/**
 * ============================================================================
 * Elephant.js - Luật di chuyển hình học & cản mắt cho quân Tượng (相 / 象) Cờ Tướng
 * ============================================================================
 * 
 * Đặc tả:
 * - Nhận Board và vị trí quân Tượng hiện tại.
 * - Trả danh sách các nước đi giả định hợp lệ (pseudo-legal moves):
 *   [{ row, col, canCapture, capturedPieceId }].
 * - Tượng đi chéo đúng 2 ô (hình vuông 2x2):
 *   + 4 hướng chéo: [-2, -2], [-2, 2], [2, -2], [2, 2].
 * - Bị chặn (cản mắt tượng / elephant eye) nếu ô giữa đường chéo có bất kỳ quân nào.
 * - Tượng KHÔNG ĐƯỢC QUA SÔNG: chỉ được di chuyển trong phần sân nhà của phe mình:
 *   + BLACK: row 0..4
 *   + RED: row 5..9
 * - Không cho phép đi vào ô chứa quân cùng màu.
 * - Không tự thay đổi Board (immutable).
 * 
 * Contract:
 * - getPseudoLegalMoves(board, position) -> [{ row, col, canCapture, capturedPieceId }]
 */

const { normalizeColor } = require('../constants');
const {
  isOwnSideOfRiver,
  isWithinBoard,
  isFriendlyPiece
} = require('./General');

/**
 * 4 hướng đi chéo 2 ô của quân Tượng kèm độ lệch ô mắt tượng (eye square):
 * - targetOffset: [drow, dcol]
 * - eyeOffset: [drow, dcol] (ô mắt tượng ở giữa)
 */
const ELEPHANT_MOVES = Object.freeze([
  // 1. Chéo Lên - Trái 2 ô: mắt cản ở [-1, -1]
  { targetOffset: [-2, -2], eyeOffset: [-1, -1] },
  // 2. Chéo Lên - Phải 2 ô: mắt cản ở [-1, 1]
  { targetOffset: [-2, 2],  eyeOffset: [-1, 1] },
  // 3. Chéo Xuống - Trái 2 ô: mắt cản ở [1, -1]
  { targetOffset: [2, -2],  eyeOffset: [1, -1] },
  // 4. Chéo Xuống - Phải 2 ô: mắt cản ở [1, 1]
  { targetOffset: [2, 2],   eyeOffset: [1, 1] }
]);

/**
 * Lấy danh sách nước đi giả định hợp lệ (pseudo-legal) của quân Tượng
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

  // Vị trí Tượng xuất phát phải nằm ở phần sân nhà (chưa qua sông)
  if (!isOwnSideOfRiver(myColor, startRow)) {
    return [];
  }

  const moves = [];

  // Duyệt 4 khả năng đi chéo 2 ô
  for (const { targetOffset, eyeOffset } of ELEPHANT_MOVES) {
    const eyeRow = startRow + eyeOffset[0];
    const eyeCol = startCol + eyeOffset[1];

    // 1. Kiểm tra ô mắt tượng phải nằm trong bàn cờ
    if (!isWithinBoard(eyeRow, eyeCol)) {
      continue;
    }

    // Nếu ô mắt tượng có bất kỳ quân nào (bất kể đỏ hay đen) -> BỊ CẢN MẮT
    const obstaclePiece = board.getPiece(eyeRow, eyeCol);
    if (obstaclePiece !== null) {
      continue; // Cản mắt tượng, không thể đi hướng này
    }

    // 2. Ô mắt tượng trống, kiểm tra ô đích
    const targetRow = startRow + targetOffset[0];
    const targetCol = startCol + targetOffset[1];

    // Ô đích phải nằm trong bàn cờ
    if (!isWithinBoard(targetRow, targetCol)) {
      continue;
    }

    // TƯỢNG KHÔNG ĐƯỢC QUA SÔNG (phải ở phần sân nhà)
    if (!isOwnSideOfRiver(myColor, targetRow)) {
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
module.exports.isOwnSideOfRiver = isOwnSideOfRiver;
module.exports.isWithinBoard = isWithinBoard;
module.exports.isFriendlyPiece = isFriendlyPiece;
module.exports.ELEPHANT_MOVES = ELEPHANT_MOVES;
