let jwt;
try {
    jwt = require('jsonwebtoken');
} catch (err) {
    // Fallback chuẩn RFC 7519 HMAC SHA-256 JWT nếu chưa cài đặt jsonwebtoken
    const crypto = require('crypto');

    const base64UrlDecode = (str) => {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
            base64 += '=';
        }
        return Buffer.from(base64, 'base64').toString('utf8');
    };

    jwt = {
        verify: (token, secret) => {
            if (!token || typeof token !== 'string') {
                const error = new Error('jwt must be provided');
                error.name = 'JsonWebTokenError';
                throw error;
            }
            const parts = token.split('.');
            if (parts.length !== 3) {
                const error = new Error('jwt malformed');
                error.name = 'JsonWebTokenError';
                throw error;
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
                const error = new Error('invalid signature');
                error.name = 'JsonWebTokenError';
                throw error;
            }

            const payload = JSON.parse(base64UrlDecode(encodedPayload));
            const nowInSeconds = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < nowInSeconds) {
                const error = new Error('jwt expired');
                error.name = 'TokenExpiredError';
                throw error;
            }
            return payload;
        }
    };
}

/**
 * Middleware xác thực token JWT từ header Authorization
 * Contract: authenticateToken(req, res, next) -> req.user = { userId, username }
 * 
 * Quy tắc:
 * 1. Đọc header Authorization: Bearer <token>
 * 2. Trả 401 khi thiếu hoặc malformed token
 * 3. Trả 401 khi token invalid hoặc expired
 * 4. Không parse user từ body để quyết định danh tính
 * 5. Gắn req.user = { userId, username } để tái sử dụng cho các module (user, room, game, history)
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    // 1. Kiểm tra thiếu Authorization header
    if (!authHeader || typeof authHeader !== 'string') {
        return res.status(401).json({
            success: false,
            message: 'Thiếu token xác thực'
        });
    }

    // 2. Kiểm tra định dạng Bearer <token>
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
        return res.status(401).json({
            success: false,
            message: 'Định dạng token không hợp lệ (yêu cầu: Bearer <token>)'
        });
    }

    const token = parts[1];
    const jwtSecret = process.env.JWT_SECRET || 'default_xiangqi_dev_secret_key_not_for_prod';

    try {
        // 3. Xác thực tính hợp lệ và thời hạn của token
        const decoded = jwt.verify(token, jwtSecret);

        if (!decoded || (!decoded.userId && !decoded.id)) {
            return res.status(401).json({
                success: false,
                message: 'Token không chứa thông tin danh tính hợp lệ'
            });
        }

        // 4. Tuyệt đối không tin userId từ body/query. Chỉ gắn danh tính từ token đã verify
        req.user = {
            userId: decoded.userId ?? decoded.id,
            username: decoded.username
        };

        return next();
    } catch (err) {
        // 5. Trả 401 khi token expired hoặc invalid
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token đã hết hạn'
            });
        }

        return res.status(401).json({
            success: false,
            message: 'Token không hợp lệ hoặc không xác thực được'
        });
    }
}

module.exports = authenticateToken;
module.exports.authenticateToken = authenticateToken;
