const sql = require('mssql');
const gameRepository = require('../repositories/gameRepository');
const moveRepository = require('../repositories/moveRepository');
const gameSaveRepository = require('../repositories/gameSaveRepository');
const Game = require('../models/Game');
const Move = require('../models/Move');
const GameSave = require('../models/GameSave');

/**
 * Lớp GameService: Quản lý toàn bộ nghiệp vụ điều phối và lưu trữ ván đấu.
 * Đảm bảo tính nguyên tử (Atomicity) khi lưu nước đi:
 * Một nước đi được chấp nhận phải đồng thời:
 * 1. Lưu bản ghi nước đi mới vào bảng Moves.
 * 2. Cập nhật lượt đi (CurrentTurn) và trạng thái (Status) trong bảng Games.
 * 3. Lưu snapshot (GameSaves) nếu cấu hình policy yêu cầu.
 * Tất cả được thực thi trong một Database Transaction duy nhất. Nếu bất kỳ bước nào lỗi,
 * hệ thống sẽ ROLLBACK hoàn toàn để đảm bảo Games không bao giờ đổi lượt khi Moves bị thiếu.
 */
class GameService {
    /**
     * @param {Object} [gameRepo=gameRepository] - Repository ván cờ
     * @param {Object} [moveRepo=moveRepository] - Repository nước đi
     * @param {Object} [saveRepo=gameSaveRepository] - Repository snapshot ván cờ
     * @param {Object|null} [userService=null] - Service người dùng của Người 3 (dùng để cập nhật Elo khi kết thúc)
     * @param {sql.ConnectionPool|null} [pool=null] - Database Connection Pool
     */
    constructor(gameRepo = gameRepository, moveRepo = moveRepository, saveRepo = gameSaveRepository, userService = null, pool = null) {
        this.gameRepository = gameRepo;
        this.moveRepository = moveRepo;
        this.gameSaveRepository = saveRepo;
        this.userService = userService;
        this.pool = pool;
        this._poolPromise = null;

        // Quản lý các action / request id đã xử lý để hỗ trợ idempotency phía application
        this.processedActionIds = new Set();
    }

    /**
     * Thiết lập pool kết nối cho service
     * @param {sql.ConnectionPool} pool
     */
    setPool(pool) {
        this.pool = pool;
    }

    /**
     * Lấy pool kết nối MSSQL đang hoạt động hoặc khởi tạo kết nối mới
     * @returns {Promise<sql.ConnectionPool>}
     */
    async getPool() {
        if (this.pool) {
            if (this.pool.connected === false && typeof this.pool.connect === 'function') {
                await this.pool.connect();
            }
            return this.pool;
        }

        if (!this._poolPromise) {
            const config = {
                user: process.env.DB_USER || 'sa',
                password: process.env.DB_PASSWORD || '',
                server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'XiangqiDB',
                port: parseInt(process.env.DB_PORT, 10) || 1433,
                options: {
                    encrypt: process.env.DB_ENCRYPT === 'true',
                    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false'
                }
            };
            this._poolPromise = sql.connect(config);
        }

        this.pool = await this._poolPromise;
        return this.pool;
    }

    /**
     * Helper an toàn cho MSSQL DataType
     * @private
     */
    _getType(typeDef, length) {
        if (typeof typeDef === 'function') {
            return length !== undefined ? typeDef(length) : typeDef();
        }
        return typeDef;
    }

