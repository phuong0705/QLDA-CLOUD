/**
 * ============================================================================
 * BoardEvaluator.js - Đánh Giá Thế Trận và Giá Trị Bàn Cờ Dành Cho AI
 * ============================================================================
 * 
 * Đặc tả:
 * - Gán giá trị tương đối cho từng loại quân cờ chuẩn Cờ Tướng:
 *   + Tướng (General): 10,000 (vô giá)
 *   + Xe (Chariot): 900
 *   + Pháo (Cannon): 450
 *   + Mã (Horse): 400
 *   + Tượng (Elephant): 200
 *   + Sĩ (Advisor): 200
 *   + Tốt (Soldier): 100 (chưa qua sông), 200 (sau khi qua sông)
 * - Điểm rất lớn cho tình thế Chiếu Bí (Checkmate): 100,000 điểm.
 * - Điểm thưởng/phạt cho trạng thái Chiếu (Check): ±50 điểm.
 * - Trả về điểm số từ góc nhìn của phe `color`:
 *   + Điểm dương (> 0): Phe `color` đang chiếm ưu thế.
 *   + Điểm âm (< 0): Phe `color` đang bị lép vế.
 * - Thuần JavaScript, không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 */

const { COLORS, PIECE_TYPES, normalizeColor } = require('../game/constants');
const { isOwnSideOfRiver } = require('../game/pieces/General');
const { findGeneral } = require('../game/rules/flyingGeneralValidator');
const isInCheck = require('../game/rules/checkValidator');

// Bảng giá trị cơ bản của từng loại quân
const PIECE_VALUES = Object.freeze({
  [PIECE_TYPES.GENERAL]: 10000,
  [PIECE_TYPES.CHARIOT]: 900,
  [PIECE_TYPES.CANNON]: 450,
  [PIECE_TYPES.HORSE]: 400,
  [PIECE_TYPES.ELEPHANT]: 200,
  [PIECE_TYPES.ADVISOR]: 200,
  [PIECE_TYPES.SOLDIER]: 100 // Tốt chưa qua sông: 100; đã qua sông: 200
});

// Điểm số rất lớn cho Chiếu Bí
const CHECKMATE_SCORE = 100000;
const CHECK_BONUS = 50;

class BoardEvaluator {
  /**
   * Lấy giá trị của một quân cờ cụ thể
   * @param {Object} piece { type, color, row, col }
   * @returns {number}
   */
  static getPieceValue(piece) {
    if (!piece || !piece.type) return 0;

    const baseVal = PIECE_VALUES[piece.type] || 0;

    // Tốt đã qua sông có giá trị cao hơn gấp đôi vì có thể đi ngang
    if (piece.type === PIECE_TYPES.SOLDIER) {
      const hasCrossedRiver = !isOwnSideOfRiver(piece.color, piece.row);
      return hasCrossedRiver ? 200 : 100;
    }

    return baseVal;
  }

  /**
   * Đánh giá giá trị toàn cục của bàn cờ từ góc nhìn của phe `color`
   * 
   * @param {Object} gameState Trạng thái ván đấu hiện tại
   * @param {'RED'|'BLACK'|string} color Màu của phe cần đánh giá thế trận
   * @returns {number} Điểm số đánh giá (+ là có lợi, - là bất lợi)
   */
  static evaluate(gameState, color) {
    if (!gameState) return 0;

    const board = gameState.board || gameState;
    const myColor = normalizeColor(color || gameState.currentTurn || COLORS.RED);
    const opponentColor = myColor === COLORS.RED ? COLORS.BLACK : COLORS.RED;

    // 1. Kiểm tra trạng thái Chiếu Bí (Checkmate) hoặc Game Over
    if (gameState.status === 'CHECKMATE') {
      if (gameState.winner === myColor) return CHECKMATE_SCORE;
      if (gameState.winner === opponentColor) return -CHECKMATE_SCORE;
    }

    // Kiểm tra tồn tại quân Tướng của hai bên
    const myGeneral = findGeneral(board, myColor);
    const opponentGeneral = findGeneral(board, opponentColor);

    if (!myGeneral) return -CHECKMATE_SCORE; // Phe mình mất Tướng -> Thua
    if (!opponentGeneral) return CHECKMATE_SCORE; // Đối thủ mất Tướng -> Thắng

    // 2. Tính tổng giá trị quân cờ (Material Value) của cả hai bên
    const allPieces = typeof board.getPieces === 'function' ? board.getPieces() : [];
    let myMaterial = 0;
    let opponentMaterial = 0;

    for (const piece of allPieces) {
      const val = BoardEvaluator.getPieceValue(piece);
      if (normalizeColor(piece.color) === myColor) {
        myMaterial += val;
      } else {
        opponentMaterial += val;
      }
    }

    let score = myMaterial - opponentMaterial;

    // 3. Đánh giá trạng thái Chiếu (Check Bonus / Penalty)
    const myKingInCheck = isInCheck(board, myColor);
    const opponentKingInCheck = isInCheck(board, opponentColor);

    if (myKingInCheck) {
      score -= CHECK_BONUS;
    }
    if (opponentKingInCheck) {
      score += CHECK_BONUS;
    }

    return score;
  }
}

module.exports = BoardEvaluator;
module.exports.BoardEvaluator = BoardEvaluator;
module.exports.evaluate = BoardEvaluator.evaluate;
module.exports.getPieceValue = BoardEvaluator.getPieceValue;
module.exports.PIECE_VALUES = PIECE_VALUES;
module.exports.CHECKMATE_SCORE = CHECKMATE_SCORE;
