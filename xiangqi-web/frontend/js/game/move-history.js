/**
 * ============================================================================
 * move-history.js - Renderer Bảng Lịch Sử Nước Đi Cờ Tướng (Xiangqi Move History)
 * ============================================================================
 * Nhiệm vụ duy nhất:
 * - Nhận mảng move chuẩn và hiển thị theo số thứ tự moveNumber.
 * - Hiển thị chi tiết quân cờ, màu (Đỏ/Đen), tọa độ from -> to, và thời điểm (timestamp) nếu có.
 * - Hiển thị empty state thân thiện khi chưa có nước đi, không để vùng trắng.
 * - Tự động cuộn mượt (smooth scroll) xuống cuối khi có nước đi mới, không giật layout.
 * - Tuyệt đối không tự tính luật di chuyển của quân cờ.
 * 
 * Contract bắt buộc:
 * - renderMoveHistory(moves)
 * - appendMove(move)
 */

/**
 * Bảng ánh xạ ký tự chữ Hán chuẩn cho từng loại quân cờ
 */
const PIECE_SYMBOLS = {
  RED: {
    general: '帥', king: '帥', tuong: '帥', 'tướng': '帥',
    advisor: '仕', guard: '仕', si: '仕', 'sĩ': '仕',
    elephant: '相', bishop: '相', tuong_voi: '相', 'tượng': '相',
    chariot: '俥', rook: '俥', xe: '俥',
    horse: '傌', knight: '傌', ma: '傌', 'mã': '傌',
    cannon: '炮', phao: '炮', 'pháo': '炮',
    soldier: '兵', pawn: '兵', tot: '兵', 'tốt': '兵', binh: '兵'
  },
  BLACK: {
    general: '將', king: '將', tuong: '將', 'tướng': '將',
    advisor: '士', guard: '士', si: '士', 'sĩ': '士',
    elephant: '象', bishop: '象', tuong_voi: '象', 'tượng': '象',
    chariot: '車', rook: '車', xe: '車',
    horse: '馬', knight: '馬', ma: '馬', 'mã': '馬',
    cannon: '砲', phao: '砲', 'pháo': '砲',
    soldier: '卒', pawn: '卒', tot: '卒', 'tốt': '卒'
  }
};

/**
 * Bộ ký tự chữ Hán gốc Cờ Tướng để nhận diện trực tiếp
 */
const CHINESE_PIECE_CHARS = new Set([
  '帥', '仕', '相', '俥', '傌', '炮', '兵',
  '將', '士', '象', '車', '馬', '砲', '卒'
]);

/**
 * Danh sách nước đi đang lưu trữ nội bộ
 */
let currentMoves = [];

/**
 * Đảm bảo file css history.css và responsive.css được nạp vào tài liệu
 */
