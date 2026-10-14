/**
 * ============================================================================
 * GameState.js - Quản lý Trạng thái Ván đấu Cờ Tướng thuần JavaScript
 * ============================================================================
 * 
 * Đặc tả:
 * - Chứa board (instance Board 10x9), currentTurn ('RED'|'BLACK'),
 *   status ('WAITING'|'PLAYING'|'CHECK'|'CHECKMATE'|'FINISHED'),
 *   winner ('RED'|'BLACK'|'DRAW'|null), lastMove và metadata cần thiết.
 * - Hỗ trợ clone sâu (deep clone) độc lập hoàn toàn để thuật toán AI
 *   (Minimax, Alpha-Beta) có thể thử các nhánh nước đi mà không làm biến đổi state thật.
 * - Cung cấp serialize() / fromJSON() để phục vụ lưu trữ (persistence)
 *   hoặc truyền qua Socket.IO mà không bị mất dữ liệu.
 * - Hoàn toàn không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 * 
 * Contract bắt buộc:
 * - GameState.prototype.serialize()
 * - GameState.fromJSON(json)
 * - GameState.prototype.clone()
 */

const Board = require('./Board');
const {
  COLORS,
  STATUS,
  normalizeColor
} = require('./constants');

/**
 * Hàm deep clone an toàn cho các đối tượng plain JS
 * @param {*} obj
 * @returns {*}
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  return JSON.parse(JSON.stringify(obj));
}

class GameState {
  /**
   * Khởi tạo trạng thái ván cờ
   * @param {Object} [options={}]
   * @param {Board|Array|Object} [options.board] Instance Board hoặc dữ liệu bàn cờ
   * @param {'RED'|'BLACK'|string} [options.currentTurn=COLORS.RED] Lượt đi hiện tại
   * @param {string} [options.status=STATUS.PLAYING] Trạng thái ván cờ
   * @param {'RED'|'BLACK'|'DRAW'|null} [options.winner=null] Người chiến thắng
   * @param {Object|null} [options.lastMove=null] Nước đi gần nhất { from, to, piece, capturedPiece }
   * @param {Object} [options.metadata={}] Dữ liệu mở rộng (moveCount, history, players, ...)
   */
  constructor(options = {}) {
    // 1. Khởi tạo Bàn cờ (Board)
    if (options.board instanceof Board) {
      this.board = options.board;
    } else if (options.board) {
      this.board = Board.fromJSON(options.board);
    } else {
      this.board = new Board(true);
    }

    // 2. Lượt đi hiện tại (RED đi trước theo luật chuẩn)
    this.currentTurn = normalizeColor(options.currentTurn || COLORS.RED);

    // 3. Trạng thái ván cờ
    const inputStatus = options.status ? String(options.status).trim().toUpperCase() : STATUS.PLAYING;
    this.status = Object.values(STATUS).includes(inputStatus) ? inputStatus : STATUS.PLAYING;

    // 4. Người chiến thắng (nullable)
    if (options.winner) {
      const w = String(options.winner).trim().toUpperCase();
      this.winner = (w === 'RED' || w === 'BLACK' || w === 'DRAW') ? w : null;
    } else {
      this.winner = null;
    }

    // 5. Nước đi gần nhất (lastMove)
    this.lastMove = options.lastMove ? this._cloneMove(options.lastMove) : null;

    // 6. Metadata mở rộng
    if (options.metadata && typeof options.metadata === 'object') {
      this.metadata = deepClone(options.metadata);
      if (this.metadata.moveCount === undefined) {
        this.metadata.moveCount = 0;
      }
      if (!Array.isArray(this.metadata.history)) {
        this.metadata.history = [];
      }
      if (!this.metadata.capturedPieces) {
        this.metadata.capturedPieces = { [COLORS.RED]: [], [COLORS.BLACK]: [] };
      }
    } else {
      this.metadata = {
        moveCount: 0,
        history: [],
        capturedPieces: {
          [COLORS.RED]: [],
          [COLORS.BLACK]: []
        },
        createdAt: Date.now()
      };
    }
  }

  // ==========================================================================
  // Clone nước đi an toàn
  // ==========================================================================

  /**
   * Helper clone một nước đi độc lập
   * @private
   */
  _cloneMove(move) {
    if (!move) return null;
    return {
      from: move.from ? { row: move.from.row, col: move.from.col } : null,
      to: move.to ? { row: move.to.row, col: move.to.col } : null,
      piece: move.piece ? { ...move.piece } : null,
      capturedPiece: move.capturedPiece ? { ...move.capturedPiece } : null
    };
  }

  // ==========================================================================
  // Điều khiển Lượt & Nước đi
  // ==========================================================================

  /**
   * Đổi lượt đi giữa RED và BLACK
   * @returns {'RED'|'BLACK'} Lượt mới
   */
  switchTurn() {
    this.currentTurn = this.currentTurn === COLORS.RED ? COLORS.BLACK : COLORS.RED;
    return this.currentTurn;
  }

  /**
   * Thực hiện nước đi trên GameState.
   * Cập nhật board, lastMove, moveCount, history, capturedPieces và đổi lượt.
   * 
   * @param {{ row: number, col: number }} from Tọa độ xuất phát
   * @param {{ row: number, col: number }} to Tọa độ đích
   * @returns {Object} Kết quả nước đi { movedPiece, capturedPiece, from, to }
   */
  makeMove(from, to) {
    if (this.status === STATUS.FINISHED || this.status === STATUS.CHECKMATE) {
      throw new Error(`Không thể đi nước cờ vì ván đấu đã kết thúc với trạng thái: ${this.status}`);
    }

    // Thực hiện di chuyển trên board
    const moveResult = this.board.movePiece(from, to);

    // Cập nhật lastMove
    this.lastMove = this._cloneMove(moveResult);

    // Cập nhật metadata
    this.metadata.moveCount = (this.metadata.moveCount || 0) + 1;

    // Ghi nhận quân bị ăn nếu có
    if (moveResult.capturedPiece) {
      const captorSide = this.currentTurn;
      if (!this.metadata.capturedPieces) {
        this.metadata.capturedPieces = { [COLORS.RED]: [], [COLORS.BLACK]: [] };
      }
      if (!Array.isArray(this.metadata.capturedPieces[captorSide])) {
        this.metadata.capturedPieces[captorSide] = [];
      }
      this.metadata.capturedPieces[captorSide].push({ ...moveResult.capturedPiece });
    }

    // Lưu vào lịch sử nước đi
    if (!Array.isArray(this.metadata.history)) {
      this.metadata.history = [];
    }
    this.metadata.history.push({
      moveNumber: this.metadata.moveCount,
      side: this.currentTurn,
      from: { row: from.row, col: from.col },
      to: { row: to.row, col: to.col },
      piece: { ...moveResult.movedPiece },
      capturedPiece: moveResult.capturedPiece ? { ...moveResult.capturedPiece } : null,
      timestamp: Date.now()
    });

    // Chuyển lượt đi sang đối thủ
    this.switchTurn();

    return moveResult;
  }

  /**
   * Cập nhật trạng thái ván cờ và người thắng
   * @param {string} newStatus
   * @param {'RED'|'BLACK'|'DRAW'|null} [winner=null]
   */
  setStatus(newStatus, winner = null) {
    const s = String(newStatus).trim().toUpperCase();
    if (Object.values(STATUS).includes(s)) {
      this.status = s;
    } else {
      throw new Error(`Trạng thái không hợp lệ: ${newStatus}`);
    }

    if (winner !== undefined) {
      if (winner === null) {
        this.winner = null;
      } else {
        const w = String(winner).trim().toUpperCase();
        if (w === 'RED' || w === 'BLACK' || w === 'DRAW') {
          this.winner = w;
        } else {
          this.winner = null;
        }
      }
    }
  }

  // ==========================================================================
  // Clone Sâu & Độc Lập Hoàn Toàn (Phục vụ AI)
  // ==========================================================================

  /**
   * Tạo bản sao sâu (deep clone) độc lập hoàn toàn của GameState.
   * Tuyệt đối không dùng chung reference Board, mảng grid, object quân cờ,
   * lastMove hoặc metadata với bản gốc.
   * 
   * Cho phép thuật toán AI (Minimax, Alpha-Beta) thử các nước đi trên bản clone
   * mà không làm biến đổi state thật của ván cờ.
   * 
   * @returns {GameState} Instance GameState mới độc lập
   */
  clone() {
    return new GameState({
      board: this.board.clone(),
      currentTurn: this.currentTurn,
      status: this.status,
      winner: this.winner,
      lastMove: this.lastMove ? this._cloneMove(this.lastMove) : null,
      metadata: deepClone(this.metadata)
    });
  }

  // ==========================================================================
  // Serialization & Deserialization
  // ==========================================================================

  /**
   * Chuyển đổi toàn bộ trạng thái GameState thành Plain JavaScript Object
   * an toàn để truyền qua Socket.IO hoặc lưu vào cơ sở dữ liệu.
   * 
   * @returns {{
   *   board: Array<Array<Object|null>>,
   *   currentTurn: string,
   *   status: string,
   *   winner: string|null,
   *   lastMove: Object|null,
   *   metadata: Object
   * }}
   */
  serialize() {
    return {
      board: this.board.serialize(),
      currentTurn: this.currentTurn,
      status: this.status,
      winner: this.winner,
      lastMove: this.lastMove ? this._cloneMove(this.lastMove) : null,
      metadata: deepClone(this.metadata)
    };
  }

  /**
   * toJSON() tự động được gọi khi thực hiện JSON.stringify(gameState)
   * @returns {Object}
   */
  toJSON() {
    return this.serialize();
  }

  /**
   * Khôi phục GameState từ dữ liệu serialized (object hoặc chuỗi JSON).
   * 
   * @param {Object|string} json
   * @returns {GameState}
   */
  static fromJSON(json) {
    if (!json) {
      return new GameState();
    }

    let data = json;
    if (typeof json === 'string') {
      try {
        data = JSON.parse(json);
      } catch (err) {
        throw new Error(`Dữ liệu JSON không hợp lệ khi parse GameState: ${err.message}`);
      }
    }

    if (!data || typeof data !== 'object') {
      throw new TypeError('Dữ liệu GameState.fromJSON phải là một đối tượng hoặc chuỗi JSON hợp lệ');
    }

    const restoredBoard = data.board ? Board.fromJSON(data.board) : new Board(true);

    return new GameState({
      board: restoredBoard,
      currentTurn: data.currentTurn || COLORS.RED,
      status: data.status || STATUS.PLAYING,
      winner: data.winner || null,
      lastMove: data.lastMove || null,
      metadata: data.metadata || {}
    });
  }
}

// Xuất module tương thích Node.js CommonJS
module.exports = GameState;
GameState.GameState = GameState;
GameState.createInitialState = () => new GameState();
