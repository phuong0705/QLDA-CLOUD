const sql = require('mssql');
const GameSave = require('../models/GameSave');

/**
 * Lớp GameSaveRepository: Quản lý truy xuất cơ sở dữ liệu cho các snapshot trạng thái ván cờ (bảng GameSaves).
 * Thực hiện lưu (upsert) và đọc bản snapshot mới nhất theo từng GameID và UserID.
 * Toàn bộ các câu query đều dùng parameterized input để ngăn chặn SQL Injection.
 * Không sử dụng eval, đảm bảo try/catch và kiểm tra schema/version tối thiểu khi load.
 */
class GameSaveRepository {
    /**
     * @param {sql.ConnectionPool|null} [pool=null] - MSSQL Connection Pool
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
     * Helper an toàn cho MSSQL DataType
     * @private
     */
    _getType(typeDef, length) {
        if (typeof typeDef === 'function') {
            return length !== undefined ? typeDef(length) : typeDef();
        }
        return typeDef;
    }

    /**
     * Lưu bản snapshot trạng thái bàn cờ (Upsert: Cập nhật nếu đã có, tạo mới nếu chưa có).
     * Sử dụng GameState.serialize() nếu gameState có hỗ trợ.
     * Đảm bảo BoardState lưu dưới dạng chuỗi JSON có version, tuyệt đối không bị lưu dạng '[object Object]'.
     * 
     * @param {number|string} gameId - Khóa chính GameID
     * @param {number|string} userId - Khóa chính UserID của người lưu
     * @param {Object|string} gameState - Đối tượng trạng thái ván cờ (hoặc đối tượng GameState từ Người 2)
     * @param {number} [moveNumber=0] - Số thứ tự nước đi hiện tại của snapshot
     * @returns {Promise<GameSave>} - Đối tượng GameSave vừa được lưu
     */
    async saveSnapshot(gameId, userId, gameState, moveNumber = 0) {
        const gid = parseInt(gameId, 10);
        if (Number.isNaN(gid) || gid <= 0) {
            throw new Error('GameID là trường bắt buộc và phải là số nguyên dương');
        }

        const uid = parseInt(userId, 10);
        if (Number.isNaN(uid) || uid <= 0) {
            throw new Error('UserID là trường bắt buộc và phải là số nguyên dương');
        }

        if (!gameState) {
            throw new Error('GameState là bắt buộc để lưu snapshot');
        }

        // 1. Serialize GameState an toàn bằng helper của GameSave model
        const boardStateJson = GameSave.serializeGameState(gameState);

        // 2. Xác định CurrentTurn từ GameState nếu có
        let currentTurn = 'RED';
        if (gameState.currentTurn) {
            const rawTurn = gameState.currentTurn.toString().toUpperCase();
            currentTurn = rawTurn === 'BLACK' ? 'BLACK' : 'RED';
        } else {
            try {
                const parsed = JSON.parse(boardStateJson);
                if (parsed.currentTurn) {
                    const rawTurn = parsed.currentTurn.toString().toUpperCase();
                    currentTurn = rawTurn === 'BLACK' ? 'BLACK' : 'RED';
                }
            } catch (e) {
                // Giữ mặc định RED nếu không đọc được
            }
        }

        const parsedMoveNumber = parseInt(moveNumber, 10);
        const finalMoveNumber = (!Number.isNaN(parsedMoveNumber) && parsedMoveNumber >= 0) ? parsedMoveNumber : 0;

        const pool = await this.getPool();
        const request = pool.request();

        // Parameterized inputs chống hoàn toàn SQL Injection
        request.input('gameId', this._getType(sql.Int), gid);
        request.input('userId', this._getType(sql.Int), uid);
        request.input('boardState', this._getType(sql.NVarChar, sql.MAX), boardStateJson);
        request.input('currentTurn', this._getType(sql.NVarChar, 10), currentTurn);
        request.input('moveNumber', this._getType(sql.Int), finalMoveNumber);

        // Sử dụng câu lệnh MERGE trong SQL Server để thực hiện UPSERT nguyên tử (Atomic Upsert)
        const query = `
            MERGE dbo.GameSaves AS target
            USING (SELECT @gameId AS GameID, @userId AS UserID) AS source
            ON (target.GameID = source.GameID AND target.UserID = source.UserID)
            WHEN MATCHED THEN
                UPDATE SET
                    BoardState = @boardState,
                    CurrentTurn = @currentTurn,
                    MoveNumber = @moveNumber,
                    SavedAt = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN
                INSERT (GameID, UserID, BoardState, CurrentTurn, MoveNumber, SavedAt)
                VALUES (@gameId, @userId, @boardState, @currentTurn, @moveNumber, SYSUTCDATETIME())
            OUTPUT
                INSERTED.SaveID,
                INSERTED.GameID,
                INSERTED.UserID,
                INSERTED.BoardState,
                INSERTED.CurrentTurn,
                INSERTED.MoveNumber,
                INSERTED.SavedAt;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            throw new Error('Không thể lưu snapshot ván cờ');
        }

        return GameSave.fromDatabase(recordset[0]);
    }

    /**
     * Tải bản snapshot mới nhất của một ván cờ theo GameID và UserID.
     * Phục hồi BoardState bằng JSON.parse (tuyệt đối không dùng eval).
     * Kiểm tra schema và version tối thiểu, trả lỗi kiểm soát nếu snapshot bị hỏng.
     * 
     * @param {number|string} gameId - Khóa chính GameID
     * @param {number|string} userId - Khóa chính UserID
     * @returns {Promise<GameSave|null>} - Thực thể GameSave mới nhất hoặc null nếu chưa có snapshot
     * @throws {Error} - Ném lỗi có kiểm soát nếu snapshot bị hỏng dữ liệu
     */
    async loadLatestSnapshot(gameId, userId) {
        const gid = parseInt(gameId, 10);
        if (Number.isNaN(gid) || gid <= 0) {
            return null;
        }

        const uid = parseInt(userId, 10);
        if (Number.isNaN(uid) || uid <= 0) {
            return null;
        }

        const pool = await this.getPool();
        const request = pool.request();
        request.input('gameId', this._getType(sql.Int), gid);
        request.input('userId', this._getType(sql.Int), uid);

        const query = `
            SELECT TOP 1
                SaveID,
                GameID,
                UserID,
                BoardState,
                CurrentTurn,
                MoveNumber,
                SavedAt
            FROM dbo.GameSaves
            WHERE GameID = @gameId AND UserID = @userId
            ORDER BY SavedAt DESC, SaveID DESC;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            return null;
        }

