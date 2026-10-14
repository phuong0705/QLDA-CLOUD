/**
 * ============================================================================
 * Soldier.js - Luật di chuyển hình học cho quân Tốt / Binh (兵 / 卒) Cờ Tướng
 * ============================================================================
 * 
 * Đặc tả:
 * - Nhận Board và vị trí quân Tốt hiện tại.
 * - Trả danh sách các nước đi giả định hợp lệ (pseudo-legal moves):
 *   [{ row, col, canCapture, capturedPieceId }].
 * - Tuyệt đối KHÔNG tự thay đổi Board (pure function / immutable).
 * - Hướng tiến phụ thuộc vào màu:
 *   + Phe RED: Tiến giảm row (drow = -1).
 *   + Phe BLACK: Tiến tăng row (drow = +1).
 * - Trước khi qua sông: Chỉ đi được ĐÚNG 1 bước tiến thẳng.
 * - Sau khi qua sông: Đi được 1 bước tiến hoặc 1 bước sang trái hoặc 1 bước sang phải.
 * - Tuyệt đối KHÔNG BAO GIỜ ĐI LÙI.
 * - Không cho phép đi vào ô chứa quân cùng màu.
 * - Không sinh nước đi ra ngoài biên bàn cờ (row 0..9, col 0..8).
 * 
 * Contract:
 * - getPseudoLegalMoves(board, position) -> [{ row, col, canCapture, capturedPieceId }]
 */

const { normalizeColor } = require('../constants');
const {
  isWithinBoard,
  isOwnSideOfRiver,
  isFriendlyPiece
} = require('./General');

/**
 * Lấy danh sách nước đi giả định hợp lệ (pseudo-legal) của quân Tốt
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

  // Hướng tiến: RED giảm row (-1), BLACK tăng row (+1)
  const forwardDrow = myColor === 'RED' ? -1 : 1;

  // Xác định các hướng di chuyển tiềm năng
  const candidateDirections = [];

  // 1. Luôn có hướng TIẾN thẳng 1 ô (không bao giờ lùi)
  candidateDirections.push([forwardDrow, 0]);

  // 2. Nếu ĐÃ QUA SÔNG: Thêm 2 hướng đi ngang (Trái và Phải)
  const hasCrossedRiver = !isOwnSideOfRiver(myColor, startRow);
  if (hasCrossedRiver) {
    candidateDirections.push([0, -1]); // Sang Trái 1 ô
    candidateDirections.push([0, 1]);  // Sang Phải 1 ô
  }

  const moves = [];

  for (const [drow, dcol] of candidateDirections) {
    const targetRow = startRow + drow;
    const targetCol = startCol + dcol;

    // Phải nằm trong bàn cờ (ví dụ Tốt đã đến hàng đáy đối phương không thể tiến tiếp)
    if (!isWithinBoard(targetRow, targetCol)) {
      continue;
    }

    const targetPiece = board.getPiece(targetRow, targetCol);

    // Không được đi vào ô chứa quân cùng màu
    if (isFriendlyPiece(targetPiece, myColor)) {
      continue;
    }

    if (!targetPiece) {
      // Ô đích trống
      moves.push({
        row: targetRow,
        col: targetCol,
        canCapture: false,
        capturedPieceId: null
      });
    } else {
      // Ăn quân đối phương
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
