/**
 * ============================================================================
 * game-ui.js - Quản lý Tương tác Click & Lựa chọn Quân cờ (Selection Management)
 * ============================================================================
 * Nhiệm vụ duy nhất:
 * - Quản lý selectedPosition {row, col} và highlight trực quan trên UI.
 * - Sử dụng Event Delegation trên #chess-board (1 listener duy nhất, chống nhân đôi khi re-init).
 * - Yêu cầu danh sách nước đi hợp lệ từ provider được inject.
 * - Phát ra moveIntent chuẩn { from: {row, col}, to: {row, col} } khi chọn đích.
 * - Tuyệt đối không tự viết luật di chuyển hoặc gọi API trực tiếp.
 *
 * Contract:
 * - onMoveIntent({ from: {row, col}, to: {row, col} })
 * - setCurrentGameState(state)
 * - resetSelection()
 */

import { getSquareElement } from '../ui/boardRenderer.js';

/**
 * Trạng thái vị trí đang được chọn { row: number, col: number } | null
 */
let selectedPosition = null;

/**
 * Danh sách các ô đích hợp lệ của quân đang chọn [{ row, col }]
 */
let validTargets = [];

/**
 * Trạng thái ván đấu hiện tại được inject từ bên ngoài
 */
let currentGameState = null;

/**
 * Callback hoặc hàm xử lý khi phát sinh ý định di chuyển (Move Intent)
 */
let moveIntentHandler = null;

/**
 * Hàm cung cấp danh sách nước đi hợp lệ (Injected Valid Moves Provider)
 */
let validMovesProvider = null;

/**
 * Tham chiếu phần tử container và handler để quản lý chống duplicate listener
 */
let currentBoardContainer = null;
let boundBoardClickHandler = null;

/**
 * Tìm phần tử ô cờ trên DOM theo tọa độ (row, col)
 * @param {number} row 
 * @param {number} col 
 * @returns {HTMLElement|null}
 */
function getSquareDOM(row, col) {
  if (typeof getSquareElement === 'function') {
    const el = getSquareElement(row, col);
    if (el) return el;
  }
  if (typeof window !== 'undefined' && typeof window.getSquareElement === 'function') {
    const el = window.getSquareElement(row, col);
    if (el) return el;
  }
  const root = currentBoardContainer || document;
  return root.querySelector(`.board-square[data-row="${row}"][data-col="${col}"]`);
}

/**
 * Tìm thông tin quân cờ tại tọa độ (row, col)
 * Ưu tiên đọc từ currentGameState.pieces; nếu không có thì đọc metadata từ DOM
 * @param {number} row 
 * @param {number} col 
 * @returns {Object|null}
 */
function getPieceAt(row, col) {
  // 1. Kiểm tra từ currentGameState.pieces
  if (currentGameState && Array.isArray(currentGameState.pieces)) {
    const found = currentGameState.pieces.find(
      p => p && !p.captured && Number(p.row) === row && Number(p.col) === col
    );
    if (found) return found;
  }

  // 2. Fallback: đọc trực tiếp từ phần tử DOM nếu có
  const square = getSquareDOM(row, col);
  if (square) {
    const pieceEl = square.querySelector('.piece');
    if (pieceEl) {
      return {
        id: pieceEl.dataset.id || null,
        type: pieceEl.dataset.pieceType || null,
        color: pieceEl.dataset.color || null,
        row: row,
        col: col
      };
    }
  }

  return null;
}

/**
 * Kiểm tra xem quân cờ tại vị trí có thuộc quyền chọn của người chơi hay không
 * Dựa trên currentGameState (turn, currentTurn, playerColor)
 * @param {Object} piece - Thông tin quân cờ
 * @returns {boolean}
 */
