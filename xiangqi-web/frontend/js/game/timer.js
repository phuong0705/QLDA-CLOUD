/**
 * ============================================================================
 * timer.js - Quản lý Định Dạng, Đồng Bộ & Hiển Thị Đồng Hồ Bàn Cờ (Xiangqi Web)
 * ============================================================================
 * Nhiệm vụ duy nhất:
 * - formatSeconds(totalSeconds) -> chuỗi "mm:ss", bảo đảm không âm, an toàn với dữ liệu lỗi.
 * - updateTimer("RED"|"BLACK", seconds): nhận snapshot chuẩn từ server và đồng bộ hiển thị lên DOM.
 * - Hỗ trợ nội suy hiển thị cục bộ giữa các snapshot nếu cần, nhưng khi snapshot mới đến
 *   phải đồng bộ ngay về giá trị chuẩn của server.
 * - TUYỆT ĐỐI KHÔNG dùng setInterval làm nguồn thời gian quyết định người thắng cuộc (winner).
 *   Mọi quyết định timeout/kết quả đều thuộc thẩm quyền của backend/server.
 * 
 * Contract:
 * - updateTimer("RED"|"BLACK", seconds)
 * - formatSeconds(totalSeconds)
 * - updateTurnIndicator(currentTurn, status)
 */

import { updateTurnIndicator } from '../ui/gameStatus.js';

/**
 * Lưu trữ snapshot thời gian chuẩn từ server của 2 bên
 */
const timerSnapshots = {
  RED: {
    serverSeconds: 0,
    syncedAt: 0,
    displaySeconds: 0
  },
  BLACK: {
    serverSeconds: 0,
    syncedAt: 0,
    displaySeconds: 0
  }
};

/**
 * Biến quản lý ticker nội suy hiển thị cục bộ
 */
let interpolationInterval = null;
let currentActiveTurn = null;

/**
 * Định dạng số giây thành chuỗi "mm:ss"
 * @param {number|any} totalSeconds - Số giây cần định dạng
 * @returns {string} Chuỗi thời gian chuẩn "mm:ss" (luôn >= "00:00")
 */
export function formatSeconds(totalSeconds) {
  // Xử lý các giá trị null, undefined, rỗng, NaN hoặc <= 0
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds === '') {
    return '00:00';
  }

  const num = Number(totalSeconds);
  if (isNaN(num) || num <= 0) {
    return '00:00';
  }

  // Làm tròn xuống số nguyên giây an toàn (không âm)
  const safeSeconds = Math.floor(num);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(remainingSeconds).padStart(2, '0');

  return `${paddedMinutes}:${paddedSeconds}`;
}

/**
 * Render trực tiếp giá trị thời gian ra phần tử DOM tương ứng
 * @param {"RED"|"BLACK"} color - Màu quân
 * @param {number} seconds - Số giây cần render
 */
function renderTimerElement(color, seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const formattedText = formatSeconds(safeSeconds);

  const elementId = color === 'RED' ? 'red-timer' : 'black-timer';
  const timerElement = document.getElementById(elementId) ||
    document.querySelector(`.player-${color.toLowerCase()} .player-timer`);

  if (!timerElement) {
    return;
  }

  // Cập nhật text hiển thị
  timerElement.textContent = formattedText;
  timerElement.setAttribute(
    'aria-label',
    `Thời gian người chơi ${color === 'RED' ? 'Đỏ' : 'Đen'}: ${formattedText}`
  );

  // Thêm class cảnh báo khi thời gian còn ít (<= 60 giây)
  if (safeSeconds <= 60 && safeSeconds > 0) {
    timerElement.classList.add('time-warning');
  } else if (safeSeconds === 0) {
    timerElement.classList.add('time-warning');
  } else {
    timerElement.classList.remove('time-warning');
  }
}

/**
 * Cập nhật đồng hồ theo snapshot từ server
 * Nhận snapshot chuẩn, ghi đè giá trị nội suy trước đó và hiển thị chuẩn xác lên UI.
 * @param {"RED"|"BLACK"|string} color - Phe của người chơi ("RED" hoặc "BLACK")
 * @param {number} seconds - Số giây còn lại từ server snapshot
 */
export function updateTimer(color, seconds) {
  const normalizedColor = String(color || '').toUpperCase().trim();
  if (normalizedColor !== 'RED' && normalizedColor !== 'BLACK') {
    console.warn(`[Timer] Màu không hợp lệ: "${color}". Chỉ chấp nhận "RED" hoặc "BLACK".`);
    return;
  }

  // Chuẩn hóa dữ liệu an toàn: nếu âm, null, undefined, NaN thì clamp về 0
  const num = Number(seconds);
  const safeSeconds = (!isNaN(num) && num > 0) ? Math.floor(num) : 0;

  // Đồng bộ với snapshot chuẩn từ server
  timerSnapshots[normalizedColor] = {
    serverSeconds: safeSeconds,
    syncedAt: Date.now(),
    displaySeconds: safeSeconds
  };

  // Render ngay lập tức giá trị snapshot chuẩn
  renderTimerElement(normalizedColor, safeSeconds);
}

