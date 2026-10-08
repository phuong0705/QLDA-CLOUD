/**
 * RankingApi: Lớp giao tiếp với REST API bảng xếp hạng (/api/rankings)
 * Xử lý fetch dữ liệu an toàn, bắt lỗi kết nối và parse JSON
 */
class RankingApi {
    /**
     * @param {string} [baseUrl] - Base URL cho API xếp hạng
     */
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl || this._resolveDefaultBaseUrl();
    }

    /**
     * Tự động xác định Base URL phù hợp với môi trường chạy
     * @private
     */
    _resolveDefaultBaseUrl() {
        if (typeof window !== 'undefined' && window.RANKING_API_BASE_URL) {
            return window.RANKING_API_BASE_URL;
        }

        if (typeof window !== 'undefined' && window.location) {
            if (window.location.protocol === 'file:') {
                return 'http://localhost:5000/api/rankings';
            }
            if (window.location.port && window.location.port !== '5000') {
                return 'http://localhost:5000/api/rankings';
            }
        }

        return '/api/rankings';
    }

    /**
     * Cập nhật Base URL khi cần thiết
     * @param {string} url
     */
    setBaseUrl(url) {
        this.baseUrl = url;
    }

    /**
     * Gửi request lấy bảng xếp hạng người chơi
     * @param {number} [limit=50] - Số lượng người chơi cần lấy
     * @returns {Promise<Object>} { success: true, data: { rankings: [...] } }
     */
    async getRankings(limit = 50) {
        const query = (limit !== undefined && limit !== null && limit !== '') 
            ? `?limit=${encodeURIComponent(limit)}` 
            : '';
        const url = `${this.baseUrl}${query}`;

        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
        } catch (networkError) {
            const error = new Error('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.');
            error.status = 0;
            error.isNetworkError = true;
            throw error;
        }

        let data;
        const text = await response.text();
        try {
            data = text ? JSON.parse(text) : {};
        } catch (parseError) {
            data = {
                success: false,
                message: `Lỗi phản hồi từ máy chủ (HTTP ${response.status})`
            };
        }

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
     * Alias method cho getRankings
     * @param {number|string} [limit=50]
     */
    async getLeaderboard(limit = 50) {
        return this.getRankings(limit);
    }
}

// Khởi tạo singleton instance dùng chung
const rankingApi = new RankingApi();

// Xuất bản cho Browser
if (typeof window !== 'undefined') {
    window.RankingApi = RankingApi;
    window.rankingApi = rankingApi;
}

// Xuất bản cho Node.js / Unit test runner
if (typeof module !== 'undefined' && module.exports) {
    module.exports = rankingApi;
    module.exports.RankingApi = RankingApi;
    module.exports.default = rankingApi;
}
