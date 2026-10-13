// frontend/js/room/waitingRoom.js

/**
 * Waiting Room UI module.
 * Renders the current RoomDto and updates it when the server notifies
 * via socket events (player-joined / player-left) or via fallback polling.
 *
 * Expected RoomDto shape:
 * {
 *   roomId: number,
 *   roomCode: string,
 *   status: string, // e.g. "WAITING", "PLAYING", "FINISHED", "CLOSED"
 *   players: [
 *     { userId: number, username: string, color: "RED" | "BLACK" }
 *   ]
 * }
 */

import { getRoom } from "../api/roomApi.js"; // fallback polling helper

const UPDATE_INTERVAL_MS = 5000; // fallback polling period (if needed)
let pollTimer = null;
let socketConnected = false;

// Cache DOM elements
const elements = {
  container: document.getElementById("waiting-room"),
  roomCodeSpan: null,
  copyBtn: null,
  redBox: null,
  blackBox: null,
  statusDiv: null,
  leaveBtn: null,
};

/** Initialize DOM references once the page is loaded */
function init() {
  if (!elements.container) return;
  // Build the UI structure dynamically (so the HTML can stay minimal)
  elements.container.innerHTML = `
    <h2>Phòng chờ</h2>
    <div class="room-code-area">
      Mã phòng: <span id="room-code" class="room-code"></span>
      <button id="copy-room-code" class="btn copy-btn" title="Sao chép mã phòng">Copy</button>
    </div>
    <div class="players-area">
      <div class="player-box red">
        <div class="side-label">RED (Chủ)</div>
        <div id="red-player" class="player-name">-</div>
      </div>
      <div class="player-box black">
        <div class="side-label">BLACK (Đối thủ)</div>
        <div id="black-player" class="player-name">-</div>
      </div>
    </div>
    <div id="room-status" class="status waiting">Waiting...</div>
    <button id="leave-room" class="btn leave-btn">Rời phòng</button>
  `;

  elements.roomCodeSpan = document.getElementById("room-code");
  elements.copyBtn = document.getElementById("copy-room-code");
  elements.redBox = document.getElementById("red-player");
  elements.blackBox = document.getElementById("black-player");
  elements.statusDiv = document.getElementById("room-status");
  elements.leaveBtn = document.getElementById("leave-room");

  // Event listeners
  elements.copyBtn.addEventListener("click", copyRoomCode);
  elements.leaveBtn.addEventListener("click", leaveRoom);

  // Detect socket connection (the global socket is created elsewhere)
  if (window.socket && typeof window.socket.on === "function") {
    socketConnected = true;
    window.socket.on("player-joined", (dto) => updateRoom(dto));
    window.socket.on("player-left", (dto) => updateRoom(dto));
    // optional: listen for game-started to let the caller decide navigation
  }

  // If no socket, start fallback polling (team may disable this later)
  if (!socketConnected) {
    startPolling();
  }
}

/** Fallback polling using REST API – runs only when socket not available */
function startPolling() {
  const stored = localStorage.getItem("roomId");
  if (!stored) return;
  const roomId = parseInt(stored, 10);
  pollTimer = setInterval(async () => {
    try {
      const dto = await getRoom(roomId);
      if (dto) updateRoom(dto);
    } catch (e) {
      console.error("Polling error", e);
    }
  }, UPDATE_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
}

/** Copy room code/link to clipboard */
function copyRoomCode() {
  const code = elements.roomCodeSpan?.textContent ?? "";
  if (!code) return;
  const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
  navigator.clipboard.writeText(link).then(() => {
    alert("Đã sao chép link phòng vào clipboard!");
  }).catch(() => alert("Sao chép thất bại"));
}

/** Leave the room – clear storage and navigate home */
function leaveRoom() {
  // Optionally inform server (not required for this task)
  localStorage.removeItem("roomId");
  localStorage.removeItem("roomCode");
  stopPolling();
  window.location.href = "index.html"; // Adjust if your home page differs
}

/** Render the UI based on the supplied RoomDto */
export function updateRoom(roomDto) {
  if (!elements.container) init(); // ensure UI is built
  if (!roomDto) return;

  // Room code
  if (elements.roomCodeSpan) {
    elements.roomCodeSpan.textContent = roomDto.roomCode ?? "";
  }

  // Players – find RED and BLACK
  const redPlayer = roomDto.players?.find(p => p.color === "RED");
  const blackPlayer = roomDto.players?.find(p => p.color === "BLACK");

  if (elements.redBox) {
    elements.redBox.textContent = redPlayer?.username ?? "(chưa có)";
  }
  if (elements.blackBox) {
    elements.blackBox.textContent = blackPlayer?.username ?? "(chưa có)";
  }

  // Status display
  if (elements.statusDiv) {
    if (roomDto.players?.length >= 2) {
      elements.statusDiv.textContent = "Ready – chờ server bắt đầu trò chơi";
      elements.statusDiv.classList.remove("waiting");
      elements.statusDiv.classList.add("ready");
    } else {
      elements.statusDiv.textContent = "Waiting...";
      elements.statusDiv.classList.remove("ready");
      elements.statusDiv.classList.add("waiting");
    }
  }
}

// Auto‑init when script is loaded (if the page already contains the container)
if (document.readyState !== "loading") {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init);
}

// Export only the update function (others are internal)
export default { updateRoom };
