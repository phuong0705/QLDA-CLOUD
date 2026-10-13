/**
 * ============================================================================
 * game-controls.js - Quản lý Nhóm Nút Điều Khiển Trận Đấu (Save, Restart, Resign)
 * ============================================================================
 * Nhiệm vụ duy nhất:
 * - Bind đúng 1 lần các nút Save, Restart, Resign (chống duplicate khi re-init).
 * - Bước xác nhận (Confirm) bắt buộc đối với hành động hủy trạng thái (Restart, Resign).
 * - Vô hiệu hóa nút trong lúc request đang xử lý để chống double click.
 * - Khôi phục trạng thái button khi backend trả lỗi hoặc hoàn tất.
 * - Cho phép setControlsEnabled(boolean) theo trạng thái trận đấu (WAITING, PLAYING, FINISHED).
 * - Không cho phép Resign khi trận đấu đã FINISHED.
 * - Không trực tiếp viết SQL hoặc tự cập nhật winner.
 * 
 * Contract:
 * - initGameControls({ onSave, onRestart, onResign })
 * - setControlsEnabled(enabled)
 */

/**
 * Callbacks nhận từ module điều phối bên ngoài
 */
const callbacks = {
  onSave: null,
  onRestart: null,
  onResign: null
};

/**
 * Trạng thái trận đấu: 'WAITING' | 'PLAYING' | 'FINISHED'
 */
let currentGameStateStatus = 'WAITING';

/**
 * Cờ cho phép người dùng tương tác với cụm controls
 */
let isControlsEnabled = true;

/**
 * Cờ khóa khi đang có 1 request bất đồng bộ đang thực thi
 */
let isRequestRunning = false;

/**
 * Handler xác nhận (có thể override trong test hoặc gán modal tùy biến)
 */
let confirmHandler = (message) => {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(message);
  }
  return true;
};

/**
 * Lưu các listener đã bind để gỡ bỏ triệt để khi re-init (tránh duplicate)
 */
let activeListeners = {
  save: null,
  restart: null,
  resign: null
};

/**
 * Hiển thị thông điệp phản hồi kết quả thao tác
 * @param {'success'|'error'|'warning'|'info'} type 
 * @param {string} message 
 */
function showControlsFeedback(type, message) {
  // 1. Cập nhật trực quan vào khu vực #game-status nếu có
  const statusContainer = document.getElementById('game-status');
  if (statusContainer) {
    const msgEl = statusContainer.querySelector('.status-message');
    if (msgEl) {
      msgEl.textContent = message;
    }
    statusContainer.classList.remove('status-feedback-success', 'status-feedback-error', 'status-feedback-warning');
    statusContainer.classList.add(`status-feedback-${type}`);
  }

  // 2. Phát CustomEvent để module bên ngoài có thể bắt được
  if (typeof document !== 'undefined') {
    try {
      document.dispatchEvent(new CustomEvent('controlsFeedback', {
        detail: { type, message }
      }));
    } catch (e) {
      // Bỏ qua nếu môi trường test thiếu CustomEvent
    }
  }
}

/**
 * Cập nhật trạng thái enabled/disabled và style trên các nút DOM
 */
function updateButtonsState() {
  const btnSave = document.getElementById('btn-save');
  const btnRestart = document.getElementById('btn-restart');
  const btnResign = document.getElementById('btn-resign');

  // Nếu toàn bộ controls bị disable (ví dụ khi chưa PLAYING và setControlsEnabled(false))
  // hoặc khi đang có 1 request đang chạy (chống gửi lặp)
  const disableAll = !isControlsEnabled || isRequestRunning;

  if (btnSave) {
    btnSave.disabled = disableAll;
    btnSave.setAttribute('aria-disabled', String(disableAll));
  }

  if (btnRestart) {
    btnRestart.disabled = disableAll;
    btnRestart.setAttribute('aria-disabled', String(disableAll));
  }

  if (btnResign) {
    // Tiêu chí DoD: Tuyệt đối KHÔNG THỂ Resign khi game đã FINISHED (hoặc WAITING)
    const disableResign = disableAll || (currentGameStateStatus === 'FINISHED') || (currentGameStateStatus === 'WAITING');
    btnResign.disabled = disableResign;
    btnResign.setAttribute('aria-disabled', String(disableResign));
  }
}

