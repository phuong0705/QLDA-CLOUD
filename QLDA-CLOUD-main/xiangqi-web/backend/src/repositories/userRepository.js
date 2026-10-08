const sql = require('mssql');
const User = require('../models/User');

/**
 * Lớp UserRepository: Nơi duy nhất của module user thực thi các truy vấn SQL Server.
 * Toàn bộ câu query đều dùng parameterized input (request.input) để ngăn chặn SQL Injection.
 */
class UserRepository {
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
     * Tạo helper an toàn cho MSSQL DataType (tương thích cả real mssql lẫn test mocks)
     * @private
     */
    _getType(typeDef, length) {
        if (typeof typeDef === 'function') {
            return length !== undefined ? typeDef(length) : typeDef();
        }
        return typeDef;
    }

    /**
     * Tìm người dùng theo Username hoặc Email.
     * Mặc định trả về PasswordHash phục vụ luồng xác thực (Authentication).
     * Có thể truyền options = { includePassword: false } hoặc false để ẩn PasswordHash khi không cần auth.
     * 
     * @param {string} value - Username hoặc Email cần tìm
     * @param {Object|boolean} [options={ includePassword: true }] - Tùy chọn hiển thị passwordHash
     * @returns {Promise<User|null>}
     */
    async findByUsernameOrEmail(value, options = {}) {
        if (!value || typeof value !== 'string') {
            return null;
        }

        const trimmedValue = value.trim();
        if (!trimmedValue) {
            return null;
        }

        const includePassword = typeof options === 'boolean'
            ? options
            : (options.includePassword !== false && options.forAuth !== false);

        const pool = await this.getPool();
        const request = pool.request();

        // Parameterized input chống triệt để SQL Injection (kể cả khi value chứa ký tự đặc biệt)
        request.input('value', this._getType(sql.NVarChar, 100), trimmedValue);

        const query = `
            SELECT TOP 1
                UserID,
                Username,
                Email,
                PasswordHash,
                Avatar,
                EloRating,
                Wins,
                Losses,
                Draws,
                CreatedAt,
                UpdatedAt
            FROM dbo.Users
            WHERE Username = @value OR Email = @value;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            return null;
        }

        const row = recordset[0];
        return User.fromDatabase(row, includePassword);
    }

    /**
     * Tìm người dùng theo UserID.
     * TUYỆT ĐỐI không trả PasswordHash ra ngoài vì không dùng cho mục đích xác thực.
     * 
     * @param {number|string} id - Khóa chính UserID
     * @returns {Promise<User|null>}
     */
    async findById(id) {
        const userId = parseInt(id, 10);
        if (Number.isNaN(userId) || userId <= 0) {
            return null;
        }

        const pool = await this.getPool();
        const request = pool.request();

        // Parameterized input kiểu Int
        request.input('id', this._getType(sql.Int), userId);

        // Không SELECT PasswordHash trong query
        const query = `
            SELECT TOP 1
                UserID,
                Username,
                Email,
                Avatar,
                EloRating,
                Wins,
                Losses,
                Draws,
                CreatedAt,
                UpdatedAt
            FROM dbo.Users
            WHERE UserID = @id;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            return null;
        }

