/**
 * Xử lý logic hiển thị thông tin hồ sơ người chơi (profile.js)
 * Tính toán thống kê an toàn (chống chia cho 0), kết nối userApi và xử lý hết hạn token
 */

/**
 * Hàm tính toán tổng trận và tỷ lệ thắng an toàn (tránh lỗi chia cho 0)
 * @param {number} [w=0] - Số trận thắng
 * @param {number} [l=0] - Số trận thua
 * @param {number} [d=0] - Số trận hòa
 * @returns {{ wins: number, losses: number, draws: number, totalGames: number, winRate: number, winRateText: string }}
 */
function calculateStats(w = 0, l = 0, d = 0) {
    const wins = Math.max(0, parseInt(w, 10) || 0);
    const losses = Math.max(0, parseInt(l, 10) || 0);
    const draws = Math.max(0, parseInt(d, 10) || 0);

    // 1. Tính tổng số trận = wins + losses + draws
    const totalGames = wins + losses + draws;

    // 2. Win rate = wins / total * 100 khi total > 0, ngược lại tuyệt đối bằng 0% (tránh chia cho 0)
    let winRate = 0;
    if (totalGames > 0) {
        winRate = Number(((wins / totalGames) * 100).toFixed(1));
    }

    return {
        wins,
        losses,
        draws,
        totalGames,
        winRate,
        winRateText: `${winRate}%`
    };
}

/**
 * Xác định danh hiệu kỳ thủ dựa trên hệ số Elo
 * @param {number} elo
 * @returns {string}
 */
function getTierName(elo) {
    const rating = parseInt(elo, 10) || 1000;
    if (rating >= 2100) return 'Đặc Cấp Đại Sư';
    if (rating >= 1800) return 'Đại Sư';
    if (rating >= 1500) return 'Kiện Tướng';
    if (rating >= 1200) return 'Kỳ Thủ';
    return 'Tập Sự';
}