function isPieceSelectable(piece) {
  if (!piece || !piece.color) return false;

  // Nếu không có state được truyền vào, cho phép chọn mặc định
  if (!currentGameState) return true;

  const pieceColor = String(piece.color).trim().toUpperCase();

  // Kiểm tra cờ trạng thái trận đấu (nếu trận đấu đã kết thúc hoặc bị khóa)
  if (currentGameState.isGameOver || currentGameState.gameOver || currentGameState.isInteractive === false) {
    return false;
  }

  // Nếu có chỉ định màu của người chơi hiện tại (ví dụ chế độ online/chơi với AI)
  if (currentGameState.playerColor) {
    const myColor = String(currentGameState.playerColor).trim().toUpperCase();
    if (pieceColor !== myColor) {
      return false;
    }
  }

  // Kiểm tra lượt đi (currentTurn hoặc turn)
  const turn = currentGameState.currentTurn || currentGameState.turn;
  if (turn) {
    const activeTurn = String(turn).trim().toUpperCase();
    if (pieceColor !== activeTurn) {
      return false;
    }
  }

  return true;
}

/**
 * Dọn sạch tất cả các class highlight (chọn ô, chọn quân, ô đích) trên UI
 */
function clearHighlights() {
  const root = currentBoardContainer || document;

  // Dọn highlight ô chọn
  root.querySelectorAll('.square-selected, .selected-square').forEach(el => {
    el.classList.remove('square-selected', 'selected-square');
  });

  // Dọn highlight quân chọn
  root.querySelectorAll('.piece-selected').forEach(el => {
    el.classList.remove('piece-selected');
  });

  // Dọn highlight ô đích hợp lệ
  root.querySelectorAll('.square-target, .valid-target-square, .target-capture').forEach(el => {
    el.classList.remove('square-target', 'valid-target-square', 'target-capture');
  });
}

/**
 * Thêm highlight cho ô và quân được chọn
 * @param {number} row 
 * @param {number} col 
 */
function highlightSelected(row, col) {
  const square = getSquareDOM(row, col);
  if (!square) return;

  square.classList.add('square-selected', 'selected-square');
  const piece = square.querySelector('.piece');
  if (piece) {
    piece.classList.add('piece-selected');
  }
}

/**
 * Thêm highlight cho danh sách các ô đích hợp lệ
 * @param {Array<{row: number, col: number}>} targets 
 */
function highlightValidTargets(targets) {
  if (!Array.isArray(targets)) return;

  targets.forEach(t => {
    const square = getSquareDOM(t.row, t.col);
    if (!square) return;

    square.classList.add('square-target', 'valid-target-square');
    // Nếu ô đích có quân đối phương -> highlight dạng ăn quân (capture)
    const enemyPiece = square.querySelector('.piece');
    if (enemyPiece) {
      square.classList.add('target-capture');
    }
  });
}

/**
 * Chuẩn hóa danh sách nước đi nhận được từ callback/provider
 * @param {any} rawMoves 
 * @returns {Array<{row: number, col: number}>}
 */
