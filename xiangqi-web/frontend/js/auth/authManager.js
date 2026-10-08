/**
 * AuthManager: Quản lý trạng thái xác thực phía Frontend (Client-side Auth Manager)
 * 
 * Lưu trữ JWT token và user profile cache trên localStorage.
 * Thiết kế Stateless: việc logout phía client là xóa sạch token và user cache.
 * Tuyệt đối không lưu trữ hay yêu cầu JWT Secret tại frontend.
 */
class AuthManager {
    constructor() {
        this.TOKEN_KEY = 'xiangqi_auth_token';
        this.USER_KEY = 'xiangqi_auth_user';
    }

    /**
     * Lấy JWT token từ bộ nhớ client
     * @returns {string|null}
     */
    getToken() {
        try {
            return localStorage.getItem(this.TOKEN_KEY);
        } catch (error) {
            console.error('Lỗi khi đọc token từ localStorage:', error);
            return null;
        }
    }

    /**
     * Lấy thông tin user hiện tại từ cache
     * @returns {{ id: number, username: string, elo: number }|null}
     */
    getUser() {
        try {
            const rawUser = localStorage.getItem(this.USER_KEY);
            return rawUser ? JSON.parse(rawUser) : null;
        } catch (error) {
            console.error('Lỗi khi đọc user cache từ localStorage:', error);
            return null;
        }
    }

    /**
     * Lưu trữ phiên đăng nhập (JWT token và thông tin người dùng)
     * @param {string} token - JWT token được cấp từ backend
     * @param {Object} user - Public user object { id, username, elo }
     */
    setAuth(token, user) {
        try {
            if (token) {
                localStorage.setItem(this.TOKEN_KEY, token);
            }
            if (user) {
                localStorage.setItem(this.USER_KEY, JSON.stringify(user));
            }
        } catch (error) {
            console.error('Lỗi khi lưu thông tin xác thực vào localStorage:', error);
        }
    }

    /**
     * Cập nhật thông tin user cache (ví dụ: cập nhật elo sau trận đấu)
     * @param {Object} user
     */
    setUser(user) {
        try {
            if (user) {
                localStorage.setItem(this.USER_KEY, JSON.stringify(user));
            }
        } catch (error) {
            console.error('Lỗi khi cập nhật user cache:', error);
        }
    }

    /**
     * Kiểm tra xem người dùng đã đăng nhập và token còn hiệu lực hay không
     * Giải mã an toàn phần payload của JWT để kiểm tra thời gian hết hạn (exp)
     * @returns {boolean}
     */
    isAuthenticated() {
        const token = this.getToken();
        if (!token) return false;

        try {
            const parts = token.split('.');
            if (parts.length !== 3) return false;

            // Base64URL decode payload (không cần secret)
            const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
            const payload = JSON.parse(payloadJson);

            // Kiểm tra thời hạn hết hạn
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                // Token đã hết hạn -> Tự động dọn dẹp trạng thái
                this.logout();
                return false;
            }

            return true;
        } catch (error) {
            // Token không đúng định dạng
            return false;
        }
    }

    /**
     * Đăng xuất người dùng: Xóa token và user cache khỏi client.
     * Vì kiến trúc JWT là stateless, client chỉ cần xóa token cục bộ.
     * Dự án chưa có cơ chế token blacklist nên không gửi request revoke giả lập lên server.
     */
    logout() {
        try {
            localStorage.removeItem(this.TOKEN_KEY);
            localStorage.removeItem(this.USER_KEY);
        } catch (error) {
            console.error('Lỗi khi dọn dẹp phiên làm việc:', error);
        }

        // Bắn event để các thành phần giao diện (UI) lắng nghe và đồng bộ lại trạng thái
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            try {
                window.dispatchEvent(new CustomEvent('auth:logout'));
            } catch (ignored) {}
        }
    }

    /**
     * Tiện ích lấy Authorization Header gửi kèm trong các request tới REST API
     * @returns {Object} { Authorization: 'Bearer <token>' } hoặc {}
     */
    getAuthHeader() {
        const token = this.getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }
}

// Khởi tạo singleton instance dùng chung toàn ứng dụng
const authManager = new AuthManager();

// Xuất bản cho trình duyệt (Window)
if (typeof window !== 'undefined') {
    window.AuthManager = AuthManager;
    window.authManager = authManager;
}

// Xuất bản cho môi trường Node.js / Unit test runner (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = authManager;
    module.exports.AuthManager = AuthManager;
    module.exports.default = authManager;
}
