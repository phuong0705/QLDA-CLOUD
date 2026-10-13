let sql;
try {
    sql = require('mssql');
} catch (err) {
    // Stub fallback khi package mssql chưa được cài đặt trong môi trường test cô lập
    sql = {
        NVarChar: (len) => `NVARCHAR(${len || 50})`,
        Int: 'INT',
        Bit: 'BIT',
        DateTime2: 'DATETIME2',
        connect: async () => { throw new Error('Package mssql chưa được cài đặt.'); }
    };
}

const Room = require('../models/Room');
const RoomPlayer = require('../models/RoomPlayer');

/**
 * Lớp RoomRepository: Nơi duy nhất của module phòng chơi thực thi các truy vấn SQL Server.
 * Toàn bộ câu query đều dùng parameterized input (request.input) để ngăn chặn SQL Injection.
 */
class RoomRepository {
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
     * Khởi tạo đối tượng sql.Request từ pool hoặc transaction hiện tại
     * @private
     * @param {Object} poolOrTx - Pool hoặc Transaction
     * @returns {sql.Request}
     */
    _createRequest(poolOrTx) {
        if (poolOrTx && typeof poolOrTx.request === 'function') {
            return poolOrTx.request();
        }
        if (sql.Request && poolOrTx) {
            return new sql.Request(poolOrTx);
        }
        throw new Error('Không thể khởi tạo SQL Request');
    }

