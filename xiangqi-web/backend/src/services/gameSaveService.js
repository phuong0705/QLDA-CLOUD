const gameRepository = require('../repositories/gameRepository');
const moveRepository = require('../repositories/moveRepository');
const gameSaveRepository = require('../repositories/gameSaveRepository');
const GameSave = require('../models/GameSave');

/**
 * Lớp GameSaveService: Quản lý business logic cho việc lưu, tải, tái tạo và tiếp tục ván cờ.
 * 
 * Nguyên tắc nghiệp vụ & bảo mật:
 * 1. Validate GameID là số nguyên dương hợp lệ.
 * 2. Xác thực quyền (Authorization): Chỉ người chơi tham gia ván đấu (RedPlayerID hoặc BlackPlayerID) mới được xem và lưu.
 *    Người ngoài tuyệt đối không được xem/lưu ván cờ của người khác (trả về lỗi 403 Forbidden).
 * 3. Ưu tiên snapshot hợp lệ, fallback replay moves từ initial state nếu chưa có snapshot.
 * 4. GameState trả về chuẩn contract Người 2 kèm currentTurn, status, players, moves.
 * 5. Xử lý ván cờ FINISHED: Cho phép xem lại (GET) nhưng tuyệt đối không cho tiếp tục (continue).
 */
class GameSaveService {
    /**
     * @param {Object} [gameRepo=gameRepository] - Repository quản lý bảng Games
     * @param {Object} [moveRepo=moveRepository] - Repository quản lý bảng Moves
     * @param {Object} [saveRepo=gameSaveRepository] - Repository quản lý bảng GameSaves
     * @param {Object|null} [gameManager=null] - Quản lý ván đấu in-memory (nếu có)
     */
    constructor(gameRepo = gameRepository, moveRepo = moveRepository, saveRepo = gameSaveRepository, gameManager = null) {
        this.gameRepository = gameRepo;
        this.moveRepository = moveRepo;
        this.gameSaveRepository = saveRepo;
        this.gameManager = gameManager;
    }

    /**
     * Khởi tạo bàn cờ Cờ Tướng tiêu chuẩn (khởi đầu) phục vụ tái tạo trạng thái (10 hàng x 9 cột)
     * @returns {Array<Array<string|null>>}
     * @private
     */
    _getInitialBoard() {
        return [
            ['R_CHARIOT', 'R_HORSE', 'R_ELEPHANT', 'R_ADVISOR', 'R_GENERAL', 'R_ADVISOR', 'R_ELEPHANT', 'R_HORSE', 'R_CHARIOT'],
            [null, null, null, null, null, null, null, null, null],
            [null, 'R_CANNON', null, null, null, null, null, 'R_CANNON', null],
            ['R_SOLDIER', null, 'R_SOLDIER', null, 'R_SOLDIER', null, 'R_SOLDIER', null, 'R_SOLDIER'],
            [null, null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null, null],
            ['B_SOLDIER', null, 'B_SOLDIER', null, 'B_SOLDIER', null, 'B_SOLDIER', null, 'B_SOLDIER'],
            [null, 'B_CANNON', null, null, null, null, null, 'B_CANNON', null],
            [null, null, null, null, null, null, null, null, null],
            ['B_CHARIOT', 'B_HORSE', 'B_ELEPHANT', 'B_ADVISOR', 'B_GENERAL', 'B_ADVISOR', 'B_ELEPHANT', 'B_HORSE', 'B_CHARIOT']
        ];
    }

    /**
     * Parse vị trí chuỗi thành tọa độ { row, col }
     * Hỗ trợ cả định dạng "row,col" (e.g. "0,4") lẫn ký hiệu đại số (e.g. "b2", "e3", "a0")
     * @param {string} posStr
     * @returns {{row: number, col: number}|null}
     * @private
     */
    _parsePosition(posStr) {
        if (!posStr || typeof posStr !== 'string') return null;
        const str = posStr.trim().toLowerCase();

        if (str.includes(',') || str.includes(' ')) {
            const parts = str.split(/[, ]+/).map(Number);
            if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
                return { row: parts[0], col: parts[1] };
            }
        }

        const colChar = str[0];
        if (colChar >= 'a' && colChar <= 'i') {
            const col = colChar.charCodeAt(0) - 97;
            const row = parseInt(str.slice(1), 10);
            if (!Number.isNaN(row) && row >= 0 && row <= 9 && col >= 0 && col <= 8) {
                return { row, col };
            }
        }