/**
 * Bắt đầu ticker nội suy hiển thị cục bộ giữa các khoảng gửi snapshot từ server.
 * Ticker này CHỈ nội suy hiển thị (Visual ticker), TUYỆT ĐỐI KHÔNG tự phán xét winner.
 * Khi server gửi snapshot mới qua updateTimer(), giá trị sẽ được đồng bộ lại ngay.
 * @param {"RED"|"BLACK"|string} [activeTurn] - Phe đang đi lượt
 */
export function startTimerTicker(activeTurn) {
  if (activeTurn) {
    const norm = String(activeTurn).toUpperCase().trim();
    if (norm === 'RED' || norm === 'BLACK') {
      currentActiveTurn = norm;
    }
  }

  if (interpolationInterval) {
    clearInterval(interpolationInterval);
    interpolationInterval = null;
  }

  interpolationInterval = setInterval(() => {
    if (!currentActiveTurn || !timerSnapshots[currentActiveTurn]) {
      return;
    }

    const currentSnapshot = timerSnapshots[currentActiveTurn];
    if (!currentSnapshot.syncedAt) {
      return;
    }

    // Tính thời gian đã trôi qua kể từ thời điểm nhận snapshot server gần nhất
    const elapsedSeconds = Math.floor((Date.now() - currentSnapshot.syncedAt) / 1000);
    const interpolatedRemaining = Math.max(0, currentSnapshot.serverSeconds - elapsedSeconds);

    currentSnapshot.displaySeconds = interpolatedRemaining;
    renderTimerElement(currentActiveTurn, interpolatedRemaining);

    // LƯU Ý QUAN TRỌNG:
    // Dù interpolatedRemaining chạm mốc 0, hàm này KHÔNG kích hoạt kết thúc game hay quyết định winner.
    // Trình duyệt chỉ hiển thị "00:00" và chờ đợi thông điệp timeout chính thức từ server.
  }, 1000);
}

/**
 * Dừng ticker nội suy hiển thị
 */
export function stopTimerTicker() {
  if (interpolationInterval) {
    clearInterval(interpolationInterval);
    interpolationInterval = null;
  }
}

/**
 * Thiết lập phe đang đếm giờ (được gọi khi đổi lượt)
 * @param {"RED"|"BLACK"|string} activeTurn - Phe đang đi ("RED" hoặc "BLACK")
 */
export function setActiveTimer(activeTurn) {
  const norm = String(activeTurn || '').toUpperCase().trim();
  if (norm === 'RED' || norm === 'BLACK') {
    currentActiveTurn = norm;
    // Đồng bộ lại thời điểm tính trôi thời gian cho phe mới
    if (timerSnapshots[norm].syncedAt) {
      timerSnapshots[norm].syncedAt = Date.now();
      timerSnapshots[norm].serverSeconds = timerSnapshots[norm].displaySeconds;
    }
  } else {
    currentActiveTurn = null;
  }
}

/**
 * Lấy trạng thái snapshot hiện tại (phục vụ kiểm thử hoặc debug)
 * @param {"RED"|"BLACK"} [color]
 * @returns {object|number}
 */
export function getTimerState(color) {
  if (color) {
    const norm = String(color).toUpperCase().trim();
    return timerSnapshots[norm] ? { ...timerSnapshots[norm] } : null;
  }
  return {
    RED: { ...timerSnapshots.RED },
    BLACK: { ...timerSnapshots.BLACK },
    activeTurn: currentActiveTurn
  };
}

/**
 * Reset đồng hồ về trạng thái ban đầu
 * @param {number} [initialSeconds=600] - Số giây mặc định (mặc định 10 phút = 600s)
 */
export function resetTimers(initialSeconds = 600) {
  stopTimerTicker();
  currentActiveTurn = null;
  updateTimer('RED', initialSeconds);
  updateTimer('BLACK', initialSeconds);
}

// Re-export hàm updateTurnIndicator để các module tiện sử dụng từ contract chung
export { updateTurnIndicator };

// Đăng ký toàn cục cho môi trường trình duyệt không dùng module bundler
if (typeof window !== 'undefined') {
  window.formatSeconds = formatSeconds;
  window.updateTimer = updateTimer;
  window.updateTurnIndicator = updateTurnIndicator;
  window.startTimerTicker = startTimerTicker;
  window.stopTimerTicker = stopTimerTicker;
  window.setActiveTimer = setActiveTimer;
  window.getTimerState = getTimerState;
  window.resetTimers = resetTimers;
  window.timer = {
    formatSeconds,
    updateTimer,
    updateTurnIndicator,
    startTimerTicker,
    stopTimerTicker,
    setActiveTimer,
    getTimerState,
    resetTimers
  };
}
