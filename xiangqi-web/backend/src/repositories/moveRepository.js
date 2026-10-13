const sql = require('mssql');
const Move = require('../models/Move');

/**
 * Lớp MoveRepository: Nơi duy nhất thực thi các truy vấn SQL Server liên quan đến bảng Moves.
 * Toàn bộ các câu query đều dùng parameterized input (request.input) để ngăn chặn hoàn toàn SQL Injection.
 * Đảm bảo MoveNumber duy nhất theo GameID (không trùng số thứ tự trong cùng một ván cờ).
 * Truy vấn danh sách nước đi luôn sắp xếp tăng dần theo MoveNumber ASC.
 */
class MoveRepository {
    /**
     * @param {sql.ConnectionPool|null} [pool=null] - MSSQL Connection Pool (hỗ trợ DI/Mock)
     */
    constructor(pool = null) {
        this.pool = pool;
        this._poolPromise = null;
    }

    /**
     * Thiết lập pool kết nối cho repository
     * @param {sql.ConnectionPool} pool
     */
    setPool(pool) {
        this.pool = pool;
    }

    /**
     * Lấy pool kết nối MSSQL đang hoạt động hoặc khởi tạo kết nối mới
     * @returns {Promise<sql.ConnectionPool>}
     */
    async getPool() {
        if (this.pool) {
            if (this.pool.connected === false && typeof this.pool.connect === 'function') {
                await this.pool.connect();
            }
            return this.pool;
        }

        if (!this._poolPromise) {
            const config = {
                user: process.env.DB_USER || 'sa',
                password: process.env.DB_PASSWORD || '',
                server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'XiangqiDB',
                port: parseInt(process.env.DB_PORT, 10) || 1433,
                options: {
                    encrypt: process.env.DB_ENCRYPT === 'true',
                    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false'
                }
            };
            this._poolPromise = sql.connect(config);
        }

        this.pool = await this._poolPromise;
        return this.pool;
    }

    /**
     * Helper an toàn cho MSSQL DataType (tương thích cả real mssql lẫn test mocks)
     * @private
     */
    _getType(typeDef, length) {
        if (typeof typeDef === 'function') {
            return length !== undefined ? typeDef(length) : typeDef();
        }
        return typeDef;
    }

