/**
 * ============================================================================
 * Board.js - Mô hình Bàn cờ Cờ Tướng 10 hàng x 9 cột thuần JavaScript
 * ============================================================================
 * 
 * Đặc tả:
 * - Đại diện bàn cờ Cờ Tướng 10 hàng (row: 0..9) x 9 cột (col: 0..8).
 * - Lưu quân theo cấu trúc nhất quán: { id, type, color, row, col }.
 * - Validate nghiêm ngặt tọa độ row 0..9, col 0..8.
 * - Hỗ trợ clone sâu (deep clone) hoàn toàn độc lập, không dùng chung mảng hay
 *   reference object với bản gốc. Phục vụ AI thử nước đi (Minimax, Alpha-Beta).
 * - Hoàn toàn không phụ thuộc Express, SQL, Socket.IO, DOM.
 * 
 * Contract bắt buộc:
 * - Board.getPiece(row, col)
 * - Board.movePiece(from, to)
 * - Board.clone()
 * - Board.prototype.serialize()
 * - Board.fromJSON(json)
 */

const {
  BOARD_ROWS,
  BOARD_COLS,
  COLORS,
  PIECE_TYPES,
  INITIAL_PIECES_SETUP,
  normalizeColor,
  normalizePieceType,
  isValidCoordinate
} = require('./constants');