        const row = recordset[0];
        return User.fromDatabase(row, false);
    }

    /**
     * Tạo người dùng mới trong database.
     * Không lưu mật khẩu plain text - bắt buộc mật khẩu đã được hash (PasswordHash).
     * Kết quả trả về không bao gồm PasswordHash.
     * 
     * @param {Object} user - Object chứa thông tin người dùng mới
     * @returns {Promise<User>} - Đối tượng người dùng vừa tạo (không kèm PasswordHash)
     */
    async createUser(user) {
        if (!user || typeof user !== 'object') {
            throw new Error('Dữ liệu người dùng không hợp lệ');
        }

        const username = (user.username ?? user.Username ?? '').toString().trim();
        const email = (user.email ?? user.Email ?? '').toString().trim();
        const passwordHash = user.passwordHash ?? user.PasswordHash;
        const avatar = user.avatar ?? user.avatarUrl ?? user.Avatar ?? null;
        const eloRating = parseInt(user.eloRating ?? user.EloRating ?? 1000, 10);
        const wins = parseInt(user.wins ?? user.Wins ?? 0, 10);
        const losses = parseInt(user.losses ?? user.Losses ?? 0, 10);
        const draws = parseInt(user.draws ?? user.Draws ?? 0, 10);

        if (!username) {
            throw new Error('Username là trường bắt buộc');
        }
        if (!email) {
            throw new Error('Email là trường bắt buộc');
        }
        if (!passwordHash) {
            throw new Error('PasswordHash là bắt buộc. Không được lưu mật khẩu dạng plain text.');
        }

        const pool = await this.getPool();
        const request = pool.request();

        // Toàn bộ các giá trị đều được bind bằng request.input
        request.input('username', this._getType(sql.NVarChar, 50), username);
        request.input('email', this._getType(sql.NVarChar, 100), email);
        request.input('passwordHash', this._getType(sql.NVarChar, 255), passwordHash);
        request.input('avatar', this._getType(sql.NVarChar, 500), avatar);
        request.input('eloRating', this._getType(sql.Int), Number.isNaN(eloRating) ? 1000 : eloRating);
        request.input('wins', this._getType(sql.Int), Number.isNaN(wins) ? 0 : wins);
        request.input('losses', this._getType(sql.Int), Number.isNaN(losses) ? 0 : losses);
        request.input('draws', this._getType(sql.Int), Number.isNaN(draws) ? 0 : draws);

        // OUTPUT INSERTED không trả về PasswordHash
        const query = `
            INSERT INTO dbo.Users (
                Username,
                Email,
                PasswordHash,
                Avatar,
                EloRating,
                Wins,
                Losses,
                Draws,
                CreatedAt,
                UpdatedAt
            )
            OUTPUT
                INSERTED.UserID,
                INSERTED.Username,
                INSERTED.Email,
                INSERTED.Avatar,
                INSERTED.EloRating,
                INSERTED.Wins,
                INSERTED.Losses,
                INSERTED.Draws,
                INSERTED.CreatedAt,
                INSERTED.UpdatedAt
            VALUES (
                @username,
                @email,
                @passwordHash,
                @avatar,
                @eloRating,
                @wins,
                @losses,
                @draws,
                SYSUTCDATETIME(),
                SYSUTCDATETIME()
            );
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            throw new Error('Không thể tạo người dùng mới');
        }

        const row = recordset[0];
        return User.fromDatabase(row, false);
    }

    /**
     * Cập nhật số liệu thống kê (Elo rating, Wins, Losses, Draws) của người dùng.
     * Kết quả trả về không bao gồm PasswordHash.
     * 
     * @param {number|string} id - UserID
     * @param {Object} stats - Đối tượng thống kê cần cập nhật
     * @returns {Promise<User|null>} - Thông tin người dùng sau khi cập nhật (không kèm PasswordHash)
     */
    async updateStats(id, stats) {
        const userId = parseInt(id, 10);
        if (Number.isNaN(userId) || userId <= 0) {
            throw new Error('ID người dùng không hợp lệ');
        }

        if (!stats || typeof stats !== 'object') {
            throw new Error('Dữ liệu thống kê không hợp lệ');
        }

        const pool = await this.getPool();
        const request = pool.request();
        request.input('id', this._getType(sql.Int), userId);

        const setClauses = ['UpdatedAt = SYSUTCDATETIME()'];

        // Cập nhật giá trị tuyệt đối nếu được truyền vào
        if (stats.eloRating !== undefined || stats.EloRating !== undefined) {
            const elo = parseInt(stats.eloRating ?? stats.EloRating, 10);
            request.input('eloRating', this._getType(sql.Int), elo);
            setClauses.push('EloRating = @eloRating');
        }

        if (stats.wins !== undefined || stats.Wins !== undefined) {
            const wins = parseInt(stats.wins ?? stats.Wins, 10);
            request.input('wins', this._getType(sql.Int), wins);
            setClauses.push('Wins = @wins');
        }

        if (stats.losses !== undefined || stats.Losses !== undefined) {
            const losses = parseInt(stats.losses ?? stats.Losses, 10);
            request.input('losses', this._getType(sql.Int), losses);
            setClauses.push('Losses = @losses');
        }

        if (stats.draws !== undefined || stats.Draws !== undefined) {
            const draws = parseInt(stats.draws ?? stats.Draws, 10);
            request.input('draws', this._getType(sql.Int), draws);
            setClauses.push('Draws = @draws');
        }

        // Hỗ trợ cập nhật giá trị gia tăng (delta / relative increments)
        if (stats.eloDelta !== undefined || stats.eloChange !== undefined) {
            const eloDelta = parseInt(stats.eloDelta ?? stats.eloChange, 10);
            request.input('eloDelta', this._getType(sql.Int), eloDelta);
            setClauses.push('EloRating = EloRating + @eloDelta');
        }

        if (stats.winsDelta !== undefined || stats.winsIncrement !== undefined) {
            const winsDelta = parseInt(stats.winsDelta ?? stats.winsIncrement, 10);
            request.input('winsDelta', this._getType(sql.Int), winsDelta);
            setClauses.push('Wins = Wins + @winsDelta');
        }

        if (stats.lossesDelta !== undefined || stats.lossesIncrement !== undefined) {
            const lossesDelta = parseInt(stats.lossesDelta ?? stats.lossesIncrement, 10);
            request.input('lossesDelta', this._getType(sql.Int), lossesDelta);
            setClauses.push('Losses = Losses + @lossesDelta');
        }

        if (stats.drawsDelta !== undefined || stats.drawsIncrement !== undefined) {
            const drawsDelta = parseInt(stats.drawsDelta ?? stats.drawsIncrement, 10);
            request.input('drawsDelta', this._getType(sql.Int), drawsDelta);
            setClauses.push('Draws = Draws + @drawsDelta');
        }

        const query = `
            UPDATE dbo.Users
            SET ${setClauses.join(', ')}
            OUTPUT
                INSERTED.UserID,
                INSERTED.Username,
                INSERTED.Email,
                INSERTED.Avatar,
                INSERTED.EloRating,
                INSERTED.Wins,
                INSERTED.Losses,
                INSERTED.Draws,
                INSERTED.CreatedAt,
                INSERTED.UpdatedAt
            WHERE UserID = @id;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            return null;
        }

        const row = recordset[0];
        return User.fromDatabase(row, false);
    }

    /**
     * Lấy bảng xếp hạng người chơi sắp xếp theo Elo rating giảm dần.
     * TUYỆT ĐỐI không trả PasswordHash ra ngoài.
     * 
     * @param {number} [limit=10] - Số lượng người chơi cần lấy
     * @returns {Promise<User[]>} - Danh sách người chơi trong bảng xếp hạng
     */
    async getLeaderboard(limit = 10) {
        const parsedLimit = parseInt(limit, 10);
        const safeLimit = (!Number.isNaN(parsedLimit) && parsedLimit > 0) ? parsedLimit : 10;

        const pool = await this.getPool();
        const request = pool.request();

        // Parameterized TOP clause
        request.input('limit', this._getType(sql.Int), safeLimit);

        // Không SELECT PasswordHash
        const query = `
            SELECT TOP (@limit)
                UserID,
                Username,
                Email,
                Avatar,
                EloRating,
                Wins,
                Losses,
                Draws,
                CreatedAt,
                UpdatedAt
            FROM dbo.Users
            ORDER BY EloRating DESC, Wins DESC, UserID ASC;
        `;

        const result = await request.query(query);
        const rows = result && result.recordset ? result.recordset : [];

        return rows.map(row => User.fromDatabase(row, false));
    }
}

// Khởi tạo singleton instance mặc định
const defaultInstance = new UserRepository();

// Export instance làm mặc định, đồng thời gắn các method trực tiếp để hỗ trợ destructuring
module.exports = defaultInstance;
module.exports.UserRepository = UserRepository;
module.exports.default = defaultInstance;

module.exports.findByUsernameOrEmail = defaultInstance.findByUsernameOrEmail.bind(defaultInstance);
module.exports.findById = defaultInstance.findById.bind(defaultInstance);
module.exports.createUser = defaultInstance.createUser.bind(defaultInstance);
module.exports.updateStats = defaultInstance.updateStats.bind(defaultInstance);
module.exports.getLeaderboard = defaultInstance.getLeaderboard.bind(defaultInstance);
module.exports.setPool = defaultInstance.setPool.bind(defaultInstance);
module.exports.getPool = defaultInstance.getPool.bind(defaultInstance);