function ensureStyles() {
  if (typeof document === 'undefined') return;

  if (!document.querySelector('link[href*="history.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/history.css';
    document.head.appendChild(link);
  }

  if (!document.querySelector('link[href*="responsive.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/responsive.css';
    document.head.appendChild(link);
  }
}

/**
 * Thoát các ký tự HTML an toàn
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Xác định ký hiệu hiển thị cho quân cờ
 * @param {string|object} piece
 * @param {"RED"|"BLACK"} color
 * @returns {string}
 */
function resolvePieceSymbol(piece, color) {
  if (!piece) return '?';

  let raw = '';
  if (typeof piece === 'object') {
    raw = piece.symbol || piece.name || piece.type || '';
  } else {
    raw = String(piece).trim();
  }

  if (!raw) return '?';

  // Nếu đã là chữ Hán cờ tướng chuẩn
  if (CHINESE_PIECE_CHARS.has(raw)) {
    return raw;
  }

  const normalizedKey = raw.toLowerCase().replace(/[^a-z0-9_à-ỹ]/g, '');
  const sideDict = PIECE_SYMBOLS[color] || PIECE_SYMBOLS.RED;

  if (sideDict[normalizedKey]) {
    return sideDict[normalizedKey];
  }

  // Tra cứu chéo nếu color chưa đúng
  const otherDict = color === 'RED' ? PIECE_SYMBOLS.BLACK : PIECE_SYMBOLS.RED;
  if (otherDict[normalizedKey]) {
    return otherDict[normalizedKey];
  }

  return raw.slice(0, 2);
}

/**
 * Định dạng tọa độ {row, col} hoặc mảng [row, col]
 * @param {object|array|string} pos
 * @returns {string}
 */
function formatCoordinates(pos) {
  if (!pos) return '?';

  if (typeof pos === 'object') {
    if (typeof pos.row === 'number' && typeof pos.col === 'number') {
      return `(${pos.row},${pos.col})`;
    }
    if (Array.isArray(pos) && pos.length >= 2) {
      return `(${pos[0]},${pos[1]})`;
    }
  }

  return String(pos);
}

/**
 * Định dạng thời điểm thực hiện nước đi
 * @param {string|number|Date} time
 * @returns {string}
 */
function formatTimestamp(time) {
  if (time === null || time === undefined || time === '') return '';

  if (typeof time === 'string') {
    return time;
  }

  if (time instanceof Date) {
    return time.toTimeString().slice(0, 8);
  }

  if (typeof time === 'number') {
    if (time > 1000000000000) {
      const d = new Date(time);
      return d.toTimeString().slice(0, 8);
    }
    // Nếu là số giây trôi qua
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return '';
}

/**
 * Dựng mã HTML cho 1 ô nước đi trong bảng
 * @param {object|null} move - Đối tượng nước đi
 * @param {"RED"|"BLACK"} defaultColor - Màu mặc định
 * @returns {string}
 */
function buildMoveCellHtml(move, defaultColor) {
  if (!move) {
    return '<span class="move-empty">-</span>';
  }

  const color = String(move.color || defaultColor || 'RED').toUpperCase();
  const symbol = resolvePieceSymbol(move.piece || move.pieceType, color);
  const fromStr = formatCoordinates(move.from);
  const toStr = formatCoordinates(move.to);
  const timeStr = formatTimestamp(move.timestamp || move.time);

  const notationStr = move.notation
    ? `<span class="move-notation">${escapeHtml(move.notation)}</span>`
    : '';
  const timeHtml = timeStr
    ? `<span class="move-time">${escapeHtml(timeStr)}</span>`
    : '';

  const badgeClass = color === 'RED' ? 'piece-badge-red' : 'piece-badge-black';
  const colorLabel = color === 'RED' ? 'Quân Đỏ' : 'Quân Đen';

  return `
    <div class="move-cell">
      <span class="move-piece-badge ${badgeClass}" title="${colorLabel}: ${symbol}">${symbol}</span>
      <span class="move-coords">${escapeHtml(fromStr)} → ${escapeHtml(toStr)}</span>
      ${notationStr}
      ${timeHtml}
    </div>
  `;
}

/**
 * Cập nhật số lượng nước đi trên badge tiêu đề
 * @param {number} count
 */
function updateBadge(count) {
  const badge = document.querySelector('.sidebar-card[aria-labelledby="history-heading"] .panel-badge') ||
    document.querySelector('#history-heading + .panel-badge') ||
    document.querySelector('.panel-badge');

  if (badge) {
    badge.textContent = `${count} nước`;
  }
}

/**
 * Tự động cuộn lịch sử tới cuối nhưng không giật layout
 * @param {HTMLElement} container
 */
function scrollToBottom(container) {
  if (!container) return;

  requestAnimationFrame(() => {
    if (container.scrollHeight > container.clientHeight) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  });
}

/**
 * Gom nhóm danh sách nước đi theo từng hiệp đấu (Round: Red, Black)
 * @param {Array<object>} moves
 * @returns {Array<object>}
 */
function pairMoves(moves) {
  const rows = [];
  let currentRow = null;

  moves.forEach((move, index) => {
    const color = String(move.color || (index % 2 === 0 ? 'RED' : 'BLACK')).toUpperCase();

    if (color === 'RED') {
      currentRow = {
        roundNumber: move.moveNumber || (rows.length + 1),
        redMove: move,
        blackMove: null
      };
      rows.push(currentRow);
    } else {
      // BLACK move
      if (currentRow && !currentRow.blackMove) {
        currentRow.blackMove = move;
      } else {
        // Nước đầu tiên hoặc liên tiếp là Đen
        currentRow = {
          roundNumber: move.moveNumber || (rows.length + 1),
          redMove: null,
          blackMove: move
        };
        rows.push(currentRow);
      }
    }
  });

  return rows;
}

/**
 * Render toàn bộ danh sách lịch sử nước đi
 * @param {Array<object>} moves - Mảng các nước đi
 */
export function renderMoveHistory(moves) {
  ensureStyles();

  const container = document.getElementById('move-history');
  if (!container) {
    return;
  }

  // Nếu không có move thì hiển thị empty state thay vì vùng trắng
  if (!moves || !Array.isArray(moves) || moves.length === 0) {
    currentMoves = [];
    updateBadge(0);
    container.innerHTML = `
      <div class="history-empty-message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 8v4l3 3"></path>
          <circle cx="12" cy="12" r="9"></circle>
        </svg>
        <span>Chưa có nước đi nào</span>
      </div>
    `;
    return;
  }

  currentMoves = [...moves];
  updateBadge(moves.length);

  const rows = pairMoves(moves);
  let rowsHtml = '';

  rows.forEach((row, index) => {
    const roundNumber = row.roundNumber || (index + 1);
    const redCell = buildMoveCellHtml(row.redMove, 'RED');
    const blackCell = buildMoveCellHtml(row.blackMove, 'BLACK');
    const isLatest = index === rows.length - 1 ? 'current-turn-row' : '';

    rowsHtml += `
      <tr class="${isLatest}" data-round="${roundNumber}">
        <td class="col-index">${roundNumber}</td>
        <td class="col-red">${redCell}</td>
        <td class="col-black">${blackCell}</td>
      </tr>
    `;
  });

  container.innerHTML = `
    <table class="history-table" aria-label="Bảng các nước đi đã thực hiện">
      <thead>
        <tr>
          <th scope="col" class="col-index">#</th>
          <th scope="col" class="col-red">Bên Đỏ</th>
          <th scope="col" class="col-black">Bên Đen</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;

  scrollToBottom(container);
}

/**
 * Thêm một nước đi mới vào lịch sử
 * @param {object} move - Đối tượng nước đi
 */
export function appendMove(move) {
  ensureStyles();

  if (!move) {
    return;
  }

  const container = document.getElementById('move-history');
  if (!container) {
    return;
  }

  currentMoves.push(move);
  updateBadge(currentMoves.length);

  let table = container.querySelector('.history-table');
  let tbody = table ? table.querySelector('tbody') : null;

  // Nếu đang hiển thị empty state hoặc chưa có bảng
  if (!table || !tbody || container.querySelector('.history-empty-message')) {
    container.innerHTML = `
      <table class="history-table" aria-label="Bảng các nước đi đã thực hiện">
        <thead>
          <tr>
            <th scope="col" class="col-index">#</th>
            <th scope="col" class="col-red">Bên Đỏ</th>
            <th scope="col" class="col-black">Bên Đen</th>
          </tr>
        </thead>
        <tbody>
        </tbody>
      </table>
    `;
    table = container.querySelector('.history-table');
    tbody = table.querySelector('tbody');
  }

  const color = String(move.color || (currentMoves.length % 2 === 1 ? 'RED' : 'BLACK')).toUpperCase();
  const lastRow = tbody.lastElementChild;

  // Xóa highlight hàng trước đó
  const prevHighlight = tbody.querySelector('.current-turn-row');
  if (prevHighlight) {
    prevHighlight.classList.remove('current-turn-row');
  }

  // Nếu nước đi là BLACK và hàng cuối cùng chưa có nước BLACK
  if (color === 'BLACK' && lastRow) {
    const blackTd = lastRow.querySelector('.col-black');
    if (blackTd && (blackTd.textContent.trim() === '-' || blackTd.querySelector('.move-empty'))) {
      blackTd.innerHTML = buildMoveCellHtml(move, 'BLACK');
      lastRow.classList.add('current-turn-row');
      scrollToBottom(container);
      return;
    }
  }

  // Ngược lại, tạo một hàng tr mới
  const roundNumber = move.moveNumber || (tbody.children.length + 1);
  const tr = document.createElement('tr');
  tr.className = 'current-turn-row';
  tr.setAttribute('data-round', String(roundNumber));

  if (color === 'RED') {
    tr.innerHTML = `
      <td class="col-index">${roundNumber}</td>
      <td class="col-red">${buildMoveCellHtml(move, 'RED')}</td>
      <td class="col-black">${buildMoveCellHtml(null, 'BLACK')}</td>
    `;
  } else {
    tr.innerHTML = `
      <td class="col-index">${roundNumber}</td>
      <td class="col-red">${buildMoveCellHtml(null, 'RED')}</td>
      <td class="col-black">${buildMoveCellHtml(move, 'BLACK')}</td>
    `;
  }

  tbody.appendChild(tr);
  scrollToBottom(container);
}

/**
 * Lấy toàn bộ danh sách nước đi hiện tại
 * @returns {Array<object>}
 */
export function getMoveHistory() {
  return [...currentMoves];
}

/**
 * Xóa toàn bộ lịch sử nước đi và đưa về empty state
 */
export function clearMoveHistory() {
  renderMoveHistory([]);
}

// Đăng ký toàn cục cho môi trường không dùng bundler
if (typeof window !== 'undefined') {
  window.renderMoveHistory = renderMoveHistory;
  window.appendMove = appendMove;
  window.getMoveHistory = getMoveHistory;
  window.clearMoveHistory = clearMoveHistory;
  window.moveHistory = {
    renderMoveHistory,
    appendMove,
    getMoveHistory,
    clearMoveHistory
  };
}
