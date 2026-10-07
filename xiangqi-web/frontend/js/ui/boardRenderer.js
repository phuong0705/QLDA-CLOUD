/**
 * ============================================================================
 * boardRenderer.js - Renderer Khung Bàn cờ Cờ Tướng 9x10
 * ============================================================================
 * Nhiệm vụ duy nhất: Dựng cấu trúc DOM bàn cờ Cờ Tướng, tách biệt hoàn toàn
 * giữa khung bàn cờ (lines, river, palaces) và layer quân cờ (pieces).
 * 
 * Contract:
 * - renderBoard(container) -> void
 * - getSquareElement(row, col) -> HTMLElement | null
 */

/**
 * Biến lưu trữ container hiện tại được gán bàn cờ
 * @type {HTMLElement|null}
 */
let currentBoardRoot = null;

/**
 * Tự động đảm bảo CSS board.css được nạp nếu chưa có trong head
 */
function ensureBoardStyles() {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector('link[href*="board.css"]');
  if (!existing) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/board.css';
    document.head.appendChild(link);
  }
}

/**
 * Tạo chuỗi SVG cho các dấu chữ thập định vị (Pháo và Tốt)
 * @param {number} x Tọa độ X tâm giao điểm
 * @param {number} y Tọa độ Y tâm giao điểm
 * @param {boolean} hasLeft Có dấu bên trái không
 * @param {boolean} hasRight Có dấu bên phải không
 * @returns {string} Chuỗi SVG các đường gạch định vị
 */
function generateMarkerSVG(x, y, hasLeft, hasRight) {
  const d = 4;   // Khoảng cách từ tâm đến dấu
  const len = 7; // Độ dài nét gạch
  let paths = '';

  if (hasLeft) {
    // Góc trên-trái
    paths += `<path d="M ${x - d - len} ${y - d} L ${x - d} ${y - d} L ${x - d} ${y - d - len}" class="board-marker-line" />`;
    // Góc dưới-trái
    paths += `<path d="M ${x - d - len} ${y + d} L ${x - d} ${y + d} L ${x - d} ${y + d + len}" class="board-marker-line" />`;
  }

  if (hasRight) {
    // Góc trên-phải
    paths += `<path d="M ${x + d + len} ${y - d} L ${x + d} ${y - d} L ${x + d} ${y - d - len}" class="board-marker-line" />`;
    // Góc dưới-phải
    paths += `<path d="M ${x + d + len} ${y + d} L ${x + d} ${y + d} L ${x + d} ${y + d + len}" class="board-marker-line" />`;
  }

  return paths;
}

/**
 * Sinh cấu trúc SVG đầy đủ cho các đường kẻ, sông và hai cửu cung
 * ViewBox chuẩn: 0 0 720 800 (9 cột x 10 hàng, bước 80px, lề 40px)
 * @returns {string} Mã HTML/SVG hoàn chỉnh của khung bàn cờ
 */