        const save = GameSave.fromDatabase(recordset[0]);

        // Thực hiện parse và validate schema/version tối thiểu (kiểm soát lỗi snapshot bị hỏng)
        // Sẽ throw Error có kiểm soát nếu BoardState bị hỏng
        save.getParsedBoardState();

        return save;
    }

    /**
     * Alias cho saveSnapshot (hỗ trợ cả hai cách đặt tên theo yêu cầu)
     */
    async upsert(gameId, userId, gameState, moveNumber = 0) {
        return this.saveSnapshot(gameId, userId, gameState, moveNumber);
    }

    /**
     * Alias cho loadLatestSnapshot
     */
    async getLatestByGameAndUser(gameId, userId) {
        return this.loadLatestSnapshot(gameId, userId);
    }
}

// Khởi tạo singleton instance mặc định
const defaultInstance = new GameSaveRepository();

// Export instance mặc định đồng thời gắn các method trực tiếp để hỗ trợ destructuring
module.exports = defaultInstance;
module.exports.GameSaveRepository = GameSaveRepository;
module.exports.default = defaultInstance;

module.exports.saveSnapshot = defaultInstance.saveSnapshot.bind(defaultInstance);
module.exports.loadLatestSnapshot = defaultInstance.loadLatestSnapshot.bind(defaultInstance);
module.exports.upsert = defaultInstance.upsert.bind(defaultInstance);
module.exports.getLatestByGameAndUser = defaultInstance.getLatestByGameAndUser.bind(defaultInstance);
module.exports.setPool = defaultInstance.setPool.bind(defaultInstance);
module.exports.getPool = defaultInstance.getPool.bind(defaultInstance);
