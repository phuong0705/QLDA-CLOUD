/**
 * ============================================================================
 * pieceRenderer.js - Renderer Quân cờ Cờ Tướng (Xiangqi Pieces)
 * ============================================================================
 * Nhiệm vụ duy nhất: Dựng và cập nhật hiển thị các quân cờ dựa trên boardState.
 * Không chứa bất kỳ logic luật di chuyển nào.
 *
 * Contract:
 * - boardState.pieces = [{ id, type, color, row, col, captured? }]
 * - renderPieces(boardState) -> void
 */

import { getSquareElement } from './boardRenderer.js';

/**
 * Bảng ký tự chữ Hán truyền thống chuẩn cho từng loại quân và từng phe
 * Tuyệt đối không chứa bất kỳ luật di chuyển nào.
 */
const PIECE_SYMBOLS = {
  RED: {
    general: '帥',
    king: '帥',
    advisor: '仕',
    guard: '仕',
    elephant: '相',
    bishop: '相',
    chariot: '俥',
    rook: '俥',
    horse: '傌',
    knight: '傌',
    cannon: '炮',
    soldier: '兵',
    pawn: '兵'
  },
  BLACK: {
    general: '將',
    king: '將',
    advisor: '士',
    guard: '士',
    elephant: '象',
    bishop: '象',
    chariot: '車',
    rook: '車',
    horse: '馬',
    knight: '馬',
    cannon: '砲',
    soldier: '卒',
    pawn: '卒'
  }
};

/**
 * Tự động đảm bảo stylesheet pieces.css được nạp vào head nếu chưa có
 */
function ensurePieceStyles() {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector('link[href*="pieces.css"]');
  if (!existing) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/pieces.css';
    document.head.appendChild(link);
  }
}

/**
 * Chuẩn hóa loại quân về chuỗi viết thường không dấu
 * @param {string} type - Tên loại quân (vd: 'General', 'chariot', 'k', 'r')
 * @returns {string} Loại quân chuẩn hóa (general, advisor, elephant, chariot, horse, cannon, soldier)
 */
function normalizeType(type) {
  if (!type) return 'soldier';
  const t = String(type).trim().toLowerCase();
  switch (t) {
    case 'g':
    case 'k':
    case 'king':
    case 'general':
      return 'general';
    case 'a':
    case 's_advisor':
    case 'guard':
    case 'advisor':
      return 'advisor';
    case 'e':
    case 'b':
    case 'bishop':
    case 'elephant':
      return 'elephant';
    case 'r':
    case 'chariot':
    case 'rook':
      return 'chariot';
    case 'h':
    case 'n':
    case 'horse':
    case 'knight':
      return 'horse';
    case 'c':
    case 'cannon':
      return 'cannon';
    case 's':
    case 'p':
    case 'soldier':
    case 'pawn':
      return 'soldier';
    default:
      return t;
  }
}

/**
 * Chuẩn hóa phe/màu cờ về 'RED' hoặc 'BLACK'
 * @param {string} color - Tên màu (vd: 'red', 'RED', 'black', 'BLACK')
 * @returns {'RED'|'BLACK'} Màu chuẩn hóa
 */
function normalizeColor(color) {
  if (!color) return 'RED';
  const c = String(color).trim().toUpperCase();
  if (c === 'RED' || c === 'R' || c === 'DO' || c === 'ĐỎ') return 'RED';
  if (c === 'BLACK' || c === 'B' || c === 'DEN' || c === 'ĐEN') return 'BLACK';
  return c;
}

/**
 * Lấy ký tự chữ Hán hiển thị tương ứng với loại quân và màu
 * @param {string} type - Loại quân
 * @param {string} color - Màu quân (RED/BLACK)
 * @returns {string} Ký tự chữ Hán (vd: 帥, 將, 兵, 卒)
 */
function getPieceSymbol(type, color) {
  const normType = normalizeType(type);
  const normColor = normalizeColor(color);
  const colorMap = PIECE_SYMBOLS[normColor] || PIECE_SYMBOLS.RED;
  return colorMap[normType] || (normColor === 'RED' ? '兵' : '卒');
}

/**
 * Tìm phần tử ô cờ tương ứng với tọa độ (row, col)
 * Sử dụng getSquareElement từ boardRenderer hoặc query trực tiếp DOM
 * @param {number} row - Chỉ số hàng (0..9)
 * @param {number} col - Chỉ số cột (0..8)
 * @returns {HTMLElement|null}
 */
function findSquareElement(row, col) {
  if (typeof getSquareElement === 'function') {
    const sq = getSquareElement(row, col);
    if (sq) return sq;
  }
  if (typeof window !== 'undefined' && typeof window.getSquareElement === 'function') {
    const sq = window.getSquareElement(row, col);
    if (sq) return sq;
  }
  if (typeof document !== 'undefined') {
    return document.querySelector(`.board-square[data-row="${row}"][data-col="${col}"]`);
  }
  return null;
}

