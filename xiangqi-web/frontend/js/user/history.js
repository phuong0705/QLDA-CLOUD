/**
 * history.js: Điều phối hiển thị trang Lịch sử & Ván cờ đã lưu (history.html)
 * 
 * Phụ trách:
 * 1. Gọi gameApi.getHistory() lấy dữ liệu thật từ backend (tuyệt đối không hard-code).
 * 2. Phân tách và hiển thị 2 khu vực:
 *    - Saved/Resumable Games: Ván cờ đang tạm lưu, có nút "Tiếp tục" (chỉ xuất hiện khi resumable).
 *    - Match History: Trận đấu đã hoàn tất, hiển thị badge WIN/LOSS/DRAW (không hiển thị Continue).
 * 3. Quản lý trạng thái: Loading Skeleton, Empty States (cho cả 2 khu vực), Error State, Expired Token.
 * 4. Chuyển hướng đúng gameId khi click Continue: game.html?gameId=...
 * 5. Format ngày giờ thân thiện, dễ đọc.
 */

class HistoryPageController {
    /**
     * @param {Object} [api=gameApi] - Instance của GameApi
     * @param {Object} [auth=authManager] - Instance của AuthManager
     */
    constructor(api = null, auth = null) {
        this.api = api;
        this.auth = auth;
        this.currentPage = 1;
        this.pageSize = 20;
        this.totalGames = 0;
    }

    /**
     * Lấy GameApi instance
     * @private
     */
    _getApi() {
        if (this.api) return this.api;
        if (typeof window !== 'undefined' && window.gameApi) {
            return window.gameApi;
        }
        try {
            return require('../api/gameApi');
        } catch (e) {
            throw new Error('Chưa cấu hình GameApi cho HistoryPageController');
        }
    }

    /**
     * Lấy AuthManager instance
     * @private
     */
    _getAuth() {
        if (this.auth) return this.auth;
        if (typeof window !== 'undefined' && window.authManager) {
            return window.authManager;
        }
        try {
            return require('../auth/authManager');
        } catch (e) {
            return null;
        }
    }

    /**
     * Khởi tạo trang, gắn sự kiện và tải dữ liệu ban đầu
     */
    init() {
        this._bindEvents();

        const auth = this._getAuth();
        if (auth && typeof auth.isAuthenticated === 'function') {
            if (!auth.isAuthenticated()) {
                this.showAuthRequired('Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập để xem lịch sử.');
                return;
            }
        }

        this.loadHistory(1);
    }

