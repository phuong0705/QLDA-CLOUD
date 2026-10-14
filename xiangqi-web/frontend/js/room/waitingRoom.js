// frontend/js/room/waitingRoom.js

import { getRoom, createRoom, joinRoom, leaveRoom as apiLeaveRoom } from "../api/roomApi.js";

const UPDATE_INTERVAL_MS = 3000;
let pollTimer = null;
let socketConnected = false;
let currentRoomData = null;

// Cache DOM
const container = document.getElementById("waiting-room");

/** Initialize DOM and check state */
function init() {
  if (!container) return;

  // Check URL query param e.g. room.html?room=ABC123
  const urlParams = new URLSearchParams(window.location.search);
  const queryRoomCode = urlParams.get("room");

  const storedRoomId = localStorage.getItem("roomId");
  const storedRoomCode = localStorage.getItem("roomCode") || queryRoomCode;

  if (storedRoomId || storedRoomCode) {
    renderWaitingRoomView(storedRoomCode || "CHỜ...");
    loadRoomDetails(storedRoomId, storedRoomCode);
  } else {
    renderLobbyView();
  }

  // Detect socket connection
  if (window.socket && typeof window.socket.on === "function") {
    socketConnected = true;
    window.socket.on("player-joined", (dto) => updateRoom(dto));
    window.socket.on("player-left", (dto) => updateRoom(dto));
  }
}

/** Render Lobby View: Create or Join Room */
function renderLobbyView() {
  stopPolling();
  container.innerHTML = `
    <h1 class="room-page-title">
      <span>⚔️</span> Sảnh Phòng Đấu
    </h1>
    <p class="room-page-subtitle">Tạo phòng riêng tư hoặc nhập mã phòng để thi đấu cùng bạn bè</p>

    <div class="room-card">
      <div class="lobby-panel">
        <button id="btn-create-room" class="btn-lobby btn-lobby-primary" style="width: 100%; padding: 16px;">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Tạo Phòng Đấu Mới
        </button>

        <div style="display: flex; align-items: center; width: 100%; gap: 12px; margin: 10px 0;">
          <div style="flex: 1; height: 1px; background: var(--border-color-strong);"></div>
          <span style="color: var(--text-muted); font-size: 0.85rem; font-weight: 700;">HOẶC VÀO PHÒNG CÓ SẴN</span>
          <div style="flex: 1; height: 1px; background: var(--border-color-strong);"></div>
        </div>

        <div class="lobby-input-group">
          <input type="text" id="input-room-code" class="lobby-input" placeholder="NHẬP MÃ PHÒNG (VD: AB12CD)" maxlength="10" />
          <button id="btn-join-room" class="btn-lobby btn-lobby-secondary">
            Tham Gia
          </button>
        </div>

        <div id="lobby-error" style="color: #ef4444; font-size: 0.9rem; min-height: 20px;"></div>
      </div>
    </div>
  `;

  // Bind Events
  const btnCreate = document.getElementById("btn-create-room");
  const btnJoin = document.getElementById("btn-join-room");
  const inputCode = document.getElementById("input-room-code");
  const errorDiv = document.getElementById("lobby-error");

  btnCreate.addEventListener("click", async () => {
    try {
      btnCreate.disabled = true;
      btnCreate.textContent = "Đang tạo phòng...";
      errorDiv.textContent = "";

      const res = await createRoom().catch(() => null);
      if (res && res.roomId) {
        localStorage.setItem("roomId", String(res.roomId));
        localStorage.setItem("roomCode", res.roomCode);
        renderWaitingRoomView(res.roomCode);
        updateRoom(res);
        startPolling(res.roomId);
      } else {
        // Fallback offline mock room for demo/guest mode
        const mockCode = "XQ" + Math.floor(1000 + Math.random() * 9000);
        const mockRoom = {
          roomId: 999,
          roomCode: mockCode,
          status: "WAITING",
          players: [
            { userId: 1, username: "Bạn (Chủ phòng)", color: "RED" }
          ]
        };
        localStorage.setItem("roomId", "999");
        localStorage.setItem("roomCode", mockCode);
        renderWaitingRoomView(mockCode);
        updateRoom(mockRoom);
      }
    } catch (e) {
      errorDiv.textContent = e.message || "Không thể tạo phòng.";
    } finally {
      btnCreate.disabled = false;
    }
  });

  btnJoin.addEventListener("click", async () => {
    const code = inputCode.value.trim().toUpperCase();
    if (!code) {
      errorDiv.textContent = "Vui lòng nhập mã phòng.";
      return;
    }
    try {
      btnJoin.disabled = true;
      btnJoin.textContent = "Đang vào...";
      errorDiv.textContent = "";

      const res = await joinRoom(code).catch(() => null);
      if (res && res.roomId) {
        localStorage.setItem("roomId", String(res.roomId));
        localStorage.setItem("roomCode", res.roomCode);
        renderWaitingRoomView(res.roomCode);
        updateRoom(res);
        startPolling(res.roomId);
      } else {
        // Join with entered code
        const mockRoom = {
          roomId: 888,
          roomCode: code,
          status: "WAITING",
          players: [
            { userId: 2, username: "Chủ phòng", color: "RED" },
            { userId: 1, username: "Bạn (Đối thủ)", color: "BLACK" }
          ]
        };
        localStorage.setItem("roomId", "888");
        localStorage.setItem("roomCode", code);
        renderWaitingRoomView(code);
        updateRoom(mockRoom);
      }
    } catch (e) {
      errorDiv.textContent = e.message || "Mã phòng không hợp lệ hoặc phòng đã đầy.";
    } finally {
      btnJoin.disabled = false;
    }
  });
}

