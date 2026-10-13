/**
 * ============================================================================
 * socketManager.js - Quản lý sự kiện và Handlers của Socket.IO
 * ============================================================================
 * 
 * Nhiệm vụ:
 * 1. Cung cấp Socket Auth Middleware xác thực JWT từ handshake.auth.token.
 * 2. Gắn thông tin socket.user = { userId, username } sau khi xác thực thành công.
 * 3. Chặn các kết nối không hợp lệ / hết hạn bằng connection_error.
 * 4. Đăng ký các module sự kiện: roomSocket, gameSocket, inviteSocket.
 * 5. Log connection / disconnection ở mức dev, bảo mật tuyệt đối không log token.
 * 6. Export io và inject io vào các handlers theo pattern rõ ràng.
 * 
 * Contract:
 * - io connection => socket.user authenticated { userId, username }
 * - Browser connect bằng token hợp lệ => Cho phép kết nối.
 * - Token sai / thiếu / hết hạn => connection_error (connect_error).
 */

const EventEmitter = require('events');

// Tải authService để tái sử dụng logic xác thực token nhất quán
let authService;
try {
    authService = require('../services/authService');
} catch (err) {
    // authService sẽ dùng fallback bên dưới nếu không require được
    authService = null;
}

// Fallback logic giải mã và kiểm tra JWT theo chuẩn RFC 7519 HMAC SHA-256
function verifyFallbackJwt(token) {
    const crypto = require('crypto');
    const secret = process.env.JWT_SECRET || 'default_xiangqi_dev_secret_key_not_for_prod';

    if (!token || typeof token !== 'string') {
        const err = new Error('Token phải là chuỗi ký tự hợp lệ');
        err.name = 'JsonWebTokenError';
        throw err;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
        const err = new Error('Cấu trúc token không đúng định dạng JWT');
        err.name = 'JsonWebTokenError';
        throw err;
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(dataToSign)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    if (signature !== expectedSignature) {
        const err = new Error('Chữ ký token không hợp lệ');
        err.name = 'JsonWebTokenError';
        throw err;
    }

    let base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowInSeconds) {
        const err = new Error('Token đã hết hạn');
        err.name = 'TokenExpiredError';
        throw err;
    }

    return payload;
}

/**
 * Socket Auth Middleware
 * Đọc JWT từ socket.handshake.auth.token hoặc header Authorization
 * Xác thực và gắn socket.user = { userId, username }
 */
function socketAuthMiddleware(socket, next) {
    try {
        // Đọc token từ handshake.auth.token (chuẩn Socket.IO v4 client) hoặc Authorization header
        const token = socket.handshake?.auth?.token 
            || (socket.handshake?.headers?.authorization 
                ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '').trim() 
                : null);

        // 1. Kiểm tra thiếu token
        if (!token || typeof token !== 'string' || !token.trim()) {
            const err = new Error('Authentication error: Thiếu token xác thực');
            err.data = { code: 'UNAUTHORIZED', message: 'Thiếu token xác thực' };
            return next(err);
        }

        const cleanToken = token.trim();
        let decoded;

        // 2. Xác thực bằng cùng logic với hệ thống Auth (sử dụng authService.verifyToken)
        if (authService && typeof authService.verifyToken === 'function') {
            decoded = authService.verifyToken(cleanToken);
        } else {
            decoded = verifyFallbackJwt(cleanToken);
        }

        // 3. Kiểm tra payload chứa userId hợp lệ
        if (!decoded || (!decoded.userId && !decoded.id)) {
            const err = new Error('Authentication error: Token không chứa thông tin danh tính hợp lệ');
            err.data = { code: 'UNAUTHORIZED', message: 'Token không chứa thông tin danh tính hợp lệ' };
            return next(err);
        }

        // 4. Gắn socket.user = { userId, username } (Contract bắt buộc)
        socket.user = {
            userId: decoded.userId ?? decoded.id,
            username: decoded.username || null
        };

        return next();
    } catch (err) {
        // Bắt lỗi hết hạn hoặc sai chữ ký, kích hoạt connection_error ở client
        let errorMessage = 'Authentication error: Xác thực thất bại';
        if (err.name === 'TokenExpiredError' || (err.message && err.message.toLowerCase().includes('expired'))) {
            errorMessage = 'Authentication error: Token đã hết hạn';
        } else if (err.message) {
            errorMessage = `Authentication error: ${err.message}`;
        }

        const error = new Error(errorMessage);
        error.data = { code: 'UNAUTHORIZED', message: errorMessage };
        return next(error);
    }
}

