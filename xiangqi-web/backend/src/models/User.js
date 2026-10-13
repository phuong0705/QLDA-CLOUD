/**
 * Mô hình dữ liệu User (Xiangqi User Entity)
 */
class User {
    /**
     * Khởi tạo đối tượng User
     * @param {Object} data - Dữ liệu người dùng
     */
    constructor(data = {}) {
        this.id = data.id ?? data.userId ?? data.UserID ?? null;
        this.userId = this.id;
        this.username = data.username ?? data.Username ?? '';
        this.email = data.email ?? data.Email ?? '';
        this.avatar = data.avatar ?? data.avatarUrl ?? data.Avatar ?? null;
        this.avatarUrl = this.avatar;
        this.eloRating = Number(data.eloRating ?? data.EloRating ?? 1000);
        this.wins = Number(data.wins ?? data.Wins ?? 0);
        this.losses = Number(data.losses ?? data.Losses ?? 0);
        this.draws = Number(data.draws ?? data.Draws ?? 0);
        this.createdAt = data.createdAt ?? data.CreatedAt ?? null;
        this.updatedAt = data.updatedAt ?? data.UpdatedAt ?? null;

        // Chỉ lưu passwordHash nếu được truyền vào rõ ràng (chỉ dùng cho luồng auth)
        if (data.passwordHash !== undefined || data.PasswordHash !== undefined) {
            this.passwordHash = data.passwordHash ?? data.PasswordHash;
        }
    }

    /**
     * Tổng số ván đấu đã tham gia
     * @returns {number}
     */
    get totalGames() {
        return this.wins + this.losses + this.draws;
    }

    /**
     * Tỷ lệ thắng (phần trăm)
     * @returns {number}
     */
    get winRate() {
        const total = this.totalGames;
        if (total === 0) return 0;
        return Number(((this.wins / total) * 100).toFixed(2));
    }

    /**
     * Chuyển đổi thành plain object an toàn, tuyệt đối không chứa PasswordHash
     * @returns {Object}
     */
    toSafeObject() {
        return {
            id: this.id,
            userId: this.userId,
            username: this.username,
            email: this.email,
            avatar: this.avatar,
            avatarUrl: this.avatarUrl,
            eloRating: this.eloRating,
            wins: this.wins,
            losses: this.losses,
            draws: this.draws,
            totalGames: this.totalGames,
            winRate: this.winRate,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    /**
     * Phương thức toJSON chuẩn để serialization tự động loại bỏ PasswordHash
     * @returns {Object}
     */
    toJSON() {
        return this.toSafeObject();
    }

    /**
     * Tạo thực thể User từ dòng dữ liệu SQL Server (recordset row)
     * @param {Object} row - Dữ liệu thô từ câu lệnh SELECT SQL
     * @param {boolean} [includePassword=false] - Cờ xác định có kèm PasswordHash không (chỉ dùng khi auth)
     * @returns {User|null}
     */
    static fromDatabase(row, includePassword = false) {
        if (!row) return null;

        const userData = {
            id: row.UserID,
            username: row.Username,
            email: row.Email,
            avatar: row.Avatar,
            eloRating: row.EloRating,
            wins: row.Wins,
            losses: row.Losses,
            draws: row.Draws,
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt
        };

        if (includePassword && row.PasswordHash !== undefined) {
            userData.passwordHash = row.PasswordHash;
        }

        return new User(userData);
    }
}

module.exports = User;
