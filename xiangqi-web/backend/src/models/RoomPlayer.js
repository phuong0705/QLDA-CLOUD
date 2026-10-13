/**
 * Các phe hợp lệ của người chơi trong phòng Cờ Tướng
 */
const PLAYER_SIDE = Object.freeze({
    RED: 'RED',
    BLACK: 'BLACK'
});

/**
 * Mô hình dữ liệu RoomPlayer (Thành viên trong phòng chơi)
 */
class RoomPlayer {
    /**
     * Khởi tạo đối tượng RoomPlayer
     * @param {Object} data - Dữ liệu người chơi trong phòng
     */
    constructor(data = {}) {
        this.id = data.id ?? data.roomPlayerId ?? data.RoomPlayerID ?? null;
        this.roomPlayerId = this.id;
        this.roomId = Number(data.roomId ?? data.RoomID ?? null);
        this.userId = Number(data.userId ?? data.UserID ?? null);
        this.side = data.side ?? data.Side ?? null;
        if (this.side) {
            this.side = this.side.toString().toUpperCase();
        }
        this.isHost = Boolean(data.isHost ?? data.IsHost ?? false);
        this.isReady = Boolean(data.isReady ?? data.IsReady ?? false);
        this.joinedAt = data.joinedAt ?? data.JoinedAt ?? null;

        // Thông tin người dùng mở rộng nếu có (kết quả JOIN từ bảng dbo.Users)
        this.username = data.username ?? data.Username ?? null;
        this.avatar = data.avatar ?? data.Avatar ?? null;
        this.eloRating = (data.eloRating !== undefined || data.EloRating !== undefined)
            ? Number(data.eloRating ?? data.EloRating)
            : null;
    }

    /**
     * Chuyển đổi thành plain object an toàn để trả về qua API
     * @returns {Object}
     */
    toSafeObject() {
        const obj = {
            id: this.id,
            roomPlayerId: this.roomPlayerId,
            roomId: this.roomId,
            userId: this.userId,
            side: this.side,
            isHost: this.isHost,
            isReady: this.isReady,
            joinedAt: this.joinedAt
        };

        if (this.username !== null) obj.username = this.username;
        if (this.avatar !== null) obj.avatar = this.avatar;
        if (this.eloRating !== null) obj.eloRating = this.eloRating;

        return obj;
    }

    /**
     * Chuẩn hóa toJSON để serialization tự động loại bỏ dữ liệu dư thừa
     * @returns {Object}
     */
    toJSON() {
        return this.toSafeObject();
    }

    /**
     * Tạo thực thể RoomPlayer từ dòng dữ liệu SQL Server (recordset row)
     * @param {Object} row - Dữ liệu thô từ câu lệnh SQL SELECT
     * @returns {RoomPlayer|null}
     */
    static fromDatabase(row) {
        if (!row) return null;

        return new RoomPlayer({
            id: row.RoomPlayerID ?? row.roomPlayerId ?? row.id,
            roomId: row.RoomID ?? row.roomId,
            userId: row.UserID ?? row.userId,
            side: row.Side ?? row.side,
            isHost: row.IsHost !== undefined ? Boolean(row.IsHost) : false,
            isReady: row.IsReady !== undefined ? Boolean(row.IsReady) : false,
            joinedAt: row.JoinedAt ?? row.joinedAt,
            username: row.Username ?? row.username ?? null,
            avatar: row.Avatar ?? row.avatar ?? null,
            eloRating: row.EloRating !== undefined ? row.EloRating : (row.eloRating !== undefined ? row.eloRating : null)
        });
    }
}

RoomPlayer.SIDE = PLAYER_SIDE;

module.exports = RoomPlayer;