    /**
     * Tạo phòng chơi mới trong database.
     * Hỗ trợ transaction: tự động thêm Host vào RoomPlayers trong cùng một transaction.
     * Nếu xảy ra lỗi (ví dụ mã phòng trùng hoặc UserID không tồn tại), toàn bộ thao tác được rollback.
     * 
     * @param {Object} roomData - Dữ liệu phòng chơi
     * @param {string} roomData.roomCode - Mã phòng chơi (duy nhất)
     * @param {number} roomData.hostUserId - UserID của chủ phòng
     * @param {number} [roomData.maxPlayers=2] - Số người chơi tối đa (mặc định 2)
     * @param {string} [roomData.status='WAITING'] - Trạng thái khởi tạo
     * @param {string} [roomData.side='RED'] - Phe của chủ phòng (mặc định RED)
     * @param {Object} [options={}] - Các tùy chọn nâng cao
     * @param {boolean} [options.autoAddHost=true] - Tự động thêm host vào RoomPlayers
     * @param {Object} [options.transaction=null] - Transaction ngoại bộ nếu có
     * @returns {Promise<Room>}
     */
    async create(roomData, options = {}) {
        if (!roomData || typeof roomData !== 'object') {
            throw new Error('Dữ liệu phòng không hợp lệ');
        }

        const roomCode = (roomData.roomCode ?? roomData.RoomCode ?? '').toString().trim().toUpperCase();
        const hostUserId = parseInt(roomData.hostUserId ?? roomData.HostUserID, 10);
        const status = (roomData.status ?? roomData.Status ?? Room.STATUS.WAITING).toString().toUpperCase();

        // Tiêu chí nghiệm thu: MaxPlayers mặc định 2, không cho phép vượt quá 2
        let rawMax = parseInt(roomData.maxPlayers ?? roomData.MaxPlayers ?? 2, 10);
        if (Number.isNaN(rawMax) || rawMax < 1) rawMax = 2;
        if (rawMax > 2) rawMax = 2;
        const maxPlayers = rawMax;

        const hostSide = (roomData.side ?? roomData.hostSide ?? roomData.Side ?? RoomPlayer.SIDE.RED).toString().toUpperCase();
        const autoAddHost = options.autoAddHost !== false && roomData.autoAddHost !== false;

        if (!roomCode) {
            throw new Error('RoomCode là trường bắt buộc');
        }
        if (Number.isNaN(hostUserId) || hostUserId <= 0) {
            throw new Error('HostUserID không hợp lệ');
        }
        if (!Object.values(Room.STATUS).includes(status)) {
            throw new Error(`Trạng thái không hợp lệ: ${status}. Chỉ chấp nhận WAITING, PLAYING, FINISHED, CLOSED.`);
        }
        if (!Object.values(RoomPlayer.SIDE).includes(hostSide)) {
            throw new Error(`Phe của chủ phòng không hợp lệ: ${hostSide}. Chỉ chấp nhận RED hoặc BLACK.`);
        }

        const pool = await this.getPool();
        const useTransaction = options.useTransaction !== false && (autoAddHost || options.transaction);
        let transaction = options.transaction || null;
        let isInternalTransaction = false;

        if (useTransaction && !transaction) {
            if (typeof pool.transaction === 'function') {
                transaction = pool.transaction();
            } else if (sql.Transaction) {
                transaction = new sql.Transaction(pool);
            }
            if (transaction && typeof transaction.begin === 'function') {
                await transaction.begin();
                isInternalTransaction = true;
            }
        }

        try {
            const target = transaction || pool;
            const roomRequest = this._createRequest(target);

            // Parameterized query cho việc tạo Room
            roomRequest.input('roomCode', this._getType(sql.NVarChar, 20), roomCode);
            roomRequest.input('hostUserId', this._getType(sql.Int), hostUserId);
            roomRequest.input('status', this._getType(sql.NVarChar, 20), status);
            roomRequest.input('maxPlayers', this._getType(sql.Int), maxPlayers);

            const roomQuery = `
                INSERT INTO dbo.Rooms (
                    RoomCode,
                    HostUserID,
                    Status,
                    MaxPlayers,
                    CreatedAt,
                    UpdatedAt
                )
                OUTPUT
                    INSERTED.RoomID,
                    INSERTED.RoomCode,
                    INSERTED.HostUserID,
                    INSERTED.Status,
                    INSERTED.MaxPlayers,
                    INSERTED.CreatedAt,
                    INSERTED.UpdatedAt
                VALUES (
                    @roomCode,
                    @hostUserId,
                    @status,
                    @maxPlayers,
                    SYSUTCDATETIME(),
                    SYSUTCDATETIME()
                );
            `;

            const roomResult = await roomRequest.query(roomQuery);
            const roomRow = roomResult && roomResult.recordset ? roomResult.recordset[0] : null;
            if (!roomRow) {
                throw new Error('Không thể tạo phòng mới');
            }

            const createdRoomId = roomRow.RoomID;
            const players = [];

            // Thêm Host vào RoomPlayers trong cùng transaction
            if (autoAddHost) {
                const playerRequest = this._createRequest(target);
                playerRequest.input('roomId', this._getType(sql.Int), createdRoomId);
                playerRequest.input('userId', this._getType(sql.Int), hostUserId);
                playerRequest.input('side', this._getType(sql.NVarChar, 10), hostSide);
                playerRequest.input('isHost', this._getType(sql.Bit), 1);
                playerRequest.input('isReady', this._getType(sql.Bit), 1);

                const playerQuery = `
                    INSERT INTO dbo.RoomPlayers (
                        RoomID,
                        UserID,
                        Side,
                        IsHost,
                        IsReady,
                        JoinedAt
                    )
                    OUTPUT
                        INSERTED.RoomPlayerID,
                        INSERTED.RoomID,
                        INSERTED.UserID,
                        INSERTED.Side,
                        INSERTED.IsHost,
                        INSERTED.IsReady,
                        INSERTED.JoinedAt
                    VALUES (
                        @roomId,
                        @userId,
                        @side,
                        @isHost,
                        @isReady,
                        SYSUTCDATETIME()
                    );
                `;

                const playerResult = await playerRequest.query(playerQuery);
                const playerRow = playerResult && playerResult.recordset ? playerResult.recordset[0] : null;
                if (playerRow) {
                    players.push(RoomPlayer.fromDatabase(playerRow));
                }
            }

            // Commit transaction nội bộ khi hoàn tất thành công
            if (isInternalTransaction && transaction && typeof transaction.commit === 'function') {
                await transaction.commit();
            }

            return Room.fromDatabase(roomRow, players);
        } catch (err) {
            // Rollback an toàn nếu có lỗi trong quá trình thực thi
            if (isInternalTransaction && transaction && typeof transaction.rollback === 'function') {
                try {
                    await transaction.rollback();
                } catch (rbErr) {
                    // Bỏ qua lỗi rollback nếu kết nối đã bị đóng
                }
            }

            // Bắt lỗi ràng buộc Unique RoomCode
            if (err.number === 2627 || err.number === 2601 || (err.message && err.message.includes('UQ_Rooms_RoomCode'))) {
                throw new Error(`Mã phòng "${roomCode}" đã tồn tại. Vui lòng chọn mã phòng khác.`);
            }
            // Bắt lỗi khóa ngoại HostUserID
            if (err.number === 547 || (err.message && err.message.includes('FK_Rooms_HostUserID'))) {
                throw new Error(`Người dùng HostUserID ${hostUserId} không tồn tại trong hệ thống.`);
            }

            throw err;
        }
    }