/**
 * Đặt trạng thái đang tải (loading) cho nút cụ thể
 * @param {HTMLElement|null} button 
 * @param {boolean} loading 
 */
function setButtonLoading(button, loading) {
  if (!button) return;
  if (loading) {
    button.classList.add('is-loading');
    button.disabled = true;
  } else {
    button.classList.remove('is-loading');
    updateButtonsState();
  }
}

/**
 * Xử lý khi nhấn nút Lưu (Save)
 */
async function handleSaveAction() {
  if (isRequestRunning || !isControlsEnabled) return;
  if (typeof callbacks.onSave !== 'function') return;

  const btn = document.getElementById('btn-save');
  isRequestRunning = true;
  setButtonLoading(btn, true);

  try {
    const result = await callbacks.onSave();
    showControlsFeedback('success', 'Đã lưu trạng thái ván cờ thành công!');
    return result;
  } catch (error) {
    // Tiêu chí DoD: Khôi phục trạng thái button nếu backend trả lỗi
    showControlsFeedback('error', error?.message || 'Lỗi khi lưu ván cờ.');
  } finally {
    isRequestRunning = false;
    setButtonLoading(btn, false);
  }
}

/**
 * Xử lý khi nhấn nút Chơi lại (Restart)
 * Hành động phá hủy trạng thái: Bắt buộc có bước xác nhận.
 */
async function handleRestartAction() {
  if (isRequestRunning || !isControlsEnabled) return;
  if (typeof callbacks.onRestart !== 'function') return;

  // Bước xác nhận (Confirm)
  const promptMessage = 'Bạn có chắc chắn muốn bắt đầu lại ván cờ? Hành động này sẽ khởi tạo lại bàn đấu.';
  let isConfirmed = false;
  try {
    isConfirmed = await confirmHandler(promptMessage);
  } catch (e) {
    isConfirmed = false;
  }

  if (!isConfirmed) {
    // Người dùng hủy xác nhận -> Không gửi request
    return;
  }

  const btn = document.getElementById('btn-restart');
  isRequestRunning = true;
  setButtonLoading(btn, true);

  try {
    const result = await callbacks.onRestart();
    showControlsFeedback('success', 'Đã khởi động lại ván cờ.');
    return result;
  } catch (error) {
    // Khôi phục trạng thái button nếu backend trả lỗi
    showControlsFeedback('error', error?.message || 'Không thể khởi động lại ván đấu.');
  } finally {
    isRequestRunning = false;
    setButtonLoading(btn, false);
  }
}

/**
 * Xử lý khi nhấn nút Xin thua / Đầu hàng (Resign)
 * Hành động phá hủy trạng thái: Bắt buộc xác nhận.
 * Tiêu chí DoD: Không thể Resign khi game đã FINISHED.
 */
async function handleResignAction() {
  if (isRequestRunning || !isControlsEnabled) return;

  // Tiêu chí nghiệm thu: Chặn đầu hàng nếu trận đấu đã kết thúc
  if (currentGameStateStatus === 'FINISHED') {
    showControlsFeedback('warning', 'Trận đấu đã kết thúc. Không thể xin thua.');
    return;
  }

  if (typeof callbacks.onResign !== 'function') return;

  // Bước xác nhận (Confirm)
  const promptMessage = 'Bạn có chắc chắn muốn đầu hàng (xin thua) ván đấu này?';
  let isConfirmed = false;
  try {
    isConfirmed = await confirmHandler(promptMessage);
  } catch (e) {
    isConfirmed = false;
  }

  if (!isConfirmed) {
    // Người dùng hủy xác nhận -> Không gửi request
    return;
  }

  const btn = document.getElementById('btn-resign');
  isRequestRunning = true;
  setButtonLoading(btn, true);

  try {
    const result = await callbacks.onResign();
    showControlsFeedback('success', 'Bạn đã xin thua ván đấu.');
    return result;
  } catch (error) {
    // Khôi phục trạng thái button nếu backend trả lỗi
    showControlsFeedback('error', error?.message || 'Không thể gửi yêu cầu xin thua.');
  } finally {
    isRequestRunning = false;
    setButtonLoading(btn, false);
  }
}