    /**
     * Gắn các sự kiện trên trang
     * @private
     */
    _bindEvents() {
        if (typeof document === 'undefined') return;

        // Nút Thử lại khi gặp lỗi
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.loadHistory(this.currentPage);
            });
        }

        // Nút phân trang
        const prevBtn = document.getElementById('prevPageBtn');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.loadHistory(this.currentPage - 1);
                }
            });
        }

        const nextBtn = document.getElementById('nextPageBtn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.totalGames / this.pageSize) || 1;
                if (this.currentPage < totalPages) {
                    this.loadHistory(this.currentPage + 1);
                }
            });
        }

        // Lắng nghe sự kiện click trên các nút Continue
        const savedGrid = document.getElementById('savedGamesGrid');
        if (savedGrid) {
            savedGrid.addEventListener('click', (e) => {
                const continueBtn = e.target.closest('.btn-continue');
                if (continueBtn) {
                    const gameId = continueBtn.getAttribute('data-game-id');
                    if (gameId) {
                        this.handleContinueGame(gameId);
                    }
                }
            });
        }
    }

    /**
     * Chuyển hướng người dùng tiếp tục ván đấu đến game.html?gameId=...
     * @param {number|string} gameId
     */
    handleContinueGame(gameId) {
        if (!gameId) return;
        const targetUrl = `game.html?gameId=${encodeURIComponent(gameId)}&action=continue`;
        if (typeof window !== 'undefined' && window.location) {
            window.location.href = targetUrl;
        }
        return targetUrl;
    }

    /**
     * Tải danh sách lịch sử từ API backend thật
     * @param {number} [page=1]
     */
    async loadHistory(page = 1) {
        this.currentPage = page;
        this.showLoading();

        try {
            const api = this._getApi();
            const response = await api.getHistory(page, this.pageSize);

            const items = (response && response.items) ? response.items : [];
            const total = (response && response.total !== undefined) ? response.total : items.length;
            this.totalGames = total;

            this.renderData(items, total, page, this.pageSize);
        } catch (error) {
            console.error('[History] Lỗi khi tải lịch sử:', error);

            if (error.isExpiredToken || error.status === 401) {
                this.showAuthRequired('Phiên làm việc của bạn đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.');
            } else {
                this.showError(error.message || 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
            }
        }
    }

    /**
     * Phân loại và render dữ liệu vào 2 khu vực: Saved Games & Match History
     * @param {Array<Object>} items - Danh sách ván cờ từ backend
     * @param {number} total - Tổng số bản ghi
     * @param {number} page - Trang hiện tại
     * @param {number} pageSize - Kích thước trang
     */
    renderData(items = [], total = 0, page = 1, pageSize = 20) {
        if (typeof document === 'undefined') return;

        // Phân tách 2 nhóm ván cờ:
        // 1. Saved / Resumable Games: status !== 'FINISHED' (SAVED, PLAYING, WAITING)
        // 2. Match History: status === 'FINISHED'
        const savedGames = items.filter(game => game.status !== 'FINISHED');
        const matchHistory = items.filter(game => game.status === 'FINISHED');

        this.renderSavedGames(savedGames);
        this.renderMatchHistory(matchHistory, total, page, pageSize);

        this.showContent();
    }

    /**
     * Render Khu vực 1: Saved / Resumable Games
     * @param {Array<Object>} savedGames
     */
    renderSavedGames(savedGames = []) {
        const countBadge = document.getElementById('savedGamesCount');
        const grid = document.getElementById('savedGamesGrid');
        const emptyBox = document.getElementById('savedGamesEmpty');

        if (countBadge) {
            countBadge.textContent = `${savedGames.length} ván`;
        }

        if (!grid || !emptyBox) return;

        grid.innerHTML = '';

        if (savedGames.length === 0) {
            emptyBox.style.display = 'flex';
            grid.style.display = 'none';
            return;
        }

        emptyBox.style.display = 'none';
        grid.style.display = 'grid';

        for (const game of savedGames) {
            const card = document.createElement('article');
            card.className = 'saved-game-card';
            card.setAttribute('aria-label', `Ván cờ lưu #${game.gameId}`);

            const formattedDate = this.formatDateTime(game.createdAt || game.startedAt);
            const isRed = game.playerColor === 'RED';
            const colorName = isRed ? 'Quân Đỏ' : 'Quân Đen';
            const colorBadgeClass = isRed ? 'badge-red' : 'badge-black';

            let opponentName = 'AI';
            if (game.opponent && game.opponent.username) {
                opponentName = game.opponent.username;
            } else if (game.gameMode === 'ONLINE') {
                opponentName = 'Chưa có đối thủ';
            }

            const statusText = game.status === 'SAVED' ? 'Tạm lưu' : (game.status === 'PLAYING' ? 'Đang chơi' : 'Đang chờ');

            card.innerHTML = `
                <div class="saved-card-header">
                    <div class="saved-card-id">
                        <span>🎲</span> Ván #${game.gameId}
                    </div>
                    <span class="badge badge-mode">${game.gameMode === 'AI' ? 'Đấu Máy' : 'Online'}</span>
                </div>
                <div class="saved-card-body">
                    <div class="saved-card-row">
                        <span>Phe bạn cầm:</span>
                        <span class="badge ${colorBadgeClass}">${colorName}</span>
                    </div>
                    <div class="saved-card-row">
                        <span>Đối thủ:</span>
                        <span style="font-weight: 600; color: #f8fafc;">${this.escapeHtml(opponentName)}</span>
                    </div>
                    <div class="saved-card-row">
                        <span>Số nước đã đi:</span>
                        <span>${game.moveCount || 0} nước</span>
                    </div>
                    <div class="saved-card-row">
                        <span>Thời gian lưu:</span>
                        <span style="font-size: 0.8rem; color: #94a3b8;">${formattedDate}</span>
                    </div>
                </div>
                <div class="saved-card-footer">
                    <span class="badge badge-draw">${statusText}</span>
                    <button type="button" class="btn btn-primary btn-sm btn-continue" data-game-id="${game.gameId}">
                        ▶ Tiếp tục chơi
                    </button>
                </div>
            `;

            grid.appendChild(card);
        }
    }

    /**
     * Render Khu vực 2: Match History
     * @param {Array<Object>} matchHistory
     * @param {number} total
     * @param {number} page
     * @param {number} pageSize
     */
    renderMatchHistory(matchHistory = [], total = 0, page = 1, pageSize = 20) {
        const countBadge = document.getElementById('matchHistoryCount');
        const tbody = document.getElementById('matchHistoryTbody');
        const emptyBox = document.getElementById('matchHistoryEmpty');
        const tableContainer = document.getElementById('matchHistoryTableContainer');
        const paginationBar = document.getElementById('paginationBar');

        if (countBadge) {
            countBadge.textContent = `${total} trận`;
        }

        if (!tbody || !emptyBox || !tableContainer) return;

        tbody.innerHTML = '';

        if (matchHistory.length === 0) {
            emptyBox.style.display = 'flex';
            tableContainer.style.display = 'none';
            if (paginationBar) paginationBar.style.display = 'none';
            return;
        }

        emptyBox.style.display = 'none';
        tableContainer.style.display = 'block';

        for (const game of matchHistory) {
            const tr = document.createElement('tr');

            const formattedDate = this.formatDateTime(game.endedAt || game.createdAt);
            const isRed = game.playerColor === 'RED';
            const colorName = isRed ? 'Đỏ' : 'Đen';
            const colorBadgeClass = isRed ? 'badge-red' : 'badge-black';

            // Opponent name & info
            let opponentDisplay = 'Máy (AI)';
            let opponentInitial = 'AI';
            let eloDisplay = '';

            if (game.opponent && !game.opponent.isAI && game.opponent.username) {
                opponentDisplay = this.escapeHtml(game.opponent.username);
                opponentInitial = opponentDisplay.charAt(0).toUpperCase();
                if (game.opponent.eloRating) {
                    eloDisplay = `<span class="opponent-elo">Elo: ${game.opponent.eloRating}</span>`;
                }
            } else if (game.gameMode === 'ONLINE') {
                opponentDisplay = 'Không xác định';
            }

            // Result Badge: WIN / LOSS / DRAW
            let resultBadgeHtml = '';
            if (game.result === 'WIN') {
                resultBadgeHtml = `<span class="badge badge-win">🏆 Thắng</span>`;
            } else if (game.result === 'LOSS') {
                resultBadgeHtml = `<span class="badge badge-loss">❌ Thua</span>`;
            } else if (game.result === 'DRAW') {
                resultBadgeHtml = `<span class="badge badge-draw">🤝 Hòa</span>`;
            } else {
                resultBadgeHtml = `<span class="badge">${this.escapeHtml(game.result || '--')}</span>`;
            }

            // Nút hành động: Cho xem lại trận đấu, TUYỆT ĐỐI KHÔNG HIỂN THỊ NÚT CONTINUE CHO FINISHED
            const actionHtml = `
                <a href="game.html?gameId=${encodeURIComponent(game.gameId)}&mode=review" class="btn btn-outline btn-sm">
                    👁️ Xem lại
                </a>
            `;

            tr.innerHTML = `
                <td style="font-family: monospace; font-weight: 700; color: #60a5fa;">#${game.gameId}</td>
                <td style="white-space: nowrap; color: #94a3b8; font-size: 0.82rem;">${formattedDate}</td>
                <td><span class="badge badge-mode">${game.gameMode === 'AI' ? 'Đấu Máy' : 'Online'}</span></td>
                <td><span class="badge ${colorBadgeClass}">${colorName}</span></td>
                <td>
                    <div class="opponent-cell">
                        <div class="opponent-avatar" aria-hidden="true">${opponentInitial}</div>
                        <div>
                            <div class="opponent-name">${opponentDisplay}</div>
                            ${eloDisplay}
                        </div>
                    </div>
                </td>
                <td style="font-weight: 600;">${game.moveCount || 0}</td>
                <td>${resultBadgeHtml}</td>
                <td>${actionHtml}</td>
            `;

            tbody.appendChild(tr);
        }

        // Cập nhật Pagination Bar
        if (paginationBar) {
            const totalPages = Math.ceil(total / pageSize) || 1;
            paginationBar.style.display = total > pageSize ? 'flex' : 'none';

            const paginationInfo = document.getElementById('paginationInfo');
            if (paginationInfo) {
                paginationInfo.textContent = `Trang ${page} / ${totalPages} (Tổng cộng ${total} trận)`;
            }

            const prevBtn = document.getElementById('prevPageBtn');
            const nextBtn = document.getElementById('nextPageBtn');

            if (prevBtn) prevBtn.disabled = (page <= 1);
            if (nextBtn) nextBtn.disabled = (page >= totalPages);
        }
    }

    /**
     * Hiển thị trạng thái Loading
     */
    showLoading() {
        if (typeof document === 'undefined') return;
        const loading = document.getElementById('loadingSection');
        const content = document.getElementById('contentSection');
        const error = document.getElementById('errorSection');
        const auth = document.getElementById('authRequiredSection');

        if (loading) loading.style.display = 'block';
        if (content) content.style.display = 'none';
        if (error) error.style.display = 'none';
        if (auth) auth.style.display = 'none';
    }

    /**
     * Hiển thị nội dung chính
     */
    showContent() {
        if (typeof document === 'undefined') return;
        const loading = document.getElementById('loadingSection');
        const content = document.getElementById('contentSection');
        const error = document.getElementById('errorSection');
        const auth = document.getElementById('authRequiredSection');

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';
        if (error) error.style.display = 'none';
        if (auth) auth.style.display = 'none';
    }

    /**
     * Hiển thị thông báo lỗi
     * @param {string} message
     */
    showError(message) {
        if (typeof document === 'undefined') return;
        const loading = document.getElementById('loadingSection');
        const content = document.getElementById('contentSection');
        const error = document.getElementById('errorSection');
        const auth = document.getElementById('authRequiredSection');

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'none';
        if (auth) auth.style.display = 'none';

        if (error) {
            error.style.display = 'flex';
            const errorMsg = document.getElementById('errorMessage');
            if (errorMsg) {
                errorMsg.textContent = message || 'Đã có lỗi xảy ra khi tải dữ liệu.';
            }
        }
    }

    /**
     * Hiển thị màn hình yêu cầu đăng nhập khi chưa có hoặc token hết hạn
     * @param {string} [customMessage]
     */
    showAuthRequired(customMessage) {
        if (typeof document === 'undefined') return;
        const loading = document.getElementById('loadingSection');
        const content = document.getElementById('contentSection');
        const error = document.getElementById('errorSection');
        const auth = document.getElementById('authRequiredSection');

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'none';
        if (error) error.style.display = 'none';

        if (auth) {
            auth.style.display = 'flex';
            if (customMessage) {
                const msgEl = document.getElementById('authRequiredMessage');
                if (msgEl) msgEl.textContent = customMessage;
            }
        }
    }

    /**
     * Định dạng ngày giờ thân thiện, dễ đọc theo định dạng DD/MM/YYYY HH:mm
     * @param {string|Date} isoString
     * @returns {string}
     */
    formatDateTime(isoString) {
        if (!isoString) return '--';
        try {
            const date = new Date(isoString);
            if (Number.isNaN(date.getTime())) return '--';

            const pad = (n) => String(n).padStart(2, '0');
            const day = pad(date.getDate());
            const month = pad(date.getMonth() + 1);
            const year = date.getFullYear();
            const hours = pad(date.getHours());
            const minutes = pad(date.getMinutes());

            return `${day}/${month}/${year} ${hours}:${minutes}`;
        } catch (e) {
            return '--';
        }
    }

    /**
     * Escape HTML ngăn ngừa XSS
     * @param {string} str
     * @returns {string}
     */
    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Khởi tạo instance
const historyPage = new HistoryPageController();

// Xuất bản cho Browser
if (typeof window !== 'undefined') {
    window.HistoryPageController = HistoryPageController;
    window.historyPage = historyPage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            historyPage.init();
        });
    } else {
        historyPage.init();
    }
}

// Xuất bản cho Node.js / Unit test runner
if (typeof module !== 'undefined' && module.exports) {
    module.exports = historyPage;
    module.exports.HistoryPageController = HistoryPageController;
    module.exports.default = historyPage;
}
