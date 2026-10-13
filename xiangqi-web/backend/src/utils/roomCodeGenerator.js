const crypto = require('crypto');

/**
 * Tập ký tự mặc định dùng để sinh mã phòng.
 * Gồm chữ in hoa và chữ số, loại bỏ các ký tự dễ gây nhầm lẫn:
 * - '0' (số không) và 'O' (chữ O)
 * - '1' (số một) và 'I' (chữ I)
 */
const DEFAULT_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_CODE_LENGTH = 6;
const DEFAULT_MAX_RETRIES = 10;
const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

/**
 * Sinh chuỗi mã phòng ứng viên gồm các ký tự chữ in hoa và chữ số.
 * Tuyệt đối không dùng timestamp nguyên dạng làm mã.
 * 
 * @param {number} [length=6] - Độ dài chuỗi mã phòng cần sinh
 * @param {string} [charset=DEFAULT_CHARSET] - Tập ký tự cho phép
 * @returns {string} - Chuỗi mã phòng ứng viên (ví dụ: 'ABC892')
 */
function generateCandidateCode(length = DEFAULT_CODE_LENGTH, charset = DEFAULT_CHARSET) {
    const codeLength = (typeof length === 'number' && length > 0) ? Math.floor(length) : DEFAULT_CODE_LENGTH;
    const chars = (typeof charset === 'string' && charset.length > 0) ? charset : DEFAULT_CHARSET;

    // Sử dụng crypto.randomBytes để đảm bảo phân phối ngẫu nhiên an toàn (cryptographically secure)
    const randomBytes = crypto.randomBytes(codeLength);
    let code = '';
    for (let i = 0; i < codeLength; i++) {
        code += chars[randomBytes[i] % chars.length];
    }
    return code;
}

/**
 * Kiểm tra định dạng mã phòng có hợp lệ hay không (chuỗi 6 ký tự gồm chữ in hoa và chữ số)
 * 
 * @param {string} code - Mã phòng cần kiểm tra
 * @returns {boolean}
 */
function isValidRoomCode(code) {
    if (!code || typeof code !== 'string') {
        return false;
    }
    return ROOM_CODE_REGEX.test(code.trim().toUpperCase());
}

/**
 * Sinh mã phòng duy nhất bằng cách kiểm tra repository và retry số lần hữu hạn nếu trùng.
 * Không bao giờ trả về mã của phòng đang active.
 * 
 * Contract:
 *   generateUniqueRoomCode(roomRepository) -> Promise<string>
 * 
 * @param {Object} roomRepository - Repository phòng chơi (bắt buộc có method findByCode)
 * @param {Object|number} [options={}] - Cấu hình số lần retry hoặc object options
 * @param {number} [options.maxRetries=10] - Số lần thử tối đa
 * @param {number} [options.length=6] - Độ dài mã phòng
 * @param {string} [options.charset=DEFAULT_CHARSET] - Tập ký tự cho phép
 * @param {Function} [options.candidateGenerator=null] - Generator tùy biến (phục vụ testing collision)
 * @returns {Promise<string>} - Mã phòng duy nhất chưa bị chiếm dụng
 * @throws {Error} - Khi đã thử hết số lần retry mà vẫn bị trùng, hoặc roomRepository không hợp lệ
 */
async function generateUniqueRoomCode(roomRepository, options = {}) {
    if (!roomRepository || typeof roomRepository.findByCode !== 'function') {
        throw new Error('roomRepository không hợp lệ: bắt buộc phải có phương thức findByCode');
    }

    let maxRetries = DEFAULT_MAX_RETRIES;
    let length = DEFAULT_CODE_LENGTH;
    let charset = DEFAULT_CHARSET;
    let customGenerator = null;

    if (typeof options === 'number') {
        maxRetries = options > 0 ? options : DEFAULT_MAX_RETRIES;
    } else if (typeof options === 'object' && options !== null) {
        if (typeof options.maxRetries === 'number' && options.maxRetries > 0) {
            maxRetries = options.maxRetries;
        }
        if (typeof options.length === 'number' && options.length > 0) {
            length = options.length;
        }
        if (typeof options.charset === 'string' && options.charset.length > 0) {
            charset = options.charset;
        }
        if (typeof options.candidateGenerator === 'function') {
            customGenerator = options.candidateGenerator;
        }
    }

    let attempts = 0;

    while (attempts < maxRetries) {
        attempts++;
        const candidate = customGenerator
            ? customGenerator(attempts)
            : generateCandidateCode(length, charset);

        // Kiểm tra mã với repository
        const existingRoom = await roomRepository.findByCode(candidate);

        // Một mã được xem là đang active / bị chiếm dụng nếu:
        // 1. Phòng tồn tại VÀ
        // 2. Trạng thái phòng không phải CLOSED (tức là WAITING, PLAYING, FINISHED hoặc active)
        const isOccupied = Boolean(existingRoom && (
            typeof existingRoom.isClosed === 'function'
                ? !existingRoom.isClosed()
                : (existingRoom.status ? existingRoom.status.toString().toUpperCase() !== 'CLOSED' : true)
        ));

        if (!isOccupied) {
            return candidate;
        }
    }

    throw new Error(`Không thể sinh mã phòng duy nhất sau ${maxRetries} lần thử do trùng lặp. Vui lòng thử lại sau.`);
}

module.exports = {
    generateCandidateCode,
    generateUniqueRoomCode,
    isValidRoomCode,
    DEFAULT_CHARSET,
    DEFAULT_CODE_LENGTH,
    DEFAULT_MAX_RETRIES,
    ROOM_CODE_REGEX
};
module.exports.default = module.exports;
