const RoomPlayer = require('./RoomPlayer');

/**
 * Các trạng thái hợp lệ của phòng chơi
 */
const ROOM_STATUS = Object.freeze({
    WAITING: 'WAITING',
    PLAYING: 'PLAYING',
    FINISHED: 'FINISHED',
    CLOSED: 'CLOSED'
});

/**
 * Mô hình dữ liệu Room (Xiangqi Room Entity)
 */
class Room {
    /**
     * Khởi tạo đối tượng Room
     * @param {Object} data - Dữ liệu phòng chơi
     */
    constructor(data = {}) {
        this.id = data.id ?? data.roomId ?? data.RoomID ?? null;
        this.roomId = this.id;
        this.roomCode = (data.roomCode ?? data.RoomCode ?? '').toString().trim().toUpperCase();
        this.hostUserId = Number(data.hostUserId ?? data.HostUserID ?? null);
        this.status = (data.status ?? data.Status ?? ROOM_STATUS.WAITING).toString().toUpperCase();
        this.maxPlayers = Number(data.maxPlayers ?? data.MaxPlayers ?? 2);
        this.createdAt = data.createdAt ?? data.CreatedAt ?? null;
        this.updatedAt = data.updatedAt ?? data.UpdatedAt ?? null;

        // Danh sách người chơi trong phòng (mảng instance RoomPlayer)
        const rawPlayers = data.players ?? data.Players ?? [];
        this.players = Array.isArray(rawPlayers)
            ? rawPlayers.map(p => (p instanceof RoomPlayer ? p : new RoomPlayer(p)))
            : [];
    }

    /**
     * Số người chơi hiện tại trong phòng
     * @returns {number}
     */
    get playerCount() {
        return this.players.length;
    }

    /**
     * Kiểm tra phòng đã đủ người chưa (mặc định tối đa 2 người chơi)
     * @returns {boolean}
     */
    get isFull() {
        return this.players.length >= this.maxPlayers;
    }

    /**
     * Kiểm tra phòng có đang ở trạng thái WAITING không
     * @returns {boolean}
     */
    isWaiting() {
        return this.status === ROOM_STATUS.WAITING;
    }

    /**
     * Kiểm tra phòng có đang ở trạng thái PLAYING không
     * @returns {boolean}
     */
    isPlaying() {
        return this.status === ROOM_STATUS.PLAYING;
    }

    /**
     * Kiểm tra phòng có đang ở trạng thái FINISHED không
     * @returns {boolean}
     */
    isFinished() {
        return this.status === ROOM_STATUS.FINISHED;
    }

    /**
     * Kiểm tra phòng đã bị đóng (CLOSED) chưa
     * @returns {boolean}
     */
    isClosed() {
        return this.status === ROOM_STATUS.CLOSED;
    }

    /**
     * Lấy người chơi đóng vai trò Host trong phòng
     * @returns {RoomPlayer|null}
     */
    getHostPlayer() {
        return this.players.find(p => p.isHost || p.userId === this.hostUserId) || null;
    }

    /**
     * Chuyển đổi thành plain object an toàn để trả về qua API
     * @returns {Object}
     */
    toSafeObject() {
        return {
            id: this.id,
            roomId: this.roomId,
            roomCode: this.roomCode,
            hostUserId: this.hostUserId,
            status: this.status,
            maxPlayers: this.maxPlayers,
            playerCount: this.playerCount,
            isFull: this.isFull,
            players: this.players.map(p => (typeof p.toSafeObject === 'function' ? p.toSafeObject() : p)),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    /**
     * Chuẩn hóa toJSON để serialize tự động
     * @returns {Object}
     */
    toJSON() {
        return this.toSafeObject();
    }

    /**
     * Tạo thực thể Room từ dòng dữ liệu SQL Server (recordset row)
     * @param {Object} row - Dòng dữ liệu từ bảng dbo.Rooms
     * @param {Array} [players=[]] - Danh sách người chơi trong phòng
     * @returns {Room|null}
     */
    static fromDatabase(row, players = []) {
        if (!row) return null;

        return new Room({
            id: row.RoomID ?? row.roomId ?? row.id,
            roomCode: row.RoomCode ?? row.roomCode,
            hostUserId: row.HostUserID ?? row.hostUserId,
            status: row.Status ?? row.status,
            maxPlayers: row.MaxPlayers ?? row.maxPlayers ?? 2,
            createdAt: row.CreatedAt ?? row.createdAt,
            updatedAt: row.UpdatedAt ?? row.updatedAt,
            players
        });
    }
}

Room.STATUS = ROOM_STATUS;

module.exports = Room;