/**
 * Thoát các ký tự HTML nguy hiểm để chống XSS
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

document.addEventListener('DOMContentLoaded', async () => {
    const authRequiredSection = document.getElementById('authRequiredSection');
    const loadingSection = document.getElementById('loadingSection');
    const profileSection = document.getElementById('profileSection');

    const avatarContainer = document.getElementById('avatarContainer');
    const profileUsername = document.getElementById('profileUsername');
    const profileTier = document.getElementById('profileTier');
    const profileId = document.getElementById('profileId');
    const profileCreatedAt = document.getElementById('profileCreatedAt');

    const statElo = document.getElementById('statElo');
    const statTotalGames = document.getElementById('statTotalGames');
    const statWins = document.getElementById('statWins');
    const statLosses = document.getElementById('statLosses');
    const statDraws = document.getElementById('statDraws');
    const statWinRate = document.getElementById('statWinRate');
    const winRateBar = document.getElementById('winRateBar');
    const logoutBtn = document.getElementById('logoutBtn');

    // 1. Kiểm tra trạng thái đăng nhập phía client
    const hasToken = typeof authManager !== 'undefined'
        ? authManager.isAuthenticated()
        : Boolean(localStorage.getItem('xiangqi_auth_token'));

    if (!hasToken) {
        showAuthRequired();
        return;
    }

    // 2. Gọi API lấy thông tin người dùng từ server
    try {
        const response = await userApi.getMe();
        const user = (response && response.data && response.data.user) || response.user || response;

        if (!user) {
            throw new Error('Không nhận được dữ liệu người dùng');
        }

        // Cập nhật lại cache user trong authManager nếu có
        if (typeof authManager !== 'undefined' && authManager.setUser) {
            authManager.setUser(user);
        }

        // 3. Render dữ liệu thật lên giao diện
        renderUserProfile(user);
    } catch (error) {
        // 4. Nếu token hết hạn hoặc không hợp lệ (401), dọn dẹp và yêu cầu đăng nhập lại
        if (error.status === 401 || error.statusCode === 401) {
            if (typeof authManager !== 'undefined' && authManager.logout) {
                authManager.logout();
            }
            showAuthRequired('Phiên đăng nhập đã hết hạn. Đang chuyển về trang đăng nhập...');
            setTimeout(() => {
                window.location.href = 'login.html?redirect=profile.html';
            }, 1500);
            return;
        }

        // Lỗi kết nối hoặc lỗi server khác
        showError(error.message || 'Lỗi khi tải dữ liệu hồ sơ');
    }

    /**
     * Render toàn bộ thông tin người dùng vào DOM
     */
    function renderUserProfile(user) {
        // Tính toán chỉ số trận đấu và Win Rate an toàn
        const stats = calculateStats(user.wins, user.losses, user.draws);
        const elo = user.eloRating ?? user.elo ?? 1000;

        // Render Hero section
        if (profileUsername) {
            profileUsername.textContent = user.username || 'Kỳ thủ';
        }
        if (profileTier) {
            profileTier.textContent = getTierName(elo);
        }
        if (profileId) {
            profileId.textContent = user.id ?? user.userId ?? '--';
        }
        if (profileCreatedAt) {
            const dateStr = user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('vi-VN')
                : 'Mới gia nhập';
            profileCreatedAt.textContent = dateStr;
        }

        // Render Avatar (hỗ trợ avatar url hoặc fallback quân cờ)
        if (avatarContainer) {
            const avatarUrl = user.avatar || user.avatarUrl;
            if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim() !== '') {
                const safeUrl = escapeHtml(avatarUrl.trim());
                avatarContainer.innerHTML = `
                    <img src="${safeUrl}" alt="${escapeHtml(user.username)}" class="avatar-img" onerror="this.outerHTML='<div class=\\'avatar-fallback\\'>帥</div>'">
                `;
            } else {
                avatarContainer.innerHTML = `<div class="avatar-fallback" aria-hidden="true">帥</div>`;
            }
        }

        // Render các chỉ số thống kê
        if (statElo) statElo.textContent = elo;
        if (statTotalGames) statTotalGames.textContent = stats.totalGames;
        if (statWins) statWins.textContent = stats.wins;
        if (statLosses) statLosses.textContent = stats.losses;
        if (statDraws) statDraws.textContent = stats.draws;
        if (statWinRate) statWinRate.textContent = stats.winRateText;

        // Cập nhật thanh tiến trình Win Rate
        if (winRateBar) {
            winRateBar.style.width = `${Math.min(100, Math.max(0, stats.winRate))}%`;
            const container = winRateBar.parentElement;
            if (container) {
                container.setAttribute('aria-valuenow', stats.winRate.toString());
            }
        }

        // Ẩn loading, hiển thị profile
        if (loadingSection) loadingSection.style.display = 'none';
        if (profileSection) profileSection.style.display = 'block';
    }

    /**
     * Hiển thị trạng thái yêu cầu đăng nhập
     */
    function showAuthRequired(customMsg) {
        if (loadingSection) loadingSection.style.display = 'none';
        if (profileSection) profileSection.style.display = 'none';
        if (authRequiredSection) {
            if (customMsg) {
                const desc = authRequiredSection.querySelector('.auth-required-desc');
                if (desc) desc.textContent = customMsg;
            }
            authRequiredSection.style.display = 'block';
        }
    }

    /**
     * Hiển thị thông báo lỗi
     */
    function showError(message) {
        if (loadingSection) loadingSection.style.display = 'none';
        showAuthRequired(message);
    }

    // Đăng xuất khi click nút Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (typeof authManager !== 'undefined') {
                authManager.logout();
            }
            window.location.href = 'login.html';
        });
    }
});

// Xuất bản hàm calculateStats cho môi trường Node.js / Unit test runner
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateStats,
        getTierName
    };
}