// ============================================================================
// CONTRACT BẮT BUỘC ĐẦU VÀO - ĐẦU RA
// ============================================================================

/**
 * Khởi tạo nhóm nút điều khiển và bind đúng một lần các sự kiện
 * 
 * @param {Object} options
 * @param {Function} [options.onSave] - Callback khi thực hiện Lưu ván đấu
 * @param {Function} [options.onRestart] - Callback khi thực hiện Chơi lại ván đấu
 * @param {Function} [options.onResign] - Callback khi thực hiện Xin thua ván đấu
 */
function initGameControls({ onSave, onRestart, onResign } = {}) {
  // Cập nhật callbacks
  callbacks.onSave = onSave || null;
  callbacks.onRestart = onRestart || null;
  callbacks.onResign = onResign || null;

  const btnSave = document.getElementById('btn-save');
  const btnRestart = document.getElementById('btn-restart');
  const btnResign = document.getElementById('btn-resign');

  // Tiêu chí DoD: Gỡ bỏ triệt để listener cũ trước khi bind mới (chống nhân đôi khi re-init)
  if (btnSave && activeListeners.save) {
    btnSave.removeEventListener('click', activeListeners.save);
    activeListeners.save = null;
  }
  if (btnRestart && activeListeners.restart) {
    btnRestart.removeEventListener('click', activeListeners.restart);
    activeListeners.restart = null;
  }
  if (btnResign && activeListeners.resign) {
    btnResign.removeEventListener('click', activeListeners.resign);
    activeListeners.resign = null;
  }

  // Bind listener mới đúng một lần
  if (btnSave) {
    activeListeners.save = (event) => {
      event.preventDefault();
      handleSaveAction();
    };
    btnSave.addEventListener('click', activeListeners.save);
  }

  if (btnRestart) {
    activeListeners.restart = (event) => {
      event.preventDefault();
      handleRestartAction();
    };
    btnRestart.addEventListener('click', activeListeners.restart);
  }

  if (btnResign) {
    activeListeners.resign = (event) => {
      event.preventDefault();
      handleResignAction();
    };
    btnResign.addEventListener('click', activeListeners.resign);
  }

  // Cập nhật trạng thái hiển thị
  updateButtonsState();
}

/**
 * Cho phép bật/tắt quyền tương tác của cụm nút điều khiển
 * Thường dùng khi chưa tới trạng thái PLAYING (ví dụ WAITING trong phòng chờ)
 * 
 * @param {boolean} enabled 
 */
function setControlsEnabled(enabled) {
  isControlsEnabled = Boolean(enabled);
  updateButtonsState();
}

/**
 * Cập nhật trạng thái ván cờ (WAITING, PLAYING, FINISHED)
 * để kiểm soát logic hành động phù hợp
 * 
 * @param {'WAITING'|'PLAYING'|'FINISHED'|string} status 
 */
function setGameStatus(status) {
  if (status) {
    currentGameStateStatus = String(status).trim().toUpperCase();
    // Khi ván đấu chuyển sang trạng thái PLAYING -> tự động kích hoạt controls
    if (currentGameStateStatus === 'PLAYING') {
      isControlsEnabled = true;
    }
  }
  updateButtonsState();
}

/**
 * Lấy trạng thái ván cờ hiện tại của cụm controls
 * @returns {string}
 */
function getGameStatus() {
  return currentGameStateStatus;
}

/**
 * Tùy biến hàm xác nhận (phục vụ viết unit test hoặc tích hợp modal UI tùy biến)
 * @param {Function} handler - Hàm nhận message và trả về boolean (hoặc Promise<boolean>)
 */
function setConfirmHandler(handler) {
  if (typeof handler === 'function') {
    confirmHandler = handler;
  }
}

// Export theo chuẩn ES Modules
export {
  initGameControls,
  setControlsEnabled,
  setGameStatus,
  getGameStatus,
  setConfirmHandler
};

// Đăng ký toàn cục cho môi trường không dùng bundler
if (typeof window !== 'undefined') {
  window.gameControls = {
    initGameControls,
    setControlsEnabled,
    setGameStatus,
    getGameStatus,
    setConfirmHandler
  };
  window.initGameControls = initGameControls;
  window.setControlsEnabled = setControlsEnabled;
}