    /**
     * Lưu một nước đi mới vào cơ sở dữ liệu.
     * Ngăn chặn tuyệt đối việc insert trùng MoveNumber trong cùng một GameID.
     * Nước đi của AI có PlayerID = null (thể hiện nước đi hệ thống/máy).
     * 
     * Lưu ý kiến trúc: Repository KHÔNG tự kiểm tra tính hợp lệ của luật đi cờ;
     * chỉ lưu nước đi đã được Game Engine / Online Service kiểm duyệt và chấp nhận.
     * 
     * @param {Object} move - Dữ liệu nước đi cần lưu
     * @param {number} move.gameId - Khóa ngoại GameID
     * @param {number} [move.moveNumber] - Số thứ tự nước đi (tự động tăng nếu không truyền)
     * @param {number|null} [move.playerId=null] - UserID của người đi (null nếu do AI thực hiện)
     * @param {string} move.pieceType - Loại quân ('GENERAL', 'CHARIOT', 'HORSE', 'CANNON', 'ADVISOR', 'ELEPHANT', 'SOLDIER')
     * @param {string} move.pieceColor - Màu quân ('RED' hoặc 'BLACK')
     * @param {string} move.fromPosition - Vị trí ban đầu (ví dụ: 'e2', '0,4')
     * @param {string} move.toPosition - Vị trí đích đến (ví dụ: 'e3', '1,4')
     * @param {string|null} [move.capturedPiece=null] - Loại quân bị ăn (nếu có)
     * @param {Date|string|null} [move.createdAt=null] - Thời điểm nước đi
     * @returns {Promise<Move>} - Đối tượng Move chuẩn vừa được lưu
     */
    async saveMove(move = {}) {
        if (!move || typeof move !== 'object') {
            throw new Error('Dữ liệu nước đi không hợp lệ');
        }

        const rawGameId = move.gameId ?? move.GameID;
        const gameId = parseInt(rawGameId, 10);
        if (Number.isNaN(gameId) || gameId <= 0) {
            throw new Error('GameID là trường bắt buộc và phải là số nguyên dương');
        }

        const rawMoveNumber = move.moveNumber ?? move.MoveNumber;
        let moveNumber = rawMoveNumber !== undefined && rawMoveNumber !== null ? parseInt(rawMoveNumber, 10) : null;

        // Nếu caller không truyền moveNumber, tự động xác định số thứ tự tiếp theo = lastMove.moveNumber + 1
        if (moveNumber === null) {
            const lastMove = await this.getLastMove(gameId);
            moveNumber = lastMove ? lastMove.moveNumber + 1 : 1;
        } else if (Number.isNaN(moveNumber) || moveNumber <= 0) {
            throw new Error('MoveNumber phải là số nguyên dương lớn hơn hoặc bằng 1');
        }

        const rawPlayerId = move.playerId ?? move.PlayerID;
        const playerId = rawPlayerId !== undefined && rawPlayerId !== null ? parseInt(rawPlayerId, 10) : null;

        const pieceType = (move.pieceType ?? move.PieceType ?? '').toString().trim().toUpperCase();
        if (!pieceType) {
            throw new Error('PieceType là trường bắt buộc');
        }
        if (pieceType.length > 20) {
            throw new Error('PieceType không được vượt quá 20 ký tự');
        }

        const rawColor = (move.pieceColor ?? move.PieceColor ?? 'RED').toString().trim().toUpperCase();
        const pieceColor = rawColor === 'BLACK' ? 'BLACK' : 'RED';

        const fromPosition = (move.fromPosition ?? move.FromPosition ?? '').toString().trim();
        if (!fromPosition) {
            throw new Error('FromPosition là trường bắt buộc');
        }
        if (fromPosition.length > 20) {
            throw new Error('FromPosition không được vượt quá 20 ký tự');
        }

        const toPosition = (move.toPosition ?? move.ToPosition ?? '').toString().trim();
        if (!toPosition) {
            throw new Error('ToPosition là trường bắt buộc');
        }
        if (toPosition.length > 20) {
            throw new Error('ToPosition không được vượt quá 20 ký tự');
        }

        const rawCaptured = move.capturedPiece ?? move.CapturedPiece ?? null;
        let capturedPiece = rawCaptured ? rawCaptured.toString().trim().toUpperCase() : null;
        if (capturedPiece && capturedPiece.length > 20) {
            capturedPiece = capturedPiece.slice(0, 20);
        }

        const createdAt = move.createdAt ?? move.CreatedAt ?? null;

        const pool = await this.getPool();
        const request = pool.request();

        // Parameterized inputs chống hoàn toàn SQL Injection
        request.input('gameId', this._getType(sql.Int), gameId);
        request.input('moveNumber', this._getType(sql.Int), moveNumber);
        request.input('playerId', this._getType(sql.Int), playerId);
        request.input('pieceType', this._getType(sql.NVarChar, 20), pieceType);
        request.input('pieceColor', this._getType(sql.NVarChar, 10), pieceColor);
        request.input('fromPosition', this._getType(sql.NVarChar, 20), fromPosition);
        request.input('toPosition', this._getType(sql.NVarChar, 20), toPosition);
        request.input('capturedPiece', this._getType(sql.NVarChar, 20), capturedPiece);
        request.input('createdAt', this._getType(sql.DateTime2, 7), createdAt);

        const query = `
            INSERT INTO dbo.Moves (
                GameID,
                MoveNumber,
                PlayerID,
                PieceType,
                PieceColor,
                FromPosition,
                ToPosition,
                CapturedPiece,
                CreatedAt
            )
            OUTPUT
                INSERTED.MoveID,
                INSERTED.GameID,
                INSERTED.MoveNumber,
                INSERTED.PlayerID,
                INSERTED.PieceType,
                INSERTED.PieceColor,
                INSERTED.FromPosition,
                INSERTED.ToPosition,
                INSERTED.CapturedPiece,
                INSERTED.CreatedAt
            VALUES (
                @gameId,
                @moveNumber,
                @playerId,
                @pieceType,
                @pieceColor,
                @fromPosition,
                @toPosition,
                @capturedPiece,
                COALESCE(@createdAt, SYSUTCDATETIME())
            );
        `;

        try {
            const result = await request.query(query);
            const recordset = result && result.recordset ? result.recordset : [];

            if (recordset.length === 0) {
                throw new Error('Không thể lưu nước đi mới');
            }

            return Move.fromDatabase(recordset[0]);
        } catch (error) {
            // Bắt lỗi trùng khóa duy nhất (GameID, MoveNumber) từ SQL Server (Error 2601 hoặc 2627)
            if (error.number === 2601 || error.number === 2627 || (error.message && error.message.includes('UQ_Moves_GameID_MoveNumber'))) {
                throw new Error(`Nước đi số ${moveNumber} của ván đấu ${gameId} đã tồn tại (Duplicate MoveNumber)`);
            }
            throw error;
        }
    }

