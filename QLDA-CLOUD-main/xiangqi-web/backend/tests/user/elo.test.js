/**
 * Unit Test cho Elo Calculator và UserService.applyGameResult
 * File: backend/tests/user/elo.test.js
 * 
 * Tiêu chí nghiệm thu (Definition of Done):
 * - Test rating ngang nhau cho win / draw / loss
 * - Test expected direction: winner tăng, loser giảm, draw hợp lý
 * - Test deterministic tính toán
 * - Test idempotency khi finalize lặp cùng GameID
 */

const assert = require('assert');
const { calculateNewRatings, calculateExpectedScore, normalizeScore } = require('../../src/utils/eloCalculator');
const { UserService } = require('../../src/services/userService');

// Bộ test runner đơn giản và độc lập, tương thích cả Jest, Mocha lẫn Node trực tiếp
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

console.log('\n========================================');
console.log('KIỂM THỬ: ELO CALCULATOR & GAME RESULT');
console.log('========================================\n');

// ----------------------------------------------------------------------------
// Nhóm 1: Kiểm thử rating ngang nhau (1000 vs 1000, K=32)
// ----------------------------------------------------------------------------
console.log('1. Kiểm thử Rating ngang nhau (1000 vs 1000, K=32):');

runTest('Rating ngang nhau - A thắng (scoreA = 1): Winner tăng 16, Loser giảm 16', () => {
    const result = calculateNewRatings(1000, 1000, 1, 32);
    assert.strictEqual(result.newA, 1016, 'Elo người A mới phải là 1016');
    assert.strictEqual(result.newB, 984, 'Elo người B mới phải là 984');
    assert.strictEqual(result.changeA, 16, 'Người A phải được cộng 16 điểm');
    assert.strictEqual(result.changeB, -16, 'Người B phải bị trừ 16 điểm');
});

runTest('Rating ngang nhau - Hòa (scoreA = 0.5): Điểm Elo của hai người không đổi', () => {
    const result = calculateNewRatings(1000, 1000, 0.5, 32);
    assert.strictEqual(result.newA, 1000, 'Elo người A phải giữ nguyên 1000');
    assert.strictEqual(result.newB, 1000, 'Elo người B phải giữ nguyên 1000');
    assert.strictEqual(result.changeA, 0, 'Điểm cộng của A phải là 0');
    assert.strictEqual(result.changeB, 0, 'Điểm trừ của B phải là 0');
});

runTest('Rating ngang nhau - A thua (scoreA = 0): A giảm 16, B tăng 16', () => {
    const result = calculateNewRatings(1000, 1000, 0, 32);
    assert.strictEqual(result.newA, 984, 'Elo người A mới phải là 984');
    assert.strictEqual(result.newB, 1016, 'Elo người B mới phải là 1016');
    assert.strictEqual(result.changeA, -16, 'Người A phải bị trừ 16 điểm');
    assert.strictEqual(result.changeB, 16, 'Người B phải được cộng 16 điểm');
});

// ----------------------------------------------------------------------------
// Nhóm 2: Kiểm thử Expected Direction (Winner tăng, Loser giảm, Draw hợp lý)
// ----------------------------------------------------------------------------
console.log('\n2. Kiểm thử Expected Direction (Chênh lệch trình độ):');

runTest('Expected Direction - Kèo trên thắng (1400 vs 1000, scoreA = 1): Winner tăng điểm, Loser giảm điểm', () => {
    const result = calculateNewRatings(1400, 1000, 1, 32);
    assert.ok(result.newA > 1400, 'Winner phải tăng điểm');
    assert.ok(result.newB < 1000, 'Loser phải giảm điểm');
    // Thắng đối thủ yếu hơn nhiều thì điểm thưởng ít hơn khi ngang trình (changeA < 16)
    assert.ok(result.changeA < 16, 'Thắng đối thủ dưới cơ chỉ được cộng ít hơn 16 điểm');
    assert.strictEqual(result.changeA + result.changeB, 0, 'Tổng điểm thay đổi phải cân bằng (zero-sum)');
});

runTest('Expected Direction - Kèo dưới lật kèo (1000 vs 1400, scoreA = 1): Winner nhận điểm thưởng lớn', () => {
    const result = calculateNewRatings(1000, 1400, 1, 32);
    assert.ok(result.newA > 1000, 'Winner phải tăng điểm');
    assert.ok(result.newB < 1400, 'Loser phải giảm điểm');
    // Thắng đối thủ mạnh hơn nhiều thì được cộng rất nhiều (changeA > 16)
    assert.ok(result.changeA > 16, 'Kèo dưới thắng phải được cộng nhiều hơn 16 điểm');
});