function generateBoardSVG() {
  const cell = 80;
  const padX = 40;
  const padY = 40;
  const totalW = 720;
  const totalH = 800;

  // 1. Viền ngoài
  let svg = `<svg class="board-svg" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
  svg += `<rect x="${padX}" y="${padY}" width="${8 * cell}" height="${9 * cell}" class="board-outer-border" />`;

  // 2. 10 đường kẻ ngang (Hàng 0..9)
  for (let r = 0; r < 10; r++) {
    const y = padY + r * cell;
    svg += `<line x1="${padX}" y1="${y}" x2="${padX + 8 * cell}" y2="${y}" class="board-line" />`;
  }

  // 3. 9 đường kẻ dọc (Cột 0..8)
  for (let c = 0; c < 9; c++) {
    const x = padX + c * cell;
    if (c === 0 || c === 8) {
      // Hai đường biên dọc chạy suốt từ hàng 0 đến hàng 9 (qua sông)
      svg += `<line x1="${x}" y1="${padY}" x2="${x}" y2="${padY + 9 * cell}" class="board-line" />`;
    } else {
      // 7 cột bên trong bị ngắt quãng bởi sông giữa hàng 4 và hàng 5
      const yRiverTop = padY + 4 * cell;
      const yRiverBottom = padY + 5 * cell;
      svg += `<line x1="${x}" y1="${padY}" x2="${x}" y2="${yRiverTop}" class="board-line" />`;
      svg += `<line x1="${x}" y1="${yRiverBottom}" x2="${x}" y2="${padY + 9 * cell}" class="board-line" />`;
    }
  }

  // 4. Vùng sông và Chữ Sở Hà - Hán Giới
  const riverTop = padY + 4 * cell;
  svg += `<rect x="${padX}" y="${riverTop}" width="${8 * cell}" height="${cell}" class="board-river-rect" />`;
  svg += `<text x="200" y="400" class="board-river-label">楚 河</text>`;
  svg += `<text x="520" y="400" class="board-river-label">漢 界</text>`;

  // 5. Hai Cửu Cung (Palaces) - Đường chéo hiển thị rõ nét
  // Cửu cung Đen (hàng 0..2, cột 3..5)
  const xCol3 = padX + 3 * cell;
  const xCol5 = padX + 5 * cell;
  const yRow0 = padY + 0 * cell;
  const yRow2 = padY + 2 * cell;
  svg += `<line x1="${xCol3}" y1="${yRow0}" x2="${xCol5}" y2="${yRow2}" class="board-palace-line" />`;
  svg += `<line x1="${xCol5}" y1="${yRow0}" x2="${xCol3}" y2="${yRow2}" class="board-palace-line" />`;

  // Cửu cung Đỏ (hàng 7..9, cột 3..5)
  const yRow7 = padY + 7 * cell;
  const yRow9 = padY + 9 * cell;
  svg += `<line x1="${xCol3}" y1="${yRow7}" x2="${xCol5}" y2="${yRow9}" class="board-palace-line" />`;
  svg += `<line x1="${xCol5}" y1="${yRow7}" x2="${xCol3}" y2="${yRow9}" class="board-palace-line" />`;

  // 6. Các điểm chữ thập định vị truyền thống (Pháo và Tốt)
  // Pháo Đen: (2, 1) và (2, 7)
  svg += generateMarkerSVG(padX + 1 * cell, padY + 2 * cell, true, true);
  svg += generateMarkerSVG(padX + 7 * cell, padY + 2 * cell, true, true);

  // Tốt Đen: (3, 0), (3, 2), (3, 4), (3, 6), (3, 8)
  svg += generateMarkerSVG(padX + 0 * cell, padY + 3 * cell, false, true);
  svg += generateMarkerSVG(padX + 2 * cell, padY + 3 * cell, true, true);
  svg += generateMarkerSVG(padX + 4 * cell, padY + 3 * cell, true, true);
  svg += generateMarkerSVG(padX + 6 * cell, padY + 3 * cell, true, true);
  svg += generateMarkerSVG(padX + 8 * cell, padY + 3 * cell, true, false);

  // Pháo Đỏ: (7, 1) và (7, 7)
  svg += generateMarkerSVG(padX + 1 * cell, padY + 7 * cell, true, true);
  svg += generateMarkerSVG(padX + 7 * cell, padY + 7 * cell, true, true);

  // Tốt Đỏ: (6, 0), (6, 2), (6, 4), (6, 6), (6, 8)
  svg += generateMarkerSVG(padX + 0 * cell, padY + 6 * cell, false, true);
  svg += generateMarkerSVG(padX + 2 * cell, padY + 6 * cell, true, true);
  svg += generateMarkerSVG(padX + 4 * cell, padY + 6 * cell, true, true);
  svg += generateMarkerSVG(padX + 6 * cell, padY + 6 * cell, true, true);
  svg += generateMarkerSVG(padX + 8 * cell, padY + 6 * cell, true, false);

  svg += `</svg>`;
  return svg;
}

/**
 * Khởi tạo và dựng DOM của bàn cờ Cờ Tướng.
 * Tách biệt thành 3 lớp rõ ràng:
 * 1. Khung bàn cờ (SVG đường kẻ, sông, hai cửu cung).
 * 2. Lưới 90 ô vị trí tương tác (data-row: 0..9, data-col: 0..8).
 * 3. Lớp quân cờ riêng biệt để các tác vụ sau cập nhật quân mà không dựng lại layout.
 *
 * @param {HTMLElement|string} container - Phần tử DOM hoặc chuỗi selector (ví dụ '#chess-board')
 * @returns {void}
 */
function renderBoard(container) {
  // Đảm bảo nạp stylesheet nếu cần
  ensureBoardStyles();

  // Xác định container mục tiêu
  const target = typeof container === 'string' ? document.querySelector(container) : container;
  if (!target) {
    console.warn('[boardRenderer] Không tìm thấy phần tử container bàn cờ:', container);
    return;
  }

  // Tiêu chí nghiệm thu: Dọn sạch nội dung cũ để không bị nhân đôi (ví dụ gọi 2 lần không tạo 180 ô)
  target.innerHTML = '';
  currentBoardRoot = target;

  // Tạo phần tử gốc của bàn cờ
  const boardRoot = document.createElement('div');
  boardRoot.className = 'xiangqi-board-root';
  boardRoot.setAttribute('role', 'region');
  boardRoot.setAttribute('aria-label', 'Bàn cờ Cờ Tướng 9x10');

  // Lớp 1: Khung bàn cờ (Lines, River, Palace Diagonals)
  const frameLayer = document.createElement('div');
  frameLayer.className = 'board-frame-layer';
  frameLayer.innerHTML = generateBoardSVG();
  boardRoot.appendChild(frameLayer);

  // Lớp 2: Lưới 90 vị trí tương tác
  const squaresLayer = document.createElement('div');
  squaresLayer.className = 'board-squares-layer';
  squaresLayer.setAttribute('role', 'grid');
  squaresLayer.setAttribute('aria-label', 'Lưới 90 vị trí trên bàn cờ');

  const fragment = document.createDocumentFragment();

  // Sinh đúng 90 điểm vị trí (hàng 0..9, cột 0..8) theo thuật toán
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const square = document.createElement('div');
      square.className = 'board-square';
      square.dataset.row = String(r);
      square.dataset.col = String(c);
      square.id = `sq-${r}-${c}`;
      square.tabIndex = 0;
      square.setAttribute('role', 'button');
      square.setAttribute('aria-label', `Ô hàng ${r}, cột ${c}`);

      // Định vị chính xác tâm giao điểm theo phần trăm tỷ lệ 720 x 800
      const leftPercent = ((40 + c * 80) / 720) * 100;
      const topPercent = ((40 + r * 80) / 800) * 100;
      square.style.left = `${leftPercent}%`;
      square.style.top = `${topPercent}%`;

      // Phân loại Cửu cung
      const isBlackPalace = r >= 0 && r <= 2 && c >= 3 && c <= 5;
      const isRedPalace = r >= 7 && r <= 9 && c >= 3 && c <= 5;
      if (isBlackPalace || isRedPalace) {
        square.classList.add('is-palace');
        if (isBlackPalace) square.classList.add('palace-black');
        if (isRedPalace) square.classList.add('palace-red');
        if ((r === 1 && c === 4) || (r === 8 && c === 4)) {
          square.classList.add('palace-center');
        }
      }

      // Phân loại Sông
      if (r === 4 || r === 5) {
        square.classList.add('is-river');
        if (r === 4) square.classList.add('river-black-bank');
        if (r === 5) square.classList.add('river-red-bank');
      }

      fragment.appendChild(square);
    }
  }

  squaresLayer.appendChild(fragment);
  boardRoot.appendChild(squaresLayer);

  // Lớp 3: Lớp quân cờ chuyên biệt (được tách riêng để cập nhật quân độc lập)
  const piecesLayer = document.createElement('div');
  piecesLayer.className = 'board-pieces-layer';
  piecesLayer.id = 'board-pieces-layer';
  piecesLayer.setAttribute('aria-label', 'Lớp hiển thị quân cờ');
  boardRoot.appendChild(piecesLayer);

  // Gắn bàn cờ vào container
  target.appendChild(boardRoot);
}

/**
 * Lấy phần tử DOM của ô/điểm giao cắt theo hàng và cột
 * @param {number|string} row - Chỉ số hàng (0..9)
 * @param {number|string} col - Chỉ số cột (0..8)
 * @returns {HTMLElement|null} Phần tử ô tương ứng hoặc null nếu không hợp lệ
 */
function getSquareElement(row, col) {
  const r = Number(row);
  const c = Number(col);

  // Kiểm tra giới hạn hợp lệ của bàn cờ Cờ Tướng 9x10
  if (!Number.isInteger(r) || !Number.isInteger(c)) {
    return null;
  }
  if (r < 0 || r > 9 || c < 0 || c > 8) {
    return null;
  }

  const root = currentBoardRoot || document;
  return root.querySelector(`.board-square[data-row="${r}"][data-col="${c}"]`);
}

// Export theo chuẩn ES Modules
export { renderBoard, getSquareElement };

// Đăng ký toàn cục để tương thích khi gọi từ script không dùng module bundler
if (typeof window !== 'undefined') {
  window.boardRenderer = { renderBoard, getSquareElement };
  window.renderBoard = renderBoard;
  window.getSquareElement = getSquareElement;
}
