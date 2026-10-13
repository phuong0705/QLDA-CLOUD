/**
 * GameApi: Lớp giao tiếp với REST API ván đấu (/api/games) và lịch sử (/api/history)
 * Tự động gắn token xác thực từ authManager / localStorage, xử lý lỗi mạng và token hết hạn.
 */
class GameApi {
    /**
     * @param {string} [baseUrl] - Base URL cho API
     */
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl || this._resolveDefaultBaseUrl();
    }

    /**
     * Tự động xác định Base URL phù hợp với môi trường chạy
     * @private
     */
    _resolveDefaultBaseUrl() {
        if (typeof window !== 'undefined' && window.GAME_API_BASE_URL) {
            return window.GAME_API_BASE_URL;
        }

        if (typeof window !== 'undefined' && window.location) {
            if (window.location.protocol === 'file:') {
                return 'http://localhost:5000/api';
            }
            if (window.location.port && window.location.port !== '5000') {
                return 'http://localhost:5000/api';
            }
        }

        return '/api';
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

        // Lấy token xác thực từ authManager nếu có hoặc từ localStorage
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

            // Xử lý đặc thù khi token hết hạn hoặc không hợp lệ (HTTP 401)
            if (response.status === 401) {
                error.isExpiredToken = true;
                if (typeof authManager !== 'undefined' && typeof authManager.logout === 'function') {
                    authManager.logout();
                }
            }

            throw error;
        }

        return data;
    }

    /**
     * Lấy lịch sử đấu của người dùng hiện tại có phân trang (GET /api/history)
     * @param {number} [page=1] - Số trang
     * @param {number} [pageSize=20] - Kích thước trang
     * @returns {Promise<{items: Array, total: number, page: number, pageSize: number}>}
     */
    async getHistory(page = 1, pageSize = 20) {
        const query = `?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`;
        return this._request(`/history${query}`, {
            method: 'GET'
        });
    }

    /**
     * Lấy chi tiết thông tin ván cờ, trạng thái bàn cờ và lịch sử nước đi (GET /api/games/:id)
     * @param {number|string} gameId - Khóa chính ván cờ
     * @returns {Promise<{game: Object, players: Object, state: Object, moves: Array}>}
     */
    async getGame(gameId) {
        return this._request(`/games/${gameId}`, {
            method: 'GET'
        });
    }

    /**
     * Lưu trạng thái hiện tại của ván cờ (POST /api/games/:id/save)
     * @param {number|string} gameId - Khóa chính ván cờ
     * @returns {Promise<{gameId: number, savedAt: string, status: string}>}
     */
    async saveGame(gameId) {
        return this._request(`/games/${gameId}/save`, {
            method: 'POST'
        });
    }

    /**
     * Tiếp tục ván cờ đã lưu (POST /api/games/:id/continue)
     * @param {number|string} gameId - Khóa chính ván cờ
     * @returns {Promise<Object>} Resumable state đầy đủ
     */
    async continueGame(gameId) {
        return this._request(`/games/${gameId}/continue`, {
            method: 'POST'
        });
    }
}

// Khởi tạo singleton instance dùng chung
const gameApi = new GameApi();

// Xuất bản cho Browser
if (typeof window !== 'undefined') {
    window.GameApi = GameApi;
    window.gameApi = gameApi;
}

// Xuất bản cho Node.js / Unit test runner
if (typeof module !== 'undefined' && module.exports) {
    module.exports = gameApi;
    module.exports.GameApi = GameApi;
    module.exports.default = gameApi;
}
