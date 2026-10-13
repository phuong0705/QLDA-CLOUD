/**
 * Unit Test cho Room Code Generator
 * File: backend/tests/room/roomCodeGenerator.test.js
 * 
 * Tiêu chí nghiệm thu (Definition of Done):
 * - Test regex và format của candidate code (chuỗi 6 ký tự A-Z, 0-9).
 * - Test không dùng timestamp nguyên dạng.
 * - Test loại trừ các ký tự dễ nhầm lẫn (0, O, 1, I).
 * - Test collision retry với mock repository.
 * - Test không trả về mã của room đang active.
 * - Test ném lỗi rõ ràng khi vượt quá số lần retry cho phép.
 */

const assert = require('assert');
const {
    generateCandidateCode,
    generateUniqueRoomCode,
    isValidRoomCode,
    DEFAULT_CHARSET,
    ROOM_CODE_REGEX
} = require('../../src/utils/roomCodeGenerator');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✓ [PASS] ${name}`);
    } catch (error) {
        console.error(`  ✗ [FAIL] ${name}`);
        console.error(`    -> Lỗi: ${error.message}`);
        throw error;
    }
}

async function runAsyncTest(name, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✓ [PASS] ${name}`);
    } catch (error) {
        console.error(`  ✗ [FAIL] ${name}`);
        console.error(`    -> Lỗi: ${error.message}`);
        throw error;
    }
}

