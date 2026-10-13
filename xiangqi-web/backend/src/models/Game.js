/**
 * Mô hình dữ liệu Game (Xiangqi Game Entity)
 * 
 * Đại diện cho một ván đấu Cờ Tướng (Chế độ ONLINE giữa 2 người chơi hoặc AI).
 * Trạng thái bàn cờ không lưu trực tiếp dạng JSON vào Games mà được tái hiện qua danh sách Moves,
 * hoặc snapshot độc lập qua GameSaves.
 */
class Game {
    /**
     * Khởi tạo đối tượng Game
     * @param {Object} data - Dữ liệu ván đấu từ database hoặc request
     */
    constructor(data = {}) {
        this.id = data.id !== undefined && data.id !== null ? Number(data.id) : (
            data.gameId !== undefined && data.gameId !== null ? Number(data.gameId) : (
                data.GameID !== undefined && data.GameID !== null ? Number(data.GameID) : null
            )
        );
        this.gameId = this.id;

        this.roomId = data.roomId !== undefined && data.roomId !== null ? Number(data.roomId) : (
            data.RoomID !== undefined && data.RoomID !== null ? Number(data.RoomID) : null
        );

        this.redPlayerId = data.redPlayerId !== undefined && data.redPlayerId !== null ? Number(data.redPlayerId) : (
            data.RedPlayerID !== undefined && data.RedPlayerID !== null ? Number(data.RedPlayerID) : null
        );

        this.blackPlayerId = data.blackPlayerId !== undefined && data.blackPlayerId !== null ? Number(data.blackPlayerId) : (
            data.BlackPlayerID !== undefined && data.BlackPlayerID !== null ? Number(data.BlackPlayerID) : null
        );

        this.winnerId = data.winnerId !== undefined && data.winnerId !== null ? Number(data.winnerId) : (
            data.WinnerID !== undefined && data.WinnerID !== null ? Number(data.WinnerID) : null
        );

        // Quy ước chuẩn: GameMode ('ONLINE', 'AI')
        const mode = (data.gameMode ?? data.GameMode ?? 'ONLINE').toString().toUpperCase();
        this.gameMode = mode === 'AI' ? 'AI' : 'ONLINE';

        // Quy ước chuẩn: Status ('WAITING', 'PLAYING', 'FINISHED', 'SAVED')
        const status = (data.status ?? data.Status ?? 'WAITING').toString().toUpperCase();
        this.status = ['WAITING', 'PLAYING', 'FINISHED', 'SAVED'].includes(status) ? status : 'WAITING';

        // Quy ước lượt đi: CurrentTurn ('RED', 'BLACK')
        const turn = (data.currentTurn ?? data.CurrentTurn ?? 'RED').toString().toUpperCase();
        this.currentTurn = turn === 'BLACK' ? 'BLACK' : 'RED';

        this.result = data.result ?? data.Result ?? null;
        this.startedAt = data.startedAt ?? data.StartedAt ?? null;
        this.endedAt = data.endedAt ?? data.EndedAt ?? null;
        this.createdAt = data.createdAt ?? data.CreatedAt ?? null;
        this.updatedAt = data.updatedAt ?? data.UpdatedAt ?? null;

        // Thông tin mở rộng của người chơi khi join từ bảng Users (nếu có)
        if (data.redPlayer) {
            this.redPlayer = data.redPlayer;
        } else if (data.RedUsername) {
            this.redPlayer = {
                id: this.redPlayerId,
                username: data.RedUsername,
                avatar: data.RedAvatar ?? null,
                eloRating: data.RedEloRating !== undefined ? Number(data.RedEloRating) : undefined
            };
        } else {
            this.redPlayer = null;
        }

        if (data.blackPlayer) {
            this.blackPlayer = data.blackPlayer;
        } else if (data.BlackUsername) {
            this.blackPlayer = {
                id: this.blackPlayerId,
                username: data.BlackUsername,
                avatar: data.BlackAvatar ?? null,
                eloRating: data.BlackEloRating !== undefined ? Number(data.BlackEloRating) : undefined
            };
        } else {
            this.blackPlayer = null;
        }

        if (data.winner) {
            this.winner = data.winner;
        } else if (data.WinnerUsername) {
            this.winner = {
                id: this.winnerId,
                username: data.WinnerUsername
            };
        } else {
            this.winner = null;
        }
    }

    /**
     * Ván đấu có đang chờ bắt đầu không
     * @returns {boolean}
     */
    get isWaiting() {
        return this.status === 'WAITING';
    }

    /**
     * Ván đấu có đang diễn ra không
     * @returns {boolean}
     */
    get isPlaying() {
        return this.status === 'PLAYING';
    }

    /**
     * Ván đấu đã hoàn tất chưa
     * @returns {boolean}
     */
    get isFinished() {
        return this.status === 'FINISHED';
    }

    /**
     * Ván đấu đã được lưu snapshot để xem lại chưa
     * @returns {boolean}
     */
    get isSaved() {
        return this.status === 'SAVED';
    }

    /**
     * Kiểm tra chế độ chơi có phải Online không
     * @returns {boolean}
     */
    get isOnline() {
        return this.gameMode === 'ONLINE';
    }

    /**
     * Kiểm tra chế độ chơi với Máy (AI)
     * @returns {boolean}
     */
    get isAI() {
        return this.gameMode === 'AI';
    }

    /**
     * Thời lượng trận đấu tính bằng giây (nếu có đủ startedAt và endedAt)
     * @returns {number|null}
     */
    get durationSeconds() {
        if (!this.startedAt || !this.endedAt) return null;
        const start = new Date(this.startedAt).getTime();
        const end = new Date(this.endedAt).getTime();
        if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
        return Math.floor((end - start) / 1000);
    }

    /**
     * Chuyển đổi thành plain object chuẩn, an toàn (không chứa dữ liệu nhạy cảm)
     * @returns {Object}
     */
    toSafeObject() {
        const obj = {
            id: this.id,
            gameId: this.gameId,
            roomId: this.roomId,
            redPlayerId: this.redPlayerId,
            blackPlayerId: this.blackPlayerId,
            winnerId: this.winnerId,
            gameMode: this.gameMode,
            status: this.status,
            currentTurn: this.currentTurn,
            result: this.result,
            startedAt: this.startedAt,
            endedAt: this.endedAt,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };

        if (this.redPlayer) {
            obj.redPlayer = this.redPlayer;
        }
        if (this.blackPlayer) {
            obj.blackPlayer = this.blackPlayer;
        }
        if (this.winner) {
            obj.winner = this.winner;
        }

        return obj;
    }

    /**
     * Phương thức toJSON chuẩn để serialization tự động
     * @returns {Object}
     */
    toJSON() {
        return this.toSafeObject();
    }

    /**
     * Tạo thực thể Game từ dòng dữ liệu SQL Server (recordset row)
     * @param {Object} row - Dữ liệu thô từ câu lệnh SELECT SQL
     * @returns {Game|null}
     */
    static fromDatabase(row) {
        if (!row) return null;
        return new Game(row);
    }
}

module.exports = Game;
