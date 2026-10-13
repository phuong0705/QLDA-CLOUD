const sql = require('mssql');
const Game = require('../models/Game');

/**
 * Lớp GameRepository: Nơi duy nhất của module game thực thi các truy vấn SQL Server liên quan đến bảng Games.
 * Toàn bộ các câu query đều dùng parameterized input (request.input) để ngăn chặn hoàn toàn SQL Injection.
 * Tách biệt hoàn toàn tầng dữ liệu (Repository) khỏi logic nghiệp vụ (Business Service).
 */
class GameRepository {
    /**
     * @param {sql.ConnectionPool|null} [pool=null] - MSSQL Connection Pool (hỗ trợ DI/Mock)
     */
    constructor(pool = null) {
        this.pool = pool;
        this._poolPromise = null;
    }

    /**
     * Thiết lập pool kết nối cho repository
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
     * Helper an toàn cho MSSQL DataType (tương thích cả real mssql lẫn test mocks)
     * @private
     */
    _getType(typeDef, length) {
        if (typeof typeDef === 'function') {
            return length !== undefined ? typeDef(length) : typeDef();
        }
        return typeDef;
    }

    /**
     * Tạo một ván đấu mới trong cơ sở dữ liệu.
     * Hỗ trợ cả chế độ ONLINE lẫn AI (chơi với máy).
     * 
     * @param {Object} gameData - Thông tin khởi tạo ván đấu
     * @param {number|null} [gameData.roomId] - RoomID (nullable cho chế độ AI)
     * @param {number|null} [gameData.redPlayerId] - UserID của người chơi quân Đỏ
     * @param {number|null} [gameData.blackPlayerId] - UserID của người chơi quân Đen (null nếu đấu với AI)
     * @param {string} [gameData.gameMode='ONLINE'] - Chế độ chơi ('ONLINE' hoặc 'AI')
     * @param {string} [gameData.status='WAITING'] - Trạng thái ván đấu ('WAITING' hoặc 'PLAYING')
     * @param {string} [gameData.currentTurn='RED'] - Lượt đi hiện tại ('RED' hoặc 'BLACK')
     * @param {Date|string|null} [gameData.startedAt=null] - Thời điểm bắt đầu ván đấu
     * @returns {Promise<Game>} - Đối tượng Game chuẩn vừa được tạo
     */
    async createGame(gameData = {}) {
        if (!gameData || typeof gameData !== 'object') {
            throw new Error('Dữ liệu ván đấu không hợp lệ');
        }

        const rawRoomId = gameData.roomId ?? gameData.RoomID;
        const roomId = rawRoomId !== undefined && rawRoomId !== null ? parseInt(rawRoomId, 10) : null;

        const rawRedId = gameData.redPlayerId ?? gameData.RedPlayerID;
        const redPlayerId = rawRedId !== undefined && rawRedId !== null ? parseInt(rawRedId, 10) : null;

        const rawBlackId = gameData.blackPlayerId ?? gameData.BlackPlayerID;
        const blackPlayerId = rawBlackId !== undefined && rawBlackId !== null ? parseInt(rawBlackId, 10) : null;

        if (redPlayerId === null && blackPlayerId === null) {
            throw new Error('Ván đấu phải có ít nhất một người chơi (RedPlayerID hoặc BlackPlayerID)');
        }

        const rawMode = (gameData.gameMode ?? gameData.GameMode ?? 'ONLINE').toString().toUpperCase();
        const gameMode = rawMode === 'AI' ? 'AI' : 'ONLINE';

        const rawStatus = (gameData.status ?? gameData.Status ?? 'WAITING').toString().toUpperCase();
        const validStatuses = ['WAITING', 'PLAYING', 'FINISHED', 'SAVED'];
        const status = validStatuses.includes(rawStatus) ? rawStatus : 'WAITING';

        const rawTurn = (gameData.currentTurn ?? gameData.CurrentTurn ?? 'RED').toString().toUpperCase();
        const currentTurn = rawTurn === 'BLACK' ? 'BLACK' : 'RED';

        let startedAt = gameData.startedAt ?? gameData.StartedAt ?? null;
        if (status === 'PLAYING' && !startedAt) {
            startedAt = new Date();
        }

        const pool = await this.getPool();
        const request = pool.request();

        // Parameterized input an toàn chống SQL Injection
        request.input('roomId', this._getType(sql.Int), roomId);
        request.input('redPlayerId', this._getType(sql.Int), redPlayerId);
        request.input('blackPlayerId', this._getType(sql.Int), blackPlayerId);
        request.input('gameMode', this._getType(sql.NVarChar, 20), gameMode);
        request.input('status', this._getType(sql.NVarChar, 20), status);
        request.input('currentTurn', this._getType(sql.NVarChar, 10), currentTurn);
        request.input('startedAt', this._getType(sql.DateTime2, 7), startedAt);

        const query = `
            INSERT INTO dbo.Games (
                RoomID,
                RedPlayerID,
                BlackPlayerID,
                GameMode,
                Status,
                CurrentTurn,
                Result,
                StartedAt,
                EndedAt,
                CreatedAt,
                UpdatedAt
            )
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
            VALUES (
                @roomId,
                @redPlayerId,
                @blackPlayerId,
                @gameMode,
                @status,
                @currentTurn,
                NULL,
                @startedAt,
                NULL,
                SYSUTCDATETIME(),
                SYSUTCDATETIME()
            );
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            throw new Error('Không thể tạo ván đấu mới');
        }

        return Game.fromDatabase(recordset[0]);
    }

    /**
     * Lấy thông tin ván đấu chi tiết theo GameID (kèm thông tin player nếu có).
     * Tuyệt đối không trả token hay passwordHash ra ngoài.
     * 
     * @param {number|string} id - Khóa chính GameID
     * @returns {Promise<Game|null>} - Thực thể Game hoặc null nếu không tìm thấy
     */
    async getGameById(id) {
        const gameId = parseInt(id, 10);
        if (Number.isNaN(gameId) || gameId <= 0) {
            return null;
        }

        const pool = await this.getPool();
        const request = pool.request();
        request.input('gameId', this._getType(sql.Int), gameId);

        const query = `
            SELECT TOP 1
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
                uWin.Username AS WinnerUsername
            FROM dbo.Games g
            LEFT JOIN dbo.Users uRed ON g.RedPlayerID = uRed.UserID
            LEFT JOIN dbo.Users uBlack ON g.BlackPlayerID = uBlack.UserID
            LEFT JOIN dbo.Users uWin ON g.WinnerID = uWin.UserID
            WHERE g.GameID = @gameId;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            return null;
        }