/**
 * Dọn sạch toàn bộ quân cờ hiện có trên bàn cờ
 */
function clearExistingPieces() {
  if (typeof document === 'undefined') return;
  const existingPieces = document.querySelectorAll('.piece');
  existingPieces.forEach(p => p.remove());
}

/**
 * Render hoặc cập nhật hiển thị quân cờ dựa trên boardState
 * 
 * @param {Object} boardState - Trạng thái bàn cờ chứa danh sách pieces
 * @param {Array<Object>} boardState.pieces - Danh sách quân cờ [{ id, type, color, row, col, captured }]
 * @returns {void}
 */
function renderPieces(boardState) {
  ensurePieceStyles();

  // 1. Kiểm tra an toàn: Xử lý boardState null hoặc undefined
  if (!boardState) {
    console.warn('[pieceRenderer] Cảnh báo: boardState là null hoặc undefined. Đã dọn sạch quân trên bàn cờ.');
    clearExistingPieces();
    return;
  }

  // 2. Kiểm tra an toàn: Xử lý thuộc tính pieces không tồn tại hoặc không phải mảng
  if (!boardState.pieces || !Array.isArray(boardState.pieces)) {
    console.warn('[pieceRenderer] Cảnh báo: boardState.pieces không tồn tại hoặc không phải là một mảng hợp lệ. Đã dọn sạch quân cờ.');
    clearExistingPieces();
    return;
  }

  // 3. Dọn sạch quân cờ cũ để tránh tình trạng nhân đôi (duplicate) khi render nhiều lần
  clearExistingPieces();

  // Nếu danh sách rỗng (boardState trống), kết thúc xử lý an toàn
  if (boardState.pieces.length === 0) {
    return;
  }

  // 4. Duyệt qua từng quân cờ và render lên đúng vị trí ô tương ứng
  for (const piece of boardState.pieces) {
    if (!piece) continue;

    // Tiêu chí nghiệm thu: Bỏ qua quân đã bị ăn (captured === true)
    if (piece.captured === true) {
      continue;
    }

    const row = Number(piece.row);
    const col = Number(piece.col);

    // Kiểm tra tính hợp lệ của tọa độ bàn cờ Cờ Tướng 9x10
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 9 || col < 0 || col > 8) {
      console.warn(`[pieceRenderer] Bỏ qua quân có tọa độ không hợp lệ: row=${piece.row}, col=${piece.col}`, piece);
      continue;
    }

    // Tìm phần tử ô vị trí được tạo bởi boardRenderer
    const square = findSquareElement(row, col);
    if (!square) {
      console.warn(`[pieceRenderer] Không tìm thấy ô tại vị trí (${row}, ${col}) trên DOM.`);
      continue;
    }

    // Chuẩn hóa loại và màu
    const normType = normalizeType(piece.type);
    const normColor = normalizeColor(piece.color);
    const colorLower = normColor.toLowerCase(); // 'red' hoặc 'black'
    const symbol = getPieceSymbol(normType, normColor);

    // Tạo phần tử DOM cho quân cờ
    const pieceEl = document.createElement('div');
    pieceEl.className = `piece piece-${colorLower} ${colorLower} piece-${normType}`;

    // Metadata bắt buộc để module click và test có thể đọc
    pieceEl.dataset.pieceType = normType;
    pieceEl.dataset.color = normColor;
    pieceEl.dataset.row = String(row);
    pieceEl.dataset.col = String(col);
    if (piece.id != null) {
      pieceEl.dataset.id = String(piece.id);
      pieceEl.id = `piece-${piece.id}`;
    }

    // Trợ năng và khả năng nhận tương tác bàn phím
    pieceEl.setAttribute('role', 'button');
    pieceEl.tabIndex = 0;
    pieceEl.setAttribute('aria-label', `Quân ${normColor} ${normType} tại hàng ${row}, cột ${col}`);

    // Nội dung ký tự hiển thị (chữ Hán truyền thống)
    const innerCircle = document.createElement('div');
    innerCircle.className = 'piece-inner';

    const charSpan = document.createElement('span');
    charSpan.className = 'piece-symbol';
    charSpan.textContent = symbol;

    innerCircle.appendChild(charSpan);
    pieceEl.appendChild(innerCircle);

    // Gắn quân cờ trực tiếp vào phần tử ô vị trí (.board-square).
    // Nhờ cơ chế event bubbling của DOM, click vào quân cờ vẫn kích hoạt click vào ô vị trí.
    square.appendChild(pieceEl);
  }
}

// Export theo chuẩn ES Modules
export { renderPieces, PIECE_SYMBOLS, getPieceSymbol };

// Đăng ký toàn cục để tương thích khi gọi từ script không dùng module bundler
if (typeof window !== 'undefined') {
  window.pieceRenderer = { renderPieces, PIECE_SYMBOLS, getPieceSymbol };
  window.renderPieces = renderPieces;
  window.PIECE_SYMBOLS = PIECE_SYMBOLS;
}