class Board {
  /**
   * Khởi tạo bàn cờ 10 hàng x 9 cột
   * @param {boolean} [setupInitial=true] Có đặt sẵn 32 quân theo bố cục ban đầu hay không
   */
  constructor(setupInitial = true) {
    this.rows = BOARD_ROWS;
    this.cols = BOARD_COLS;
    this.grid = Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));

    if (setupInitial) {
      this.setupInitialPosition();
    }
  }

  // ==========================================================================
  // Validation Tọa độ (row 0..9, col 0..8)
  // ==========================================================================

  /**
   * Kiểm tra tọa độ ô có hợp lệ trên bàn cờ 10x9 hay không
   * @param {number} row Hàng (0..9)
   * @param {number} col Cột (0..8)
   * @returns {boolean}
   */
  static isValidPosition(row, col) {
    return isValidCoordinate(row, col);
  }

  /**
   * Kiểm tra tọa độ ô (instance method)
   * @param {number} row Hàng (0..9)
   * @param {number} col Cột (0..8)
   * @returns {boolean}
   */
  isValidPosition(row, col) {
    return Board.isValidPosition(row, col);
  }

  /**
   * Validate tọa độ row và col. Ném RangeError nếu vượt biên hoặc sai kiểu.
   * @param {number} row
   * @param {number} col
   * @throws {RangeError|TypeError}
   */
  validateCoordinate(row, col) {
    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isInteger(row) || !Number.isInteger(col)) {
      throw new TypeError(`Tọa độ phải là số nguyên: row=${row}, col=${col}`);
    }
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new RangeError(
        `Tọa độ ngoài biên bàn cờ 10x9: (row=${row}, col=${col}). Yêu cầu row thuộc [0..${this.rows - 1}] và col thuộc [0..${this.cols - 1}].`
      );
    }
  }

  /**
   * Validate một đối tượng tọa độ { row, col }
   * @param {{ row: number, col: number }} pos
   * @param {string} [name='vị trí']
   */
  validateCoordinateObject(pos, name = 'vị trí') {
    if (!pos || typeof pos !== 'object') {
      throw new TypeError(`Đối tượng ${name} không hợp lệ, yêu cầu { row, col }`);
    }
    this.validateCoordinate(pos.row, pos.col);
  }

  // ==========================================================================
  // Thao tác với quân cờ
  // ==========================================================================

  /**
   * Lấy quân cờ tại tọa độ (row, col)
   * @param {number} row Hàng (0..9)
   * @param {number} col Cột (0..8)
   * @returns {Object|null} Thông tin quân cờ hoặc null nếu ô trống
   * @throws {RangeError|TypeError} Nếu tọa độ ngoài biên 0..9, 0..8
   */
  getPiece(row, col) {
    this.validateCoordinate(row, col);
    return this.grid[row][col];
  }

  /**
   * Đặt quân cờ vào tọa độ (row, col)
   * @param {number} row Hàng (0..9)
   * @param {number} col Cột (0..8)
   * @param {Object|null} piece Quân cờ cần đặt, hoặc null để làm trống ô
   * @returns {Object|null} Quân cờ vừa được đặt
   * @throws {RangeError|TypeError} Nếu tọa độ ngoài biên
   */
  setPiece(row, col, piece) {
    this.validateCoordinate(row, col);

    if (piece === null || piece === undefined) {
      this.grid[row][col] = null;
      return null;
    }

    if (typeof piece !== 'object') {
      throw new TypeError('Quân cờ phải là một đối tượng hoặc null');
    }

    const color = normalizeColor(piece.color);
    const type = normalizePieceType(piece.type);
    const id = piece.id || `${color.toLowerCase()}_${type}_${row}_${col}`;

    const standardizedPiece = {
      id: String(id),
      type,
      color,
      row,
      col
    };

    this.grid[row][col] = standardizedPiece;
    return standardizedPiece;
  }

  /**
   * Gỡ bỏ quân cờ khỏi tọa độ (row, col)
   * @param {number} row Hàng (0..9)
   * @param {number} col Cột (0..8)
   * @returns {Object|null} Quân cờ bị xóa, hoặc null nếu ô vốn dĩ trống
   * @throws {RangeError|TypeError} Nếu tọa độ ngoài biên
   */
  removePiece(row, col) {
    this.validateCoordinate(row, col);
    const existing = this.grid[row][col];
    this.grid[row][col] = null;
    return existing;
  }

  /**
   * Di chuyển quân cờ từ vị trí `from` đến vị trí `to`
   * Cập nhật vị trí trên grid và đồng bộ { row, col } bên trong object quân cờ.
   * 
   * @param {{ row: number, col: number }} from Tọa độ xuất phát
   * @param {{ row: number, col: number }} to Tọa độ đích
   * @returns {{
   *   movedPiece: Object,
   *   capturedPiece: Object|null,
   *   from: { row: number, col: number },
   *   to: { row: number, col: number }
   * }} Chi tiết kết quả nước đi
   * @throws {RangeError|TypeError|Error} Nếu tọa độ ngoài biên hoặc ô from không có quân
   */
  movePiece(from, to) {
    this.validateCoordinateObject(from, 'from');
    this.validateCoordinateObject(to, 'to');

    const sourcePiece = this.grid[from.row][from.col];
    if (!sourcePiece) {
      throw new Error(`Không có quân cờ nào tại vị trí xuất phát (${from.row}, ${from.col})`);
    }

    const capturedPiece = this.grid[to.row][to.col];

    // Tạo bản copy mới của quân cờ với tọa độ mới
    const movedPiece = {
      ...sourcePiece,
      row: to.row,
      col: to.col
    };

    this.grid[to.row][to.col] = movedPiece;
    this.grid[from.row][from.col] = null;

    return {
      movedPiece: { ...movedPiece },
      capturedPiece: capturedPiece ? { ...capturedPiece } : null,
      from: { row: from.row, col: from.col },
      to: { row: to.row, col: to.col }
    };
  }

  /**
   * Lấy danh sách toàn bộ các quân cờ đang có trên bàn cờ.
   * Có thể lọc theo màu RED hoặc BLACK.
   * 
   * @param {string} [color=null] 'RED' | 'BLACK' hoặc null để lấy tất cả
   * @returns {Array<Object>} Mảng các quân cờ
   */
  getPieces(color = null) {
    const filterColor = color ? normalizeColor(color) : null;
    const pieces = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const piece = this.grid[r][c];
        if (piece !== null) {
          if (!filterColor || piece.color === filterColor) {
            pieces.push({ ...piece });
          }
        }
      }
    }

    return pieces;
  }

  /**
   * Kiểm tra xem một ô có trống (không có quân) hay không
   * @param {number} row
   * @param {number} col
   * @returns {boolean}
   */
  isEmpty(row, col) {
    this.validateCoordinate(row, col);
    return this.grid[row][col] === null;
  }

  /**
   * Tìm vị trí quân Tướng (General) của một phe
   * @param {'RED'|'BLACK'|string} color
   * @returns {Object|null} Quân Tướng hoặc null nếu không tìm thấy
   */
  findGeneral(color) {
    const targetColor = normalizeColor(color);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const piece = this.grid[r][c];
        if (piece && piece.type === PIECE_TYPES.GENERAL && piece.color === targetColor) {
          return { ...piece };
        }
      }
    }
    return null;
  }

  /**
   * Xóa toàn bộ quân cờ trên bàn
   */
  clear() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c] = null;
      }
    }
  }

  /**
   * Thiết lập 32 quân cờ về vị trí ban đầu chuẩn Cờ Tướng
   */
  setupInitialPosition() {
    this.clear();
    for (const p of INITIAL_PIECES_SETUP) {
      this.grid[p.row][p.col] = {
        id: p.id,
        type: p.type,
        color: p.color,
        row: p.row,
        col: p.col
      };
    }
  }

  // ==========================================================================
  // Clone Sâu & Serialization (Không chia sẻ reference)
  // ==========================================================================

  /**
   * Tạo bản sao sâu (deep clone) hoàn toàn độc lập của Board.
   * Tạo mảng grid 10x9 mới và clone từng object quân cờ.
   * Bất kỳ thay đổi nào trên bản clone KHÔNG làm biến đổi bản gốc.
   * 
   * @returns {Board} Instance Board mới độc lập
   */
  clone() {
    const cloned = new Board(false);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const piece = this.grid[r][c];
        if (piece !== null) {
          cloned.grid[r][c] = {
            id: piece.id,
            type: piece.type,
            color: piece.color,
            row: piece.row,
            col: piece.col
          };
        } else {
          cloned.grid[r][c] = null;
        }
      }
    }

    return cloned;
  }

  /**
   * Serialize dữ liệu bàn cờ thành mảng 2 chiều JSON-friendly
   * @returns {Array<Array<Object|null>>}
   */
  serialize() {
    return this.grid.map(row =>
      row.map(cell => (cell ? { ...cell } : null))
    );
  }

  /**
   * Phương thức toJSON tự động được gọi bởi JSON.stringify
   * @returns {Array<Array<Object|null>>}
   */
  toJSON() {
    return this.serialize();
  }

  /**
   * Khôi phục Board từ dữ liệu serialized (mảng 2 chiều 10x9 hoặc chuỗi JSON)
   * @param {Array<Array<Object|null>>|string|Object} json
   * @returns {Board} Instance Board đã khôi phục
   */
  static fromJSON(json) {
    if (!json) {
      return new Board(false);
    }

    let data = json;
    if (typeof json === 'string') {
      try {
        data = JSON.parse(json);
      } catch (err) {
        throw new Error(`Dữ liệu JSON không hợp lệ khi parse Board: ${err.message}`);
      }
    }

    // Nếu dữ liệu được bọc trong object { grid: [...] } hoặc { board: [...] }
    const gridData = Array.isArray(data) ? data : (data.grid || data.board);
    if (!Array.isArray(gridData)) {
      throw new TypeError('Dữ liệu Board.fromJSON phải là mảng 2 chiều hoặc đối tượng chứa grid');
    }

    const board = new Board(false);

    for (let r = 0; r < Math.min(gridData.length, BOARD_ROWS); r++) {
      const rowData = gridData[r];
      if (!Array.isArray(rowData)) continue;

      for (let c = 0; c < Math.min(rowData.length, BOARD_COLS); c++) {
        const cell = rowData[c];
        if (cell && typeof cell === 'object') {
          board.grid[r][c] = {
            id: cell.id || `${normalizeColor(cell.color).toLowerCase()}_${normalizePieceType(cell.type)}_${r}_${c}`,
            type: normalizePieceType(cell.type),
            color: normalizeColor(cell.color),
            row: r,
            col: c
          };
        } else {
          board.grid[r][c] = null;
        }
      }
    }

    return board;
  }
}

// Xuất module tương thích Node.js CommonJS
module.exports = Board;
Board.Board = Board;
Board.createInitialBoard = () => new Board(true);
Board.createEmptyBoard = () => new Board(false);
