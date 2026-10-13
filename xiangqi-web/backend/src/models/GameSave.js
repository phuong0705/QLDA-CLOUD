/**
 * Mô hình dữ liệu GameSave (Xiangqi GameSave / Snapshot Entity)
 * 
 * Đại diện cho một bản lưu snapshot trạng thái ván cờ tại một thời điểm nhất định.
 * Lưu trữ trạng thái bàn cờ dưới dạng JSON có version (versioned BoardState JSON),
 * lượt đi hiện tại (CurrentTurn), số thứ tự nước đi (MoveNumber) và thời điểm lưu (SavedAt).
 * 
 * Tuyệt đối không sử dụng eval() để parse dữ liệu.
 * Đảm bảo JSON parse / stringify đều có try/catch và kiểm tra schema/version tối thiểu.
 */

const CURRENT_SCHEMA_VERSION = 1;

class GameSave {
    /**
     * Khởi tạo đối tượng GameSave
     * @param {Object} data - Dữ liệu snapshot
     */
    constructor(data = {}) {
        this.id = data.id !== undefined && data.id !== null ? Number(data.id) : (
            data.saveId !== undefined && data.saveId !== null ? Number(data.saveId) : (
                data.SaveID !== undefined && data.SaveID !== null ? Number(data.SaveID) : null
            )
        );
        this.saveId = this.id;

        this.gameId = data.gameId !== undefined && data.gameId !== null ? Number(data.gameId) : (
            data.GameID !== undefined && data.GameID !== null ? Number(data.GameID) : null
        );

        this.userId = data.userId !== undefined && data.userId !== null ? Number(data.userId) : (
            data.UserID !== undefined && data.UserID !== null ? Number(data.UserID) : null
        );

        const rawTurn = (data.currentTurn ?? data.CurrentTurn ?? 'RED').toString().toUpperCase();
        this.currentTurn = rawTurn === 'BLACK' ? 'BLACK' : 'RED';

        this.moveNumber = data.moveNumber !== undefined && data.moveNumber !== null ? (
            Number(data.moveNumber)
        ) : (
            data.MoveNumber !== undefined && data.MoveNumber !== null ? Number(data.MoveNumber) : 0
        );

        this.savedAt = data.savedAt ?? data.SavedAt ?? null;

        // Xử lý BoardState JSON chuỗi hoặc object
        const rawBoardState = data.boardState ?? data.BoardState;
        if (typeof rawBoardState === 'string') {
            this.boardStateJson = rawBoardState;
            this.boardState = null; // Sẽ được parse an toàn khi gọi getParsedBoardState()
        } else if (rawBoardState && typeof rawBoardState === 'object') {
            this.boardState = rawBoardState;
            try {
                this.boardStateJson = JSON.stringify(rawBoardState);
            } catch (err) {
                this.boardStateJson = null;
            }
        } else {
            this.boardState = null;
            this.boardStateJson = null;
        }

        this.version = data.version ?? CURRENT_SCHEMA_VERSION;
    }

    /**
     * Lấy trạng thái bàn cờ đã parse an toàn, có validate schema và version tối thiểu.
     * TUYỆT ĐỐI KHÔNG DÙNG eval.
     * 
     * @returns {Object} - Object dữ liệu bàn cờ đã được kiểm tra tính hợp lệ
     * @throws {Error} - Ném lỗi có kiểm soát nếu snapshot bị hỏng hoặc sai cấu trúc
     */
    getParsedBoardState() {
        if (this.boardState) {
            GameSave.validateBoardStateSchema(this.boardState);
            return this.boardState;
        }

        if (!this.boardStateJson || typeof this.boardStateJson !== 'string') {
            throw new Error('Dữ liệu snapshot bị hỏng: BoardState JSON trống hoặc không hợp lệ');
        }

        // Kiểm tra lỗi lưu dạng chuỗi "[object Object]"
        if (this.boardStateJson.trim() === '[object Object]') {
            throw new Error('Dữ liệu snapshot bị hỏng: BoardState bị lưu dạng [object Object]');
        }

        let parsed;
        try {
            // Sử dụng JSON.parse chuẩn, tuyệt đối không dùng eval
            parsed = JSON.parse(this.boardStateJson);
        } catch (error) {
            throw new Error(`Dữ liệu snapshot bị hỏng (Invalid JSON): ${error.message}`);
        }

        GameSave.validateBoardStateSchema(parsed);
        this.boardState = parsed;
        this.version = parsed.version ?? this.version;
        return parsed;
    }

    /**
     * Kiểm tra cấu trúc và version tối thiểu của đối tượng BoardState
     * @param {Object} data - Dữ liệu trạng thái ván cờ cần kiểm tra
     * @throws {Error} - Ném lỗi rõ ràng nếu vi phạm schema
     */
    static validateBoardStateSchema(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Dữ liệu snapshot không hợp lệ: BoardState phải là một JSON object');
        }

        // Validate version tối thiểu
        if (data.version === undefined || data.version === null) {
            throw new Error('Dữ liệu snapshot không hợp lệ: Thiếu trường version');
        }

