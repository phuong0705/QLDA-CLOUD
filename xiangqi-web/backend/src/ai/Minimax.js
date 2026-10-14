/**
 * ============================================================================
 * Minimax.js - Thuật Toán Tìm Kiếm Nước Đi Tối Ưu Cho AI (Minimax & Alpha-Beta)
 * ============================================================================
 * 
 * Đặc tả:
 * - Luân phiên lượt đi giữa RED và BLACK (Alternating minimax).
 * - Clone state và apply legal move để dự đoán các thế cờ tiếp theo mà không
 *   làm biến đổi state thật.
 * - Tích hợp cắt tỉa Alpha-Beta Pruning và Move Ordering (ưu tiên các nước ăn quân)
 *   để tối ưu hóa tốc độ tính toán, hoàn thành độ sâu depth 2 trong vài trăm mili-giây.
 * - Thiết lập Deadline (giới hạn thời gian) rõ ràng, tuyệt đối không gây treo server.
 * - Thuần JavaScript, không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 */

const { COLORS, normalizeColor } = require('../game/constants');
const MoveGenerator = require('./MoveGenerator');
const BoardEvaluator = require('./BoardEvaluator');
const isInCheck = require('../game/rules/checkValidator');

const CHECKMATE_SCORE = BoardEvaluator.CHECKMATE_SCORE || 100000;

class Minimax {
  /**
   * Tìm kiếm nước đi tốt nhất cho AI bằng thuật toán Minimax / Alpha-Beta
   * 
   * @param {Object} gameState Trạng thái ván đấu (GameState hoặc { board, currentTurn })
   * @param {'RED'|'BLACK'|string} aiColor Màu của AI ('RED' hoặc 'BLACK')
   * @param {Object} [options={}] Tùy chọn cấu hình
   * @param {number} [options.depth=2] Độ sâu tìm kiếm (mặc định depth 2 cho Medium)
   * @param {number} [options.maxTimeMs=2500] Giới hạn thời gian thực thi (mili-giây)
   * @returns {{ from: { row: number, col: number }, to: { row: number, col: number } }|null}
   */
  static findBestMove(gameState, aiColor, options = {}) {
    if (!gameState) return null;

    const myColor = normalizeColor(aiColor || gameState.currentTurn || COLORS.RED);
    const depth = Number.isInteger(options.depth) && options.depth > 0 ? options.depth : 2;
    const maxTimeMs = Number.isInteger(options.maxTimeMs) ? options.maxTimeMs : 2500;
    const deadline = Date.now() + maxTimeMs;

    // Sinh toàn bộ các nước đi hợp lệ của AI từ MoveGenerator
    const legalMoves = MoveGenerator.generateLegalMoves(gameState, myColor);
    if (!legalMoves || legalMoves.length === 0) {
      return null;
    }

    // Nếu chỉ có 1 nước đi duy nhất, trả về ngay lập tức
    if (legalMoves.length === 1) {
      return {
        from: { row: legalMoves[0].from.row, col: legalMoves[0].from.col },
        to: { row: legalMoves[0].to.row, col: legalMoves[0].to.col }
      };
    }

    // Move Ordering: Ưu tiên thử các nước ăn quân trước để Alpha-Beta cắt tỉa hiệu quả hơn
    legalMoves.sort((a, b) => (b.canCapture ? 1 : 0) - (a.canCapture ? 1 : 0));

    let bestScore = -Infinity;
    let bestMoves = [];
    let alpha = -Infinity;
    const beta = Infinity;

    for (const move of legalMoves) {
      // Hết thời gian cho phép -> ngắt sớm để bảo vệ server
      if (Date.now() >= deadline) {
        break;
      }

      // Clone state độc lập và thực hiện nước đi
      const nextState = gameState.clone();
      nextState.makeMove(move.from, move.to);

      // Đệ quy tầng tiếp theo (lượt của đối thủ -> isMaximizing = false)
      const score = Minimax._minimax(
        nextState,
        depth - 1,
        false,
        myColor,
        alpha,
        beta,
        deadline
      );

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }

      alpha = Math.max(alpha, bestScore);
    }

    // Nếu có nhiều nước đi cùng điểm số cao nhất, chọn ngẫu nhiên 1 nước trong số đó
    if (bestMoves.length === 0) {
      bestMoves = [legalMoves[0]];
    }

    const selectedMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    return {
      from: { row: selectedMove.from.row, col: selectedMove.from.col },
      to: { row: selectedMove.to.row, col: selectedMove.to.col }
    };
  }

  /**
   * Hàm đệ quy Minimax có cắt tỉa Alpha-Beta
   * @private
   */
  static _minimax(gameState, depth, isMaximizing, aiColor, alpha, beta, deadline) {
    // 1. Kiểm tra giới hạn thời gian (Time-limit guard)
    if (Date.now() >= deadline) {
      return BoardEvaluator.evaluate(gameState, aiColor);
    }

    const myColor = aiColor;
    const opponentColor = myColor === COLORS.RED ? COLORS.BLACK : COLORS.RED;
    const currentTurn = isMaximizing ? myColor : opponentColor;

    // 2. Điều kiện dừng: Chạm đáy độ sâu tìm kiếm
    if (depth <= 0) {
      return BoardEvaluator.evaluate(gameState, aiColor);
    }

    // 3. Sinh các nước đi hợp lệ của bên tới lượt
    const legalMoves = MoveGenerator.generateLegalMoves(gameState, currentTurn);

    // Không còn nước đi hợp lệ: Chiếu bí hoặc cạn nước đi (Stalemate)
    if (legalMoves.length === 0) {
      const inCheck = isInCheck(gameState.board, currentTurn);
      if (isMaximizing) {
        // Đến lượt AI mà không có nước đi -> AI thua
        return -(CHECKMATE_SCORE + depth);
      } else {
        // Đến lượt đối thủ mà đối thủ không có nước đi -> AI thắng
        return CHECKMATE_SCORE + depth;
      }
    }

    // Move Ordering: Ưu tiên các nước ăn quân
    legalMoves.sort((a, b) => (b.canCapture ? 1 : 0) - (a.canCapture ? 1 : 0));

    if (isMaximizing) {
      let maxEval = -Infinity;

      for (const move of legalMoves) {
        if (Date.now() >= deadline) break;

        const nextState = gameState.clone();
        nextState.makeMove(move.from, move.to);

        const evaluation = Minimax._minimax(
          nextState,
          depth - 1,
          false,
          aiColor,
          alpha,
          beta,
          deadline
        );

        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);

        if (beta <= alpha) {
          break; // Cắt tỉa Beta
        }
      }

      return maxEval;
    } else {
      let minEval = Infinity;

      for (const move of legalMoves) {
        if (Date.now() >= deadline) break;

        const nextState = gameState.clone();
        nextState.makeMove(move.from, move.to);

        const evaluation = Minimax._minimax(
          nextState,
          depth - 1,
          true,
          aiColor,
          alpha,
          beta,
          deadline
        );

        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);

        if (beta <= alpha) {
          break; // Cắt tỉa Alpha
        }
      }

      return minEval;
    }
  }
}

module.exports = Minimax;
module.exports.Minimax = Minimax;
module.exports.findBestMove = Minimax.findBestMove;
