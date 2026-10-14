/**
 * ============================================================================
 * gameStatusEvaluator.js - Đánh giá Trạng thái Toàn cục của Ván Cờ Tướng
 * ============================================================================
 * 
 * Đặc tả:
 * - evaluateGameStatus(gameState) -> { status, winner, checkColor, currentTurn }
 * - Xác định chính xác trạng thái hiện tại của ván cờ:
 *   + PLAYING: Đang chơi bình thường, không ai bị chiếu.
 *   + CHECK: Bên tới lượt đang bị chiếu nhưng vẫn còn ít nhất 1 nước đi thoát chiếu.
 *   + CHECKMATE: Bên tới lượt bị chiếu bí (không còn nước thoát chiếu) hoặc hết nước đi (stalemate).
 *   + FINISHED: Ván đấu kết thúc (do mất Tướng, xin thua, timeout...).
 * - Winner chỉ xuất hiện khi status là FINISHED hoặc CHECKMATE; các trạng thái khác luôn là null.
 * - Hỗ trợ trường hợp Tướng (General) bị capture nếu kiến trúc trò chơi cho phép ăn Tướng kết thúc ngay.
 * - Không tự cập nhật SQL hay tác động database (thuần JavaScript in-memory).
 * 
 * Contract:
 * - evaluateGameStatus(gameState) -> { status, winner, checkColor, currentTurn }
 */

const Board = require('../Board');
const { COLORS, STATUS, normalizeColor } = require('../constants');
const { findGeneral } = require('./flyingGeneralValidator');
const isInCheck = require('./checkValidator');
const { hasAnyLegalMove } = require('./checkmateValidator');

/**
 * Trích xuất instance Board an toàn từ gameState
 * @param {Object} gameState
 * @returns {Board|null}
 */
function extractBoard(gameState) {
  if (!gameState) return null;
  if (gameState.board instanceof Board) return gameState.board;
  if (gameState instanceof Board) return gameState;
  if (gameState.board) return Board.fromJSON(gameState.board);
  if (Array.isArray(gameState)) return Board.fromJSON(gameState);
  return null;
}

/**
 * Đánh giá trạng thái toàn cục của ván đấu Cờ Tướng.
 * Trả về Plain JavaScript Object hoàn toàn serializable.
 * 
 * @param {Object} gameState Instance GameState hoặc Plain Object { board, currentTurn, status?, winner? }
 * @returns {{
 *   status: 'WAITING'|'PLAYING'|'CHECK'|'CHECKMATE'|'FINISHED',
 *   winner: 'RED'|'BLACK'|'DRAW'|null,
 *   checkColor: 'RED'|'BLACK'|null,
 *   currentTurn: 'RED'|'BLACK'
 * }}
 */
function evaluateGameStatus(gameState) {
  if (!gameState) {
    return {
      status: STATUS.WAITING,
      winner: null,
      checkColor: null,
      currentTurn: COLORS.RED
    };
  }

  const board = extractBoard(gameState);
  const currentTurn = normalizeColor(gameState.currentTurn || COLORS.RED);
  const opponentColor = currentTurn === COLORS.RED ? COLORS.BLACK : COLORS.RED;

  // 1. Nếu ván cờ đã được đánh dấu FINISHED từ trước (ví dụ do resign, timeout...)
  if (gameState.status === STATUS.FINISHED && gameState.winner) {
    return {
      status: STATUS.FINISHED,
      winner: normalizeColor(gameState.winner),
      checkColor: null,
      currentTurn
    };
  }

  if (!board) {
    return {
      status: STATUS.WAITING,
      winner: null,
      checkColor: null,
      currentTurn
    };
  }

  // 2. HỖ TRỢ TRƯỜNG HỢP GENERAL BỊ CAPTURE (Mất Tướng kết thúc ván đấu ngay)
  const redGeneral = findGeneral(board, COLORS.RED);
  const blackGeneral = findGeneral(board, COLORS.BLACK);

  // Mất Tướng Đỏ -> Phe Đen thắng ngay lập tức
  if (!redGeneral && blackGeneral) {
    return {
      status: STATUS.FINISHED,
      winner: COLORS.BLACK,
      checkColor: null,
      currentTurn
    };
  }

  // Mất Tướng Đen -> Phe Đỏ thắng ngay lập tức
  if (!blackGeneral && redGeneral) {
    return {
      status: STATUS.FINISHED,
      winner: COLORS.RED,
      checkColor: null,
      currentTurn
    };
  }

  // Nếu mất cả 2 Tướng (thế cờ test đặc biệt)
  if (!redGeneral && !blackGeneral) {
    return {
      status: STATUS.FINISHED,
      winner: 'DRAW',
      checkColor: null,
      currentTurn
    };
  }

  // 3. KIỂM TRA CHIẾU (CHECK) VÀ CHIẾU BÍ (CHECKMATE) CHO BÊN TỚI LƯỢT
  const currentlyInCheck = isInCheck(board, currentTurn);

  if (currentlyInCheck) {
    // Bên tới lượt ĐANG BỊ CHIẾU
    const canEscape = hasAnyLegalMove(gameState, currentTurn);

    if (!canEscape) {
      // Không còn bất kỳ nước đi nào để thoát chiếu -> CHIẾU BÍ (CHECKMATE)
      return {
        status: STATUS.CHECKMATE,
        winner: opponentColor, // Người thắng là đối thủ
        checkColor: currentTurn,
        currentTurn
      };
    }

    // Còn nước đi thoát chiếu -> Chỉ là CHIẾU (CHECK)
    return {
      status: STATUS.CHECK,
      winner: null, // Chưa có winner khi chỉ mới bị chiếu
      checkColor: currentTurn,
      currentTurn
    };
  }

  // 4. BÊN TỚI LƯỢT KHÔNG BỊ CHIẾU: Kiểm tra Cờ Bí / Hết Nước Đi (Stalemate)
  const hasMoves = hasAnyLegalMove(gameState, currentTurn);

  if (!hasMoves) {
    // Trong luật Cờ Tướng truyền thống, bên tới lượt mà không còn nước đi hợp lệ
    // (hết nước đi / cạn nước) thì bị xử thua (Stalemate = Lose)
    return {
      status: STATUS.CHECKMATE,
      winner: opponentColor,
      checkColor: null,
      currentTurn
    };
  }

  // 5. TRẠNG THÁI BÌNH THƯỜNG: Ván đấu đang tiếp diễn
  return {
    status: STATUS.PLAYING,
    winner: null,
    checkColor: null,
    currentTurn
  };
}

module.exports = evaluateGameStatus;
module.exports.evaluateGameStatus = evaluateGameStatus;

