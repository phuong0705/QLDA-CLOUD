/**
 * ============================================================================
 * Horse.js - Luật di chuyển hình học & cản chân cho quân Mã (馬 / 馬)
 * ============================================================================
 * 
 * Đặc tả:
 * - Nhận Board và vị trí quân Mã hiện tại.
 * - Trả danh sách các nước đi giả định hợp lệ (pseudo-legal moves) về mặt
 *   hình học và vật cản: [{ row, col, canCapture, capturedPieceId }].
 * - Tuyệt đối KHÔNG tự thay đổi Board (pure function / immutable).
 * - Mã đi chữ L (nhật tự / 8 khả năng nhảy).
 * - Bị chặn (cản chân mã) nếu ô chân tương ứng có bất kỳ quân nào đứng.
 * - Không cho phép đích chứa quân cùng màu.
 * - Không sinh nước đi ra ngoài bàn cờ (row 0..9, col 0..8).
 * 
 * Contract:
 * - getPseudoLegalMoves(board, piecePosition) -> [{ row, col, canCapture, capturedPieceId }]
 */

const { normalizeColor } = require('../constants');
const { isWithinBoard, isFriendlyPiece } = require('./Chariot');

/**
 * 8 hướng nhảy chữ L của quân Mã và ô cản chân tương ứng:
 * - targetOffset: [drow, dcol] (vị trí ô đích)
 * - blockOffset: [drow, dcol] (vị trí ô cản chân mã)
 */
const HORSE_MOVES = Object.freeze([
  // 1. Nhảy lên 2, trái 1 - Chân cản: ô ngay phía trên [ -1, 0 ]
  { targetOffset: [-2, -1], blockOffset: [-1, 0] },
  // 2. Nhảy lên 2, phải 1 - Chân cản: ô ngay phía trên [ -1, 0 ]
  { targetOffset: [-2, 1],  blockOffset: [-1, 0] },

  // 3. Nhảy xuống 2, trái 1 - Chân cản: ô ngay phía dưới [ 1, 0 ]
  { targetOffset: [2, -1],  blockOffset: [1, 0] },
  // 4. Nhảy xuống 2, phải 1 - Chân cản: ô ngay phía dưới [ 1, 0 ]
  { targetOffset: [2, 1],   blockOffset: [1, 0] },

  // 5. Nhảy sang trái 2, lên 1 - Chân cản: ô ngay bên trái [ 0, -1 ]
  { targetOffset: [-1, -2], blockOffset: [0, -1] },
  // 6. Nhảy sang trái 2, xuống 1 - Chân cản: ô ngay bên trái [ 0, -1 ]
  { targetOffset: [1, -2],  blockOffset: [0, -1] },

  // 7. Nhảy sang phải 2, lên 1 - Chân cản: ô ngay bên phải [ 0, 1 ]
  { targetOffset: [-1, 2],  blockOffset: [0, 1] },
  // 8. Nhảy sang phải 2, xuống 1 - Chân cản: ô ngay bên phải [ 0, 1 ]
  { targetOffset: [1, 2],   blockOffset: [0, 1] }
]);

/**
 * Lấy danh sách các nước đi giả định hợp lệ (pseudo-legal) của quân Mã
 * 
 * @param {Object} board Instance Board (cung cấp getPiece(row, col))
 * @param {{ row: number, col: number, color?: string }|number} piecePosition Vị trí hiện tại của Mã hoặc row nếu truyền rời
 * @param {number} [maybeCol] Cột nếu truyền (board, row, col)
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

  // Tọa độ xuất phát phải nằm trong bàn cờ
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
  const moves = [];

  // Duyệt đúng 8 khả năng di chuyển của quân Mã
  for (const { targetOffset, blockOffset } of HORSE_MOVES) {
    const blockRow = startRow + blockOffset[0];
    const blockCol = startCol + blockOffset[1];

    // 1. Kiểm tra ô cản chân: phải nằm trong bàn cờ
    if (!isWithinBoard(blockRow, blockCol)) {
      continue;
    }

    // Nếu ô cản chân có bất kỳ quân nào (bất kể đỏ hay đen) -> BỊ CẢN CHÂN
    const obstaclePiece = board.getPiece(blockRow, blockCol);
    if (obstaclePiece !== null) {
      continue; // Bị cản chân mã, không thể đi hướng này
    }

    // 2. Ô chân trống, kiểm tra ô đích
    const targetRow = startRow + targetOffset[0];
    const targetCol = startCol + targetOffset[1];

    // Ô đích phải nằm trong biên bàn cờ
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
      // Ô đích có quân đối phương -> Ăn quân
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

// Xuất hàm tương thích CommonJS và các phong cách gọi khác nhau
module.exports = getPseudoLegalMoves;
module.exports.getPseudoLegalMoves = getPseudoLegalMoves;
module.exports.isWithinBoard = isWithinBoard;
module.exports.isFriendlyPiece = isFriendlyPiece;
module.exports.HORSE_MOVES = HORSE_MOVES;