async function main() {
    console.log('\n======================================================');
    console.log('KIỂM THỬ: ROOM CODE GENERATOR (FORMAT, REGEX & RETRY)');
    console.log('======================================================\n');

    // ----------------------------------------------------------------------------
    // Nhóm 1: Kiểm thử Định dạng, Regex và Bộ ký tự của Candidate Code
    // ----------------------------------------------------------------------------
    console.log('1. Kiểm thử Format, Regex và Tập ký tự:');

    runTest('generateCandidateCode: sinh chuỗi đúng 6 ký tự mặc định', () => {
        const code = generateCandidateCode();
        assert.strictEqual(typeof code, 'string', 'Mã phòng phải là kiểu string');
        assert.strictEqual(code.length, 6, 'Mã phòng mặc định phải có độ dài đúng 6 ký tự');
    });

    runTest('generateCandidateCode: chuỗi khớp Regex /^[A-Z0-9]{6}$/ (dạng ABC123)', () => {
        const code = generateCandidateCode();
        assert.match(code, ROOM_CODE_REGEX, `Mã "${code}" phải khớp regex /^[A-Z0-9]{6}$/`);
        assert.strictEqual(isValidRoomCode(code), true, 'isValidRoomCode phải trả về true');
    });

    runTest('generateCandidateCode: loại trừ các ký tự dễ gây nhầm lẫn (0, O, 1, I)', () => {
        for (let i = 0; i < 50; i++) {
            const code = generateCandidateCode();
            assert.doesNotMatch(code, /[0O1I]/, `Mã "${code}" không được chứa các ký tự dễ nhầm: 0, O, 1, I`);
        }
    });

    runTest('generateCandidateCode: không dùng timestamp nguyên dạng làm mã phòng', () => {
        const code = generateCandidateCode();
        const timestampStr = Date.now().toString();
        assert.notStrictEqual(code, timestampStr, 'Mã phòng không được là timestamp nguyên dạng');
        assert.strictEqual(code.length, 6, 'Độ dài mã phòng phải là 6, khác độ dài thông thường của timestamp (13 ký tự)');
    });

    runTest('generateCandidateCode: hỗ trợ tùy chỉnh độ dài length', () => {
        const code8 = generateCandidateCode(8);
        assert.strictEqual(code8.length, 8);
        assert.match(code8, /^[A-Z0-9]{8}$/);
    });

    runTest('generateCandidateCode: tính ngẫu nhiên và phân phối (100 mã không bị trùng lặp liên tiếp)', () => {
        const set = new Set();
        for (let i = 0; i < 100; i++) {
            set.add(generateCandidateCode());
        }
        // Với 32^6 = hơn 1 tỷ tổ hợp, 100 mã ngẫu nhiên phải gần như 100% duy nhất
        assert(set.size >= 98, 'Độ phân tán ngẫu nhiên phải cao, không bị lặp mã liên tục');
    });

    runTest('isValidRoomCode: kiểm tra các trường hợp hợp lệ và không hợp lệ', () => {
        assert.strictEqual(isValidRoomCode('ABC123'), true);
        assert.strictEqual(isValidRoomCode('X9B7KM'), true);
        assert.strictEqual(isValidRoomCode('abc123'), true, 'Chấp nhận chữ thường khi kiểm tra');
        assert.strictEqual(isValidRoomCode('ABC12'), false, 'Không đủ 6 ký tự');
        assert.strictEqual(isValidRoomCode('ABC1234'), false, 'Quá 6 ký tự');
        assert.strictEqual(isValidRoomCode('AB@123'), false, 'Chứa ký tự đặc biệt');
        assert.strictEqual(isValidRoomCode(''), false, 'Chuỗi rỗng');
        assert.strictEqual(isValidRoomCode(null), false, 'Giá trị null');
        assert.strictEqual(isValidRoomCode(undefined), false, 'Giá trị undefined');
    });

    // ----------------------------------------------------------------------------
    // Nhóm 2: Kiểm thử Uniqueness & Collision Retry với Mock Repository
    // ----------------------------------------------------------------------------
    console.log('\n2. Kiểm thử Uniqueness, Active Check và Collision Retry:');

    await runAsyncTest('generateUniqueRoomCode: thành công ngay lần đầu khi không có trùng lặp', async () => {
        let callCount = 0;
        const mockRepo = {
            async findByCode(code) {
                callCount++;
                return null; // Không có phòng nào trùng
            }
        };

        const code = await generateUniqueRoomCode(mockRepo);
        assert.strictEqual(typeof code, 'string');
        assert.strictEqual(code.length, 6);
        assert.match(code, ROOM_CODE_REGEX);
        assert.strictEqual(callCount, 1, 'Chỉ cần gọi repository đúng 1 lần khi không bị trùng');
    });

    await runAsyncTest('generateUniqueRoomCode: tự động retry khi gặp collision (trùng lặp) và trả về mã hợp lệ', async () => {
        const generatedCandidates = ['COLID1', 'COLID2', 'AVAIL3'];
        let candidateIndex = 0;
        const checkedCodes = [];

        const mockRepo = {
            async findByCode(code) {
                checkedCodes.push(code);
                // 2 mã đầu tiên bị trùng với phòng đang active
                if (code === 'COLID1' || code === 'COLID2') {
                    return { roomCode: code, status: 'WAITING' };
                }
                return null; // Mã thứ 3 khả dụng
            }
        };

        const code = await generateUniqueRoomCode(mockRepo, {
            candidateGenerator: () => generatedCandidates[candidateIndex++]
        });

        assert.strictEqual(code, 'AVAIL3', 'Phải trả về mã khả dụng thứ 3');
        assert.deepStrictEqual(checkedCodes, ['COLID1', 'COLID2', 'AVAIL3'], 'Phải kiểm tra lần lượt 3 mã');
    });

    await runAsyncTest('generateUniqueRoomCode: không return code của phòng đang active (WAITING/PLAYING)', async () => {
        const activeRooms = {
            'ACT001': { roomCode: 'ACT001', status: 'WAITING' },
            'ACT002': { roomCode: 'ACT002', status: 'PLAYING' }
        };

        const candidates = ['ACT001', 'ACT002', 'FREE99'];
        let idx = 0;

        const mockRepo = {
            async findByCode(code) {
                return activeRooms[code] || null;
            }
        };

        const code = await generateUniqueRoomCode(mockRepo, {
            candidateGenerator: () => candidates[idx++]
        });

        assert.strictEqual(code, 'FREE99', 'Mã trả về không được trùng với bất kỳ phòng active nào');
        assert.notStrictEqual(code, 'ACT001');
        assert.notStrictEqual(code, 'ACT002');
    });

    await runAsyncTest('generateUniqueRoomCode: tái sử dụng được mã nếu phòng cũ đã CLOSED', async () => {
        const candidates = ['OLD001'];
        let idx = 0;

        const mockRepo = {
            async findByCode(code) {
                // Phòng cũ đã CLOSED không còn active
                return { roomCode: code, status: 'CLOSED', isClosed: () => true };
            }
        };

        const code = await generateUniqueRoomCode(mockRepo, {
            candidateGenerator: () => candidates[idx++]
        });

        assert.strictEqual(code, 'OLD001', 'Mã của phòng đã CLOSED được phép cấp lại');
    });

    await runAsyncTest('generateUniqueRoomCode: ném lỗi rõ ràng khi vượt quá số lần maxRetries', async () => {
        let callCount = 0;
        const mockRepo = {
            async findByCode(code) {
                callCount++;
                // Luôn luôn trùng phòng active
                return { roomCode: code, status: 'WAITING' };
            }
        };

        const maxRetries = 5;
        let errorCaught = null;

        try {
            await generateUniqueRoomCode(mockRepo, { maxRetries });
        } catch (err) {
            errorCaught = err;
        }

        assert(errorCaught !== null, 'Bắt buộc phải throw error khi hết retry');
        assert.strictEqual(callCount, 5, 'Phải retry đúng 5 lần trước khi dừng');
        assert(
            errorCaught.message.includes('5 lần thử'),
            `Thông báo lỗi phải đề cập đến số lần thử (Nhận được: "${errorCaught.message}")`
        );
    });

    await runAsyncTest('generateUniqueRoomCode: ném lỗi khi roomRepository không hợp lệ', async () => {
        let err1 = null;
        let err2 = null;

        try {
            await generateUniqueRoomCode(null);
        } catch (e) {
            err1 = e;
        }
        assert(err1 !== null, 'Phải ném lỗi khi repository là null');

        try {
            await generateUniqueRoomCode({});
        } catch (e) {
            err2 = e;
        }
        assert(err2 !== null, 'Phải ném lỗi khi repository thiếu phương thức findByCode');
    });

    console.log('\n======================================================');
    console.log(`TỔNG KẾT: ${passedTests}/${totalTests} TESTS ĐẠT YÊU CẦU!`);
    console.log('======================================================\n');
}

main().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
