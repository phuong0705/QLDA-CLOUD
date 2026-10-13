let bcrypt;
try {
    bcrypt = require('bcrypt');
} catch (err) {
    try {
        bcrypt = require('bcryptjs');
    } catch (err2) {
        // Fallback stub dùng crypto nếu môi trường chưa cài đặt bcrypt/bcryptjs
        const crypto = require('crypto');
        bcrypt = {
            hash: async (password, saltRounds = 10) => {
                const salt = crypto.randomBytes(16).toString('hex');
                const hash = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
                return `$mock$${salt}$${hash}`;
            },
            compare: async (password, storedHash) => {
                if (!storedHash || !password) return false;
                if (storedHash.startsWith('$mock$')) {
                    const parts = storedHash.split('$');
                    const salt = parts[2];
                    const originalHash = parts[3];
                    const testHash = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
                    return testHash === originalHash;
                }
                return false;
            }
        };
    }
}

let jwt;
try {
    jwt = require('jsonwebtoken');
} catch (err) {
    // Fallback chuẩn RFC 7519 HMAC SHA-256 JWT nếu thư viện jsonwebtoken chưa được npm install
    const crypto = require('crypto');

    const base64UrlEncode = (str) => {
        return Buffer.from(str)
            .toString('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    };

    const base64UrlDecode = (str) => {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
            base64 += '=';
        }
        return Buffer.from(base64, 'base64').toString('utf8');
    };

    jwt = {
        sign: (payload, secret, options = {}) => {
            const header = { alg: 'HS256', typ: 'JWT' };
            const nowInSeconds = Math.floor(Date.now() / 1000);

            let expSeconds = 86400; // Mặc định 24h
            const expiresIn = options.expiresIn || '24h';
            if (typeof expiresIn === 'number') {
                expSeconds = expiresIn;
            } else if (typeof expiresIn === 'string') {
                const match = expiresIn.match(/^(\d+)([smhd])$/);
                if (match) {
                    const val = parseInt(match[1], 10);
                    const unit = match[2];
                    if (unit === 's') expSeconds = val;
                    else if (unit === 'm') expSeconds = val * 60;
                    else if (unit === 'h') expSeconds = val * 3600;
                    else if (unit === 'd') expSeconds = val * 86400;
                }
            }

            const fullPayload = {
                ...payload,
                iat: nowInSeconds,
                exp: nowInSeconds + expSeconds
            };

            const encodedHeader = base64UrlEncode(JSON.stringify(header));
            const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
            const dataToSign = `${encodedHeader}.${encodedPayload}`;

            const signature = crypto
                .createHmac('sha256', secret)
                .update(dataToSign)
                .digest('base64')
                .replace(/=/g, '')
                .replace(/\+/g, '-')
                .replace(/\//g, '_');

            return `${dataToSign}.${signature}`;
        },
        verify: (token, secret) => {
            if (!token || typeof token !== 'string') {
                const err = new Error('jwt must be provided');
                err.name = 'JsonWebTokenError';
                throw err;
            }
            const parts = token.split('.');
            if (parts.length !== 3) {
                const err = new Error('jwt malformed');
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
                const err = new Error('invalid signature');
                err.name = 'JsonWebTokenError';
                throw err;
            }

            const payload = JSON.parse(base64UrlDecode(encodedPayload));
            const nowInSeconds = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < nowInSeconds) {
                const err = new Error('jwt expired');
                err.name = 'TokenExpiredError';
                throw err;
            }
            return payload;
        }
    };
}

const userRepository = require('../repositories/userRepository');
const AuthValidator = require('../validators/authValidator');

/**
 * Service xử lý nghiệp vụ xác thực người dùng (Đăng ký, Đăng nhập, Token)
 */
class AuthService {
    /**
     * @param {Object} [userRepo=userRepository] - Repository người dùng
     * @param {Object} [hasher=bcrypt] - Module mã hóa mật khẩu
     * @param {Object} [jwtModule=jwt] - Module xử lý JWT token
     */
    constructor(userRepo = userRepository, hasher = bcrypt, jwtModule = jwt) {
        this.userRepository = userRepo;
        this.bcrypt = hasher;
        this.jwt = jwtModule;
    }

    /**
     * Đăng ký người dùng mới
     * @param {Object} data - { username, email, password }
     * @returns {Promise<{ id: number, username: string, email: string, elo: number }>}
     */
    async register({ username, email, password }) {
        // 1. Validate dữ liệu đầu vào
        const validation = AuthValidator.validateRegister({ username, email, password });
        if (!validation.isValid) {
            const error = new Error(validation.errors[0] || 'Dữ liệu đăng ký không hợp lệ');
            error.statusCode = 400;
            error.errors = validation.errors;
            throw error;
        }

        // 2. Normalize dữ liệu
        const normalizedUsername = username.trim();
        const normalizedEmail = email.trim().toLowerCase();

        // 3. Kiểm tra trùng lặp username hoặc email (409 Conflict)
        const existingByUsername = await this.userRepository.findByUsernameOrEmail(normalizedUsername, { includePassword: false });
        if (existingByUsername && existingByUsername.username.toLowerCase() === normalizedUsername.toLowerCase()) {
            const error = new Error('Username đã tồn tại');
            error.statusCode = 409;
            throw error;
        }

        const existingByEmail = await this.userRepository.findByUsernameOrEmail(normalizedEmail, { includePassword: false });
        if (existingByEmail && existingByEmail.email.toLowerCase() === normalizedEmail.toLowerCase()) {
            const error = new Error('Email đã được sử dụng');
            error.statusCode = 409;
            throw error;
        }

        // 4. Hash password bằng bcrypt
        const saltRounds = 10;
        const passwordHash = await this.bcrypt.hash(password, saltRounds);

        // 5. Lưu người dùng vào cơ sở dữ liệu qua repository
        let createdUser;
        try {
            createdUser = await this.userRepository.createUser({
                username: normalizedUsername,
                email: normalizedEmail,
                passwordHash,
                eloRating: 1000,
                wins: 0,
                losses: 0,
                draws: 0
            });
        } catch (dbError) {
            if (dbError.number === 2627 || dbError.number === 2601) {
                const isEmail = dbError.message && dbError.message.includes('Email');
                const error = new Error(isEmail ? 'Email đã được sử dụng' : 'Username đã tồn tại');
                error.statusCode = 409;
                throw error;
            }
            throw dbError;
        }

        // 6. Định dạng kết quả trả về theo contract bắt buộc, không bao gồm password / hash
        return {
            id: createdUser.id ?? createdUser.userId,
            username: createdUser.username,
            email: createdUser.email,
            elo: createdUser.eloRating ?? createdUser.elo ?? 1000
        };
    }

    /**
     * Đăng nhập người dùng bằng username/email và mật khẩu
     * @param {Object} data - { login, password } (login có thể là username hoặc email)
     * @returns {Promise<{ token: string, user: { id: number, username: string, elo: number } }>}
     */
    async login({ login, password, username, email }) {
        const identifier = (login ?? username ?? email ?? '').toString().trim();

        // 1. Validate dữ liệu đầu vào cơ bản
        if (!identifier || !password || typeof password !== 'string') {
            const error = new Error('Vui lòng cung cấp tài khoản và mật khẩu');
            error.statusCode = 400;
            throw error;
        }

        // 2. Tìm người dùng theo username hoặc email (lấy kèm passwordHash để so khớp)
        const user = await this.userRepository.findByUsernameOrEmail(identifier, { includePassword: true });

        // 3. So khớp mật khẩu với bcrypt
        // Không tiết lộ user có tồn tại hay không (tránh username/email enumeration attack)
        if (!user || !user.passwordHash) {
            const error = new Error('Thông tin đăng nhập hoặc mật khẩu không chính xác');
            error.statusCode = 401;
            throw error;
        }

        const isMatch = await this.bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            const error = new Error('Thông tin đăng nhập hoặc mật khẩu không chính xác');
            error.statusCode = 401;
            throw error;
        }

        // 4. Tạo JWT token chứa userId và username với thời hạn cấu hình qua biến môi trường
        const payload = {
            userId: user.id ?? user.userId,
            username: user.username
        };

        const jwtSecret = process.env.JWT_SECRET || 'default_xiangqi_dev_secret_key_not_for_prod';
        const expiresIn = process.env.JWT_EXPIRES_IN || '24h';

        const token = this.jwt.sign(payload, jwtSecret, { expiresIn });

        // 5. Trả về token và public user (loại bỏ PasswordHash)
        return {
            token,
            user: {
                id: user.id ?? user.userId,
                username: user.username,
                elo: user.eloRating ?? user.elo ?? 1000
            }
        };
    }

    /**
     * Xác thực và giải mã JWT token (kiểm tra signature và expiration)
     * @param {string} token
     * @returns {Object} decoded payload
     */
    verifyToken(token) {
        const jwtSecret = process.env.JWT_SECRET || 'default_xiangqi_dev_secret_key_not_for_prod';
        return this.jwt.verify(token, jwtSecret);
    }
}

// Khởi tạo instance mặc định
const defaultInstance = new AuthService();

module.exports = defaultInstance;
module.exports.AuthService = AuthService;
module.exports.register = defaultInstance.register.bind(defaultInstance);
module.exports.login = defaultInstance.login.bind(defaultInstance);
module.exports.verifyToken = defaultInstance.verifyToken.bind(defaultInstance);
