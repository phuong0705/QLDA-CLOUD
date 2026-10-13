/**
 * ============================================================================
 * socketClient.js - Lớp kết nối Socket.IO duy nhất phía Client (Browser/Frontend)
 * ============================================================================
 * 
 * Nhiệm vụ:
 * 1. Đóng vai trò là lớp kết nối Socket.IO duy nhất phía client (Singleton Pattern).
 * 2. Tự động đọc JWT token từ authManager (hoặc localStorage) và gửi qua handshake.auth.token.
 * 3. Ngăn chặn việc tạo nhiều socket connection do page init lặp lại.
 * 4. Quản lý việc đăng ký, hủy đăng ký và dọn dẹp (cleanup) toàn bộ event listeners khi rời trang/ván đấu.
 * 5. Cung cấp các phương thức tiện ích cho các nghiệp vụ realtime:
 *    - joinRoom, leaveRoom, startGame
 *    - sendMove, resign, rejoinGame, syncGame
 * 6. Xử lý các sự kiện vòng đời kết nối: connect, connect_error, disconnect, reconnect.
 * 
 * Contract:
 * - Singleton instance: socketClient
 * - Auth: handshake.auth = { token }
 */

/**
 * Lấy authManager từ môi trường toàn cục hoặc nạp an toàn
 * @returns {Object|null}
 */
function getAuthManager() {
    if (typeof window !== 'undefined' && window.authManager) {
        return window.authManager;
    }
    if (typeof global !== 'undefined' && global.authManager) {
        return global.authManager;
    }
    try {
        if (typeof require === 'function') {
            return require('../auth/authManager');
        }
    } catch (e) {
        // Fallback im lặng nếu không có require
    }
    return null;
}

/**
 * Lấy token xác thực từ authManager hoặc localStorage
 * @returns {string|null}
 */