    /**
     * Lưu trữ một nước đi đã được Game Engine / Online Service (Người 6 / Người 2) xác thực là hợp lệ.
     * 
     * Nguyên tắc thiết kế:
     * - KHÔNG validate lại luật cờ nếu contract đã có nextState.
     * - MoveNumber lấy từ server state / database (ISNULL(MAX(MoveNumber), 0) + 1), KHÔNG tin client.
     * - Sử dụng MSSQL Transaction bọc toàn bộ các câu lệnh:
     *   + Insert dbo.Moves
     *   + Update dbo.Games (CurrentTurn, Status, StartedAt/EndedAt)
     *   + Upsert dbo.GameSaves (nếu policy yêu cầu)
     * - Nếu xảy ra lỗi ở bất kỳ bước nào -> ROLLBACK toàn bộ.
     * - Hỗ trợ chiến lược Idempotency (xử lý duplicate request) để tránh double move khi mạng retry.
     * - Trả về persistence result chuẩn cho online handler / socket emit.
     * 
     * Hỗ trợ cả 2 chữ ký:
     * 1. persistAcceptedMove({ gameId, playerId, move, nextState, options })
     * 2. persistAcceptedMove(gameId, playerId, moveResult)
     * 
     * @param {Object|number|string} arg1 - Object tham số hoặc GameID
     * @param {number|string|null} [arg2] - UserID của người thực hiện nước đi (null cho AI)
     * @param {Object} [arg3] - Dữ liệu nước đi hoặc moveResult { move, nextState, options }
     * @returns {Promise<Object>} - Kết quả persistence chuẩn
     */
    async persistAcceptedMove(arg1, arg2, arg3) {
        let gameId;
        let playerId = null;
        let moveData = null;
        let nextState = null;
        let options = {};

        // Chuẩn hóa tham số theo cả 2 dạng chữ ký
        if (arg1 && typeof arg1 === 'object' && arg2 === undefined) {
            // Chữ ký 1: ({ gameId, playerId, move, nextState, options })
            gameId = arg1.gameId ?? arg1.GameID;
            playerId = arg1.playerId !== undefined ? arg1.playerId : (arg1.PlayerID !== undefined ? arg1.PlayerID : null);
            moveData = arg1.move ?? arg1.moveResult?.move ?? arg1;
            nextState = arg1.nextState ?? arg1.moveResult?.nextState ?? null;
            options = arg1.options ?? arg1.moveResult?.options ?? {};
        } else {
            // Chữ ký 2: (gameId, playerId, moveResult)
            gameId = arg1;
            playerId = arg2 !== undefined ? arg2 : null;
            if (arg3 && typeof arg3 === 'object') {
                moveData = arg3.move ?? arg3;
                nextState = arg3.nextState ?? arg3.gameState ?? null;
                options = arg3.options ?? {};
            }
        }

        const gid = parseInt(gameId, 10);
        if (Number.isNaN(gid) || gid <= 0) {
            throw new Error('GameID không hợp lệ');
        }

        const pid = playerId !== null && playerId !== undefined ? parseInt(playerId, 10) : null;

        if (!moveData || typeof moveData !== 'object') {
            throw new Error('Dữ liệu nước đi (move) là bắt buộc');
        }

        // Trích xuất thông tin cơ bản của nước đi
        const fromPosition = (moveData.fromPosition ?? moveData.FromPosition ?? '').toString().trim();
        const toPosition = (moveData.toPosition ?? moveData.ToPosition ?? '').toString().trim();
        const pieceType = (moveData.pieceType ?? moveData.PieceType ?? '').toString().trim().toUpperCase();
        const rawColor = (moveData.pieceColor ?? moveData.PieceColor ?? '').toString().trim().toUpperCase();
        const capturedPiece = (moveData.capturedPiece ?? moveData.CapturedPiece ?? null)?.toString().trim().toUpperCase() || null;
        const clientActionId = options.actionId ?? options.clientActionId ?? moveData.actionId ?? null;

        if (!fromPosition || !toPosition) {
            throw new Error('FromPosition và ToPosition là bắt buộc');
        }
        if (!pieceType) {
            throw new Error('PieceType là bắt buộc');
        }

        // Kiểm tra Idempotency phía application (nếu có clientActionId)
        if (clientActionId) {
            const actionKey = `${gid}:${clientActionId}`;
            if (this.processedActionIds.has(actionKey)) {
                const latestMove = await this.moveRepository.getLastMove(gid);
                const currentGame = await this.gameRepository.getGameById(gid);
                return {
                    success: true,
                    duplicate: true,
                    alreadyPersisted: true,
                    gameId: gid,
                    move: latestMove,
                    game: currentGame,
                    message: 'Yêu cầu nước đi đã được xử lý trước đó (Idempotent by actionId)'
                };
            }
        }

        const pool = await this.getPool();
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        try {
            const request = new sql.Request(transaction);
            request.input('gameId', this._getType(sql.Int), gid);

            // 1. Kiểm tra ván cờ và khóa dòng bằng UPDLOCK, HOLDLOCK trong Transaction
            const gameQuery = `
                SELECT
                    GameID, RoomID, RedPlayerID, BlackPlayerID, WinnerID, GameMode, Status, CurrentTurn, Result, StartedAt, EndedAt
                FROM dbo.Games WITH (UPDLOCK, HOLDLOCK)
                WHERE GameID = @gameId;
            `;
            const gameResult = await request.query(gameQuery);
            const gameRows = gameResult && gameResult.recordset ? gameResult.recordset : [];

            if (gameRows.length === 0) {
                throw new Error(`Không tìm thấy ván cờ với GameID = ${gid}`);
            }

            const currentGame = gameRows[0];

            if (currentGame.Status === 'FINISHED') {
                throw new Error('Ván đấu đã kết thúc, không thể thực hiện thêm nước đi');
            }

            // 2. Kiểm tra Idempotency ở tầng Database:
            // Đọc nước đi cuối cùng của ván cờ với UPDLOCK để xác định xem nước đi này đã được lưu trước đó chưa
            const lastMoveQuery = `
                SELECT TOP 1
                    MoveID, GameID, MoveNumber, PlayerID, PieceType, PieceColor, FromPosition, ToPosition, CapturedPiece, CreatedAt
                FROM dbo.Moves WITH (UPDLOCK, HOLDLOCK)
                WHERE GameID = @gameId
                ORDER BY MoveNumber DESC;
            `;
            const lastMoveResult = await request.query(lastMoveQuery);
            const lastMoveRows = lastMoveResult && lastMoveResult.recordset ? lastMoveResult.recordset : [];
            const lastMove = lastMoveRows.length > 0 ? lastMoveRows[0] : null;

            const moveColor = rawColor || currentGame.CurrentTurn;

            // Nếu nước đi gửi lên trùng khớp hoàn toàn với nước đi cuối cùng đã ghi nhận
            if (lastMove &&
                lastMove.FromPosition === fromPosition &&
                lastMove.ToPosition === toPosition &&
                lastMove.PieceType === pieceType &&
                lastMove.PieceColor === moveColor &&
                ((pid === null && lastMove.PlayerID === null) || (lastMove.PlayerID === pid))
            ) {
                // Nhận diện đây là Duplicate Request do mạng retry -> Trả về kết quả an toàn (Idempotent response)
                await transaction.commit();

                if (clientActionId) {
                    this.processedActionIds.add(`${gid}:${clientActionId}`);
                }

                return {
                    success: true,
                    duplicate: true,
                    alreadyPersisted: true,
                    gameId: gid,
                    move: Move.fromDatabase(lastMove),
                    moveNumber: lastMove.MoveNumber,
                    currentTurn: currentGame.CurrentTurn,
                    status: currentGame.Status,
                    game: Game.fromDatabase(currentGame),
                    message: 'Nước đi đã được lưu trữ thành công trước đó (Idempotent retry)'
                };
            }

            // 3. Tính toán MoveNumber từ Server Database (KHÔNG tin client)
            const nextMoveNumber = lastMove ? (lastMove.MoveNumber + 1) : 1;

            // 4. Xác định lượt đi kế tiếp (nextTurn) và trạng thái kế tiếp (nextStatus)
            let nextTurn = currentGame.CurrentTurn === 'RED' ? 'BLACK' : 'RED';
            if (nextState?.currentTurn) {
                const requestedTurn = nextState.currentTurn.toString().toUpperCase();
                if (['RED', 'BLACK'].includes(requestedTurn)) {
                    nextTurn = requestedTurn;
                }
            }

            let nextStatus = currentGame.Status === 'WAITING' ? 'PLAYING' : currentGame.Status;
            if (nextState?.status) {
                const requestedStatus = nextState.status.toString().toUpperCase();
                if (['WAITING', 'PLAYING', 'FINISHED', 'SAVED'].includes(requestedStatus)) {
                    nextStatus = requestedStatus;
                }
            } else if (nextState?.isGameOver === true) {
                nextStatus = 'FINISHED';
            }

            const winnerId = nextState?.winnerId !== undefined ? (
                nextState.winnerId !== null ? parseInt(nextState.winnerId, 10) : null
            ) : null;
            const result = nextState?.result ? nextState.result.toString() : null;

            // 5. Thêm nước đi mới vào bảng dbo.Moves
            const insertMoveRequest = new sql.Request(transaction);
            insertMoveRequest.input('gameId', this._getType(sql.Int), gid);
            insertMoveRequest.input('moveNumber', this._getType(sql.Int), nextMoveNumber);
            insertMoveRequest.input('playerId', this._getType(sql.Int), pid);
            insertMoveRequest.input('pieceType', this._getType(sql.NVarChar, 20), pieceType);
            insertMoveRequest.input('pieceColor', this._getType(sql.NVarChar, 10), moveColor);
            insertMoveRequest.input('fromPosition', this._getType(sql.NVarChar, 20), fromPosition);
            insertMoveRequest.input('toPosition', this._getType(sql.NVarChar, 20), toPosition);
            insertMoveRequest.input('capturedPiece', this._getType(sql.NVarChar, 20), capturedPiece);

            const insertMoveQuery = `
                INSERT INTO dbo.Moves (
                    GameID, MoveNumber, PlayerID, PieceType, PieceColor, FromPosition, ToPosition, CapturedPiece, CreatedAt
                )
                OUTPUT
                    INSERTED.MoveID,
                    INSERTED.GameID,
                    INSERTED.MoveNumber,
                    INSERTED.PlayerID,
                    INSERTED.PieceType,
                    INSERTED.PieceColor,
                    INSERTED.FromPosition,
                    INSERTED.ToPosition,
                    INSERTED.CapturedPiece,
                    INSERTED.CreatedAt
                VALUES (
                    @gameId, @moveNumber, @playerId, @pieceType, @pieceColor, @fromPosition, @toPosition, @capturedPiece, SYSUTCDATETIME()
                );
            `;
            const moveInsertRes = await insertMoveRequest.query(insertMoveQuery);
            const insertedMove = moveInsertRes.recordset[0];

            // 6. Cập nhật lượt đi và trạng thái trong bảng dbo.Games
            const updateGameRequest = new sql.Request(transaction);
            updateGameRequest.input('gameId', this._getType(sql.Int), gid);
            updateGameRequest.input('nextTurn', this._getType(sql.NVarChar, 10), nextTurn);
            updateGameRequest.input('nextStatus', this._getType(sql.NVarChar, 20), nextStatus);
            updateGameRequest.input('winnerId', this._getType(sql.Int), winnerId);
            updateGameRequest.input('result', this._getType(sql.NVarChar, 20), result);

            const updateGameQuery = `
                UPDATE dbo.Games
                SET
                    CurrentTurn = @nextTurn,
                    Status = @nextStatus,
                    StartedAt = CASE WHEN @nextStatus = 'PLAYING' AND StartedAt IS NULL THEN SYSUTCDATETIME() ELSE StartedAt END,
                    EndedAt = CASE WHEN @nextStatus = 'FINISHED' THEN SYSUTCDATETIME() ELSE EndedAt END,
                    WinnerID = CASE WHEN @nextStatus = 'FINISHED' THEN @winnerId ELSE WinnerID END,
                    Result = CASE WHEN @nextStatus = 'FINISHED' THEN @result ELSE Result END,
                    UpdatedAt = SYSUTCDATETIME()
                OUTPUT
                    INSERTED.GameID,
                    INSERTED.RoomID,
                    INSERTED.RedPlayerID,
                    INSERTED.BlackPlayerID,
                    INSERTED.WinnerID,
                    INSERTED.GameMode,
                    INSERTED.Status,
                    INSERTED.CurrentTurn,
                    INSERTED.Result,
                    INSERTED.StartedAt,
                    INSERTED.EndedAt,
                    INSERTED.CreatedAt,
                    INSERTED.UpdatedAt
                WHERE GameID = @gameId;
            `;
            const gameUpdateRes = await updateGameRequest.query(updateGameQuery);
            const updatedGame = gameUpdateRes.recordset[0];

            // 7. Snapshot BoardState (nếu policy yêu cầu)
            let savedSnapshot = null;
            const shouldSaveSnapshot = options.saveSnapshot === true ||
                options.snapshotPolicy === 'every_move' ||
                (options.snapshotPolicy === 'interval' && nextMoveNumber % (options.snapshotInterval || 10) === 0) ||
                (nextState && nextState.board && options.snapshot !== false && options.saveSnapshot !== false);

            if (shouldSaveSnapshot && (nextState?.board || nextState?.pieces || nextState?.grid || nextState?.boardState)) {
                const snapshotPayload = {
                    version: 1,
                    board: nextState.board ?? nextState.pieces ?? nextState.grid ?? nextState.boardState,
                    currentTurn: nextTurn,
                    moveNumber: nextMoveNumber
                };
                const boardStateJson = GameSave.serializeGameState(snapshotPayload);
                const snapshotUserId = pid || currentGame.RedPlayerID || currentGame.BlackPlayerID;

                if (snapshotUserId) {
                    const saveRequest = new sql.Request(transaction);
                    saveRequest.input('gameId', this._getType(sql.Int), gid);
                    saveRequest.input('userId', this._getType(sql.Int), snapshotUserId);
                    saveRequest.input('boardState', this._getType(sql.NVarChar, sql.MAX), boardStateJson);
                    saveRequest.input('currentTurn', this._getType(sql.NVarChar, 10), nextTurn);
                    saveRequest.input('moveNumber', this._getType(sql.Int), nextMoveNumber);

                    const mergeSaveQuery = `
                        MERGE dbo.GameSaves AS target
                        USING (SELECT @gameId AS GameID, @userId AS UserID) AS source
                        ON (target.GameID = source.GameID AND target.UserID = source.UserID)
                        WHEN MATCHED THEN
                            UPDATE SET
                                BoardState = @boardState,
                                CurrentTurn = @currentTurn,
                                MoveNumber = @moveNumber,
                                SavedAt = SYSUTCDATETIME()
                        WHEN NOT MATCHED THEN
                            INSERT (GameID, UserID, BoardState, CurrentTurn, MoveNumber, SavedAt)
                            VALUES (@gameId, @userId, @boardState, @currentTurn, @moveNumber, SYSUTCDATETIME())
                        OUTPUT
                            INSERTED.SaveID,
                            INSERTED.GameID,
                            INSERTED.UserID,
                            INSERTED.BoardState,
                            INSERTED.CurrentTurn,
                            INSERTED.MoveNumber,
                            INSERTED.SavedAt;
                    `;
                    const saveRes = await saveRequest.query(mergeSaveQuery);
                    if (saveRes.recordset && saveRes.recordset.length > 0) {
                        savedSnapshot = GameSave.fromDatabase(saveRes.recordset[0]);
                    }
                }
            }

            // 8. Commit Transaction sau khi tất cả các bước thành công
            await transaction.commit();

            if (clientActionId) {
                this.processedActionIds.add(`${gid}:${clientActionId}`);
            }

            // 9. Nếu ván cờ kết thúc (FINISHED) và có UserService được truyền vào:
            // Ủy thác việc tính toán và cập nhật Elo cho UserService của Người 3 (tách biệt nghiệp vụ)
            if (nextStatus === 'FINISHED' && this.userService && typeof this.userService.applyGameResult === 'function') {
                if (currentGame.RedPlayerID && currentGame.BlackPlayerID && result) {
                    try {
                        await this.userService.applyGameResult(gid, currentGame.RedPlayerID, currentGame.BlackPlayerID, result);
                    } catch (eloErr) {
                        // Không để lỗi Elo làm hỏng kết quả lưu nước cờ đã commit
                        console.error(`[GameService] Lỗi khi gọi UserService.applyGameResult: ${eloErr.message}`);
                    }
                }
            }

            // 10. Trả về kết quả hoàn chỉnh cho online handler
            return {
                success: true,
                duplicate: false,
                gameId: gid,
                move: Move.fromDatabase(insertedMove),
                moveNumber: nextMoveNumber,
                currentTurn: nextTurn,
                status: nextStatus,
                game: Game.fromDatabase(updatedGame),
                snapshot: savedSnapshot,
                isGameOver: nextStatus === 'FINISHED',
                winnerId: winnerId,
                result: result
            };

        } catch (error) {
            // Khi bất kỳ bước nào thất bại, ROLLBACK toàn bộ transaction
            if (transaction && !transaction._aborted) {
                try {
                    await transaction.rollback();
                } catch (rbError) {
                    // Bỏ qua lỗi rollback thứ cấp
                }
            }
            throw error;
        }
    }

