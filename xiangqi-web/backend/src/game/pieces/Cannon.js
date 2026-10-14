/**
 * ============================================================================
 * Cannon.js - Luật di chuyển hình học & ngòi pháo cho quân Pháo (炮 / 砲) Cờ Tướng
 * ============================================================================
 * 
 * Đặc tả:
 * - Nhận Board và vị trí quân Pháo hiện tại.
 * - Trả danh sách các nước đi giả định hợp lệ (pseudo-legal moves):
 *   [{ row, col, canCapture, capturedPieceId }].
 * - Tuyệt đối KHÔNG tự thay đổi Board (pure function / immutable).
 * - Pháo di chuyển không ăn quân: Giống hệt quân Xe (đi ngang, dọc các ô trống,
 *   không được nhảy qua bất kỳ quân nào).
 * - Pháo khi ăn quân (Capture): Bắt buộc phải có ĐÚNG MỘT quân nằm giữa Pháo và
 *   mục tiêu (quân làm ngòi / screen). Quân làm ngòi có thể là quân mình hoặc quân địch.
 * - Sau quân làm ngòi, CHỈ quân đầu tiên tiếp theo có thể bị ăn nếu là quân đối phương.
 * - Sau quân làm ngòi, các ô trống không được đi vào.
 * - Không cho phép ăn quân khi không có ngòi (0 screen).
 * - Không cho phép ăn quân khi có từ 2 quân chắn trở lên (>= 2 screens).
 * - Không cho phép ăn quân cùng màu.
 * 
 * Contract:
 * - getPseudoLegalMoves(board, position) -> [{ row, col, canCapture, capturedPieceId }]
 */

const { normalizeColor } = require('../constants');
const {
  isWithinBoard,
  isFriendlyPiece
} = require('./General');

/**
 * 4 hướng đi thẳng của quân Pháo: [drow, dcol]
 */
const CANNON_DIRECTIONS = Object.freeze([
  [-1, 0], // Lên
  [1, 0],  // Xuống
  [0, -1], // Trái
  [0, 1]   // Phải
]);

/**
 * Lấy danh sách nước đi giả định hợp lệ (pseudo-legal) của quân Pháo
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
  const moves = [];

  // Quét theo 4 hướng trực giao
  for (const [drow, dcol] of CANNON_DIRECTIONS) {
    let r = startRow + drow;
    let c = startCol + dcol;
    let hasScreen = false; // Đã gặp quân làm ngòi hay chưa

    while (isWithinBoard(r, c)) {
      const targetPiece = board.getPiece(r, c);

      if (!hasScreen) {
        // GIAI ĐOẠN 1: Chưa gặp quân làm ngòi (Đi như Xe)
        if (!targetPiece) {
          // Ô trống: Đi bình thường không ăn quân
          moves.push({
            row: r,
            col: c,
            canCapture: false,
            capturedPieceId: null
          });
        } else {
          // Gặp quân cản đầu tiên: Quân này trở thành NGÒI
          hasScreen = true;
          // Pháo KHÔNG thể đi vào ô này (không thể ăn quân khi chưa có ngòi)
          // Tiếp tục quét các ô phía sau ngòi để tìm mục tiêu ăn quân
        }
      } else {
        // GIAI ĐOẠN 2: Đã có ngòi phía trước
        if (!targetPiece) {
          // Ô trống phía sau ngòi: Pháo KHÔNG được đáp xuống ô trống
          // Tiếp tục quét tiếp để tìm quân mục tiêu
        } else {
          // Gặp quân đầu tiên phía sau ngòi: Đây là mục tiêu duy nhất có thể ăn
          if (!isFriendlyPiece(targetPiece, myColor)) {
            // Là quân đối phương: Ăn quân thành công!
            moves.push({
              row: r,
              col: c,
              canCapture: true,
              capturedPieceId: targetPiece.id || null
            });
          }
          // Dù là quân địch hay quân mình, DỪNG QUÉT ngay lập tức theo hướng này
          // (Không bao giờ nhảy qua từ 2 quân trở lên)
          break;
        }
      }

      r += drow;
      c += dcol;
    }
  }

  return moves;
}

// Xuất hàm tương thích CommonJS và các helpers tái sử dụng
module.exports = getPseudoLegalMoves;
module.exports.getPseudoLegalMoves = getPseudoLegalMoves;
module.exports.CANNON_DIRECTIONS = CANNON_DIRECTIONS;