function getAuthToken() {
    const am = getAuthManager();
    if (am && typeof am.getToken === 'function') {
        const token = am.getToken();
        if (token) return token;
    }
    if (typeof localStorage !== 'undefined') {
        try {
            return localStorage.getItem('xiangqi_auth_token');
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * Xác định URL kết nối Socket.IO Server
 * @returns {string}
 */
function getDefaultServerUrl() {
    if (typeof window !== 'undefined') {
        if (window.SOCKET_URL) return window.SOCKET_URL;
        if (window.API_BASE_URL) return window.API_BASE_URL.replace(/\/api\/?$/, '');
        if (window.location && window.location.origin && !window.location.origin.startsWith('file:')) {
            const port = window.location.port;
            // Nếu chạy dev frontend trên live-server (5500, 3000, 5173), trỏ về backend cổng 5000
            if (port === '5500' || port === '3000' || port === '5173') {
                return `${window.location.protocol}//${window.location.hostname}:5000`;
            }
            return window.location.origin;
        }
    }
    if (typeof process !== 'undefined' && process.env && process.env.SOCKET_URL) {
        return process.env.SOCKET_URL;
    }
    return 'http://localhost:5000';
}

/**
 * Lấy hàm khởi tạo io từ window.io hoặc global
 * @returns {Function|null}
 */
function getGlobalIO() {
    if (typeof window !== 'undefined' && typeof window.io === 'function') {
        return window.io;
    }
    if (typeof io === 'function') {
        return io;
    }
    if (typeof global !== 'undefined' && typeof global.io === 'function') {
        return global.io;
    }
    return null;
}

/**
 * Lớp điều phối kết nối Socket.IO phía client
 */
class SocketClient {
    constructor() {
        this.socket = null;
        this.serverUrl = null;
        this.isConnecting = false;
        this.ioFactory = null; // Cho phép mock/inject trong test

        // Map quản lý các event listeners do các module đăng ký: event -> Set<handler>
        this.registeredListeners = new Map();
        
        // Trạng thái thông tin kết nối
        this.lastError = null;
    }

    /**
     * Cho phép cấu hình custom IO factory (dùng cho integration test / mock)
     * @param {Function} factory
     */
    setIOFactory(factory) {
        this.ioFactory = factory;
    }

    /**
     * Kiểm tra socket hiện tại đã kết nối thành công chưa
     * @returns {boolean}
     */
    isConnected() {
        return Boolean(this.socket && (this.socket.connected === true || this.socket.connected === undefined && !this.isConnecting));
    }

    /**
     * Lấy socket instance hiện tại
     * @returns {Object|null}
     */
    getSocket() {
        return this.socket;
    }

    /**
     * Khởi tạo kết nối Socket.IO (Singleton Guard: Không tạo nhiều kết nối khi gọi lặp)
     * 
     * @param {Object} [options={}]
     * @param {string} [options.url] - URL backend server
     * @param {string} [options.token] - JWT token ghi đè nếu cần
     * @param {boolean} [options.forceReconnect=false] - Buộc ngắt kết nối cũ và tạo mới
     * @param {Object} [options.socketOptions] - Tùy chọn cấu hình Socket.IO bổ sung
     * @returns {Object|null} Socket instance
     */
    connect(options = {}) {
        const {
            url,
            token,
            forceReconnect = false,
            socketOptions = {}
        } = options;

        const targetUrl = url || this.serverUrl || getDefaultServerUrl();
        this.serverUrl = targetUrl;

        // 1. Singleton Guard: Nếu socket đang kết nối hoặc đã kết nối và không forceReconnect -> tái sử dụng
        if (this.socket && (this.socket.connected || this.isConnecting) && !forceReconnect) {
            return this.socket;
        }

        // 2. Nếu đã có socket cũ nhưng cần kết nối lại, dọn dẹp trước
        if (this.socket) {
            try {
                this.socket.disconnect();
            } catch (ignored) {}
            this.socket = null;
        }

        this.isConnecting = true;
        this.lastError = null;

        const authToken = token || getAuthToken();

        const ioFunc = this.ioFactory || getGlobalIO();
        if (!ioFunc) {
            this.isConnecting = false;
            const msg = '[SocketClient] Thư viện Socket.IO client (io) chưa sẵn sàng. Vui lòng nạp socket.io.js hoặc inject ioFactory.';
            console.error(msg);
            this.lastError = new Error(msg);
            return null;
        }

        // Cấu hình chuẩn kết nối với credentials và auth token
        const finalSocketOptions = {
            auth: {
                token: authToken || ''
            },
            withCredentials: true,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            ...socketOptions
        };

        try {
            this.socket = ioFunc(targetUrl, finalSocketOptions);
        } catch (err) {
            this.isConnecting = false;
            this.lastError = err;
            console.error('[SocketClient] Lỗi khởi tạo socket:', err);
            return null;
        }

        // Đăng ký lại các listeners đã được lưu trong registeredListeners (nếu có trước khi connect)
        this._rebindAllListeners();

        // Lắng nghe các sự kiện hệ thống
        this.socket.on('connect', () => {
            this.isConnecting = false;
            this.lastError = null;
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[SocketClient] Kết nối thành công tới ${targetUrl} (id: ${this.socket.id})`);
            }
        });

        this.socket.on('connect_error', (error) => {
            this.isConnecting = false;
            this.lastError = error;
            console.warn('[SocketClient] Lỗi kết nối (connect_error):', error?.message || error);
        });

        this.socket.on('disconnect', (reason) => {
            this.isConnecting = false;
            if (process.env.NODE_ENV !== 'production') {
                console.log('[SocketClient] Đã ngắt kết nối:', reason);
            }
        });

        return this.socket;
    }

    /**
     * Gắn lại tất cả listeners đã lưu vào socket hiện tại
     * @private
     */
    _rebindAllListeners() {
        if (!this.socket) return;
        for (const [event, handlers] of this.registeredListeners.entries()) {
            for (const handler of handlers) {
                this.socket.on(event, handler);
            }
        }
    }

    /**
     * Đăng ký lắng nghe sự kiện với khả năng quản lý và dọn dẹp tập trung
     * @param {string} event - Tên sự kiện
     * @param {Function} handler - Hàm callback xử lý
     */
    on(event, handler) {
        if (!event || typeof handler !== 'function') return;

        if (!this.registeredListeners.has(event)) {
            this.registeredListeners.set(event, new Set());
        }
        this.registeredListeners.get(event).add(handler);

        if (this.socket) {
            this.socket.on(event, handler);
        }
    }

    /**
     * Hủy đăng ký một handler cụ thể hoặc tất cả handler của sự kiện
     * @param {string} event - Tên sự kiện
     * @param {Function} [handler] - Handler cụ thể cần hủy (nếu bỏ trống sẽ hủy hết sự kiện đó)
     */
    off(event, handler) {
        if (!event) return;

        if (handler) {
            if (this.registeredListeners.has(event)) {
                this.registeredListeners.get(event).delete(handler);
            }
            if (this.socket) {
                this.socket.off(event, handler);
            }
        } else {
            if (this.registeredListeners.has(event)) {
                const handlers = this.registeredListeners.get(event);
                if (this.socket) {
                    for (const h of handlers) {
                        this.socket.off(event, h);
                    }
                }
                this.registeredListeners.delete(event);
            }
        }
    }

    /**
     * Lắng nghe sự kiện một lần duy nhất
     * @param {string} event
     * @param {Function} handler
     */
    once(event, handler) {
        if (!event || typeof handler !== 'function') return;

        const wrapper = (...args) => {
            this.off(event, wrapper);
            handler(...args);
        };
        this.on(event, wrapper);
    }

    /**
     * Phát sự kiện tới server
     * @param {string} event - Tên sự kiện
     * @param {any} [data] - Dữ liệu payload
     * @param {Function} [callback] - Ack callback từ server
     */
    emit(event, data, callback) {
        if (!this.socket) {
            console.warn(`[SocketClient] emit('${event}') bị bỏ qua vì socket chưa được khởi tạo.`);
            return;
        }
        this.socket.emit(event, data, callback);
    }

    /**
     * Dọn dẹp sạch toàn bộ event listeners mà client đã đăng ký
     * Tiêu chí nghiệm thu: Cleanup listeners khi rời trang/ván đấu, không rò rỉ bộ nhớ
     */
    cleanupListeners() {
        if (this.socket) {
            for (const [event, handlers] of this.registeredListeners.entries()) {
                for (const handler of handlers) {
                    this.socket.off(event, handler);
                }
            }
        }
        this.registeredListeners.clear();
    }

    /**
     * Ngắt kết nối socket hoàn toàn và dọn dẹp listeners
     */
    disconnect() {
        this.cleanupListeners();
        if (this.socket) {
            try {
                this.socket.disconnect();
            } catch (ignored) {}
            this.socket = null;
        }
        this.isConnecting = false;
    }

    // ========================================================================
    // Các phương thức nghiệp vụ Realtime chuẩn hóa Contract
    // ========================================================================

    /**
     * Tham gia phòng chơi (Room)
     * Contract: client emit join-room { roomCode } -> server emit room-updated / room-error
     * @param {string} roomCode
     * @returns {Promise<any>}
     */
    joinRoom(roomCode) {
        return new Promise((resolve) => {
            const cleanCode = String(roomCode || '').trim().toUpperCase();
            this.emit('join-room', { roomCode: cleanCode }, (response) => {
                resolve(response);
            });
        });
    }

    /**
     * Rời phòng chơi (Leave Room)
     * Contract: client emit leave-room { roomCode } -> server emit room-updated / left-room
     * @param {string} roomCode
     * @returns {Promise<any>}
     */
    leaveRoom(roomCode) {
        return new Promise((resolve) => {
            const cleanCode = String(roomCode || '').trim().toUpperCase();
            this.emit('leave-room', { roomCode: cleanCode }, (response) => {
                resolve(response);
            });
        });
    }

    /**
     * Bắt đầu ván cờ khi phòng đủ 2 người chơi
     * Contract: client emit start-game { roomCode } -> server emit game-started
     * @param {string} roomCode
     * @returns {Promise<any>}
     */
    startGame(roomCode) {
        return new Promise((resolve) => {
            const cleanCode = String(roomCode || '').trim().toUpperCase();
            this.emit('start-game', { roomCode: cleanCode }, (response) => {
                resolve(response);
            });
        });
    }

    /**
     * Gửi nước đi tới server
     * Contract: client emit send-move { gameId, from, to, clientMoveId? }
     *           server broadcast move-accepted / move-rejected (chỉ cho sender)
     * 
     * @param {Object} movePayload
     * @param {number|string} movePayload.gameId
     * @param {{ row: number, col: number }} movePayload.from
     * @param {{ row: number, col: number }} movePayload.to
     * @param {string} [movePayload.clientMoveId]
     * @returns {Promise<any>}
     */
    sendMove({ gameId, from, to, clientMoveId }) {
        return new Promise((resolve) => {
            this.emit('send-move', { gameId, from, to, clientMoveId }, (response) => {
                resolve(response);
            });
        });
    }

    /**
     * Xin đầu hàng ván đấu
     * Contract: client emit resign { gameId } -> server emit game-over
     * @param {number|string} gameId
     * @returns {Promise<any>}
     */
    resign(gameId) {
        return new Promise((resolve) => {
            this.emit('resign', { gameId }, (response) => {
                resolve(response);
            });
        });
    }

    /**
     * Reconnect / Rejoin trong thời gian chờ Grace Period
     * Contract: client emit rejoin-game { gameId } -> server emit game-resync
     * @param {number|string} gameId
     * @returns {Promise<any>}
     */
    rejoinGame(gameId) {
        return new Promise((resolve) => {
            this.emit('rejoin-game', { gameId }, (response) => {
                resolve(response);
            });
        });
    }

    /**
     * Đồng bộ lại trạng thái ván cờ hiện tại
     * Contract: client emit sync-game { roomCode, gameId }
     * @param {string|number} key - roomCode hoặc gameId
     * @returns {Promise<any>}
     */
    syncGame(key) {
        return new Promise((resolve) => {
            this.emit('sync-game', { roomCode: key, gameId: key }, (response) => {
                resolve(response);
            });
        });
    }
}

// Khởi tạo Singleton instance dùng chung toàn ứng dụng
const socketClient = new SocketClient();

// Xuất bản cho trình duyệt (Window)
if (typeof window !== 'undefined') {
    window.SocketClient = SocketClient;
    window.socketClient = socketClient;
}

// Xuất bản cho môi trường Node.js / CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = socketClient;
    module.exports.SocketClient = SocketClient;
    module.exports.socketClient = socketClient;
    module.exports.default = socketClient;
}

// Xuất bản theo chuẩn ES Modules
export { SocketClient, socketClient };
export default socketClient;