    /**
     * Lấy lịch sử đấu của một người dùng kèm phân trang và tối ưu hóa tránh N+1.
     * 
     * Các yêu cầu nghiệp vụ:
     * 1. Xác định đối thủ (opponent) chính xác dựa trên user hiện tại.
     * 2. Suy ra kết quả (WIN / LOSS / DRAW) dựa trên WinnerID, Result và quyền tham gia (participant).
     * 3. Đếm số nước đi (moveCount) bằng subquery/aggregate trong câu lệnh SQL duy nhất.
     * 4. Sắp xếp ván cờ mới nhất trước (CreatedAt DESC, GameID DESC).
     * 5. Đảm bảo bảo mật: không lộ ván cờ riêng tư của người khác.
     * 
     * @param {number|string} userId - ID người dùng cần xem lịch sử
     * @param {Object} [options={}] - Tùy chọn phân trang { page, pageSize }
     * @returns {Promise<{items: Array<Object>, total: number, page: number, pageSize: number}>}
     */
    async getUserGameHistory(userId, options = {}) {
        const uid = parseInt(userId, 10);
        if (Number.isNaN(uid) || uid <= 0) {
            const error = new Error('ID người dùng không hợp lệ');
            error.status = 401;
            throw error;
        }

        // Validate và chuẩn hóa phân trang
        let page = parseInt(options.page, 10);
        if (Number.isNaN(page) || page < 1) {
            page = 1;
        }

        let pageSize = parseInt(options.pageSize, 10);
        if (Number.isNaN(pageSize) || pageSize < 1) {
            pageSize = 20;
        } else if (pageSize > 100) {
            pageSize = 100;
        }

        const offset = (page - 1) * pageSize;

        const pool = await this.getPool();
        const request = pool.request();
        request.input('userId', this._getType(sql.Int), uid);
        request.input('offset', this._getType(sql.Int), offset);
        request.input('pageSize', this._getType(sql.Int), pageSize);

        // Truy vấn duy nhất tránh N+1: JOIN lấy đối thủ, SUBQUERY đếm moves và WINDOW FUNCTION đếm total
        const query = `
            SELECT
                g.GameID,
                g.RoomID,
                g.RedPlayerID,
                g.BlackPlayerID,
                g.WinnerID,
                g.GameMode,
                g.Status,
                g.CurrentTurn,
                g.Result,
                g.StartedAt,
                g.EndedAt,
                g.CreatedAt,
                g.UpdatedAt,
                uRed.Username AS RedUsername,
                uRed.Avatar AS RedAvatar,
                uRed.EloRating AS RedEloRating,
                uBlack.Username AS BlackUsername,
                uBlack.Avatar AS BlackAvatar,
                uBlack.EloRating AS BlackEloRating,
                (
                    SELECT COUNT(1) 
                    FROM dbo.Moves m 
                    WHERE m.GameID = g.GameID
                ) AS MoveCount,
                COUNT(1) OVER() AS TotalCount
            FROM dbo.Games g
            LEFT JOIN dbo.Users uRed ON g.RedPlayerID = uRed.UserID
            LEFT JOIN dbo.Users uBlack ON g.BlackPlayerID = uBlack.UserID
            WHERE g.RedPlayerID = @userId OR g.BlackPlayerID = @userId
            ORDER BY g.CreatedAt DESC, g.GameID DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        let total = 0;
        if (recordset.length > 0) {
            total = Number(recordset[0].TotalCount) || 0;
        } else if (offset > 0) {
            // Khi offset vượt quá số bản ghi thực tế, truy vấn count để trả về total chính xác
            const countReq = pool.request();
            countReq.input('userId', this._getType(sql.Int), uid);
            const countRes = await countReq.query(`
                SELECT COUNT(1) AS Total
                FROM dbo.Games
                WHERE RedPlayerID = @userId OR BlackPlayerID = @userId;
            `);
            total = (countRes.recordset && countRes.recordset[0]) ? Number(countRes.recordset[0].Total) : 0;
        }

        // Map từng dòng dữ liệu sang cấu trúc chuẩn yêu cầu
        const items = recordset.map(row => {
            const isRed = row.RedPlayerID === uid;
            const playerColor = isRed ? 'RED' : 'BLACK';

            // 1. Xác định đối thủ (Opponent)
            let opponent = null;
            if (row.GameMode === 'AI') {
                if (isRed && !row.BlackPlayerID) {
                    opponent = {
                        id: null,
                        username: 'AI',
                        isAI: true
                    };
                } else if (!isRed && !row.RedPlayerID) {
                    opponent = {
                        id: null,
                        username: 'AI',
                        isAI: true
                    };
                } else {
                    const oppId = isRed ? row.BlackPlayerID : row.RedPlayerID;
                    const oppUsername = isRed ? row.BlackUsername : row.RedUsername;
                    const oppAvatar = isRed ? row.BlackAvatar : row.RedAvatar;
                    const oppElo = isRed ? row.BlackEloRating : row.RedEloRating;
                    opponent = {
                        id: oppId ?? null,
                        username: oppUsername ?? 'AI',
                        avatar: oppAvatar ?? null,
                        eloRating: oppElo ?? null,
                        isAI: !oppId
                    };
                }
            } else {
                // Chế độ ONLINE
                const oppId = isRed ? row.BlackPlayerID : row.RedPlayerID;
                const oppUsername = isRed ? row.BlackUsername : row.RedUsername;
                const oppAvatar = isRed ? row.BlackAvatar : row.RedAvatar;
                const oppElo = isRed ? row.BlackEloRating : row.RedEloRating;

                opponent = oppId ? {
                    id: oppId,
                    username: oppUsername,
                    avatar: oppAvatar,
                    eloRating: oppElo,
                    isAI: false
                } : null;
            }

            // 2. Xác định Kết quả ván đấu (WIN / LOSS / DRAW)
            let matchResult = null;
            const winnerId = row.WinnerID;
            const rawResult = (row.Result || '').toString().toUpperCase();

            if (row.Status === 'FINISHED') {
                if (winnerId !== null && winnerId !== undefined) {
                    matchResult = (winnerId === uid) ? 'WIN' : 'LOSS';
                } else if (rawResult === 'DRAW') {
                    matchResult = 'DRAW';
                } else if (rawResult === 'RED_WIN') {
                    matchResult = isRed ? 'WIN' : 'LOSS';
                } else if (rawResult === 'BLACK_WIN') {
                    matchResult = !isRed ? 'WIN' : 'LOSS';
                } else {
                    matchResult = 'DRAW';
                }
            }

            return {
                gameId: row.GameID,
                gameMode: row.GameMode,
                playerColor,
                opponent,
                result: matchResult,
                moveCount: row.MoveCount || 0,
                status: row.Status,
                startedAt: row.StartedAt,
                endedAt: row.EndedAt,
                createdAt: row.CreatedAt
            };
        });

        return {
            items,
            total,
            page,
            pageSize
        };
    }
}

// Khởi tạo singleton instance mặc định
const defaultInstance = new GameService();

// Export instance mặc định đồng thời gắn các method trực tiếp để hỗ trợ destructuring
module.exports = defaultInstance;
module.exports.GameService = GameService;
module.exports.default = defaultInstance;

module.exports.persistAcceptedMove = defaultInstance.persistAcceptedMove.bind(defaultInstance);
module.exports.getUserGameHistory = defaultInstance.getUserGameHistory.bind(defaultInstance);
module.exports.setPool = defaultInstance.setPool.bind(defaultInstance);
module.exports.getPool = defaultInstance.getPool.bind(defaultInstance);