runTest('Expected Direction - Hòa khi chênh lệch trình độ (1400 vs 1000, scoreA = 0.5): Kèo trên bị trừ, kèo dưới được cộng', () => {
    const result = calculateNewRatings(1400, 1000, 0.5, 32);
    assert.ok(result.newA < 1400, 'Kèo trên hòa phải bị trừ điểm');
    assert.ok(result.newB > 1000, 'Kèo dưới hòa phải được cộng điểm');
});

// ----------------------------------------------------------------------------
// Nhóm 3: Kiểm thử Tính Deterministic (Tính toán xác định, lặp lại nhất quán)
// ----------------------------------------------------------------------------
console.log('\n3. Kiểm thử Tính Deterministic & Làm tròn số:');

runTest('Deterministic - Gọi 100 lần cùng input luôn cho kết quả giống hệt nhau', () => {
    const firstRun = calculateNewRatings(1250, 1180, 1, 32);
    for (let i = 0; i < 100; i++) {
        const run = calculateNewRatings(1250, 1180, 1, 32);
        assert.strictEqual(run.newA, firstRun.newA);
        assert.strictEqual(run.newB, firstRun.newB);
        assert.strictEqual(run.changeA, firstRun.changeA);
        assert.strictEqual(run.changeB, firstRun.changeB);
    }
});

runTest('Rounding - Kết quả mới luôn là số nguyên (Math.round)', () => {
    const res = calculateNewRatings(1523, 1377, 0.5, 32);
    assert.strictEqual(Number.isInteger(res.newA), true, 'newA phải là số nguyên');
    assert.strictEqual(Number.isInteger(res.newB), true, 'newB phải là số nguyên');
});

// ----------------------------------------------------------------------------
// Nhóm 4: Kiểm thử UserService.applyGameResult & Idempotency
// ----------------------------------------------------------------------------
console.log('\n4. Kiểm thử UserService.applyGameResult & Idempotency:');

(async () => {
    // Tạo Mock Repository giả lập database để test Service độc lập
    class MockUserRepository {
        constructor() {
            this.users = new Map([
                [1, { id: 1, username: 'PlayerRed', eloRating: 1000, wins: 5, losses: 2, draws: 1 }],
                [2, { id: 2, username: 'PlayerBlack', eloRating: 1000, wins: 3, losses: 4, draws: 1 }]
            ]);
        }

        async findById(id) {
            const u = this.users.get(Number(id));
            return u ? { ...u } : null;
        }

        async updateStats(id, stats) {
            const u = this.users.get(Number(id));
            if (!u) throw new Error('User not found');
            const updated = {
                ...u,
                eloRating: stats.eloRating ?? u.eloRating,
                wins: stats.wins ?? u.wins,
                losses: stats.losses ?? u.losses,
                draws: stats.draws ?? u.draws
            };
            this.users.set(Number(id), updated);
            return { ...updated };
        }
    }

    await runAsyncTest('applyGameResult - Cập nhật đúng Elo và số trận thắng/thua cho Red thắng', async () => {
        const mockRepo = new MockUserRepository();
        const service = new UserService(mockRepo, 32);

        const res = await service.applyGameResult('game-101', 1, 2, 'red_win');

        assert.strictEqual(res.red.newElo, 1016, 'Red mới phải đạt 1016 Elo');
        assert.strictEqual(res.black.newElo, 984, 'Black mới phải còn 984 Elo');
        assert.strictEqual(res.red.wins, 6, 'Số trận thắng của Red phải tăng từ 5 lên 6');
        assert.strictEqual(res.black.losses, 5, 'Số trận thua của Black phải tăng từ 4 lên 5');
    });

    await runAsyncTest('Idempotency - Gọi lại với cùng GameID không cập nhật Elo lần 2', async () => {
        const mockRepo = new MockUserRepository();
        const service = new UserService(mockRepo, 32);

        // Lần 1: Cập nhật thành công
        const firstRes = await service.applyGameResult('game-unique-999', 1, 2, 'red_win');
        assert.strictEqual(firstRes.red.newElo, 1016);

        // Lần 2: Gọi lặp lại cùng GameID
        const secondRes = await service.applyGameResult('game-unique-999', 1, 2, 'red_win');
        assert.strictEqual(secondRes.alreadyFinalized, true, 'Lần gọi thứ hai phải nhận diện đã finalize');

        // Xác nhận dữ liệu trong database không bị cộng điểm 2 lần
        const redInDb = await mockRepo.findById(1);
        assert.strictEqual(redInDb.eloRating, 1016, 'Elo không được phép tăng lần thứ hai');
        assert.strictEqual(redInDb.wins, 6, 'Số trận thắng không được phép tăng lần thứ hai');
    });

    console.log(`\n========================================`);
    console.log(`KẾT QUẢ: ĐÃ PASS ${passedTests}/${totalTests} BỘ TEST THÀNH CÔNG!`);
    console.log(`========================================\n`);
})();