function normalizeMoves(rawMoves) {
  if (!Array.isArray(rawMoves)) return [];

  return rawMoves
    .map(m => {
      if (!m) return null;
      if (typeof m.row === 'number' && typeof m.col === 'number') {
        return { row: m.row, col: m.col };
      }
      if (m.to && typeof m.to.row === 'number' && typeof m.to.col === 'number') {
        return { row: m.to.row, col: m.to.col };
      }
      if (Array.isArray(m) && m.length >= 2) {
        return { row: Number(m[0]), col: Number(m[1]) };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Yêu cầu danh sách nước đi hợp lệ từ callback/provider đã inject
 * @param {{row: number, col: number}} fromPos 
 */
function requestValidMoves(fromPos) {
  validTargets = [];

  // 1. Kiểm tra provider được inject riêng
  if (typeof validMovesProvider === 'function') {
    const raw = validMovesProvider(fromPos, currentGameState);
    validTargets = normalizeMoves(raw);
  }
  // 2. Hoặc kiểm tra hàm getValidMoves trong currentGameState
  else if (currentGameState && typeof currentGameState.getValidMoves === 'function') {
    const raw = currentGameState.getValidMoves(fromPos);
    validTargets = normalizeMoves(raw);
  }

  // Cập nhật highlight các ô đích lên UI
  highlightValidTargets(validTargets);
}

/**
 * Phát ra sự kiện moveIntent đến handler đã đăng ký
 * Bảo đảm tiêu chí DoD: Không bao giờ tạo moveIntent thiếu from hoặc to
 * @param {{from: {row: number, col: number}, to: {row: number, col: number}}} move 
 */
function emitMoveIntent(move) {
  if (!move || !move.from || !move.to) {
    console.warn('[game-ui] Từ chối phát moveIntent: thiếu from hoặc to', move);
    return;
  }

  if (
    typeof move.from.row !== 'number' || typeof move.from.col !== 'number' ||
    typeof move.to.row !== 'number' || typeof move.to.col !== 'number'
  ) {
    console.warn('[game-ui] Tọa độ from hoặc to không hợp lệ', move);
    return;
  }

  // 1. Gọi handler nội bộ
  if (typeof moveIntentHandler === 'function') {
    moveIntentHandler(move);
  }

  // 2. Phát CustomEvent trên container bàn cờ để module khác có thể lắng nghe
  if (currentBoardContainer && typeof currentBoardContainer.dispatchEvent === 'function') {
    try {
      const event = new CustomEvent('moveIntent', { detail: move, bubbles: true });
      currentBoardContainer.dispatchEvent(event);
    } catch (e) {
      // Bỏ qua lỗi dispatch nếu trong môi trường test thiếu CustomEvent
    }
  }
}

/**
 * Xử lý sự kiện click trên bàn cờ thông qua Event Delegation
 * @param {MouseEvent} event 
 */
function handleBoardClick(event) {
  // Tìm ô cờ được click
  const squareEl = event.target.closest('.board-square');
  if (!squareEl) {
    // Click ngoài các ô cờ -> dọn selection
    resetSelection();
    return;
  }

  const row = parseInt(squareEl.dataset.row, 10);
  const col = parseInt(squareEl.dataset.col, 10);

  if (isNaN(row) || isNaN(col) || row < 0 || row > 9 || col < 0 || col > 8) {
    resetSelection();
    return;
  }

  const clickedPiece = getPieceAt(row, col);

  // --------------------------------------------------------------------------
  // TRƯỜNG HỢP 1: Chưa có quân nào được chọn (selectedPosition === null)
  // --------------------------------------------------------------------------
  if (!selectedPosition) {
    if (clickedPiece && isPieceSelectable(clickedPiece)) {
      // Chọn quân của mình -> Highlight và yêu cầu nước đi hợp lệ
      selectedPosition = { row, col };
      clearHighlights();
      highlightSelected(row, col);
      requestValidMoves(selectedPosition);
    } else {
      // Click ô trống hoặc quân đối phương khi chưa chọn quân -> Dọn sạch selection
      resetSelection();
    }
    return;
  }

  // --------------------------------------------------------------------------
  // TRƯỜNG HỢP 2: Đã có quân được chọn (selectedPosition !== null)
  // --------------------------------------------------------------------------

  // 2.1. Click lại chính ô đang chọn -> Hủy chọn
  if (selectedPosition.row === row && selectedPosition.col === col) {
    resetSelection();
    return;
  }

  // 2.2. Click vào một quân khác cũng thuộc phe mình -> Chuyển selection sang quân mới
  if (clickedPiece && isPieceSelectable(clickedPiece)) {
    selectedPosition = { row, col };
    clearHighlights();
    highlightSelected(row, col);
    requestValidMoves(selectedPosition);
    return;
  }

  // 2.3. Click vào ô đích (ô trống hoặc quân đối phương)
  // Nếu có provider cung cấp validTargets, kiểm tra ô đích có thuộc validTargets không
  if (validTargets.length > 0) {
    const isValid = validTargets.some(t => t.row === row && t.col === col);
    if (isValid) {
      const move = {
        from: { row: selectedPosition.row, col: selectedPosition.col },
        to: { row, col }
      };
      // Phát moveIntent
      emitMoveIntent(move);
      // Dọn sạch selection sau khi phát moveIntent
      resetSelection();
    } else {
      // Click vào vị trí không hợp lệ -> Dọn selection theo quy tắc rõ ràng
      resetSelection();
    }
  } else {
    // Không có danh sách hạn chế (hoặc luật kiểm tra ở controller/engine)
    // Phát moveIntent gồm from/to
    const move = {
      from: { row: selectedPosition.row, col: selectedPosition.col },
      to: { row, col }
    };
    emitMoveIntent(move);
    resetSelection();
  }
}

// ============================================================================
// CÁC HÀM CONTRACT THEO YÊU CẦU
// ============================================================================

/**
 * Đặt hoặc phát callback onMoveIntent
 * Hỗ trợ 2 kiểu gọi:
 * - onMoveIntent(callbackFn): Đăng ký hàm nhận moveIntent
 * - onMoveIntent({ from, to }): Phát moveIntent đến các listener
 * 
 * @param {Function|Object} arg - Callback hoặc đối tượng move
 */
function onMoveIntent(arg) {
  if (typeof arg === 'function') {
    moveIntentHandler = arg;
    return;
  }

  if (arg && typeof arg === 'object' && arg.from && arg.to) {
    emitMoveIntent(arg);
  }
}

/**
 * Cập nhật trạng thái ván đấu hiện tại và tự động reset selection UI
 * @param {Object} state - Trạng thái ván cờ (currentTurn, pieces, playerColor,...)
 */
function setCurrentGameState(state) {
  currentGameState = state;
  // Tiêu chí hợp đồng: "Tạo resetSelection() và gọi khi state mới được render hoặc move bị từ chối"
  resetSelection();
}

/**
 * Dọn dẹp trạng thái lựa chọn và xóa sạch highlight trên bàn cờ
 */
function resetSelection() {
  selectedPosition = null;
  validTargets = [];
  clearHighlights();
}

/**
 * Đăng ký callback/provider cung cấp nước đi hợp lệ
 * @param {Function} provider - Hàm nhận ({row, col}, state) trả về Array<{row, col}>
 */
function setValidMovesProvider(provider) {
  validMovesProvider = provider;
}

/**
 * Lấy vị trí quân đang được chọn hiện tại
 * @returns {{row: number, col: number}|null}
 */
function getSelectedPosition() {
  return selectedPosition ? { ...selectedPosition } : null;
}

/**
 * Lấy danh sách ô đích hợp lệ hiện tại
 * @returns {Array<{row: number, col: number}>}
 */
function getValidTargets() {
  return [...validTargets];
}

/**
 * Khởi tạo event delegation trên #chess-board
 * Tiêu chí DoD: "Không có listener bị nhân đôi sau khi re-init."
 * @param {HTMLElement|string} container - Phần tử hoặc selector bàn cờ
 */
function initGameUI(container = '#chess-board') {
  // Gỡ bỏ listener cũ nếu đã từng gắn trước đó để tránh nhân đôi
  if (currentBoardContainer && boundBoardClickHandler) {
    currentBoardContainer.removeEventListener('click', boundBoardClickHandler);
    boundBoardClickHandler = null;
  }

  const target = typeof container === 'string' ? document.querySelector(container) : container;
  if (!target) {
    return;
  }

  currentBoardContainer = target;
  boundBoardClickHandler = handleBoardClick;
  currentBoardContainer.addEventListener('click', boundBoardClickHandler);
}

// Tự động khởi tạo khi tài liệu sẵn sàng và có sẵn #chess-board
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initGameUI('#chess-board');
    });
  } else {
    initGameUI('#chess-board');
  }
}

// Export theo chuẩn ES Modules
export {
  onMoveIntent,
  setCurrentGameState,
  resetSelection,
  setValidMovesProvider,
  getSelectedPosition,
  getValidTargets,
  initGameUI
};

// Đăng ký toàn cục cho môi trường không dùng bundler
if (typeof window !== 'undefined') {
  window.gameUI = {
    onMoveIntent,
    setCurrentGameState,
    resetSelection,
    setValidMovesProvider,
    getSelectedPosition,
    getValidTargets,
    initGameUI
  };
  window.onMoveIntent = onMoveIntent;
  window.setCurrentGameState = setCurrentGameState;
  window.resetSelection = resetSelection;
}
