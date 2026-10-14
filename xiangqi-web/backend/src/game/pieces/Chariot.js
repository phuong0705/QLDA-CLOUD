/**
 * ============================================================================
 * Chariot.js - Luật di chuyển hình học & cản vật cho quân Xe (車 / 車)
 * ============================================================================
 * 
 * Đặc tả:
 * - Nhận Board và vị trí quân Xe hiện tại.
 * - Trả danh sách các nước đi giả định hợp lệ (pseudo-legal moves) về mặt
 *   hình học và vật cản: [{ row, col, canCapture, capturedPieceId }].
 * - Tuyệt đối KHÔNG tự thay đổi Board (pure function / immutable).
 * - Xe đi thẳng theo 4 hướng (lên, xuống, trái, phải), không giới hạn số ô.
 * - Không cho phép Xe nhảy qua bất kỳ quân nào (không xuyên quân).
 * - Được ăn quân đối phương đầu tiên trên đường đi rồi dừng lại.
 * - Không cho phép đi vào ô chứa quân cùng màu (quân mình).
 * - Không sinh nước đi ra ngoài bàn cờ (row 0..9, col 0..8).
 * 
 * Contract:
 * - getPseudoLegalMoves(board, piecePosition) -> [{ row, col, canCapture, capturedPieceId }]
 */

const { BOARD_ROWS, BOARD_COLS, normalizeColor } = require('../constants');

/**
 * Kiểm tra xem tọa độ (row, col) có nằm trong phạm vi bàn cờ 10x9 hay không
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function isWithinBoard(row, col) {
  return (
    typeof row === 'number' &&
    typeof col === 'number' &&
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < (BOARD_ROWS || 10) &&
    col >= 0 &&
    col < (BOARD_COLS || 9)
  );
}

/**
 * Kiểm tra xem một quân cờ tại ô đích có phải là đồng minh (cùng màu) hay không
 * @param {Object|null} targetPiece Quân cờ tại ô đích
 * @param {string} currentPieceColor Màu quân cờ đang xét ('RED' hoặc 'BLACK')
 * @returns {boolean}
 */
function isFriendlyPiece(targetPiece, currentPieceColor) {
  if (!targetPiece || !targetPiece.color) return false;
  return normalizeColor(targetPiece.color) === normalizeColor(currentPieceColor);
}

/**
 * 4 hướng đi thẳng của quân Xe: [drow, dcol]
 * - Lên: [-1, 0]
 * - Xuống: [1, 0]
 * - Trái: [0, -1]
 * - Phải: [0, 1]
 */
const CHARIOT_DIRECTIONS = Object.freeze([
  [-1, 0], // Lên
  [1, 0],  // Xuống
  [0, -1], // Trái
  [0, 1]   // Phải
]);

/**
 * Lấy danh sách các nước đi giả định hợp lệ (pseudo-legal) của quân Xe
 * 
 * @param {Object} board Instance Board (cung cấp getPiece(row, col) và isValidPosition)
 * @param {{ row: number, col: number, color?: string }|number} piecePosition Vị trí hiện tại của Xe hoặc row nếu truyền rời
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

  // Quét 4 hướng: Lên, Xuống, Trái, Phải
  for (const [drow, dcol] of CHARIOT_DIRECTIONS) {
    let r = startRow + drow;
    let c = startCol + dcol;

    while (isWithinBoard(r, c)) {
      const targetPiece = board.getPiece(r, c);

      if (!targetPiece) {
        // Ô trống: Xe có thể đi vào và tiếp tục quét tiếp
        moves.push({
          row: r,
          col: c,
          canCapture: false,
          capturedPieceId: null
        });
      } else {
        // Gặp quân cờ cản đường:
        if (!isFriendlyPiece(targetPiece, myColor)) {
          // Là quân đối phương: Ăn được quân này và DỪNG LẠI (không xuyên quân)
          moves.push({
            row: r,
            col: c,
            canCapture: true,
            capturedPieceId: targetPiece.id || null
          });
        }
        // Gặp quân mình hoặc vừa ăn quân địch: DỪNG quét theo hướng này ngay lập tức
        break;
      }

      r += drow;
      c += dcol;
    }
  }

  return moves;
}

// Xuất hàm tương thích CommonJS và các phong cách gọi khác nhau
module.exports = getPseudoLegalMoves;
module.exports.getPseudoLegalMoves = getPseudoLegalMoves;
module.exports.isWithinBoard = isWithinBoard;
module.exports.isFriendlyPiece = isFriendlyPiece;
module.exports.CHARIOT_DIRECTIONS = CHARIOT_DIRECTIONS;