        const versionNum = Number(data.version);
        if (Number.isNaN(versionNum) || versionNum < 1) {
            throw new Error(`Dữ liệu snapshot không hợp lệ: Version không được nhỏ hơn 1 (nhận được: ${data.version})`);
        }

        // Validate schema tối thiểu: Bàn cờ phải có cấu trúc dữ liệu bàn/quân cờ
        const hasBoard = data.board !== undefined || data.pieces !== undefined || data.grid !== undefined || data.boardState !== undefined;
        if (!hasBoard) {
            throw new Error('Dữ liệu snapshot không hợp lệ: Thiếu dữ liệu bàn cờ (cần có board, pieces hoặc grid)');
        }
    }

    /**
     * Chuyển đổi một đối tượng GameState (từ Người 2 hoặc service) thành chuỗi JSON versioned chuẩn.
     * Sử dụng GameState.serialize() nếu có sẵn.
     * 
     * @param {Object|string} gameState - Đối tượng GameState hoặc plain object
     * @param {number} [version=CURRENT_SCHEMA_VERSION] - Phiên bản schema
     * @returns {string} - Chuỗi JSON hợp lệ, tuyệt đối không phải '[object Object]'
     */
    static serializeGameState(gameState, version = CURRENT_SCHEMA_VERSION) {
        if (!gameState) {
            throw new Error('GameState là bắt buộc để tạo snapshot');
        }

        let payload;
        // Nếu GameState có method serialize() từ Người 2, ưu tiên gọi nó
        if (typeof gameState.serialize === 'function') {
            payload = gameState.serialize();
        } else {
            payload = gameState;
        }

        let versionedObj;
        if (typeof payload === 'string') {
            if (payload.trim() === '[object Object]') {
                throw new Error('GameState không hợp lệ: Chuỗi là [object Object]');
            }
            try {
                versionedObj = JSON.parse(payload);
            } catch (err) {
                throw new Error(`Dữ liệu GameState JSON không hợp lệ: ${err.message}`);
            }
        } else if (payload && typeof payload === 'object') {
            versionedObj = { ...payload };
        } else {
            throw new Error('GameState phải là một object hoặc JSON string hợp lệ');
        }

        // Đảm bảo gắn version cho snapshot
        if (!versionedObj.version) {
            versionedObj.version = version;
        }

        // Stringify an toàn với try/catch
        let jsonStr;
        try {
            jsonStr = JSON.stringify(versionedObj);
        } catch (error) {
            throw new Error(`Không thể serialize GameState: ${error.message}`);
        }

        if (!jsonStr || jsonStr === '[object Object]') {
            throw new Error('Không thể serialize GameState thành chuỗi JSON hợp lệ');
        }

        return jsonStr;
    }

    /**
     * Khởi tạo đối tượng GameSave từ chuỗi JSON hoặc plain object (fromJSON).
     * Tuyệt đối không dùng eval().
     * 
     * @param {string|Object} jsonOrObj - Chuỗi JSON snapshot hoặc object
     * @returns {GameSave} - Thực thể GameSave
     */
    static fromJSON(jsonOrObj) {
        if (!jsonOrObj) {
            throw new Error('Dữ liệu JSON không hợp lệ');
        }

        let data;
        if (typeof jsonOrObj === 'string') {
            if (jsonOrObj.trim() === '[object Object]') {
                throw new Error('Dữ liệu snapshot bị hỏng: Chuỗi là [object Object]');
            }
            try {
                data = JSON.parse(jsonOrObj);
            } catch (err) {
                throw new Error(`Không thể parse JSON snapshot: ${err.message}`);
            }
        } else if (typeof jsonOrObj === 'object') {
            data = jsonOrObj;
        } else {
            throw new Error('Dữ liệu truyền vào fromJSON phải là chuỗi JSON hoặc object');
        }

        // Validate schema cơ bản
        if (data.boardState) {
            if (typeof data.boardState === 'object') {
                GameSave.validateBoardStateSchema(data.boardState);
            }
        }

        return new GameSave(data);
    }

    /**
     * Chuyển đổi thành plain object chuẩn
     * @returns {Object}
     */
    toSafeObject() {
        return {
            id: this.id,
            saveId: this.saveId,
            gameId: this.gameId,
            userId: this.userId,
            currentTurn: this.currentTurn,
            moveNumber: this.moveNumber,
            savedAt: this.savedAt,
            version: this.version,
            boardState: this.boardState ?? this.boardStateJson
        };
    }

    /**
     * Phương thức toJSON chuẩn
     * @returns {Object}
     */
    toJSON() {
        return this.toSafeObject();
    }

    /**
     * Tạo thực thể GameSave từ dòng dữ liệu SQL Server (recordset row)
     * @param {Object} row - Dữ liệu thô từ câu lệnh SELECT SQL
     * @returns {GameSave|null}
     */
    static fromDatabase(row) {
        if (!row) return null;
        return new GameSave(row);
    }
}

module.exports = GameSave;
module.exports.CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
