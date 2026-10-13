/**
 * UserApi: Lớp giao tiếp với REST API thông tin người dùng (/api/users)
 * Tự động gắn token xác thực từ authManager và xử lý lỗi phản hồi an toàn
 */
class UserApi {
    /**
     * @param {string} [baseUrl] - Base URL cho API người dùng
     */
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl || this._resolveDefaultBaseUrl();
    }

    /**
     * Tự động xác định Base URL phù hợp với môi trường chạy
     * @private
     */
    _resolveDefaultBaseUrl() {
        if (typeof window !== 'undefined' && window.USER_API_BASE_URL) {
            return window.USER_API_BASE_URL;
        }

        if (typeof window !== 'undefined' && window.location) {
            if (window.location.protocol === 'file:') {
                return 'http://localhost:5000/api/users';
            }
            if (window.location.port && window.location.port !== '5000') {
                return 'http://localhost:5000/api/users';
            }
        }

        return '/api/users';
    }

    /**
     * Cập nhật Base URL khi cần thiết
     * @param {string} url
     */
    setBaseUrl(url) {
        this.baseUrl = url;
    }

    /**
     * Gửi HTTP request có kèm Authorization token và xử lý lỗi chuẩn hóa
     * @private
     * @param {string} endpoint - Tuyến đường con
     * @param {Object} options - Cấu hình fetch
     * @returns {Promise<Object>} Response data
     */
    async _request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        // Lấy token xác thực từ authManager nếu có
        let authHeader = {};
        if (typeof authManager !== 'undefined' && typeof authManager.getAuthHeader === 'function') {
            authHeader = authManager.getAuthHeader();
        } else if (typeof localStorage !== 'undefined') {
            const token = localStorage.getItem('xiangqi_auth_token');
            if (token) {
                authHeader = { Authorization: `Bearer ${token}` };
            }
        }

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...authHeader,
            ...(options.headers || {})
        };

        let response;
        try {
            response = await fetch(url, {
                ...options,
                headers
            });
        } catch (networkError) {
            const error = new Error('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.');
            error.status = 0;
            error.isNetworkError = true;
            throw error;
        }

        let data;
        const textResponse = await response.text();
        try {
            data = textResponse ? JSON.parse(textResponse) : {};
        } catch (parseError) {
            data = {
                success: false,
                message: `Lỗi phản hồi từ máy chủ (HTTP ${response.status})`
            };
        }

        // Xử lý khi HTTP status không thành công
        if (!response.ok) {
            const error = new Error(data.message || `Yêu cầu thất bại với mã lỗi HTTP ${response.status}`);
            error.status = response.status;
            error.statusCode = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    /**
     * Lấy thông tin profile người dùng hiện tại (GET /api/users/me)
     * @returns {Promise<Object>} Phản hồi từ server { success: true, data: { user } }
     */
    async getMe() {
        return this._request('/me', {
            method: 'GET'
        });
    }
}

// Khởi tạo singleton instance dùng chung
const userApi = new UserApi();

// Xuất bản cho Browser
if (typeof window !== 'undefined') {
    window.UserApi = UserApi;
    window.userApi = userApi;
}

// Xuất bản cho Node.js / Unit test runner
if (typeof module !== 'undefined' && module.exports) {
    module.exports = userApi;
    module.exports.UserApi = UserApi;
    module.exports.default = userApi;
}
