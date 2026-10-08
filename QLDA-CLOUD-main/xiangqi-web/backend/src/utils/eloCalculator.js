/**
 * Mô-đun tính toán hệ số Elo chuẩn theo công thức FIDE / Quốc Tế (eloCalculator.js)
 * Thuần logic, deterministic, nhận rating hai người và kết quả 1/0.5/0, dùng K-factor cố định.
 */

const DEFAULT_K_FACTOR = 32;

/**
 * Tính xác suất kỳ vọng (Expected Score) của người chơi A trước người chơi B
 * Công thức: E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 * 
 * @param {number} ratingA - Elo hiện tại của kỳ thủ A
 * @param {number} ratingB - Elo hiện tại của kỳ thủ B
 * @returns {number} Xác suất kỳ vọng trong khoảng (0, 1)
 */
function calculateExpectedScore(ratingA, ratingB) {
    const rA = Number(ratingA) || 1000;
    const rB = Number(ratingB) || 1000;
    const exponent = (rB - rA) / 400;
    return 1 / (1 + Math.pow(10, exponent));
}

/**
 * Chuẩn hóa kết quả trận đấu về giá trị số: 1 (thắng), 0.5 (hòa), 0 (thua)
 * @param {number|string} score - Điểm số hoặc chuỗi kết quả
 * @returns {number} 1 | 0.5 | 0
 */
function normalizeScore(score) {
    if (typeof score === 'number') {
        if (score === 1 || score === 0.5 || score === 0) return score;
        if (score > 0.5) return 1;
        if (score > 0) return 0.5;
        return 0;
    }

    const s = String(score).toLowerCase().trim();
    if (s === '1' || s === 'win' || s === 'red_win' || s === 'red') return 1;
    if (s === '0.5' || s === 'draw' || s === 'tie' || s === '0.5-0.5') return 0.5;
    if (s === '0' || s === 'loss' || s === 'black_win' || s === 'black') return 0;

    return 0.5;
}

/**
 * Tính toán hệ số Elo mới cho 2 người chơi sau khi kết thúc ván đấu
 * Contract: calculateNewRatings(a, b, scoreA, k) -> { newA, newB }
 * 
 * @param {number} ratingA - Hệ số Elo hiện tại của kỳ thủ A
 * @param {number} ratingB - Hệ số Elo hiện tại của kỳ thủ B
 * @param {number|string} scoreA - Kết quả của A (1: thắng, 0.5: hòa, 0: thua)
 * @param {number} [k=32] - Hệ số K-factor cấu hình (mặc định 32)
 * @returns {{ newA: number, newB: number, changeA: number, changeB: number, expectedA: number, expectedB: number }}
 */
function calculateNewRatings(ratingA, ratingB, scoreA, k = DEFAULT_K_FACTOR) {
    const rA = Math.max(0, parseInt(ratingA, 10) || 1000);
    const rB = Math.max(0, parseInt(ratingB, 10) || 1000);
    const sA = normalizeScore(scoreA);
    const sB = 1 - sA;
    const kFactor = (typeof k === 'number' && k > 0) ? k : DEFAULT_K_FACTOR;

    // 1. Tính xác suất thắng kỳ vọng
    const expectedA = calculateExpectedScore(rA, rB);
    const expectedB = 1 - expectedA;

    // 2. Điểm Elo mới trước khi làm tròn
    const rawNewA = rA + kFactor * (sA - expectedA);
    const rawNewB = rB + kFactor * (sB - expectedB);

    // 3. Làm tròn thành số nguyên theo quy ước chuẩn
    const newA = Math.round(rawNewA);
    const newB = Math.round(rawNewB);

    return {
        newA,
        newB,
        changeA: newA - rA,
        changeB: newB - rB,
        expectedA: Number(expectedA.toFixed(4)),
        expectedB: Number(expectedB.toFixed(4))
    };
}

module.exports = {
    DEFAULT_K_FACTOR,
    calculateExpectedScore,
    normalizeScore,
    calculateNewRatings
};
