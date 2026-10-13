const userRepository = require('../repositories/userRepository');
const { calculateNewRatings, normalizeScore, DEFAULT_K_FACTOR } = require('../utils/eloCalculator');

/**
 * Service xử lý các nghiệp vụ liên quan đến người dùng (User Service)
 */
class UserService {
    /**
     * @param {Object} [userRepo=userRepository] - Repository người dùng
     * @param {number} [kFactor=DEFAULT_K_FACTOR] - Hệ số K mặc định cho tính Elo
     */
    constructor(userRepo = userRepository, kFactor = DEFAULT_K_FACTOR) {
        this.userRepository = userRepo;
        this.kFactor = kFactor;
        // Quản lý các ván đấu đã hoàn tất để đảm bảo tính Idempotency (không cộng/trừ 2 lần)
        this.finalizedGameIds = new Set();
    }

    /**
     * Lấy thông tin profile người dùng theo UserID
     * Đảm bảo an toàn: Tuyệt đối không bao gồm PasswordHash
     * 
     * @param {number|string} userId - Khóa chính UserID
     * @returns {Promise<Object|null>} - Thông tin public profile của người dùng
     */
    async getProfile(userId) {
        const id = parseInt(userId, 10);
        if (Number.isNaN(id) || id <= 0) {
            return null;
        }

        const user = await this.userRepository.findById(id);
        if (!user) {
            return null;
        }

        return {
            id: user.id ?? user.userId,
            username: user.username,
            email: user.email,
            avatar: user.avatar ?? user.avatarUrl ?? null,
            elo: user.eloRating ?? user.elo ?? 1000,
            eloRating: user.eloRating ?? user.elo ?? 1000,
            wins: user.wins ?? 0,
            losses: user.losses ?? 0,
            draws: user.draws ?? 0,
            totalGames: user.totalGames ?? 0,
            winRate: user.winRate ?? 0,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };
    }

    /**
     * Alias cho getProfile
     */
    async getCurrentUser(userId) {
        return this.getProfile(userId);
    }

