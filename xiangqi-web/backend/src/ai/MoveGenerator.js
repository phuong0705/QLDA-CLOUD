/**
 * ============================================================================
 * MoveGenerator.js - Trình Sinh Nước Đi Hợp Lệ Dành Cho AI
 * ============================================================================
 * 
 * Đặc tả:
 * - Gọi trực tiếp getAllLegalMoves và hasAnyLegalMove từ Game Engine
 *   (checkmateValidator).
 * - TUYỆT ĐỐI KHÔNG tự viết lại luật cờ hoặc duplicate logic kiểm tra nước đi.
 * - Đảm bảo mọi nước đi sinh ra đều hợp lệ 100% (đã qua kiểm tra cản chân,
 *   cản mắt, ngòi pháo, cửu cung, bờ sông, Flying General và Self-Check).
 * - Thuần JavaScript, không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 */

const {
  getAllLegalMoves,
  hasAnyLegalMove
} = require('../game/rules/checkmateValidator');
const { normalizeColor } = require('../game/constants');

class MoveGenerator {
  /**
   * Sinh toàn bộ các nước đi hợp lệ của một phe từ gameState hiện tại
   * 
   * @param {Object} gameState Trạng thái ván đấu
   * @param {'RED'|'BLACK'|string} color Màu phe cần sinh nước đi
   * @returns {Array<{
   *   from: { row: number, col: number },
   *   to: { row: number, col: number },
   *   piece: Object,
   *   canCapture: boolean,
   *   capturedPieceId: string|null
   * }>}
   */
  static generateLegalMoves(gameState, color) {
    if (!gameState) return [];
    const side = normalizeColor(color || gameState.currentTurn);
    return getAllLegalMoves(gameState, side);
  }

  /**
   * Kiểm tra nhanh xem phe chỉ định có còn bất kỳ nước đi hợp lệ nào không
   * 
   * @param {Object} gameState
   * @param {'RED'|'BLACK'|string} color
   * @returns {boolean}
   */
  static hasLegalMoves(gameState, color) {
    if (!gameState) return false;
    const side = normalizeColor(color || gameState.currentTurn);
    return hasAnyLegalMove(gameState, side);
  }
}

module.exports = MoveGenerator;
module.exports.MoveGenerator = MoveGenerator;
module.exports.generateLegalMoves = MoveGenerator.generateLegalMoves;
module.exports.hasLegalMoves = MoveGenerator.hasLegalMoves;
