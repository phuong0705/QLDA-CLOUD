const gameService = require('../services/gameService');

/**
 * Controller xử lý lịch sử đấu của người dùng (History Controller)
 */
class HistoryController {
    /**
     * @param {Object} [service=gameService] - Service xử lý ván đấu và lịch sử
     */
    constructor(service = gameService) {
        this.gameService = service;
        this.getHistory = this.getHistory.bind(this);
    }

    /**
     * Endpoint: GET /api/history
     * Lấy danh sách lịch sử đấu của người dùng hiện tại có phân trang và sắp xếp mới nhất trước.
     * 
     * Query Parameters:
     * - page: Số trang (mặc định 1)
     * - pageSize: Kích thước trang (mặc định 20, tối đa 100)
     * 
     * Contract đầu vào:
     * - req.user: { userId, username } (gắn bởi middleware authenticateToken)
     * 
     * Contract đầu ra:
     * - HTTP 200: { success: true, items, total, page, pageSize }
     * - HTTP 401: Thiếu hoặc token không hợp lệ
     * - HTTP 500: Lỗi hệ thống
     * 
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} [next]
     */
    async getHistory(req, res, next) {
        try {
            // 1. Xác thực người dùng qua token
            const userId = req.user && (req.user.userId ?? req.user.id);
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Yêu cầu xác thực tài khoản'
                });
            }

            // 2. Validate và chuẩn hóa tham số phân trang
            const page = parseInt(req.query.page, 10) || 1;
            const pageSize = parseInt(req.query.pageSize, 10) || 20;

            // 3. Gọi service lấy danh sách lịch sử
            const result = await this.gameService.getUserGameHistory(userId, { page, pageSize });

            // 4. Trả về đúng contract bắt buộc: { items, total, page, pageSize }
            return res.status(200).json({
                success: true,
                items: result.items,
                total: result.total,
                page: result.page,
                pageSize: result.pageSize
            });

        } catch (error) {
            const statusCode = error.status || 500;
            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Lỗi khi tải lịch sử đấu'
            });
        }
    }
}

const defaultInstance = new HistoryController();

module.exports = defaultInstance;
module.exports.HistoryController = HistoryController;
module.exports.default = defaultInstance;

module.exports.getHistory = defaultInstance.getHistory.bind(defaultInstance);