    /**
     * Cập nhật điểm Elo và thống kê (Wins/Losses/Draws) cho 2 người chơi sau khi ván đấu kết thúc.
     * Đảm bảo Idempotency: không cập nhật 2 lần nếu cùng GameID được gọi lặp lại.
     * Đảm bảo Atomic/Compensation: tránh trường hợp cập nhật một người mà người kia thất bại.
     * 
     * Hỗ trợ cả 2 chữ ký hàm:
     * - applyGameResult(gameId, redId, blackId, result) (Contract khuyến nghị)
     * - applyGameResult(redId, blackId, result)
     * 
     * @param {string|number} arg1 - gameId hoặc redId
     * @param {number|string} arg2 - redId hoặc blackId
     * @param {number|string} arg3 - blackId hoặc result
     * @param {number|string} [arg4] - result (nếu arg1 là gameId)
     * @returns {Promise<Object>} Kết quả cập nhật của ván cờ
     */
    async applyGameResult(arg1, arg2, arg3, arg4) {
        let gameId = null;
        let redId;
        let blackId;
        let result;

        if (arg4 !== undefined) {
            // Chữ ký: (gameId, redId, blackId, result)
            gameId = arg1;
            redId = parseInt(arg2, 10);
            blackId = parseInt(arg3, 10);
            result = arg4;
        } else {
            // Chữ ký: (redId, blackId, result)
            redId = parseInt(arg1, 10);
            blackId = parseInt(arg2, 10);
            result = arg3;
        }

        if (Number.isNaN(redId) || Number.isNaN(blackId)) {
            throw new Error('ID người chơi không hợp lệ');
        }

        if (redId === blackId) {
            throw new Error('Hai người chơi không được trùng ID');
        }

        // 1. Kiểm tra Idempotency với GameID (tránh finalize lặp 2 lần khi mạng retry)
        if (gameId !== null && gameId !== undefined) {
            const gameKey = String(gameId);
            if (this.finalizedGameIds.has(gameKey)) {
                return {
                    alreadyFinalized: true,
                    gameId,
                    message: 'Kết quả ván đấu đã được cập nhật trước đó (Idempotent)'
                };
            }
        }

        // 2. Lấy thông tin hiện tại của cả 2 người chơi từ database
        const redUser = await this.userRepository.findById(redId);
        const blackUser = await this.userRepository.findById(blackId);

        if (!redUser || !blackUser) {
            throw new Error('Không tìm thấy thông tin một trong hai người chơi');
        }

        // 3. Tính điểm Elo mới bằng eloCalculator
        const scoreRed = normalizeScore(result); // 1: Red thắng, 0.5: Hòa, 0: Black thắng
        const currentRedElo = Number(redUser.eloRating ?? redUser.elo ?? 1000);
        const currentBlackElo = Number(blackUser.eloRating ?? blackUser.elo ?? 1000);

        const ratingResult = calculateNewRatings(currentRedElo, currentBlackElo, scoreRed, this.kFactor);
        const newRedElo = ratingResult.newA;
        const newBlackElo = ratingResult.newB;

        // 4. Chuẩn bị dữ liệu thống kê cập nhật
        const redUpdates = {
            eloRating: newRedElo,
            wins: (redUser.wins || 0) + (scoreRed === 1 ? 1 : 0),
            losses: (redUser.losses || 0) + (scoreRed === 0 ? 1 : 0),
            draws: (redUser.draws || 0) + (scoreRed === 0.5 ? 1 : 0)
        };

        const blackUpdates = {
            eloRating: newBlackElo,
            wins: (blackUser.wins || 0) + (scoreRed === 0 ? 1 : 0),
            losses: (blackUser.losses || 0) + (scoreRed === 1 ? 1 : 0),
            draws: (blackUser.draws || 0) + (scoreRed === 0.5 ? 1 : 0)
        };

        // 5. Cập nhật an toàn: Nếu người thứ 2 thất bại, tự động bù trừ (rollback compensation) người thứ 1
        let updatedRed;
        try {
            updatedRed = await this.userRepository.updateStats(redId, redUpdates);
        } catch (err) {
            throw new Error(`Cập nhật người chơi Đỏ thất bại: ${err.message}`);
        }

        let updatedBlack;
        try {
            updatedBlack = await this.userRepository.updateStats(blackId, blackUpdates);
        } catch (err) {
            // Rollback hoàn tác người chơi Đỏ về dữ liệu ban đầu
            try {
                await this.userRepository.updateStats(redId, {
                    eloRating: currentRedElo,
                    wins: redUser.wins || 0,
                    losses: redUser.losses || 0,
                    draws: redUser.draws || 0
                });
            } catch (rollbackErr) {
                console.error('Lỗi khi hoàn tác người chơi Đỏ:', rollbackErr);
            }
            throw new Error(`Cập nhật người chơi Đen thất bại, đã hoàn tác: ${err.message}`);
        }

        // 6. Ghi nhận GameID đã hoàn tất để chống finalize lặp lại
        if (gameId !== null && gameId !== undefined) {
            this.finalizedGameIds.add(String(gameId));
        }

        return {
            gameId,
            result,
            red: {
                id: redId,
                oldElo: currentRedElo,
                newElo: newRedElo,
                eloChange: newRedElo - currentRedElo,
                wins: updatedRed.wins,
                losses: updatedRed.losses,
                draws: updatedRed.draws
            },
            black: {
                id: blackId,
                oldElo: currentBlackElo,
                newElo: newBlackElo,
                eloChange: newBlackElo - currentBlackElo,
                wins: updatedBlack.wins,
                losses: updatedBlack.losses,
                draws: updatedBlack.draws
            }
        };
    }
}

const defaultInstance = new UserService();

module.exports = defaultInstance;
module.exports.UserService = UserService;
module.exports.getProfile = defaultInstance.getProfile.bind(defaultInstance);
module.exports.getCurrentUser = defaultInstance.getCurrentUser.bind(defaultInstance);
module.exports.applyGameResult = defaultInstance.applyGameResult.bind(defaultInstance);
