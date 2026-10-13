const gameSaveService = require('../services/gameSaveService');

/**
 * Controller điều phối các request liên quan đến trận đấu (Game Controller)
 */
class GameController {
    /**
     * @param {Object} [saveService=gameSaveService] - Service lưu snapshot ván cờ
     */
    constructor(saveService = gameSaveService) {
        this.gameSaveService = saveService;
        this.saveGame = this.saveGame.bind(this);
        this.getGame = this.getGame.bind(this);
        this.continueGame = this.continueGame.bind(this);
    }

    /**
     * Endpoint: POST /api/games/:id/save
     * Cho phép người chơi chủ động lưu trạng thái ván cờ hiện tại và đánh dấu có thể tiếp tục sau này.
     * 
     * Contract đầu vào:
     * - req.params.id: GameID (số nguyên dương)
     * - req.user: { userId, username } (từ middleware authenticateToken)
     * 
     * Contract đầu ra:
     * - HTTP 200: { gameId, savedAt, status }
     * - HTTP 400: GameID không hợp lệ hoặc ván đấu đã kết thúc
     * - HTTP 401: Thiếu hoặc token không hợp lệ
     * - HTTP 403: Người dùng không phải là người tham gia ván cờ
     * - HTTP 404: Không tìm thấy ván cờ
     * 
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} [next]
     */
    async saveGame(req, res, next) {
        try {
            // 1. Validate GameID là số nguyên
            const rawId = req.params && req.params.id;
            const gameId = parseInt(rawId, 10);
            if (!rawId || Number.isNaN(gameId) || gameId <= 0 || String(gameId) !== String(rawId).trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'GameID không hợp lệ (yêu cầu số nguyên dương)'
                });
            }

            // 2. Kiểm tra xác thực người dùng (đọc an toàn từ req.user gắn bởi authenticateToken)
            const userId = req.user && (req.user.userId ?? req.user.id);
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Yêu cầu xác thực tài khoản'
                });
            }

            // 3. Gọi service thực hiện lưu snapshot
            // Service tự động lấy state từ in-memory / reconstruct từ Moves, không tin BoardState client gửi lên
            const result = await this.gameSaveService.saveGame(gameId, userId);

            // 4. Trả về đúng contract bắt buộc: { gameId, savedAt, status }
            return res.status(200).json({
                success: true,
                gameId: result.gameId,
                savedAt: result.savedAt,
                status: result.status,
                message: 'Lưu ván cờ thành công'
            });

        } catch (error) {
            const statusCode = error.status || 500;
            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Lỗi khi lưu trạng thái ván cờ'
            });
        }
    }

    /**
     * Endpoint: GET /api/games/:id
     * Lấy toàn bộ thông tin chi tiết ván cờ: metadata, players, state (ưu tiên snapshot, fallback replay) và moves.
     * Chỉ người tham gia ván đấu mới có quyền truy cập. Ván cờ FINISHED vẫn được phép xem.
     * 
     * Contract đầu vào:
     * - req.params.id: GameID (số nguyên dương)
     * - req.user: { userId, username } (từ middleware authenticateToken)
     * 
     * Contract đầu ra:
     * - HTTP 200: { game, players, state, moves }
     * - HTTP 400: GameID không hợp lệ
     * - HTTP 401: Thiếu hoặc token không hợp lệ
     * - HTTP 403: Người dùng không phải là người tham gia ván cờ
     * - HTTP 404: Không tìm thấy ván cờ
     * 
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} [next]
     */
    async getGame(req, res, next) {
        try {
            // 1. Validate GameID là số nguyên
            const rawId = req.params && req.params.id;
            const gameId = parseInt(rawId, 10);
            if (!rawId || Number.isNaN(gameId) || gameId <= 0 || String(gameId) !== String(rawId).trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'GameID không hợp lệ (yêu cầu số nguyên dương)'
                });
            }

            // 2. Kiểm tra xác thực người dùng
            const userId = req.user && (req.user.userId ?? req.user.id);
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Yêu cầu xác thực tài khoản'
                });
            }

            // 3. Gọi service lấy thông tin chi tiết ván cờ
            const result = await this.gameSaveService.getGameDetails(gameId, userId);

            // 4. Trả về đúng contract bắt buộc: { game, players, state, moves }
            return res.status(200).json({
                success: true,
                game: result.game,
                players: result.players,
                state: result.state,
                moves: result.moves
            });

        } catch (error) {
            const statusCode = error.status || 500;
            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Lỗi khi lấy thông tin ván cờ'
            });
        }
    }

    /**
     * Endpoint: POST /api/games/:id/continue
     * Tiếp tục ván cờ đã lưu (chuyển sang PLAYING và trả về resumable state).
     * Xử lý game FINISHED: Trả về lỗi 400 Bad Request, tuyệt đối không cho phép tiếp tục.
     * 
     * Contract đầu vào:
     * - req.params.id: GameID (số nguyên dương)
     * - req.user: { userId, username } (từ middleware authenticateToken)
     * 
     * Contract đầu ra:
     * - HTTP 200: Resumable state ({ success: true, resumable: true, gameId, status, currentTurn, game, players, state, moves })
     * - HTTP 400: GameID không hợp lệ hoặc ván cờ đã kết thúc (FINISHED)
     * - HTTP 401: Thiếu hoặc token không hợp lệ
     * - HTTP 403: Người dùng không phải là người tham gia ván cờ
     * - HTTP 404: Không tìm thấy ván cờ
     * 
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} [next]
     */
    async continueGame(req, res, next) {
        try {
            // 1. Validate GameID là số nguyên
            const rawId = req.params && req.params.id;
            const gameId = parseInt(rawId, 10);
            if (!rawId || Number.isNaN(gameId) || gameId <= 0 || String(gameId) !== String(rawId).trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'GameID không hợp lệ (yêu cầu số nguyên dương)'
                });
            }

            // 2. Kiểm tra xác thực người dùng
            const userId = req.user && (req.user.userId ?? req.user.id);
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Yêu cầu xác thực tài khoản'
                });
            }

            // 3. Gọi service tiếp tục ván cờ
            const result = await this.gameSaveService.continueGame(gameId, userId);

            // 4. Trả về đúng contract: resumable state
            return res.status(200).json({
                success: true,
                resumable: result.resumable,
                gameId: result.gameId,
                status: result.status,
                currentTurn: result.currentTurn,
                game: result.game,
                players: result.players,
                state: result.state,
                moves: result.moves,
                message: result.message || 'Tiếp tục ván đấu thành công'
            });

        } catch (error) {
            const statusCode = error.status || 500;
            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Lỗi khi tiếp tục ván cờ'
            });
        }
    }
}

// Khởi tạo singleton instance mặc định
const defaultInstance = new GameController();

module.exports = defaultInstance;
module.exports.GameController = GameController;
module.exports.default = defaultInstance;

module.exports.saveGame = defaultInstance.saveGame.bind(defaultInstance);
module.exports.getGame = defaultInstance.getGame.bind(defaultInstance);
module.exports.continueGame = defaultInstance.continueGame.bind(defaultInstance);
