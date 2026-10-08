const userRepository = require('../repositories/userRepository');

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/**
 * Service xử lý bảng xếp hạng kỳ thủ (Ranking Service)
 */
class RankingService {
    /**
     * @param {Object} [userRepo=userRepository] - Repository người dùng
     */
    constructor(userRepo = userRepository) {
        this.userRepository = userRepo;
    }

    /**
     * Lấy danh sách bảng xếp hạng người chơi
     * Quy tắc:
     * - Validate limit trong khoảng hợp lý (1 - 100)
     * - Gọi userRepository.getLeaderboard
     * - Sắp xếp EloRating DESC, sau đó tie-break ổn định bằng Wins DESC, sau đó UserID ASC
     * - Tuyệt đối không trả PasswordHash hoặc Email không cần thiết ra ngoài
     * 
     * @param {number|string} [limit=50] - Số lượng người chơi cần lấy
     * @returns {Promise<Array>} Danh sách bảng xếp hạng có gán số thứ tự Rank
     */
    async getLeaderboard(limit = DEFAULT_LIMIT) {
        let safeLimit = DEFAULT_LIMIT;

        // 1. Validate limit trong khoảng hợp lý
        if (limit !== undefined && limit !== null && limit !== '') {
            const parsed = Number(limit);
            if (!Number.isInteger(parsed) || parsed < MIN_LIMIT || parsed > MAX_LIMIT) {
                const error = new Error(`Tham số limit không hợp lệ. Limit phải là số nguyên từ ${MIN_LIMIT} đến ${MAX_LIMIT}.`);
                error.statusCode = 400;
                throw error;
            }
            safeLimit = parsed;
        }

        // 2. Gọi repository lấy dữ liệu từ database
        const rawUsers = await this.userRepository.getLeaderboard(safeLimit);
        const users = Array.isArray(rawUsers) ? [...rawUsers] : [];

        // 3. Sắp xếp tie-break ổn định: EloRating DESC -> Wins DESC -> UserID ASC
        users.sort((a, b) => {
            const eloA = Number(a.eloRating ?? a.elo ?? a.EloRating ?? a.Elo ?? 1000);
            const eloB = Number(b.eloRating ?? b.elo ?? b.EloRating ?? b.Elo ?? 1000);
            if (eloB !== eloA) return eloB - eloA;

            const winsA = Number(a.wins ?? a.Wins ?? 0);
            const winsB = Number(b.wins ?? b.Wins ?? 0);
            if (winsB !== winsA) return winsB - winsA;

            const idA = Number(a.id ?? a.userId ?? a.UserID ?? 0);
            const idB = Number(b.id ?? b.userId ?? b.UserID ?? 0);
            return idA - idB;
        });

        // 4. Lọc DTO an toàn: Không chứa PasswordHash hoặc Email
        return users.map((user, index) => {
            const wins = Math.max(0, parseInt(user.wins ?? user.Wins, 10) || 0);
            const losses = Math.max(0, parseInt(user.losses ?? user.Losses, 10) || 0);
            const draws = Math.max(0, parseInt(user.draws ?? user.Draws, 10) || 0);
            const totalGames = wins + losses + draws;
            const winRate = totalGames > 0
                ? Number(((wins / totalGames) * 100).toFixed(1))
                : 0;

            const id = user.id ?? user.userId ?? user.UserID;
            const username = user.username ?? user.Username;
            const avatar = user.avatar ?? user.avatarUrl ?? user.Avatar ?? null;
            const elo = user.eloRating ?? user.elo ?? user.EloRating ?? user.Elo ?? 1000;

            return {
                rank: index + 1,
                id,
                userId: id,
                username,
                avatar,
                elo,
                eloRating: elo,
                wins,
                losses,
                draws,
                totalGames,
                winRate,
                winRateText: `${winRate}%`
            };
        });
    }
}

const defaultInstance = new RankingService();

module.exports = defaultInstance;
module.exports.RankingService = RankingService;
module.exports.getLeaderboard = defaultInstance.getLeaderboard.bind(defaultInstance);
module.exports.DEFAULT_LIMIT = DEFAULT_LIMIT;
module.exports.MIN_LIMIT = MIN_LIMIT;
module.exports.MAX_LIMIT = MAX_LIMIT;
