/**
 * ============================================================================
 * Advisor.js - Luật di chuyển hình học cho quân Sĩ (仕 / 士) Cờ Tướng
 * ============================================================================
 * 
 * Đặc tả:
 * - Nhận Board và vị trí quân Sĩ hiện tại.
 * - Trả danh sách các nước đi giả định hợp lệ (pseudo-legal moves):
 *   [{ row, col, canCapture, capturedPieceId }].
 * - Sĩ chỉ được di chuyển chéo đúng 1 ô trong Cung (Palace) của phe mình:
 *   + BLACK Palace: row 0..2, col 3..5 (các điểm chéo: tâm (1,4) và 4 góc (0,3), (0,5), (2,3), (2,5))
 *   + RED Palace: row 7..9, col 3..5 (các điểm chéo: tâm (8,4) và 4 góc (7,3), (7,5), (9,3), (9,5))
 * - Không cho phép đi vào ô chứa quân cùng màu.
 * - Không tự thay đổi Board (immutable).
 * 
 * Contract:
 * - getPseudoLegalMoves(board, position) -> [{ row, col, canCapture, capturedPieceId }]
 */

const { normalizeColor } = require('../constants');
const {
  isInsidePalace,
  isWithinBoard,
  isFriendlyPiece
} = require('./General');

/**
 * 4 hướng đi chéo 1 ô của quân Sĩ: [drow, dcol]
 */
const ADVISOR_DIRECTIONS = Object.freeze([
  [-1, -1], // Lên - Trái
  [-1, 1],  // Lên - Phải
  [1, -1],  // Xuống - Trái
  [1, 1]    // Xuống - Phải
]);

/**
 * Lấy danh sách nước đi giả định hợp lệ (pseudo-legal) của quân Sĩ
 * 
 * @param {Object} board Instance Board
 * @param {{ row: number, col: number, color?: string }|number} piecePosition
 * @param {number} [maybeCol]
 * @returns {Array<{ row: number, col: number, canCapture: boolean, capturedPieceId: string|null }>}
 */
function getPseudoLegalMoves(board, piecePosition, maybeCol) {
  if (!board) return [];

  // Chuẩn hóa tọa độ xuất phát
  let startRow;
  let startCol;

  if (typeof piecePosition === 'number' && typeof maybeCol === 'number') {
    startRow = piecePosition;
    startCol = maybeCol;
  } else if (piecePosition && typeof piecePosition === 'object') {
    startRow = piecePosition.row;
    startCol = piecePosition.col;
  } else {
    return [];
  }

  // Tọa độ phải nằm trong bàn cờ
  if (!isWithinBoard(startRow, startCol)) {
    return [];
  }

  // Lấy thông tin quân cờ tại vị trí xuất phát
  const currentPiece = board.getPiece(startRow, startCol) ||
    (piecePosition && piecePosition.color ? piecePosition : null);

  if (!currentPiece || !currentPiece.color) {
    return [];
  }

  const myColor = normalizeColor(currentPiece.color);

  // Vị trí Sĩ xuất phát phải nằm trong cung
  if (!isInsidePalace(myColor, startRow, startCol)) {
    return [];
  }

  const moves = [];

  // Duyệt 4 hướng chéo 1 ô
  for (const [drow, dcol] of ADVISOR_DIRECTIONS) {
    const targetRow = startRow + drow;
    const targetCol = startCol + dcol;

    // Sĩ KHÔNG được ra khỏi cung
    if (!isInsidePalace(myColor, targetRow, targetCol)) {
      continue;
    }

    const targetPiece = board.getPiece(targetRow, targetCol);

    // Không được đi vào ô chứa quân cùng màu
    if (isFriendlyPiece(targetPiece, myColor)) {
      continue;
    }

    if (!targetPiece) {
      moves.push({
        row: targetRow,
        col: targetCol,
        canCapture: false,
        capturedPieceId: null
      });
    } else {
      moves.push({
        row: targetRow,
        col: targetCol,
        canCapture: true,
        capturedPieceId: targetPiece.id || null
      });
    }
  }

  return moves;
}

// Xuất hàm tương thích CommonJS và các helpers tái sử dụng
module.exports = getPseudoLegalMoves;
module.exports.getPseudoLegalMoves = getPseudoLegalMoves;
module.exports.isInsidePalace = isInsidePalace;
module.exports.isWithinBoard = isWithinBoard;
module.exports.isFriendlyPiece = isFriendlyPiece;
module.exports.ADVISOR_DIRECTIONS = ADVISOR_DIRECTIONS;