        return null;
    }

    /**
     * Tái hiện lại trạng thái bàn cờ bằng cách replay chuỗi Moves từ initial board
     * @param {Array<Object>} moves - Danh sách nước đi sắp xếp theo MoveNumber ASC
     * @returns {Array<Array<string|null>>}
     */
    replayMoves(moves = []) {
        const board = this._getInitialBoard().map(row => [...row]);

        for (const move of moves) {
            const from = this._parsePosition(move.fromPosition);
            const to = this._parsePosition(move.toPosition);

            if (from && to &&
                from.row >= 0 && from.row < 10 && from.col >= 0 && from.col < 9 &&
                to.row >= 0 && to.row < 10 && to.col >= 0 && to.col < 9
            ) {
                const piecePrefix = move.pieceColor === 'BLACK' ? 'B_' : 'R_';
                const movingPiece = board[from.row][from.col] || `${piecePrefix}${move.pieceType}`;
                board[to.row][to.col] = movingPiece;
                board[from.row][from.col] = null;
            }
        }

        return board;
    }

    /**
     * Tái tạo trạng thái bàn cờ hiện tại từ danh sách nước đi đã lưu trên server (Server Reconstruct)
     * 
     * @param {number} gameId - Khóa chính GameID
     * @param {Object} game - Thực thể Game từ database
     * @returns {Promise<Object>}
     */
    async reconstructGameState(gameId, game) {
        // 1. Kiểm tra nếu có in-memory game manager đang quản lý ván này
        if (this.gameManager && typeof this.gameManager.getGameState === 'function') {
            const memoryState = this.gameManager.getGameState(gameId);
            if (memoryState && memoryState.board) {
                return {
                    version: 1,
                    board: memoryState.board,
                    currentTurn: game.currentTurn || memoryState.currentTurn || 'RED',
                    moveNumber: memoryState.moveNumber || 0
                };
            }
        }

        // 2. Lấy danh sách nước đi từ database
        const moves = await this.moveRepository.getMovesByGameId(gameId);
        const lastMove = moves.length > 0 ? moves[moves.length - 1] : null;
        const moveNumber = lastMove ? lastMove.moveNumber : 0;

        // Replay chính xác trạng thái bàn cờ từ chuỗi nước đi
        const replayedBoard = this.replayMoves(moves);

        return {
            version: 1,
            gameId,
            currentTurn: game.currentTurn || 'RED',
            moveNumber,
            board: replayedBoard,
            movesCount: moves.length,
            lastMove: lastMove ? lastMove.toSafeObject() : null
        };
    }

    /**
     * Lưu trạng thái hiện tại của ván cờ (Snapshot) và đánh dấu ván cờ có thể tiếp tục sau này.
     * 
     * @param {number|string} gameId - Khóa chính GameID
     * @param {number|string} userId - UserID của người yêu cầu lưu
     * @param {Object} [options={}] - Tùy chọn mở rộng
     * @returns {Promise<{gameId: number, savedAt: Date|string, status: string}>}
     */
    async saveGame(gameId, userId, options = {}) {
        const gid = parseInt(gameId, 10);
        if (Number.isNaN(gid) || gid <= 0) {
            const error = new Error('ID ván cờ không hợp lệ');
            error.status = 400;
            throw error;
        }

        const uid = parseInt(userId, 10);
        if (Number.isNaN(uid) || uid <= 0) {
            const error = new Error('ID người dùng không hợp lệ');
            error.status = 401;
            throw error;
        }

        const game = await this.gameRepository.getGameById(gid);
        if (!game) {
            const error = new Error('Không tìm thấy ván cờ');
            error.status = 404;
            throw error;
        }

        const isParticipant = (game.redPlayerId === uid || game.blackPlayerId === uid);
        if (!isParticipant) {
            const error = new Error('Bạn không có quyền lưu ván đấu này vì không phải người tham gia ván cờ');
            error.status = 403;
            throw error;
        }

        if (game.status === 'FINISHED') {
            const error = new Error('Ván đấu đã kết thúc, không thể lưu snapshot để tiếp tục');
            error.status = 400;
            throw error;
        }

        const authoritativeState = await this.reconstructGameState(gid, game);
        const moveNumber = authoritativeState.moveNumber || 0;
        const snapshot = await this.gameSaveRepository.saveSnapshot(gid, uid, authoritativeState, moveNumber);

        const updatedGame = await this.gameRepository.markSaved(gid);
        const currentStatus = updatedGame ? updatedGame.status : 'SAVED';

        return {
            gameId: gid,
            savedAt: snapshot.savedAt,
            status: currentStatus
        };
    }

    /**
     * Lấy toàn bộ thông tin chi tiết của ván cờ: metadata, players, state (ưu tiên snapshot, fallback replay) và moves.
     * Endpoint phục vụ: GET /api/games/:id
     * 
     * @param {number|string} gameId - Khóa chính GameID
     * @param {number|string} userId - UserID của người yêu cầu
     * @returns {Promise<{game: Object, players: Object, state: Object, moves: Array}>}
     */
    async getGameDetails(gameId, userId) {
        const gid = parseInt(gameId, 10);
        if (Number.isNaN(gid) || gid <= 0) {
            const error = new Error('ID ván cờ không hợp lệ');
            error.status = 400;
            throw error;
        }

        const uid = parseInt(userId, 10);
        if (Number.isNaN(uid) || uid <= 0) {
            const error = new Error('ID người dùng không hợp lệ');
            error.status = 401;
            throw error;
        }

        const game = await this.gameRepository.getGameById(gid);
        if (!game) {
            const error = new Error('Không tìm thấy ván cờ');
            error.status = 404;
            throw error;
        }

        // Không trả state của game cho user ngoài trận đấu (403 Forbidden)
        const isParticipant = (game.redPlayerId === uid || game.blackPlayerId === uid);
        if (!isParticipant) {
            const error = new Error('Bạn không có quyền truy cập ván cờ này vì không phải người tham gia');
            error.status = 403;
            throw error;
        }

        // Lấy lịch sử nước đi đầy đủ từ Moves
        const moves = await this.moveRepository.getMovesByGameId(gid);
        const lastMove = moves.length > 0 ? moves[moves.length - 1] : null;
        const moveNumber = lastMove ? lastMove.moveNumber : 0;

        // 1. Ưu tiên lấy snapshot hợp lệ mới nhất của ván cờ
        let resolvedBoard = null;
        let resolvedVersion = 1;
        let fromSnapshot = false;
        let snapshotMoveNumber = null;
        let parsedSnapshot = null;

        try {
            let snapshot = await this.gameSaveRepository.loadLatestSnapshot(gid, uid);
            // Nếu người chơi hiện tại chưa lưu, kiểm tra snapshot của đối thủ cùng trận
            if (!snapshot) {
                const otherPlayerId = (game.redPlayerId === uid) ? game.blackPlayerId : game.redPlayerId;
                if (otherPlayerId) {
                    snapshot = await this.gameSaveRepository.loadLatestSnapshot(gid, otherPlayerId);
                }
            }

            if (snapshot) {
                const parsed = snapshot.getParsedBoardState();
                if (parsed && (parsed.board || parsed.pieces || parsed.grid)) {
                    parsedSnapshot = parsed;
                    resolvedBoard = parsed.board ?? parsed.pieces ?? parsed.grid;
                    resolvedVersion = parsed.version ?? 1;
                    fromSnapshot = true;
                    if (snapshot.moveNumber !== undefined && snapshot.moveNumber !== null) {
                        snapshotMoveNumber = snapshot.moveNumber;
                    }
                }
            }
        } catch (e) {
            // Snapshot bị hỏng hoặc chưa có, tự động fallback replay moves
        }

        // 2. Fallback replay moves nếu snapshot không có
        if (!resolvedBoard) {
            resolvedBoard = this.replayMoves(moves);
        }

        // Chuẩn hóa GameState theo contract Người 2
        const state = {
            version: resolvedVersion,
            board: resolvedBoard,
            currentTurn: game.currentTurn || 'RED',
            status: game.status,
            moveNumber: snapshotMoveNumber !== null ? snapshotMoveNumber : moveNumber,
            movesCount: (parsedSnapshot && parsedSnapshot.movesCount !== undefined) ? parsedSnapshot.movesCount : moves.length,
            isGameOver: game.status === 'FINISHED',
            winnerId: game.winnerId ?? null,
            result: game.result ?? null,
            fromSnapshot
        };

        const players = {
            red: game.redPlayer ?? (game.redPlayerId ? { id: game.redPlayerId } : null),
            black: game.blackPlayer ?? (game.blackPlayerId ? { id: game.blackPlayerId } : null),
            winner: game.winner ?? (game.winnerId ? { id: game.winnerId } : null)
        };

        return {
            game: game.toSafeObject(),
            players,
            state,
            moves: moves.map(m => m.toSafeObject())
        };
    }

    /**
     * Tiếp tục ván cờ đã lưu (Resume Game).
     * Chuyển trạng thái ván cờ từ SAVED / WAITING sang PLAYING và trả về resumable state.
     * Xử lý game FINISHED: cho xem nhưng TUYỆT ĐỐI không cho continue (trả 400).
     * 
     * @param {number|string} gameId - Khóa chính GameID
     * @param {number|string} userId - UserID của người yêu cầu
     * @returns {Promise<Object>} - Resumable state đầy đủ để frontend render tiếp tục
     */
    async continueGame(gameId, userId) {
        const gid = parseInt(gameId, 10);
        if (Number.isNaN(gid) || gid <= 0) {
            const error = new Error('ID ván cờ không hợp lệ');
            error.status = 400;
            throw error;
        }

        const uid = parseInt(userId, 10);
        if (Number.isNaN(uid) || uid <= 0) {
            const error = new Error('ID người dùng không hợp lệ');
            error.status = 401;
            throw error;
        }

        const game = await this.gameRepository.getGameById(gid);
        if (!game) {
            const error = new Error('Không tìm thấy ván cờ');
            error.status = 404;
            throw error;
        }

        const isParticipant = (game.redPlayerId === uid || game.blackPlayerId === uid);
        if (!isParticipant) {
            const error = new Error('Bạn không có quyền tiếp tục ván cờ này vì không phải người tham gia');
            error.status = 403;
            throw error;
        }

        // Xử lý game FINISHED: cho xem nhưng không continue
        if (game.status === 'FINISHED') {
            const error = new Error('Ván đấu đã kết thúc, không thể tiếp tục thi đấu');
            error.status = 400;
            throw error;
        }

        // Chuyển trạng thái ván cờ sang PLAYING để cho phép đi tiếp
        let activeGame = game;
        if (game.status === 'SAVED' || game.status === 'WAITING') {
            activeGame = await this.gameRepository.updateTurnStatus(gid, {
                status: 'PLAYING'
            }) || game;
        }

        // Lấy chi tiết state phục hồi
        const details = await this.getGameDetails(gid, uid);

        return {
            success: true,
            resumable: true,
            gameId: gid,
            status: activeGame.status,
            currentTurn: activeGame.currentTurn,
            game: details.game,
            players: details.players,
            state: details.state,
            moves: details.moves,
            message: 'Tiếp tục ván đấu thành công'
        };
    }

    /**
     * Tải bản snapshot mới nhất của ván cờ
     * 
     * @param {number|string} gameId - Khóa chính GameID
     * @param {number|string} userId - UserID của người yêu cầu tải
     * @returns {Promise<Object>}
     */
    async loadLatestSnapshot(gameId, userId) {
        const details = await this.getGameDetails(gameId, userId);
        return {
            gameId: details.game.id,
            savedAt: details.game.updatedAt,
            moveNumber: details.state.moveNumber,
            currentTurn: details.state.currentTurn,
            boardState: details.state,
            game: details.game
        };
    }
}

// Khởi tạo singleton instance mặc định
const defaultInstance = new GameSaveService();

module.exports = defaultInstance;
module.exports.GameSaveService = GameSaveService;
module.exports.default = defaultInstance;

module.exports.saveGame = defaultInstance.saveGame.bind(defaultInstance);
module.exports.getGameDetails = defaultInstance.getGameDetails.bind(defaultInstance);
module.exports.continueGame = defaultInstance.continueGame.bind(defaultInstance);
module.exports.loadLatestSnapshot = defaultInstance.loadLatestSnapshot.bind(defaultInstance);
module.exports.reconstructGameState = defaultInstance.reconstructGameState.bind(defaultInstance);
module.exports.replayMoves = defaultInstance.replayMoves.bind(defaultInstance);
