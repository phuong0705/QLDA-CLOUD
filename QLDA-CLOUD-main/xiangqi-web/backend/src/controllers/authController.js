const authService = require('../services/authService');

/**
 * Controller xử lý các request liên quan đến Authentication (Đăng ký, Đăng nhập)
 */
class AuthController {
    /**
     * @param {Object} [service=authService] - Service xác thực
     */
    constructor(service = authService) {
        this.authService = service;
        this.register = this.register.bind(this);
        this.login = this.login.bind(this);
    }

    /**
     * Xử lý yêu cầu đăng ký người dùng mới
     * Endpoint: POST /api/auth/register
     */
    async register(req, res, next) {
        try {
            const { username, email, password } = req.body || {};

            // Chú ý bảo mật: Tuyệt đối không log password hay req.body chứa password
            const registeredUser = await this.authService.register({ username, email, password });

            return res.status(201).json({
                success: true,
                message: 'Đăng ký tài khoản thành công',
                data: {
                    user: {
                        id: registeredUser.id,
                        username: registeredUser.username,
                        email: registeredUser.email,
                        elo: registeredUser.elo
                    }
                }
            });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 400) {
                return res.status(400).json({
                    success: false,
                    message: error.message || 'Dữ liệu đăng ký không hợp lệ',
                    errors: error.errors || [error.message]
                });
            }

            if (statusCode === 409) {
                return res.status(409).json({
                    success: false,
                    message: error.message || 'Tài khoản đã tồn tại'
                });
            }

            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Lỗi hệ thống'
            });
        }
    }

    /**
     * Xử lý yêu cầu đăng nhập người dùng
     * Endpoint: POST /api/auth/login
     * Contract: body: { login, password }
     *           200: { success: true, message, data: { token, user: { id, username, elo } } }
     */
    async login(req, res, next) {
        try {
            const { login, password, username, email } = req.body || {};
            const loginIdentifier = login ?? username ?? email;

            // Chú ý bảo mật: Tuyệt đối không log password
            const result = await this.authService.login({
                login: loginIdentifier,
                password
            });

            return res.status(200).json({
                success: true,
                message: 'Đăng nhập thành công',
                data: {
                    token: result.token,
                    user: {
                        id: result.user.id,
                        username: result.user.username,
                        elo: result.user.elo
                    }
                }
            });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 400) {
                return res.status(400).json({
                    success: false,
                    message: error.message || 'Vui lòng cung cấp đầy đủ thông tin đăng nhập'
                });
            }

            // Trả 401 khi sai password hoặc user không tồn tại mà không tiết lộ chi tiết
            if (statusCode === 401) {
                return res.status(401).json({
                    success: false,
                    message: error.message || 'Thông tin đăng nhập hoặc mật khẩu không chính xác'
                });
            }

            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Lỗi hệ thống'
            });
        }
    }
}

const defaultInstance = new AuthController();

module.exports = defaultInstance;
module.exports.AuthController = AuthController;
module.exports.register = defaultInstance.register.bind(defaultInstance);
module.exports.login = defaultInstance.login.bind(defaultInstance);