    /**
     * Alias cho create()
     */
    async createRoom(roomData, options = {}) {
        return this.create(roomData, options);
    }

    /**
     * Tìm phòng chơi theo RoomCode.
     * 
     * @param {string} roomCode - Mã phòng cần tìm
     * @param {Object} [options={ includePlayers: true }] - Tùy chọn kèm danh sách người chơi
     * @returns {Promise<Room|null>}
     */
    async findByCode(roomCode, options = {}) {
        if (!roomCode || typeof roomCode !== 'string') {
            return null;
        }

        const trimmedCode = roomCode.trim().toUpperCase();
        if (!trimmedCode) {
            return null;
        }

        const pool = await this.getPool();
        const request = this._createRequest(pool);

        // Parameterized query cho RoomCode
        request.input('roomCode', this._getType(sql.NVarChar, 20), trimmedCode);

        const query = `
            SELECT TOP 1
                RoomID,
                RoomCode,
                HostUserID,
                Status,
                MaxPlayers,
                CreatedAt,
                UpdatedAt
            FROM dbo.Rooms
            WHERE RoomCode = @roomCode;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];
        if (recordset.length === 0) {
            return null;
        }

        const roomRow = recordset[0];
        const includePlayers = options.includePlayers !== false;
        let players = [];

        if (includePlayers) {
            players = await this.getPlayers(roomRow.RoomID);
        }

        return Room.fromDatabase(roomRow, players);
    }

    /**
     * Tìm phòng chơi theo RoomID (Khóa chính)
     * 
     * @param {number|string} roomId - Khóa chính RoomID
     * @param {Object} [options={ includePlayers: true }] - Tùy chọn kèm danh sách người chơi
     * @returns {Promise<Room|null>}
     */
    async findById(roomId, options = {}) {
        const parsedId = parseInt(roomId, 10);
        if (Number.isNaN(parsedId) || parsedId <= 0) {
            return null;
        }

        const pool = await this.getPool();
        const request = this._createRequest(pool);

        request.input('roomId', this._getType(sql.Int), parsedId);

        const query = `
            SELECT TOP 1
                RoomID,
                RoomCode,
                HostUserID,
                Status,
                MaxPlayers,
                CreatedAt,
                UpdatedAt
            FROM dbo.Rooms
            WHERE RoomID = @roomId;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];
        if (recordset.length === 0) {
            return null;
        }

        const roomRow = recordset[0];
        const includePlayers = options.includePlayers !== false;
        let players = [];

        if (includePlayers) {
            players = await this.getPlayers(roomRow.RoomID);
        }

