/**
 * ============================================================================
 * moveValidator.js - Validator Nước Đi Chính Quy Cho Toàn Bộ Game Engine
 * ============================================================================
 * 
 * Đặc tả:
 * - validateMove() là API duy nhất các module ngoài game engine (Socket, Controller,
 *   GameManager, AI Player) cần dùng để xác nhận tính hợp lệ của nước đi.
 * - Kiểm tra chặt chẽ theo thứ tự:
 *   1. Tọa độ hợp lệ trong bàn cờ (OUT_OF_BOARD)
 *   2. Ô xuất phát có quân cờ (NO_PIECE)
 *   3. Đúng lượt đi và đúng màu người chơi (NOT_YOUR_TURN)
 *   4. Đi đúng quy tắc hình học và vật cản của quân cờ (ILLEGAL_PATTERN)
 *   5. Clone Board thử nước đi (KHÔNG mutate board thật)
 *   6. Không để hai Tướng đối mặt trực tiếp (FLYING_GENERAL)
 *   7. Không để Tướng bên đi tự rơi vào thế bị chiếu (SELF_CHECK)
 * - Trả reason code rõ ràng, ổn định.
 * - Thuần JavaScript, không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 * 
 * Contract:
 * - validateMove(gameState, { from, to, playerColor }) -> { valid, reason?, capturedPiece?, nextState? }
 */

const Board = require('../Board');
const GameState = require('../GameState');
const { COLORS, PIECE_TYPES, normalizeColor, isValidCoordinate } = require('../constants');
const isFlyingGeneral = require('./flyingGeneralValidator');
const isInCheck = require('./checkValidator');

// Nạp bộ sinh nước đi của từng loại quân
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
 * Các mã lỗi ổn định khi nước đi không hợp lệ
 */
const MOVE_INVALID_REASONS = Object.freeze({
  OUT_OF_BOARD: 'OUT_OF_BOARD',
  NO_PIECE: 'NO_PIECE',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  ILLEGAL_PATTERN: 'ILLEGAL_PATTERN',
  SELF_CHECK: 'SELF_CHECK',
  FLYING_GENERAL: 'FLYING_GENERAL'
});

/**
 * Kiểm tra tính hợp lệ toàn diện của một nước đi trong ván cờ Cờ Tướng.
 * Tuyệt đối không làm thay đổi (mutate) gameState hoặc board truyền vào.
 * 
 * @param {GameState|Object} gameState Trạng thái ván đấu hiện tại
 * @param {Object} move Tham số nước đi { from, to, playerColor? } hoặc from
 * @param {string|Object} [maybePlayerColor] Màu người chơi nếu truyền riêng lẻ
 * @returns {{
 *   valid: boolean,
 *   reason?: string,
 *   capturedPiece?: Object|null,
 *   nextState?: GameState|Object
 * }}
 */
