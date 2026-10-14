/**
 * ============================================================================
 * AIPlayer.js - Người Chơi Trí Tuệ Nhân Tạo (AI Player) Cờ Tướng
 * ============================================================================
 * 
 * Đặc tả:
 * - Cung cấp hàm getMove(gameState, color, difficulty) trả về nước đi tối ưu
 *   hoặc null nếu ván đấu đã kết thúc hoặc không còn nước đi hợp lệ.
 * - Các cấp độ khó:
 *   + EASY: Chọn ngẫu nhiên một nước đi trong tập hợp legal moves.
 *   + MEDIUM: Chạy thuật toán Minimax depth 2 với đánh giá thế trận theo material
 *     value và trạng thái check/checkmate.
 * - Tuân thủ nghiêm ngặt các nguyên tắc:
 *   + Không tự viết lại luật cờ (dùng chung MoveGenerator / Game Engine).
 *   + Xử lý state Game Over bằng null.
 *   + Hoàn thành tính toán trong giới hạn thời gian hợp lý (không treo server).
 * - Thuần JavaScript, không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 * 
 * Contract bắt buộc:
 * - AIPlayer.getMove(gameState, color, difficulty) -> { from, to } | null
 */

const { COLORS, normalizeColor } = require('../game/constants');
const evaluateGameStatus = require('../game/rules/gameStatusEvaluator');
const MoveGenerator = require('./MoveGenerator');
const Minimax = require('./Minimax');

class AIPlayer {
  /**
   * Khởi tạo đối tượng AIPlayer (tùy chọn)
   * @param {string} [defaultDifficulty='EASY']
   */
  constructor(defaultDifficulty = 'EASY') {
    this.defaultDifficulty = String(defaultDifficulty).trim().toUpperCase();
  }

  /**
   * Phương thức instance lấy nước đi của AI
   * @param {Object} gameState
   * @param {string} color
   * @param {string} [difficulty]
   * @returns {{ from: { row: number, col: number }, to: { row: number, col: number } }|null}
   */
  getMove(gameState, color, difficulty) {
    return AIPlayer.getMove(gameState, color, difficulty || this.defaultDifficulty);
  }

  /**
   * Sinh nước đi của AI dựa trên trạng thái ván cờ, màu quân và mức độ khó
   * 
   * @param {Object} gameState Trạng thái ván đấu hiện tại
   * @param {'RED'|'BLACK'|string} color Màu phe AI điều khiển ('RED' hoặc 'BLACK')
   * @param {'EASY'|'MEDIUM'|string} [difficulty='EASY'] Cấp độ khó ('EASY' hoặc 'MEDIUM')
   * @returns {{ from: { row: number, col: number }, to: { row: number, col: number } }|null}
   */
  static getMove(gameState, color, difficulty = 'EASY') {
    if (!gameState) {
      return null;
    }

    const myColor = normalizeColor(color || gameState.currentTurn || COLORS.BLACK);
    const diff = String(difficulty || 'EASY').trim().toUpperCase();

    // 1. Kiểm tra trạng thái ván cờ: Nếu Game Over (FINISHED hoặc CHECKMATE), trả về null
    const currentStatus = evaluateGameStatus(gameState);
    if (currentStatus.status === 'FINISHED' || currentStatus.status === 'CHECKMATE') {
      return null;
    }

    // 2. Lấy danh sách nước đi hợp lệ từ MoveGenerator (dùng chung Engine)
    const legalMoves = MoveGenerator.generateLegalMoves(gameState, myColor);
    if (!legalMoves || legalMoves.length === 0) {
      return null;
    }

    // 3. Xử lý theo cấp độ khó
    if (diff === 'MEDIUM') {
      // Cấp độ MEDIUM: Minimax depth 2 với đánh giá thế trận
      const bestMove = Minimax.findBestMove(gameState, myColor, {
        depth: 2,
        maxTimeMs: 2500
      });

      if (bestMove) {
        return {
          from: { row: bestMove.from.row, col: bestMove.from.col },
          to: { row: bestMove.to.row, col: bestMove.to.col }
        };
      }

      // Fallback nếu Minimax không tìm được: chọn nước đi hợp lệ đầu tiên
      const fallback = legalMoves[0];
      return {
        from: { row: fallback.from.row, col: fallback.from.col },
        to: { row: fallback.to.row, col: fallback.to.col }
      };
    }

    // Mặc định hoặc Cấp độ EASY: Chọn ngẫu nhiên trong danh sách legal moves
    const randomIndex = Math.floor(Math.random() * legalMoves.length);
    const selected = legalMoves[randomIndex];

    return {
      from: { row: selected.from.row, col: selected.from.col },
      to: { row: selected.to.row, col: selected.to.col }
    };
  }
}

module.exports = AIPlayer;
module.exports.AIPlayer = AIPlayer;
module.exports.getMove = AIPlayer.getMove;
