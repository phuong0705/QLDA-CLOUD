/**
 * save-load.js: Module quản lý luồng lưu và tải trạng thái ván cờ qua API
 * 
 * Phụ trách:
 * 1. Gọi gameApi để lưu ván cờ (POST /api/games/:id/save).
 * 2. Gọi gameApi để tải trạng thái ván cờ (GET /api/games/:id).
 * 3. Gọi gameApi để tiếp tục ván cờ (POST /api/games/:id/continue).
 * 4. Tự động kiểm tra tham số URL (?gameId=...) khi vào game.html để tải lại state từ server.
 */

class SaveLoadManager {
    /**
     * @param {Object} [api=null] - Đối tượng GameApi (mặc định lấy từ window.gameApi hoặc instance)
     */
    constructor(api = null) {
        this.api = api;
    }

    /**
     * Lấy GameApi instance hiện tại
     * @private
     * @returns {Object}
     */
    _getApi() {
        if (this.api) return this.api;
        if (typeof window !== 'undefined' && window.gameApi) {
            return window.gameApi;
        }
        // Thử require trong môi trường Node.js / test
        try {
            return require('../api/gameApi');
        } catch (e) {
            throw new Error('Chưa cấu hình GameApi cho SaveLoadManager');
        }
    }

    /**
     * Lưu trạng thái ván cờ hiện tại
     * @param {number|string} gameId - Khóa chính ván cờ
     * @returns {Promise<{gameId: number, savedAt: string, status: string}>}
     */
    async saveGame(gameId) {
        if (!gameId) {
            throw new Error('GameID là bắt buộc để lưu ván cờ');
        }
        const api = this._getApi();
        return api.saveGame(gameId);
    }

    /**
     * Tải toàn bộ trạng thái chi tiết của ván cờ từ server
     * @param {number|string} gameId - Khóa chính ván cờ
     * @returns {Promise<{game: Object, players: Object, state: Object, moves: Array}>}
     */
    async loadGame(gameId) {
        if (!gameId) {
            throw new Error('GameID là bắt buộc để tải ván cờ');
        }
        const api = this._getApi();
        return api.getGame(gameId);
    }

    /**
     * Tiếp tục ván cờ đã lưu (chuyển sang PLAYING và lấy resumable state)
     * @param {number|string} gameId - Khóa chính ván cờ
     * @returns {Promise<Object>} Resumable state
     */
    async continueGame(gameId) {
        if (!gameId) {
            throw new Error('GameID là bắt buộc để tiếp tục ván cờ');
        }
        const api = this._getApi();
        return api.continueGame(gameId);
    }

    /**
     * Kiểm tra tham số trên URL (gameId) và tự động tải trạng thái ván cờ nếu có
     * @returns {Promise<{resumed: boolean, gameId: number|null, gameData: Object|null}>}
     */
    async initFromUrl() {
        if (typeof window === 'undefined' || !window.location || !window.location.search) {
            return { resumed: false, gameId: null, gameData: null };
        }

        const urlParams = new URLSearchParams(window.location.search);
        const rawId = urlParams.get('gameId');
        const isContinue = urlParams.get('action') === 'continue' || urlParams.has('continue');

        if (!rawId) {
            return { resumed: false, gameId: null, gameData: null };
        }

        const gameId = parseInt(rawId, 10);
        if (Number.isNaN(gameId) || gameId <= 0) {
            console.warn('[SaveLoad] gameId trên URL không hợp lệ:', rawId);
            return { resumed: false, gameId: null, gameData: null };
        }

        try {
            let gameData;
            if (isContinue) {
                gameData = await this.continueGame(gameId);
            } else {
                gameData = await this.loadGame(gameId);
            }

            // Phát sự kiện trên window để các thành phần UI / Engine lắng nghe và cập nhật bàn cờ
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                try {
                    window.dispatchEvent(new CustomEvent('game:state-loaded', {
                        detail: {
                            gameId,
                            gameData
                        }
                    }));
                } catch (e) {
                    // Bỏ qua lỗi dispatch event
                }
            }

            return {
                resumed: true,
                gameId,
                gameData
            };
        } catch (error) {
            console.error(`[SaveLoad] Không thể tải trạng thái ván cờ #${gameId}:`, error.message);
            throw error;
        }
    }
}

// Khởi tạo instance dùng chung
const saveLoad = new SaveLoadManager();

// Xuất bản cho Browser
if (typeof window !== 'undefined') {
    window.SaveLoadManager = SaveLoadManager;
    window.saveLoad = saveLoad;

    // Tự động kiểm tra URL khi DOM sẵn sàng nếu đang ở trang game
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            saveLoad.initFromUrl().catch(() => {});
        });
    } else {
        saveLoad.initFromUrl().catch(() => {});
    }
}

// Xuất bản cho Node.js / Unit test runner
if (typeof module !== 'undefined' && module.exports) {
    module.exports = saveLoad;
    module.exports.SaveLoadManager = SaveLoadManager;
    module.exports.default = saveLoad;
}