        return Room.fromDatabase(roomRow, players);
    }

    /**
     * Lấy danh sách thành viên trong phòng (kèm thông tin từ bảng Users: Username, Avatar, EloRating)
     * 
     * @param {number|string} roomId - RoomID
     * @returns {Promise<RoomPlayer[]>}
     */
    async getPlayers(roomId) {
        const parsedId = parseInt(roomId, 10);
        if (Number.isNaN(parsedId) || parsedId <= 0) {
            return [];
        }

        const pool = await this.getPool();
        const request = this._createRequest(pool);

        request.input('roomId', this._getType(sql.Int), parsedId);

        const query = `
            SELECT
                rp.RoomPlayerID,
                rp.RoomID,
                rp.UserID,
                rp.Side,
                rp.IsHost,
                rp.IsReady,
                rp.JoinedAt,
                u.Username,
                u.Avatar,
                u.EloRating
            FROM dbo.RoomPlayers rp
            LEFT JOIN dbo.Users u ON rp.UserID = u.UserID
            WHERE rp.RoomID = @roomId
            ORDER BY rp.JoinedAt ASC;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        return recordset.map(row => RoomPlayer.fromDatabase(row));
    }

    /**
     * Đếm số lượng người chơi hiện tại trong phòng
     * 
     * @param {number|string|Object} roomIdOrData - RoomID hoặc đối tượng chứa roomId
     * @returns {Promise<number>}
     */
    async countPlayers(roomIdOrData) {
        const id = typeof roomIdOrData === 'object' && roomIdOrData !== null
            ? (roomIdOrData.roomId ?? roomIdOrData.RoomID ?? roomIdOrData.id)
            : roomIdOrData;

        const parsedId = parseInt(id, 10);
        if (Number.isNaN(parsedId) || parsedId <= 0) {
            return 0;
        }

        const pool = await this.getPool();
        const request = this._createRequest(pool);

        request.input('roomId', this._getType(sql.Int), parsedId);

        const query = `
            SELECT COUNT(*) AS total
            FROM dbo.RoomPlayers
            WHERE RoomID = @roomId;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];
        if (recordset.length === 0) return 0;

        return Number(recordset[0].total || 0);
    }

    /**
     * Thêm người chơi vào phòng.
     * Tiêu chí nghiệm thu (Definition of Done):
     * - Ngăn cùng user xuất hiện hai lần trong cùng room (qua Unique Constraint + validation).
     * - Tuyệt đối không để phòng có >2 active players (qua locking và atomic check ở SQL Server).
     * - Chỉ cho phép tham gia phòng đang ở trạng thái WAITING.
     * 
     * @param {number|string|Object} roomIdOrData - RoomID hoặc Object chứa { roomId, userId, side, isHost, isReady }
     * @param {number|string} [userIdParam] - UserID của người chơi
     * @param {Object} [optionsParam={}] - Các tùy chọn bổ sung (side, isHost, isReady)
     * @returns {Promise<RoomPlayer>}
     */
    async addPlayer(roomIdOrData, userIdParam, optionsParam = {}) {
        let roomId, userId, side, isHost, isReady;

        if (typeof roomIdOrData === 'object' && roomIdOrData !== null) {
            roomId = parseInt(roomIdOrData.roomId ?? roomIdOrData.RoomID ?? roomIdOrData.id, 10);
            userId = parseInt(roomIdOrData.userId ?? roomIdOrData.UserID ?? userIdParam, 10);
            side = roomIdOrData.side ?? roomIdOrData.Side ?? optionsParam.side;
            isHost = Boolean(roomIdOrData.isHost ?? roomIdOrData.IsHost ?? optionsParam.isHost ?? false);
            isReady = Boolean(roomIdOrData.isReady ?? roomIdOrData.IsReady ?? optionsParam.isReady ?? false);
        } else {
            roomId = parseInt(roomIdOrData, 10);
            userId = parseInt(userIdParam, 10);
            side = optionsParam.side;
            isHost = Boolean(optionsParam.isHost ?? false);
            isReady = Boolean(optionsParam.isReady ?? false);
        }

        if (Number.isNaN(roomId) || roomId <= 0) {
            throw new Error('RoomID không hợp lệ');
        }
        if (Number.isNaN(userId) || userId <= 0) {
            throw new Error('UserID không hợp lệ');
        }

        // 1. Kiểm tra sự tồn tại và trạng thái của phòng
        const room = await this.findById(roomId, { includePlayers: true });
        if (!room) {
            throw new Error('Không tìm thấy phòng chơi');
        }
        if (room.status === Room.STATUS.CLOSED) {
            throw new Error('Phòng đã đóng, không thể tham gia');
        }
        if (room.status === Room.STATUS.FINISHED) {
            throw new Error('Phòng đã kết thúc, không thể tham gia');
        }
        if (room.status === Room.STATUS.PLAYING) {
            throw new Error('Phòng đang trong ván đấu, không thể tham gia');
        }

        // 2. Ngăn cùng user xuất hiện hai lần trong cùng room
        const alreadyInRoom = room.players.some(p => p.userId === userId);
        if (alreadyInRoom) {
            throw new Error('Người chơi đã ở trong phòng này');
        }

        // 3. Tiêu chí nghiệm thu (DoD): Không có room có >2 active players
        if (room.players.length >= room.maxPlayers || room.players.length >= 2) {
            throw new Error('Phòng đã đầy (tối đa 2 người chơi)');
        }

        // 4. Xác định Side (Phe quân cờ) nếu chưa truyền
        let playerSide = side ? side.toString().toUpperCase() : null;
        if (!playerSide) {
            const existingSide = room.players[0] ? room.players[0].side : null;
            if (existingSide === RoomPlayer.SIDE.RED) {
                playerSide = RoomPlayer.SIDE.BLACK;
            } else if (existingSide === RoomPlayer.SIDE.BLACK) {
                playerSide = RoomPlayer.SIDE.RED;
            } else {
                playerSide = room.players.length === 0 ? RoomPlayer.SIDE.RED : RoomPlayer.SIDE.BLACK;
            }
        }

        if (!Object.values(RoomPlayer.SIDE).includes(playerSide)) {
            throw new Error(`Phe không hợp lệ: ${playerSide}. Chỉ chấp nhận RED hoặc BLACK.`);
        }

        const pool = await this.getPool();
        const request = this._createRequest(pool);

        request.input('roomId', this._getType(sql.Int), roomId);
        request.input('userId', this._getType(sql.Int), userId);
        request.input('side', this._getType(sql.NVarChar, 10), playerSide);
        request.input('isHost', this._getType(sql.Bit), isHost ? 1 : 0);
        request.input('isReady', this._getType(sql.Bit), isReady ? 1 : 0);
        request.input('maxPlayers', this._getType(sql.Int), room.maxPlayers);

        // Atomic check với khóa bảng UPDLOCK, HOLDLOCK ở cấp độ SQL Server
        // Đảm bảo không thể xảy ra Race Condition vượt quá 2 người chơi kể cả khi nhiều request đến cùng lúc
        const query = `
            IF (SELECT COUNT(*) FROM dbo.RoomPlayers WITH (UPDLOCK, HOLDLOCK) WHERE RoomID = @roomId) >= @maxPlayers
            BEGIN
                THROW 51000, 'Phòng đã đầy (tối đa 2 người chơi)', 1;
            END;

            INSERT INTO dbo.RoomPlayers (
                RoomID,
                UserID,
                Side,
                IsHost,
                IsReady,
                JoinedAt
            )
            OUTPUT
                INSERTED.RoomPlayerID,
                INSERTED.RoomID,
                INSERTED.UserID,
                INSERTED.Side,
                INSERTED.IsHost,
                INSERTED.IsReady,
                INSERTED.JoinedAt
            VALUES (
                @roomId,
                @userId,
                @side,
                @isHost,
                @isReady,
                SYSUTCDATETIME()
            );
        `;

        try {
            const result = await request.query(query);
            const recordset = result && result.recordset ? result.recordset : [];
            if (recordset.length === 0) {
                throw new Error('Không thể thêm người chơi vào phòng');
            }

            const row = recordset[0];
            return RoomPlayer.fromDatabase(row);
        } catch (err) {
            // Xử lý lỗi ném từ THROW trong SQL Server khi phòng đầy
            if (err.number === 51000 || (err.message && err.message.includes('Phòng đã đầy'))) {
                throw new Error('Phòng đã đầy (tối đa 2 người chơi)');
            }
            // Xử lý vi phạm Unique Constraint UQ_RoomPlayers_Room_User
            if (err.number === 2627 || err.number === 2601 || (err.message && err.message.includes('UQ_RoomPlayers_Room_User'))) {
                throw new Error('Người chơi đã ở trong phòng này');
            }
            // Xử lý vi phạm Foreign Key tới Users
            if (err.number === 547 && err.message && err.message.includes('FK_RoomPlayers_UserID')) {
                throw new Error(`Người dùng UserID ${userId} không tồn tại`);
            }

            throw err;
        }
    }

    /**
     * Xóa người chơi khỏi phòng (rời phòng).
     * 
     * @param {number|string|Object} roomIdOrData - RoomID hoặc Object chứa { roomId, userId }
     * @param {number|string} [userIdParam] - UserID của người chơi rời phòng
     * @returns {Promise<{ success: boolean, removed: boolean, player: RoomPlayer|null }>}
     */
    async removePlayer(roomIdOrData, userIdParam) {
        let roomId, userId;

        if (typeof roomIdOrData === 'object' && roomIdOrData !== null) {
            roomId = parseInt(roomIdOrData.roomId ?? roomIdOrData.RoomID ?? roomIdOrData.id, 10);
            userId = parseInt(roomIdOrData.userId ?? roomIdOrData.UserID ?? userIdParam, 10);
        } else {
            roomId = parseInt(roomIdOrData, 10);
            userId = parseInt(userIdParam, 10);
        }

        if (Number.isNaN(roomId) || roomId <= 0) {
            throw new Error('RoomID không hợp lệ');
        }
        if (Number.isNaN(userId) || userId <= 0) {
            throw new Error('UserID không hợp lệ');
        }

        const pool = await this.getPool();
        const request = this._createRequest(pool);

        request.input('roomId', this._getType(sql.Int), roomId);
        request.input('userId', this._getType(sql.Int), userId);

        const query = `
            DELETE FROM dbo.RoomPlayers
            OUTPUT
                DELETED.RoomPlayerID,
                DELETED.RoomID,
                DELETED.UserID,
                DELETED.Side,
                DELETED.IsHost,
                DELETED.IsReady,
                DELETED.JoinedAt
            WHERE RoomID = @roomId AND UserID = @userId;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];

        if (recordset.length === 0) {
            return {
                success: false,
                removed: false,
                player: null
            };
        }

        const deletedRow = recordset[0];
        return {
            success: true,
            removed: true,
            player: RoomPlayer.fromDatabase(deletedRow)
        };
    }

    /**
     * Cập nhật trạng thái phòng chơi (WAITING, PLAYING, FINISHED, CLOSED).
     * 
     * @param {number|string|Object} roomIdOrData - RoomID hoặc Object chứa { roomId, status }
     * @param {string} [statusParam] - Trạng thái mới
     * @returns {Promise<Room|null>}
     */
    async updateStatus(roomIdOrData, statusParam) {
        let roomId, status;

        if (typeof roomIdOrData === 'object' && roomIdOrData !== null) {
            roomId = parseInt(roomIdOrData.roomId ?? roomIdOrData.RoomID ?? roomIdOrData.id, 10);
            status = roomIdOrData.status ?? roomIdOrData.Status ?? statusParam;
        } else {
            roomId = parseInt(roomIdOrData, 10);
            status = statusParam;
        }

        if (Number.isNaN(roomId) || roomId <= 0) {
            throw new Error('RoomID không hợp lệ');
        }

        const upperStatus = (status ?? '').toString().trim().toUpperCase();
        if (!Object.values(Room.STATUS).includes(upperStatus)) {
            throw new Error(`Trạng thái phòng không hợp lệ: ${status}. Chỉ chấp nhận WAITING, PLAYING, FINISHED, CLOSED.`);
        }

        const pool = await this.getPool();
        const request = this._createRequest(pool);

        request.input('roomId', this._getType(sql.Int), roomId);
        request.input('status', this._getType(sql.NVarChar, 20), upperStatus);

        const query = `
            UPDATE dbo.Rooms
            SET Status = @status,
                UpdatedAt = SYSUTCDATETIME()
            OUTPUT
                INSERTED.RoomID,
                INSERTED.RoomCode,
                INSERTED.HostUserID,
                INSERTED.Status,
                INSERTED.MaxPlayers,
                INSERTED.CreatedAt,
                INSERTED.UpdatedAt
            WHERE RoomID = @roomId;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];
        if (recordset.length === 0) {
            return null;
        }

        const roomRow = recordset[0];
        const players = await this.getPlayers(roomRow.RoomID);

        return Room.fromDatabase(roomRow, players);
    }

    /**
     * Đóng phòng chơi (chuyển trạng thái sang CLOSED).
     * Hỗ trợ tìm theo RoomID hoặc RoomCode.
     * 
     * @param {number|string|Object} identifier - RoomID, RoomCode hoặc Object chứa id
     * @returns {Promise<Room|null>}
     */
    async closeRoom(identifier) {
        let id = identifier;
        if (typeof identifier === 'object' && identifier !== null) {
            id = identifier.roomId ?? identifier.RoomID ?? identifier.roomCode ?? identifier.RoomCode ?? identifier.id;
        }

        const numId = parseInt(id, 10);
        if (!Number.isNaN(numId) && numId > 0) {
            return this.updateStatus(numId, Room.STATUS.CLOSED);
        }

        if (typeof id === 'string' && id.trim()) {
            const room = await this.findByCode(id.trim(), { includePlayers: false });
            if (!room) {
                return null;
            }
            return this.updateStatus(room.id, Room.STATUS.CLOSED);
        }

        throw new Error('ID hoặc RoomCode không hợp lệ');
    }

    /**
     * Kiểm tra người dùng có đang ở trong phòng chơi hay không
     * 
     * @param {number|string} roomId - RoomID
     * @param {number|string} userId - UserID
     * @returns {Promise<boolean>}
     */
    async isUserInRoom(roomId, userId) {
        const parsedRoomId = parseInt(roomId, 10);
        const parsedUserId = parseInt(userId, 10);

        if (Number.isNaN(parsedRoomId) || Number.isNaN(parsedUserId)) {
            return false;
        }

        const pool = await this.getPool();
        const request = this._createRequest(pool);

        request.input('roomId', this._getType(sql.Int), parsedRoomId);
        request.input('userId', this._getType(sql.Int), parsedUserId);

        const query = `
            SELECT TOP 1 1 AS existsFlag
            FROM dbo.RoomPlayers
            WHERE RoomID = @roomId AND UserID = @userId;
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];
        return recordset.length > 0;
    }

    /**
     * Tìm phòng chơi đang hoạt động (WAITING hoặc PLAYING) mà người dùng đang tham gia
     * 
     * @param {number|string} userId - UserID
     * @returns {Promise<Room|null>}
     */
    async findActiveRoomByUserId(userId) {
        const parsedUserId = parseInt(userId, 10);
        if (Number.isNaN(parsedUserId) || parsedUserId <= 0) {
            return null;
        }

        const pool = await this.getPool();
        const request = this._createRequest(pool);

        request.input('userId', this._getType(sql.Int), parsedUserId);

        const query = `
            SELECT TOP 1
                r.RoomID,
                r.RoomCode,
                r.HostUserID,
                r.Status,
                r.MaxPlayers,
                r.CreatedAt,
                r.UpdatedAt
            FROM dbo.Rooms r
            INNER JOIN dbo.RoomPlayers rp ON r.RoomID = rp.RoomID
            WHERE rp.UserID = @userId AND r.Status IN ('WAITING', 'PLAYING');
        `;

        const result = await request.query(query);
        const recordset = result && result.recordset ? result.recordset : [];
        if (recordset.length === 0) return null;

        const roomRow = recordset[0];
        const players = await this.getPlayers(roomRow.RoomID);
        return Room.fromDatabase(roomRow, players);
    }

    /**
     * Xóa hoàn toàn một phòng chơi (Cascade xóa các bản ghi RoomPlayers liên quan)
     * Thường dùng cho teardown trong kiểm thử hoặc dọn dẹp hệ thống.
     * 
     * @param {number|string} roomId - RoomID
     * @returns {Promise<boolean>}
     */
    async deleteRoom(roomId) {
        const parsedId = parseInt(roomId, 10);
        if (Number.isNaN(parsedId) || parsedId <= 0) {
            return false;
        }

        const pool = await this.getPool();
        const request = this._createRequest(pool);

        request.input('roomId', this._getType(sql.Int), parsedId);

        const query = `
            DELETE FROM dbo.Rooms
            WHERE RoomID = @roomId;
        `;

        const result = await request.query(query);
        return Boolean(result && result.rowsAffected && result.rowsAffected[0] > 0);
    }
}

// Khởi tạo singleton instance mặc định
const defaultInstance = new RoomRepository();

// Export instance làm mặc định, đồng thời hỗ trợ destructuring trực tiếp
module.exports = defaultInstance;
module.exports.RoomRepository = RoomRepository;
module.exports.default = defaultInstance;

module.exports.create = defaultInstance.create.bind(defaultInstance);
module.exports.createRoom = defaultInstance.createRoom.bind(defaultInstance);
module.exports.findByCode = defaultInstance.findByCode.bind(defaultInstance);
module.exports.findById = defaultInstance.findById.bind(defaultInstance);
module.exports.getPlayers = defaultInstance.getPlayers.bind(defaultInstance);
module.exports.addPlayer = defaultInstance.addPlayer.bind(defaultInstance);
module.exports.removePlayer = defaultInstance.removePlayer.bind(defaultInstance);
module.exports.countPlayers = defaultInstance.countPlayers.bind(defaultInstance);
module.exports.updateStatus = defaultInstance.updateStatus.bind(defaultInstance);
module.exports.closeRoom = defaultInstance.closeRoom.bind(defaultInstance);
module.exports.isUserInRoom = defaultInstance.isUserInRoom.bind(defaultInstance);
module.exports.findActiveRoomByUserId = defaultInstance.findActiveRoomByUserId.bind(defaultInstance);
module.exports.deleteRoom = defaultInstance.deleteRoom.bind(defaultInstance);
module.exports.setPool = defaultInstance.setPool.bind(defaultInstance);
module.exports.getPool = defaultInstance.getPool.bind(defaultInstance);
