/**
 * Validator cho các nghiệp vụ xác thực (Authentication)
 */
class AuthValidator {
    /**
     * Kiểm tra tính hợp lệ của dữ liệu đăng ký người dùng
     * @param {Object} data - Dữ liệu đăng ký { username, email, password }
     * @returns {{ isValid: boolean, errors: string[] }}
     */
    static validateRegister(data = {}) {
        const errors = [];
        const { username, email, password } = data || {};

        // 1. Kiểm tra username
        if (!username || typeof username !== 'string' || username.trim().length === 0) {
            errors.push('Username là bắt buộc');
        } else {
            const trimmedUsername = username.trim();
            if (trimmedUsername.length < 3) {
                errors.push('Username phải có ít nhất 3 ký tự');
            } else if (trimmedUsername.length > 50) {
                errors.push('Username không được vượt quá 50 ký tự');
            } else if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
                errors.push('Username chỉ được chứa chữ cái, chữ số và dấu gạch dưới');
            }
        }

        // 2. Kiểm tra email
        if (!email || typeof email !== 'string' || email.trim().length === 0) {
            errors.push('Email là bắt buộc');
        } else {
            const trimmedEmail = email.trim();
            // Regex chuẩn cho định dạng email
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(trimmedEmail)) {
                errors.push('Email không đúng định dạng');
            }
        }

        // 3. Kiểm tra password
        if (!password || typeof password !== 'string') {
            errors.push('Mật khẩu là bắt buộc');
        } else if (password.length < 6) {
            errors.push('Mật khẩu phải có ít nhất 6 ký tự');
        } else if (password.length > 128) {
            errors.push('Mật khẩu không được vượt quá 128 ký tự');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = AuthValidator;
module.exports.validateRegister = AuthValidator.validateRegister;
