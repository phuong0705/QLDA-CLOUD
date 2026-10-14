/**
 * ============================================================================
 * checkValidator.js - Kiểm tra Tình trạng Chiếu Tướng (Check / In-Check)
 * ============================================================================
 * 
 * Đặc tả:
 * - Kiểm tra xem Tướng của một phe có đang bị bất kỳ quân đối phương nào
 *   đe dọa bắt (chiếu Tướng) hay không.
 * - Quét các nước đi giả định (pseudo-legal moves) của toàn bộ quân cờ đối phương;
 *   nếu có bất kỳ nước đi nào có ô đích trùng với tọa độ quân Tướng phe mình
 *   thì Tướng đang bị chiếu (In Check).
 * - Thuần JavaScript, không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 */

const { COLORS, PIECE_TYPES, normalizeColor } = require('../constants');
const { findGeneral } = require('./flyingGeneralValidator');

// Nạp các bộ sinh nước đi của từng loại quân cờ
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
 * Lấy danh sách các quân cờ đối phương đang trực tiếp chiếu Tướng phe chỉ định
 * 
 * @param {Object} board Instance Board
 * @param {'RED'|'BLACK'|string} color Màu của phe bị chiếu (phe phòng thủ)
 * @returns {Array<Object>} Danh sách các quân cờ đối thủ đang chiếu Tướng
 */
function getCheckingPieces(board, color) {
  if (!board) return [];

  const defenderColor = normalizeColor(color);
  const attackerColor = defenderColor === COLORS.RED ? COLORS.BLACK : COLORS.RED;

  // Tìm Tướng của phe phòng thủ
  const general = findGeneral(board, defenderColor);
  if (!general) {
    return [];
  }

  const attackers = typeof board.getPieces === 'function'
    ? board.getPieces(attackerColor)
    : [];

  const checkingPieces = [];

  for (const atk of attackers) {
    const moveGen = pieceMoveGenerators[atk.type];
    if (typeof moveGen !== 'function') continue;

    const moves = moveGen(board, { row: atk.row, col: atk.col, color: atk.color });
    const isAttackingGeneral = moves.some(
      m => m.row === general.row && m.col === general.col
    );

    if (isAttackingGeneral) {
      checkingPieces.push({ ...atk });
    }
  }

  return checkingPieces;
}

/**
 * Kiểm tra xem Tướng của phe chỉ định có đang bị chiếu hay không
 * 
 * @param {Object} board Instance Board
 * @param {'RED'|'BLACK'|string} color Màu của phe cần kiểm tra bị chiếu
 * @returns {boolean} true nếu Tướng đang bị chiếu, ngược lại false
 */
function isInCheck(board, color) {
  if (!board) return false;

  const checkingPieces = getCheckingPieces(board, color);
  return checkingPieces.length > 0;
}

module.exports = isInCheck;
module.exports.isInCheck = isInCheck;
module.exports.getCheckingPieces = getCheckingPieces;