    /**
     * Lấy danh sách toàn bộ nước đi của một ván cờ theo GameID.
     * Luôn sắp xếp theo thứ tự nước đi tăng dần: MoveNumber ASC.
     * 
     * @param {number|string} gameId - Khóa ngoại GameID
     * @returns {Promise<Move[]>} - Mảng các thực thể Move chuẩn theo thứ tự nước đi
     */
    async getMovesByGameId(gameId) {
        const gid = parseInt(gameId, 10);
        if (Number.isNaN(gid) || gid <= 0) {
            return [];
        }

        const pool = await this.getPool();
        const request = pool.request();
        request.input('gameId', this._getType(sql.Int), gid);

        const query = `
            SELECT
                m.MoveID,
                m.GameID,
                m.MoveNumber,
                m.PlayerID,
                m.PieceType,
                m.PieceColor,
                m.FromPosition,
                m.ToPosition,
                m.CapturedPiece,
                m.CreatedAt,
                u.Username AS PlayerUsername
            FROM dbo.Moves m
            LEFT JOIN dbo.Users u ON m.PlayerID = u.UserID
            WHERE m.GameID = @gameId
            ORDER BY m.MoveNumber ASC;
        `;

        const result = await request.query(query);
        const rows = result && result.recordset ? result.recordset : [];

        return rows.map(row => Move.fromDatabase(row));
    }

    /**
     * Lấy nước đi mới nhất (cuối cùng) của ván cờ.
     * Sắp xếp theo MoveNumber DESC và lấy TOP 1.
     * 
     * @param {number|string} gameId - Khóa ngoại GameID
     * @returns {Promise<Move|null>} - Thực thể Move cuối cùng hoặc null nếu ván cờ chưa có nước đi
     */
    async getLastMove(gameId) {
        const gid = parseInt(gameId, 10);
        if (Number.isNaN(gid) || gid <= 0) {
            return null;
        }

        const pool = await this.getPool();
        const request = pool.request();
        request.input('gameId', this._getType(sql.Int), gid);

        const query = `
            SELECT TOP 1
                m.MoveID,
                m.GameID,
                m.MoveNumber,
                m.PlayerID,
                m.PieceType,
                m.PieceColor,
                m.FromPosition,
                m.ToPosition,
                m.CapturedPiece,
                m.CreatedAt,
                u.Username AS PlayerUsername
            FROM dbo.Moves m
            LEFT JOIN dbo.Users u ON m.PlayerID = u.UserID
            WHERE m.GameID = @gameId
            ORDER BY m.MoveNumber DESC;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            return null;
        }

        return Move.fromDatabase(recordset[0]);
    }
}

// Khởi tạo singleton instance mặc định
const defaultInstance = new MoveRepository();

// Export instance mặc định đồng thời gắn các method trực tiếp để hỗ trợ destructuring
module.exports = defaultInstance;
module.exports.MoveRepository = MoveRepository;
module.exports.default = defaultInstance;

module.exports.saveMove = defaultInstance.saveMove.bind(defaultInstance);
module.exports.getMovesByGameId = defaultInstance.getMovesByGameId.bind(defaultInstance);
module.exports.getLastMove = defaultInstance.getLastMove.bind(defaultInstance);
module.exports.setPool = defaultInstance.setPool.bind(defaultInstance);
module.exports.getPool = defaultInstance.getPool.bind(defaultInstance);
