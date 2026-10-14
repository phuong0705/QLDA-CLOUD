/**
 * ============================================================================
 * flyingGeneralValidator.js - Kiểm tra Luật Hai Tướng Đối Mặt (Lộ Mặt Tướng)
 * ============================================================================
 * 
 * Đặc tả:
 * - Trong Cờ Tướng, hai quân Tướng (General) không bao giờ được nhìn thấy nhau
 *   trực tiếp trên cùng một cột mà không có quân cờ nào chắn ở giữa (Flying General).
 * - Cung cấp findGeneral(board, color): Tìm vị trí Tướng của một phe.
 * - Cung cấp isFlyingGeneral(board): Kiểm tra xem hiện tại bàn cờ có đang rơi
 *   vào tình thế hai Tướng đối mặt trực tiếp hay không.
 * - Thuần JavaScript, không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 */

const { COLORS, PIECE_TYPES, normalizeColor } = require('../constants');

/**
 * Tìm quân Tướng của một phe trên bàn cờ
 * @param {Object} board Instance Board
 * @param {'RED'|'BLACK'|string} color
 * @returns {Object|null} Thông tin quân Tướng { id, type, color, row, col } hoặc null
 */
function findGeneral(board, color) {
  if (!board) return null;

  // Nếu Board đã có sẵn method findGeneral
  if (typeof board.findGeneral === 'function') {
    return board.findGeneral(color);
  }

  const targetColor = normalizeColor(color);

  // Duyệt qua bàn cờ để tìm Tướng
  if (typeof board.getPieces === 'function') {
    const pieces = board.getPieces(targetColor);
    const gen = pieces.find(p => p.type === PIECE_TYPES.GENERAL);
    if (gen) return { ...gen };
  }

  // Fallback quét qua grid nếu board là object có grid
  const grid = board.grid || (Array.isArray(board) ? board : null);
  if (grid) {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < (grid[r] ? grid[r].length : 0); c++) {
        const piece = grid[r][c];
        if (piece && piece.type === PIECE_TYPES.GENERAL && normalizeColor(piece.color) === targetColor) {
          return { ...piece, row: r, col: c };
        }
      }
    }
  }

  return null;
}

/**
 * Kiểm tra xem trên bàn cờ hai Tướng có đang nhìn thẳng vào nhau (Flying General) hay không.
 * 
 * Điều kiện đối mặt:
 * 1. Cả hai Tướng Đỏ và Đen cùng tồn tại trên bàn cờ.
 * 2. Cả hai Tướng đứng trên CÙNG MỘT CỘT (col giống nhau).
 * 3. Trên cột đó, giữa hàng của hai Tướng KHÔNG CÓ BẤT KỲ quân cờ nào đứng chắn.
 * 
 * @param {Object} board Instance Board
 * @returns {boolean} true nếu hai Tướng đối mặt trực tiếp, ngược lại false
 */
function isFlyingGeneral(board) {
  if (!board) return false;

  const redGeneral = findGeneral(board, COLORS.RED);
  const blackGeneral = findGeneral(board, COLORS.BLACK);

  // Nếu thiếu một trong hai Tướng (ví dụ thế cờ test tùy biến), không có Flying General
  if (!redGeneral || !blackGeneral) {
    return false;
  }

  // Nếu khác cột thì chắc chắn không thể đối mặt
  if (redGeneral.col !== blackGeneral.col) {
    return false;
  }

  const col = redGeneral.col;
  const minRow = Math.min(redGeneral.row, blackGeneral.row);
  const maxRow = Math.max(redGeneral.row, blackGeneral.row);

  // Đếm các ô nằm giữa 2 Tướng trên cột col
  for (let r = minRow + 1; r < maxRow; r++) {
    const obstacle = typeof board.getPiece === 'function'
      ? board.getPiece(r, col)
      : (board.grid ? board.grid[r][col] : null);

    if (obstacle !== null && obstacle !== undefined) {
      // Có ít nhất 1 quân cờ chắn giữa -> Không bị Flying General
      return false;
    }
  }

  // Không có quân nào chắn giữa 2 Tướng trên cùng 1 cột -> HAI TƯỚNG ĐỐI MẶT!
  return true;
}

module.exports = isFlyingGeneral;
module.exports.isFlyingGeneral = isFlyingGeneral;
module.exports.findGeneral = findGeneral;
