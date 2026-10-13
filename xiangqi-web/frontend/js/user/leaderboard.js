/**
 * Xử lý logic hiển thị Bảng xếp hạng kỳ thủ (leaderboard.js)
 * Tích hợp rankingApi, render thứ hạng, Elo, thống kê trận đấu và quản lý các trạng thái loading/error/empty
 */

/**
 * Thoát các ký tự HTML nguy hiểm để chống tấn công XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Lấy huy hiệu hoặc biểu tượng thứ hạng cho Top 3
 * @param {number} rank
 * @returns {string}
 */
function getRankBadge(rank) {
    if (rank === 1) return '<span class="rank-badge rank-1" aria-label="Hạng 1">🥇 1</span>';
    if (rank === 2) return '<span class="rank-badge rank-2" aria-label="Hạng 2">🥈 2</span>';
    if (rank === 3) return '<span class="rank-badge rank-3" aria-label="Hạng 3">🥉 3</span>';
    return `<span class="rank-badge rank-other">${rank}</span>`;
}

document.addEventListener('DOMContentLoaded', () => {
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const emptyState = document.getElementById('emptyState');
    const tableContainer = document.getElementById('tableContainer');
    const leaderboardBody = document.getElementById('leaderboardBody');
    const errorMessage = document.getElementById('errorMessage');
    const retryBtn = document.getElementById('retryBtn');
    const limitSelect = document.getElementById('limitSelect');
    const totalCountText = document.getElementById('totalCountText');

    let currentLimit = 50;

    /**
     * Chuyển đổi hiển thị các trạng thái giao diện (loading / error / empty / content)
     * @param {'loading'|'error'|'empty'|'content'} state
     */
    function setState(state) {
        if (loadingState) loadingState.style.display = state === 'loading' ? 'block' : 'none';
        if (errorState) errorState.style.display = state === 'error' ? 'block' : 'none';
        if (emptyState) emptyState.style.display = state === 'empty' ? 'block' : 'none';
        if (tableContainer) tableContainer.style.display = state === 'content' ? 'block' : 'none';
    }

    /**
     * Tải dữ liệu bảng xếp hạng từ API và hiển thị lên giao diện
     * @param {number} limit
     */
    async function loadLeaderboard(limit = currentLimit) {
        setState('loading');

        try {
            const response = await rankingApi.getRankings(limit);
            const rankings = (response && response.data && response.data.rankings) 
                || (response && response.rankings) 
                || (response && response.data && Array.isArray(response.data) ? response.data : null)
                || (Array.isArray(response) ? response : []);

            // 1. Xử lý trạng thái rỗng (Empty State)
            if (!rankings || rankings.length === 0) {
                setState('empty');
                if (totalCountText) totalCountText.textContent = '0 kỳ thủ';
                return;
            }

            // 2. Render dữ liệu thật vào bảng xếp hạng
            renderLeaderboardTable(rankings);
            setState('content');

            if (totalCountText) {
                totalCountText.textContent = `${rankings.length} kỳ thủ hàng đầu`;
            }
        } catch (error) {
            // 3. Xử lý trạng thái lỗi (Error State)
            setState('error');
            if (errorMessage) {
                errorMessage.textContent = error.message || 'Không thể tải bảng xếp hạng. Vui lòng thử lại sau.';
            }
        }
    }

    /**
     * Render danh sách người chơi vào tbody của bảng
     * @param {Array} rankings
     */
    function renderLeaderboardTable(rankings) {
        if (!leaderboardBody) return;

        leaderboardBody.innerHTML = '';

        rankings.forEach((item, index) => {
            const rank = item.rank || (index + 1);
            const username = escapeHtml(item.username || 'Kỳ thủ ẩn danh');
            const elo = item.elo ?? item.eloRating ?? 1000;
            const wins = Math.max(0, parseInt(item.wins, 10) || 0);
            const losses = Math.max(0, parseInt(item.losses, 10) || 0);
            const draws = Math.max(0, parseInt(item.draws, 10) || 0);
            const total = item.totalGames ?? (wins + losses + draws);
            
            // Tính Win Rate an toàn
            const winRate = total > 0 ? Number(((wins / total) * 100).toFixed(1)) : 0;
            const winRateText = item.winRateText || `${winRate}%`;

            // Avatar hoặc Fallback quân cờ
            const avatarUrl = item.avatar || item.avatarUrl;
            let avatarHtml;
            if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim() !== '') {
                avatarHtml = `<img src="${escapeHtml(avatarUrl)}" alt="${username}" class="user-avatar" onerror="this.outerHTML='<div class=\\'avatar-mini-fallback\\'>帥</div>'">`;
            } else {
                avatarHtml = `<div class="avatar-mini-fallback" aria-hidden="true">帥</div>`;
            }

            const tr = document.createElement('tr');
            if (rank <= 3) {
                tr.classList.add(`row-top-${rank}`);
            }

            tr.innerHTML = `
                <td class="col-rank">${getRankBadge(rank)}</td>
                <td class="col-user">
                    <div class="user-cell">
                        ${avatarHtml}
                        <span class="user-name">${username}</span>
                    </div>
                </td>
                <td class="col-elo">
                    <span class="elo-badge">${elo}</span>
                </td>
                <td class="col-wins text-green">${wins}</td>
                <td class="col-losses text-red">${losses}</td>
                <td class="col-draws text-gray">${draws}</td>
                <td class="col-winrate">
                    <div class="winrate-cell">
                        <span class="winrate-num">${winRateText}</span>
                        <div class="mini-bar-bg" aria-hidden="true">
                            <div class="mini-bar-fill" style="width: ${Math.min(100, Math.max(0, winRate))}%;"></div>
                        </div>
                    </div>
                </td>
            `;

            leaderboardBody.appendChild(tr);
        });
    }

    // Lắng nghe sự kiện thử lại khi gặp lỗi
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            loadLeaderboard(currentLimit);
        });
    }

    // Lắng nghe thay đổi số lượng giới hạn hiển thị (limit)
    if (limitSelect) {
        limitSelect.addEventListener('change', (e) => {
            currentLimit = parseInt(e.target.value, 10) || 50;
            loadLeaderboard(currentLimit);
        });
    }

    if (typeof window !== 'undefined') {
        window.loadLeaderboard = loadLeaderboard;
        window.renderLeaderboardTable = renderLeaderboardTable;
    }

    // Khởi chạy nạp dữ liệu lần đầu
    loadLeaderboard(currentLimit);
});

// Xuất bản cho môi trường Node.js / Unit test runner
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getRankBadge,
        escapeHtml
    };
}
