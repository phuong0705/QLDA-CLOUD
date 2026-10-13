/**
 * Mô hình dữ liệu Move (Xiangqi Move Entity)
 * 
 * Đại diện cho một nước đi trong ván cờ tướng.
 * Lưu trữ vị trí xuất phát, vị trí đích, loại quân, màu quân, người chơi thực hiện,
 * quân cờ bị bắt (nếu có) và thời điểm nước đi được ghi nhận.
 * 
 * Đối với ván đấu AI, nếu AI thực hiện nước đi thì PlayerID có giá trị null
 * (thể hiện nước đi do AI/hệ thống thực hiện).
 */
class Move {
    /**
     * Khởi tạo đối tượng Move
     * @param {Object} data - Dữ liệu nước đi từ database hoặc service
     */
    constructor(data = {}) {
        this.id = data.id !== undefined && data.id !== null ? Number(data.id) : (
            data.moveId !== undefined && data.moveId !== null ? Number(data.moveId) : (
                data.MoveID !== undefined && data.MoveID !== null ? Number(data.MoveID) : null
            )
        );
        this.moveId = this.id;

        this.gameId = data.gameId !== undefined && data.gameId !== null ? Number(data.gameId) : (
            data.GameID !== undefined && data.GameID !== null ? Number(data.GameID) : null
        );

        this.moveNumber = data.moveNumber !== undefined && data.moveNumber !== null ? Number(data.moveNumber) : (
            data.MoveNumber !== undefined && data.MoveNumber !== null ? Number(data.MoveNumber) : null
        );

        // PlayerID nullable cho AI (null thể hiện nước đi của hệ thống/máy)
        this.playerId = data.playerId !== undefined && data.playerId !== null ? Number(data.playerId) : (
            data.PlayerID !== undefined && data.PlayerID !== null ? Number(data.PlayerID) : null
        );

        this.pieceType = (data.pieceType ?? data.PieceType ?? '').toString().toUpperCase();

        const color = (data.pieceColor ?? data.PieceColor ?? 'RED').toString().toUpperCase();
        this.pieceColor = color === 'BLACK' ? 'BLACK' : 'RED';

        this.fromPosition = (data.fromPosition ?? data.FromPosition ?? '').toString().trim();
        this.toPosition = (data.toPosition ?? data.ToPosition ?? '').toString().trim();

        this.capturedPiece = data.capturedPiece !== undefined && data.capturedPiece !== null ? (
            data.capturedPiece.toString().trim() || null
        ) : (
            data.CapturedPiece !== undefined && data.CapturedPiece !== null ? (
                data.CapturedPiece.toString().trim() || null
            ) : null
        );

        this.createdAt = data.createdAt ?? data.CreatedAt ?? null;

        // Thông tin người chơi mở rộng (nếu có join với bảng Users)
        this.playerUsername = data.playerUsername ?? data.PlayerUsername ?? null;
    }

    /**
     * Kiểm tra nước đi do quân Đỏ thực hiện
     * @returns {boolean}
     */
    get isRed() {
        return this.pieceColor === 'RED';
    }

    /**
     * Kiểm tra nước đi do quân Đen thực hiện
     * @returns {boolean}
     */
    get isBlack() {
        return this.pieceColor === 'BLACK';
    }

    /**
     * Kiểm tra nước đi có phải là nước ăn quân hay không
     * @returns {boolean}
     */
    get isCapture() {
        return Boolean(this.capturedPiece);
    }

    /**
     * Kiểm tra nước đi có phải do AI / Hệ thống thực hiện (PlayerID === null)
     * @returns {boolean}
     */
    get isAIMove() {
        return this.playerId === null;
    }

    /**
     * Chuyển đổi thành plain object chuẩn, an toàn (không chứa dữ liệu nhạy cảm)
     * @returns {Object}
     */
    toSafeObject() {
        const obj = {
            id: this.id,
            moveId: this.moveId,
            gameId: this.gameId,
            moveNumber: this.moveNumber,
            playerId: this.playerId,
            pieceType: this.pieceType,
            pieceColor: this.pieceColor,
            fromPosition: this.fromPosition,
            toPosition: this.toPosition,
            capturedPiece: this.capturedPiece,
            createdAt: this.createdAt
        };

        if (this.playerUsername) {
            obj.playerUsername = this.playerUsername;
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
     * Tạo thực thể Move từ dòng dữ liệu SQL Server (recordset row)
     * @param {Object} row - Dữ liệu thô từ câu lệnh SELECT SQL
     * @returns {Move|null}
     */
    static fromDatabase(row) {
        if (!row) return null;
        return new Move(row);
    }
}

module.exports = Move;
