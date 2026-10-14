/**
 * ============================================================================
 * checkmateValidator.js - Kiểm tra Chiếu Bí (Checkmate) & Sinh Nước Đi Hợp Lệ
 * ============================================================================
 * 
 * Đặc tả:
 * - Khi một bên bị chiếu (In Check), cần kiểm tra xem bên đó có còn ít nhất
 *   MỘT nước đi hợp lệ (legal move) để thoát chiếu hay không.
 * - Nếu KHÔNG CÒN nước đi hợp lệ nào để thoát chiếu -> CHIẾU BÍ (Checkmate)
 *   và người chiến thắng là đối thủ.
 * - Cung cấp:
 *   + getAllLegalMoves(gameState, color): Lấy toàn bộ nước đi hợp lệ của một bên.
 *   + hasAnyLegalMove(gameState, color): Kiểm tra nhanh có tồn tại ít nhất 1 nước hợp lệ.
 *   + isCheckmate(gameState, color): Xác nhận tình trạng chiếu bí.
 * - Tối ưu hóa: Ngắt sớm (early-exit) ngay khi tìm thấy nước đi hợp lệ đầu tiên
 *   để không gây nghẽn hiệu năng trên bàn cờ bình thường.
 * - Thuần JavaScript, không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 */

const Board = require('../Board');
const { COLORS, PIECE_TYPES, normalizeColor } = require('../constants');
const isFlyingGeneral = require('./flyingGeneralValidator');
const isInCheck = require('./checkValidator');

// Nạp các bộ sinh nước đi của từng loại quân
const getChariotMoves = require('../pieces/Chariot');
const getHorseMoves = require('../pieces/Horse');
const getCannonMoves = require('../pieces/Cannon');
const getSoldierMoves = require('../pieces/Soldier');
const getGeneralMoves = require('../pieces/General');
const getAdvisorMoves = require('../pieces/Advisor');
const getElephantMoves = require('../pieces/Elephant');

const pieceMoveGenerators = {
  [PIECE_TYPES.CHARIOT]: getChariotMoves,
  [PIECE_TYPES.HORSE]: getHorseMoves,
  [PIECE_TYPES.CANNON]: getCannonMoves,
  [PIECE_TYPES.SOLDIER]: getSoldierMoves,
  [PIECE_TYPES.GENERAL]: getGeneralMoves,
  [PIECE_TYPES.ADVISOR]: getAdvisorMoves,
  [PIECE_TYPES.ELEPHANT]: getElephantMoves
};

/**
 * Trích xuất instance Board từ gameState
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
 * Lấy tất cả các nước đi hợp lệ (Legal Moves) của một phe.
 * Một nước đi là hợp lệ khi:
 * 1. Thuộc tập pseudo-legal moves của quân cờ đó.
 * 2. Sau khi đi, Tướng phe mình không bị lộ mặt (không Flying General).
 * 3. Sau khi đi, Tướng phe mình không bị chiếu (không In Check).
 * 
 * @param {Object} gameState Trạng thái ván đấu hoặc Board
 * @param {'RED'|'BLACK'|string} color Màu phe cần tìm nước đi
 * @returns {Array<{
 *   from: { row: number, col: number },
 *   to: { row: number, col: number },
 *   piece: Object,
 *   canCapture: boolean,
 *   capturedPieceId: string|null
 * }>} Danh sách các nước đi hợp lệ
 */
function getAllLegalMoves(gameState, color) {
  const board = extractBoard(gameState);
  if (!board) return [];

  const side = normalizeColor(color);
  const pieces = typeof board.getPieces === 'function' ? board.getPieces(side) : [];
  const legalMoves = [];

  for (const p of pieces) {
    const moveGen = pieceMoveGenerators[p.type];
    if (typeof moveGen !== 'function') continue;

    const pseudoMoves = moveGen(board, { row: p.row, col: p.col, color: p.color });

    for (const move of pseudoMoves) {
      // Clone board để thử nước đi (bảo toàn tính bất biến cho board thật)
      const clonedBoard = board.clone();
      clonedBoard.movePiece({ row: p.row, col: p.col }, { row: move.row, col: move.col });

      // Nước đi không được gây Flying General
      if (isFlyingGeneral(clonedBoard)) {
        continue;
      }

      // Nước đi không được để Tướng phe mình bị chiếu (hoặc phải giải được chiếu)
      if (isInCheck(clonedBoard, side)) {
        continue;
      }

      legalMoves.push({
        from: { row: p.row, col: p.col },
        to: { row: move.row, col: move.col },
        piece: { ...p },
        canCapture: move.canCapture,
        capturedPieceId: move.capturedPieceId || null
      });
    }
  }

  return legalMoves;
}

/**
 * Kiểm tra nhanh xem một phe có còn ít nhất MỘT nước đi hợp lệ hay không.
 * Tối ưu hóa: Ngắt và trả về true ngay lập tức khi tìm thấy nước đi hợp lệ đầu tiên.
 * 
 * @param {Object} gameState
 * @param {'RED'|'BLACK'|string} color
 * @returns {boolean} true nếu còn ít nhất 1 nước đi hợp lệ, ngược lại false
 */
function hasAnyLegalMove(gameState, color) {
  const board = extractBoard(gameState);
  if (!board) return false;

  const side = normalizeColor(color);
  const pieces = typeof board.getPieces === 'function' ? board.getPieces(side) : [];

  for (const p of pieces) {
    const moveGen = pieceMoveGenerators[p.type];
    if (typeof moveGen !== 'function') continue;

    const pseudoMoves = moveGen(board, { row: p.row, col: p.col, color: p.color });

    for (const move of pseudoMoves) {
      const clonedBoard = board.clone();
      clonedBoard.movePiece({ row: p.row, col: p.col }, { row: move.row, col: move.col });

      if (isFlyingGeneral(clonedBoard)) {
        continue;
      }

      if (isInCheck(clonedBoard, side)) {
        continue;
      }

      // Tìm thấy ít nhất một nước đi hợp lệ -> Return ngay lập tức!
      return true;
    }
  }

  return false;
}

/**
 * Kiểm tra xem một phe có đang bị CHIẾU BÍ (Checkmate) hay không.
 * Điều kiện Chiếu Bí:
 * 1. Tướng của phe đó đang bị chiếu (isInCheck === true).
 * 2. Phe đó KHÔNG CÒN bất kỳ nước đi hợp lệ nào để thoát khỏi thế bị chiếu.
 * 
 * @param {Object} gameState Trạng thái ván đấu hoặc Board
 * @param {'RED'|'BLACK'|string} color Màu phe cần kiểm tra
 * @returns {boolean} true nếu bị chiếu bí, ngược lại false
 */
function isCheckmate(gameState, color) {
  const board = extractBoard(gameState);
  if (!board) return false;

  const side = normalizeColor(color);

  // Phải đang bị chiếu thì mới xét chiếu bí (Check != Checkmate)
  const currentlyInCheck = isInCheck(board, side);
  if (!currentlyInCheck) {
    return false;
  }

  // Nếu đang bị chiếu và không còn bất kỳ nước đi nào để thoát chiếu -> CHECKMATE!
  const canEscape = hasAnyLegalMove(gameState, side);
  return !canEscape;
}

module.exports = isCheckmate;
module.exports.isCheckmate = isCheckmate;
module.exports.getAllLegalMoves = getAllLegalMoves;
module.exports.hasAnyLegalMove = hasAnyLegalMove;