function validateMove(gameState, move, maybePlayerColor) {
  if (!gameState) {
    return { valid: false, reason: MOVE_INVALID_REASONS.NO_PIECE };
  }

  // 1. Trích xuất from, to, playerColor linh hoạt
  let from;
  let to;
  let playerColor;

  if (move && typeof move === 'object') {
    from = move.from;
    to = move.to;
    playerColor = move.playerColor || maybePlayerColor;
  } else {
    return { valid: false, reason: MOVE_INVALID_REASONS.OUT_OF_BOARD };
  }

  // 2. Kiểm tra tọa độ biên (OUT_OF_BOARD)
  if (!from || !to ||
      typeof from.row !== 'number' || typeof from.col !== 'number' ||
      typeof to.row !== 'number' || typeof to.col !== 'number' ||
      !isValidCoordinate(from.row, from.col) ||
      !isValidCoordinate(to.row, to.col)) {
    return { valid: false, reason: MOVE_INVALID_REASONS.OUT_OF_BOARD };
  }

  // Chuẩn hóa board
  let boardInstance;
  if (gameState.board instanceof Board) {
    boardInstance = gameState.board;
  } else if (gameState.board) {
    boardInstance = Board.fromJSON(gameState.board);
  } else if (Array.isArray(gameState)) {
    boardInstance = Board.fromJSON(gameState);
  } else {
    return { valid: false, reason: MOVE_INVALID_REASONS.NO_PIECE };
  }

  // 3. Kiểm tra quân cờ tại ô xuất phát (NO_PIECE)
  const piece = boardInstance.getPiece(from.row, from.col);
  if (!piece) {
    return { valid: false, reason: MOVE_INVALID_REASONS.NO_PIECE };
  }

  // 4. Kiểm tra lượt đi và màu người chơi (NOT_YOUR_TURN)
  const currentTurn = normalizeColor(gameState.currentTurn || COLORS.RED);
  const pieceColor = normalizeColor(piece.color);

  // Quân cờ định đi không phải của bên tới lượt
  if (pieceColor !== currentTurn) {
    return { valid: false, reason: MOVE_INVALID_REASONS.NOT_YOUR_TURN };
  }

  // Nếu caller truyền rõ danh tính playerColor, phải trùng với currentTurn
  if (playerColor) {
    const expectedColor = normalizeColor(playerColor);
    if (expectedColor !== currentTurn || expectedColor !== pieceColor) {
      return { valid: false, reason: MOVE_INVALID_REASONS.NOT_YOUR_TURN };
    }
  }

  // 5. Kiểm tra quy tắc hình học & vật cản của quân cờ (ILLEGAL_PATTERN)
  const moveGenerator = pieceMoveGenerators[piece.type];
  if (typeof moveGenerator !== 'function') {
    return { valid: false, reason: MOVE_INVALID_REASONS.ILLEGAL_PATTERN };
  }

  const pseudoMoves = moveGenerator(boardInstance, {
    row: from.row,
    col: from.col,
    color: piece.color
  });

  const matchingPseudoMove = pseudoMoves.find(
    m => m.row === to.row && m.col === to.col
  );

  if (!matchingPseudoMove) {
    return { valid: false, reason: MOVE_INVALID_REASONS.ILLEGAL_PATTERN };
  }

  // 6. CLONE BOARD & THỬ ÁP DỤNG NƯỚC ĐI (Không làm biến đổi Board thật!)
  const clonedBoard = boardInstance.clone();
  const moveResult = clonedBoard.movePiece(from, to);

  // 7. Kiểm tra hai Tướng đối mặt (FLYING_GENERAL)
  if (isFlyingGeneral(clonedBoard)) {
    return { valid: false, reason: MOVE_INVALID_REASONS.FLYING_GENERAL };
  }

  // 8. Kiểm tra tự đưa Tướng mình vào thế bị chiếu (SELF_CHECK)
  if (isInCheck(clonedBoard, currentTurn)) {
    return { valid: false, reason: MOVE_INVALID_REASONS.SELF_CHECK };
  }

  // 9. NƯỚC ĐI HỢP LỆ! Tạo nextState để bàn giao
  let nextState = null;
  try {
    if (gameState instanceof GameState) {
      nextState = gameState.clone();
      nextState.makeMove(from, to);
    } else if (typeof gameState === 'object') {
      const gs = new GameState({
        board: boardInstance,
        currentTurn,
        status: gameState.status,
        winner: gameState.winner,
        lastMove: gameState.lastMove,
        metadata: gameState.metadata
      });
      nextState = gs.clone();
      nextState.makeMove(from, to);
    }
  } catch (err) {
    // Nếu có lỗi phát sinh khi tạo nextState, vẫn đảm bảo kết quả valid
    nextState = null;
  }

  return {
    valid: true,
    capturedPiece: moveResult.capturedPiece,
    nextState: nextState
  };
}

module.exports = validateMove;
module.exports.validateMove = validateMove;
module.exports.MOVE_INVALID_REASONS = MOVE_INVALID_REASONS;
