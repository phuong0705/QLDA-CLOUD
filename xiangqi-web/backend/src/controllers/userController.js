const userService = require('../services/userService');

/**
 * Controller xử lý các request liên quan đến User
 */
class UserController {
    /**
     * @param {Object} [service=userService] - Service người dùng
     */
    constructor(service = userService) {
        this.userService = service;
        this.getProfile = this.getProfile.bind(this);
        this.getMe = this.getMe.bind(this);
    }

    /**
     * Lấy profile của người dùng hiện tại
     * Endpoint: GET /api/users/me
     * 
     * Lưu ý bảo mật:
     * Tuyệt đối không đọc userId từ req.query hoặc req.body.
     * Chỉ dùng req.user.userId được gắn từ authenticateToken middleware.
     * 
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} [next]
     */
    async getProfile(req, res, next) {
        try {
            // Chỉ trích xuất userId từ req.user đã được xác thực an toàn qua token
            const userId = req.user && req.user.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Chưa được xác thực hoặc danh tính không hợp lệ'
                });
            }

            const user = await this.userService.getProfile(userId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Lấy thông tin người dùng thành công',
                data: {
                    user
                }
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message || 'Lỗi hệ thống'
            });
        }
    }

    /**
     * Alias cho getProfile
     */
    async getMe(req, res, next) {
        return this.getProfile(req, res, next);
    }
}

const defaultInstance = new UserController();

module.exports = defaultInstance;
module.exports.UserController = UserController;
module.exports.getProfile = defaultInstance.getProfile.bind(defaultInstance);
module.exports.getMe = defaultInstance.getMe.bind(defaultInstance);