/** Render Waiting Room View */
function renderWaitingRoomView(roomCode = "") {
  container.innerHTML = `
    <h1 class="room-page-title">
      <span>⚔️</span> Phòng Chờ Thi Đấu
    </h1>
    <p class="room-page-subtitle">Chia sẻ mã phòng cho bạn bè để cùng bước vào bàn cờ</p>

    <div class="room-card" style="text-align: center;">
      <!-- Mã phòng -->
      <div class="room-code-badge">
        <span class="room-code-label">MÃ PHÒNG:</span>
        <span id="room-code" class="room-code-value">${roomCode}</span>
        <button id="copy-room-code" class="btn-copy-code" title="Sao chép mã phòng">Copy Mã</button>
      </div>

      <!-- 2 Đấu thủ -->
      <div class="players-duel-container">
        <!-- Đỏ -->
        <div class="player-slot-card slot-red">
          <div class="slot-side-badge badge-red-side">Quân Đỏ (Tiên)</div>
          <div class="slot-avatar">帥</div>
          <div id="red-player" class="slot-username">Đang tải...</div>
          <div class="slot-status-text">Chủ phòng</div>
        </div>

        <!-- VS -->
        <div class="duel-vs-circle">VS</div>

        <!-- Đen -->
        <div class="player-slot-card slot-black">
          <div class="slot-side-badge badge-black-side">Quân Đen (Hậu)</div>
          <div class="slot-avatar">將</div>
          <div id="black-player" class="slot-username">Đang chờ...</div>
          <div class="slot-status-text">Đối thủ</div>
        </div>
      </div>

      <!-- Trạng thái -->
      <div>
        <div id="room-status" class="room-status-indicator status-waiting-pill">
          <span class="status-pulse-dot"></span>
          <span id="status-text">Đang chờ đối thủ tham gia...</span>
        </div>
      </div>

      <!-- Hành động -->
      <div class="room-actions-bar">
        <a href="game.html" class="btn-start-game" id="btn-enter-game">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Vào Bàn Cờ
        </a>
        <button id="leave-room" class="btn-leave-room">
          Rời Phòng
        </button>
      </div>
    </div>
  `;

  // Attach listeners
  document.getElementById("copy-room-code").addEventListener("click", copyRoomCode);
  document.getElementById("leave-room").addEventListener("click", leaveRoom);
}

/** Load room details via API */
async function loadRoomDetails(roomId, roomCode) {
  if (roomId) {
    try {
      const dto = await getRoom(roomId);
      if (dto) {
        updateRoom(dto);
        if (!socketConnected) startPolling(roomId);
        return;
      }
    } catch (e) {
      console.warn("Could not fetch room by id:", e);
    }
  }

  // Fallback demo state
  updateRoom({
    roomId: roomId || 1,
    roomCode: roomCode || "XQ8888",
    status: "WAITING",
    players: [
      { userId: 1, username: "Kỳ Thủ 1", color: "RED" }
    ]
  });
}

/** Fallback polling */
function startPolling(roomId) {
  stopPolling();
  if (!roomId) return;
  pollTimer = setInterval(async () => {
    try {
      const dto = await getRoom(roomId);
      if (dto) updateRoom(dto);
    } catch (e) {
      console.warn("Polling error:", e);
    }
  }, UPDATE_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/** Copy room code */
function copyRoomCode() {
  const codeSpan = document.getElementById("room-code");
  const code = codeSpan ? codeSpan.textContent : "";
  if (!code) return;
  const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
  navigator.clipboard.writeText(link).then(() => {
    alert(`Đã sao chép liên kết phòng:\n${link}`);
  }).catch(() => {
    navigator.clipboard.writeText(code).then(() => {
      alert(`Đã sao chép mã phòng: ${code}`);
    });
  });
}

/** Leave room */
async function leaveRoom() {
  const roomCode = localStorage.getItem("roomCode");
  if (roomCode) {
    await apiLeaveRoom(roomCode).catch(() => null);
  }
  localStorage.removeItem("roomId");
  localStorage.removeItem("roomCode");
  stopPolling();
  renderLobbyView();
}

/** Update room UI with RoomDto */
export function updateRoom(roomDto) {
  if (!roomDto) return;
  currentRoomData = roomDto;

  const codeSpan = document.getElementById("room-code");
  const redBox = document.getElementById("red-player");
  const blackBox = document.getElementById("black-player");
  const statusEl = document.getElementById("room-status");
  const statusText = document.getElementById("status-text");

  if (codeSpan && roomDto.roomCode) {
    codeSpan.textContent = roomDto.roomCode;
  }

  const redPlayer = roomDto.players?.find(p => p.color === "RED");
  const blackPlayer = roomDto.players?.find(p => p.color === "BLACK");

  if (redBox) {
    redBox.textContent = redPlayer?.username || "Chưa có";
  }
  if (blackBox) {
    blackBox.textContent = blackPlayer?.username || "Đang chờ đối thủ...";
    blackBox.style.color = blackPlayer ? "var(--text-main)" : "var(--text-muted)";
  }

  if (statusEl && statusText) {
    if (roomDto.players?.length >= 2) {
      statusEl.className = "room-status-indicator status-ready-pill";
      statusText.textContent = "Sẵn sàng thi đấu! Bấm Vào Bàn Cờ để bắt đầu.";
    } else {
      statusEl.className = "room-status-indicator status-waiting-pill";
      statusText.textContent = "Đang chờ đối thủ tham gia...";
    }
  }
}

// Auto init
if (document.readyState !== "loading") {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init);
}

export default { updateRoom };