        return Game.fromDatabase(recordset[0]);
    }

    /**
     * Cập nhật lượt đi và trạng thái ván đấu.
     * Hỗ trợ truyền dạng object { currentTurn, status, startedAt } hoặc 2 đối số (currentTurn, status).
     * 
     * @param {number|string} id - Khóa chính GameID
     * @param {Object|string} updateDataOrTurn - Object cập nhật hoặc lượt đi ('RED' / 'BLACK')
     * @param {string} [optionalStatus] - Trạng thái ván đấu nếu truyền đối số rời
     * @returns {Promise<Game|null>} - Thực thể Game sau khi cập nhật
     */
    async updateTurnStatus(id, updateDataOrTurn, optionalStatus) {
        const gameId = parseInt(id, 10);
        if (Number.isNaN(gameId) || gameId <= 0) {
            throw new Error('GameID không hợp lệ');
        }

        let currentTurn = null;
        let status = null;
        let startedAt = null;

        if (updateDataOrTurn && typeof updateDataOrTurn === 'object') {
            const rawTurn = updateDataOrTurn.currentTurn ?? updateDataOrTurn.CurrentTurn;
            if (rawTurn) {
                const turnStr = rawTurn.toString().toUpperCase();
                if (['RED', 'BLACK'].includes(turnStr)) {
                    currentTurn = turnStr;
                }
            }

            const rawStatus = updateDataOrTurn.status ?? updateDataOrTurn.Status;
            if (rawStatus) {
                const stStr = rawStatus.toString().toUpperCase();
                if (['WAITING', 'PLAYING', 'FINISHED', 'SAVED'].includes(stStr)) {
                    status = stStr;
                }
            }

            startedAt = updateDataOrTurn.startedAt ?? updateDataOrTurn.StartedAt ?? null;
        } else {
            if (updateDataOrTurn) {
                const turnStr = updateDataOrTurn.toString().toUpperCase();
                if (['RED', 'BLACK'].includes(turnStr)) {
                    currentTurn = turnStr;
                }
            }
            if (optionalStatus) {
                const stStr = optionalStatus.toString().toUpperCase();
                if (['WAITING', 'PLAYING', 'FINISHED', 'SAVED'].includes(stStr)) {
                    status = stStr;
                }
            }
        }

        const pool = await this.getPool();
        const request = pool.request();
        request.input('gameId', this._getType(sql.Int), gameId);

        const setClauses = ['UpdatedAt = SYSUTCDATETIME()'];

        if (currentTurn !== null) {
            request.input('currentTurn', this._getType(sql.NVarChar, 10), currentTurn);
            setClauses.push('CurrentTurn = @currentTurn');
        }

        if (status !== null) {
            request.input('status', this._getType(sql.NVarChar, 20), status);
            setClauses.push('Status = @status');

            if (status === 'PLAYING') {
                if (startedAt) {
                    request.input('startedAt', this._getType(sql.DateTime2, 7), startedAt);
                    setClauses.push('StartedAt = @startedAt');
                } else {
                    setClauses.push('StartedAt = COALESCE(StartedAt, SYSUTCDATETIME())');
                }
            }
        }

        if (setClauses.length === 1) {
            // Không có trường nào thay đổi ngoài UpdatedAt
            return this.getGameById(gameId);
        }

        const query = `
            UPDATE dbo.Games
            SET ${setClauses.join(', ')}
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

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            return null;
        }

        return Game.fromDatabase(recordset[0]);
    }

    /**
     * Đánh dấu hoàn tất ván đấu (Status -> 'FINISHED').
     * Lưu thông tin người thắng cuộc, kết quả trận đấu và thời điểm kết thúc.
     * Lưu ý kiến trúc: Repository KHÔNG tự ý tính toán/cập nhật Elo.
     * Việc cập nhật Elo sẽ do business service (UserService / GameService) phụ trách.
     * 
     * @param {number|string} id - Khóa chính GameID
     * @param {Object|number|null} winnerOrData - Object kết quả hoặc WinnerID
     * @param {string|null} [optionalResult] - Kết quả nếu truyền tham số rời ('RED_WIN', 'BLACK_WIN', 'DRAW')
     * @returns {Promise<Game|null>} - Thực thể Game sau khi kết thúc
     */
    async finishGame(id, winnerOrData, optionalResult) {
        const gameId = parseInt(id, 10);
        if (Number.isNaN(gameId) || gameId <= 0) {
            throw new Error('GameID không hợp lệ');
        }

        let winnerId = null;
        let result = null;
        let endedAt = null;

        if (winnerOrData && typeof winnerOrData === 'object') {
            const rawWinner = winnerOrData.winnerId ?? winnerOrData.WinnerID;
            winnerId = rawWinner !== undefined && rawWinner !== null ? parseInt(rawWinner, 10) : null;
            result = (winnerOrData.result ?? winnerOrData.Result ?? null)?.toString() || null;
            endedAt = winnerOrData.endedAt ?? winnerOrData.EndedAt ?? null;
        } else {
            winnerId = winnerOrData !== undefined && winnerOrData !== null ? parseInt(winnerOrData, 10) : null;
            result = optionalResult !== undefined && optionalResult !== null ? optionalResult.toString() : null;
        }

        const pool = await this.getPool();
        const request = pool.request();
        request.input('gameId', this._getType(sql.Int), gameId);
        request.input('winnerId', this._getType(sql.Int), winnerId);
        request.input('result', this._getType(sql.NVarChar, 20), result);
        request.input('endedAt', this._getType(sql.DateTime2, 7), endedAt);

        const query = `
            UPDATE dbo.Games
            SET
                Status = 'FINISHED',
                WinnerID = @winnerId,
                Result = @result,
                EndedAt = COALESCE(@endedAt, SYSUTCDATETIME()),
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

        const queryResult = await request.query(query);
        const recordset = queryResult && queryResult.recordset ? queryResult.recordset : [];

        if (recordset.length === 0) {
            return null;
        }

        return Game.fromDatabase(recordset[0]);
    }

    /**
     * Đánh dấu ván đấu đã được lưu snapshot (Status -> 'SAVED').
     * Phục vụ chức năng lưu ván cờ (GameSaves) để xem lại hoặc chơi tiếp sau này.
     * 
     * @param {number|string} id - Khóa chính GameID
     * @returns {Promise<Game|null>} - Thực thể Game sau khi cập nhật
     */
    async markSaved(id) {
        const gameId = parseInt(id, 10);
        if (Number.isNaN(gameId) || gameId <= 0) {
            throw new Error('GameID không hợp lệ');
        }

        const pool = await this.getPool();
        const request = pool.request();
        request.input('gameId', this._getType(sql.Int), gameId);

        const query = `
            UPDATE dbo.Games
            SET
                Status = 'SAVED',
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

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            return null;
        }

        return Game.fromDatabase(recordset[0]);
    }

    /**
     * Lấy danh sách lịch sử các ván đấu của một người dùng cụ thể.
     * Tìm tất cả ván cờ mà người dùng đó đóng vai trò là RedPlayerID HOẶC BlackPlayerID.
     * Sắp xếp theo CreatedAt giảm dần (mới nhất lên đầu).
     * 
     * @param {number|string} userId - Khóa chính UserID
     * @param {Object} [options={}] - Các tùy chọn lọc và phân trang
     * @param {number} [options.limit=20] - Số lượng bản ghi tối đa
     * @param {number} [options.offset=0] - Vị trí bản ghi bắt đầu lấy
     * @param {number} [options.page] - Số trang (nếu dùng thay cho offset)
     * @param {string} [options.status] - Lọc theo trạng thái ('PLAYING', 'FINISHED', 'SAVED')
     * @param {string} [options.gameMode] - Lọc theo chế độ ('ONLINE', 'AI')
     * @returns {Promise<Game[]>} - Mảng các thực thể Game chuẩn
     */
    async getGamesByUser(userId, options = {}) {
        const uid = parseInt(userId, 10);
        if (Number.isNaN(uid) || uid <= 0) {
            return [];
        }

        const parsedLimit = parseInt(options.limit ?? 20, 10);
        const limit = (!Number.isNaN(parsedLimit) && parsedLimit > 0) ? Math.min(parsedLimit, 100) : 20;

        let offset = 0;
        if (options.page !== undefined) {
            const page = Math.max(1, parseInt(options.page, 10) || 1);
            offset = (page - 1) * limit;
        } else if (options.offset !== undefined) {
            const parsedOffset = parseInt(options.offset, 10);
            offset = (!Number.isNaN(parsedOffset) && parsedOffset >= 0) ? parsedOffset : 0;
        }

        const pool = await this.getPool();
        const request = pool.request();
        request.input('userId', this._getType(sql.Int), uid);
        request.input('limit', this._getType(sql.Int), limit);
        request.input('offset', this._getType(sql.Int), offset);

        const conditions = ['(g.RedPlayerID = @userId OR g.BlackPlayerID = @userId)'];

        if (options.status) {
            const st = options.status.toString().toUpperCase();
            if (['WAITING', 'PLAYING', 'FINISHED', 'SAVED'].includes(st)) {
                request.input('status', this._getType(sql.NVarChar, 20), st);
                conditions.push('g.Status = @status');
            }
        }

        if (options.gameMode) {
            const gm = options.gameMode.toString().toUpperCase();
            if (['ONLINE', 'AI'].includes(gm)) {
                request.input('gameMode', this._getType(sql.NVarChar, 20), gm);
                conditions.push('g.GameMode = @gameMode');
            }
        }

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
                uWin.Username AS WinnerUsername
            FROM dbo.Games g
            LEFT JOIN dbo.Users uRed ON g.RedPlayerID = uRed.UserID
            LEFT JOIN dbo.Users uBlack ON g.BlackPlayerID = uBlack.UserID
            LEFT JOIN dbo.Users uWin ON g.WinnerID = uWin.UserID
            WHERE ${conditions.join(' AND ')}
            ORDER BY g.CreatedAt DESC, g.GameID DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
        `;

        const result = await request.query(query);
        const rows = result && result.recordset ? result.recordset : [];

        return rows.map(row => Game.fromDatabase(row));
    }
}

// Khởi tạo singleton instance mặc định
const defaultInstance = new GameRepository();

// Export instance mặc định đồng thời gắn các method trực tiếp để hỗ trợ destructuring
module.exports = defaultInstance;
module.exports.GameRepository = GameRepository;
module.exports.default = defaultInstance;

module.exports.createGame = defaultInstance.createGame.bind(defaultInstance);
module.exports.getGameById = defaultInstance.getGameById.bind(defaultInstance);
module.exports.updateTurnStatus = defaultInstance.updateTurnStatus.bind(defaultInstance);
module.exports.finishGame = defaultInstance.finishGame.bind(defaultInstance);
module.exports.markSaved = defaultInstance.markSaved.bind(defaultInstance);
module.exports.getGamesByUser = defaultInstance.getGamesByUser.bind(defaultInstance);
module.exports.setPool = defaultInstance.setPool.bind(defaultInstance);
module.exports.getPool = defaultInstance.getPool.bind(defaultInstance);