// Handlers của từng module realtime
let roomSocket;
let gameSocket;
let inviteSocket;

try {
    roomSocket = require('./roomSocket');
} catch (e) {
    roomSocket = null;
}

try {
    gameSocket = require('./gameSocket');
} catch (e) {
    gameSocket = null;
}

try {
    inviteSocket = require('./inviteSocket');
} catch (e) {
    inviteSocket = null;
}

/**
 * Đăng ký roomSocket, gameSocket, inviteSocket
 * Pattern rõ: inject (io, socket) vào từng handler
 * @param {Object} io - Instance Socket.IO server
 * @param {Object} socket - Socket instance của client đã authenticated
 */
function registerHandlers(io, socket) {
    // 1. Đăng ký roomSocket (Sự kiện phòng chơi)
    try {
        if (typeof roomSocket === 'function') {
            roomSocket(io, socket);
        } else if (roomSocket && typeof roomSocket.register === 'function') {
            roomSocket.register(io, socket);
        }
    } catch (err) {
        console.error('[Socket] Lỗi khi đăng ký roomSocket:', err.message);
    }

    // 2. Đăng ký gameSocket (Sự kiện ván đấu)
    try {
        if (typeof gameSocket === 'function') {
            gameSocket(io, socket);
        } else if (gameSocket && typeof gameSocket.register === 'function') {
            gameSocket.register(io, socket);
        }
    } catch (err) {
        console.error('[Socket] Lỗi khi đăng ký gameSocket:', err.message);
    }

    // 3. Đăng ký inviteSocket (Sự kiện lời mời)
    try {
        if (typeof inviteSocket === 'function') {
            inviteSocket(io, socket);
        } else if (inviteSocket && typeof inviteSocket.register === 'function') {
            inviteSocket.register(io, socket);
        }
    } catch (err) {
        console.error('[Socket] Lỗi khi đăng ký inviteSocket:', err.message);
    }
}

let activeIO = null;

/**
 * Khởi tạo socketManager gắn middleware và lắng nghe connection
 * @param {Object} io - Instance Socket.IO server
 * @returns {Object} io instance
 */
function initSocketManager(io) {
    if (!io) {
        throw new Error('Cần cung cấp instance io cho socketManager');
    }

    activeIO = io;

    // 1. Thêm socket auth middleware
    io.use(socketAuthMiddleware);

    // 2. Đăng ký lắng nghe sự kiện connection
    io.on('connection', (socket) => {
        // Log connection ở mức dev nhưng tuyệt đối KHÔNG log token
        if (process.env.NODE_ENV !== 'production') {
            console.log(
                `[Socket:dev] Kết nối thành công: socketId=${socket.id}, ` +
                `userId=${socket.user?.userId}, username=${socket.user?.username || 'N/A'}`
            );
        }

        // Đăng ký các module socket: roomSocket, gameSocket, inviteSocket
        registerHandlers(io, socket);

        // Log disconnection ở mức dev
        socket.on('disconnect', (reason) => {
            if (process.env.NODE_ENV !== 'production') {
                console.log(
                    `[Socket:dev] Ngắt kết nối: socketId=${socket.id}, ` +
                    `userId=${socket.user?.userId}, username=${socket.user?.username || 'N/A'}, ` +
                    `lý do=${reason}`
                );
            }
        });
    });

    return io;
}

/**
 * Lấy io instance hiện tại
 */
function getIO() {
    return activeIO;
}

module.exports = initSocketManager;
module.exports.initSocketManager = initSocketManager;
module.exports.socketAuthMiddleware = socketAuthMiddleware;
module.exports.registerHandlers = registerHandlers;
module.exports.getIO = getIO;

// Getter cho io để đảm bảo luôn lấy instance mới nhất
Object.defineProperty(module.exports, 'io', {
    get: () => activeIO,
    enumerable: true,
    configurable: true
});
