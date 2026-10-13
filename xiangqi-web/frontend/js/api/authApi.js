/**
 * AuthApi: Lớp giao tiếp với REST API xác thực của backend
 * Bọc fetch, chuẩn hóa xử lý lỗi mạng (Network error) và lỗi JSON từ server
 */
class AuthApi {
    /**
     * @param {string} [baseUrl] - Base URL cho API xác thực
     */
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl || this._resolveDefaultBaseUrl();
    }

    /**
     * Tự động xác định Base URL phù hợp với môi trường chạy (Local, Proxy, Live Server)
     * @private
     */
    _resolveDefaultBaseUrl() {
        if (typeof window !== 'undefined' && window.API_BASE_URL) {
            return window.API_BASE_URL;
        }

        if (typeof window !== 'undefined' && window.location) {
            // Trường hợp mở trực tiếp file:// trong trình duyệt
            if (window.location.protocol === 'file:') {
                return 'http://localhost:5000/api/auth';
            }
            // Trường hợp chạy qua Live Server hoặc port dev khác 5000
            if (window.location.port && window.location.port !== '5000') {
                return 'http://localhost:5000/api/auth';
            }
        }

        return '/api/auth';
    }

    /**
     * Thay đổi base URL khi cần
     * @param {string} url
     */
    setBaseUrl(url) {
        this.baseUrl = url;
    }

    /**
     * Gửi HTTP request an toàn và chuẩn hóa kết quả phản hồi
     * @private
     * @param {string} endpoint - Tuyến đường API con
     * @param {Object} options - Cấu hình fetch
     * @returns {Promise<Object>} Response data
     */
    async _request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(options.headers || {})
        };

        let response;
        try {
            response = await fetch(url, {
                ...options,
                headers
            });
        } catch (networkError) {
            // Xử lý lỗi kết nối mạng (Server tắt, mất kết nối, CORS chặn)
            const error = new Error('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.');
            error.status = 0;
            error.isNetworkError = true;
            throw error;
        }

        // Parse JSON an toàn (kể cả khi server trả HTML hoặc nội dung trống)
        let data;
        const textResponse = await response.text();
        try {
            data = textResponse ? JSON.parse(textResponse) : {};
        } catch (jsonParseError) {
            data = {
                success: false,
                message: `Lỗi phản hồi không đúng định dạng từ máy chủ (HTTP ${response.status})`
            };
        }

        // Kiểm tra mã trạng thái HTTP
        if (!response.ok) {
            const error = new Error(data.message || `Yêu cầu thất bại với mã lỗi HTTP ${response.status}`);
            error.status = response.status;
            error.statusCode = response.status;
            error.data = data;
            error.errors = data.errors || [];
            throw error;
        }

        return data;
    }

    /**
     * Gọi API đăng ký tài khoản mới: POST /api/auth/register
     * @param {Object} payload - { username, email, password }
     * @returns {Promise<Object>} { success: true, message, data: { user } }
     */
    async register({ username, email, password }) {
        return this._request('/register', {
            method: 'POST',
            body: JSON.stringify({
                username: username ? username.trim() : '',
                email: email ? email.trim() : '',
                password
            })
        });
    }

    /**
     * Gọi API đăng nhập tài khoản: POST /api/auth/login
     * @param {Object} payload - { login, password }
     * @returns {Promise<Object>} { success: true, message, data: { token, user } }
     */
    async login({ login, password }) {
        return this._request('/login', {
            method: 'POST',
            body: JSON.stringify({
                login: login ? login.trim() : '',
                password
            })
        });
    }
}

// Khởi tạo singleton instance dùng chung
const authApi = new AuthApi();

// Xuất bản cho Browser
if (typeof window !== 'undefined') {
    window.AuthApi = AuthApi;
    window.authApi = authApi;
}

// Xuất bản cho môi trường Node.js / Unit test
if (typeof module !== 'undefined' && module.exports) {
    module.exports = authApi;
    module.exports.AuthApi = AuthApi;
    module.exports.default = authApi;
}
