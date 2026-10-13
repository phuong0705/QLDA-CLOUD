// frontend/js/room/inviteRoom.js

/**
 * Helper module for generating invitation links and copying them to clipboard.
 * It works on any origin – the link is built from `window.location.origin`
 * and the appropriate page (room.html or game.html) decided by the team.
 *
 * Exported API:
 *   - buildInviteLink(roomCode): string
 *   - copyRoomCode(roomCode): Promise<void>
 *   - copyInviteLink(roomCode, targetPage = 'room.html'): Promise<void>
 *   - getRoomCodeFromQuery(): string | null   // parses ?room=CODE
 *   - initInvite(options = {}): void           // optional auto‑prefill UI
 */

import { showToast } from "../ui/notification.js";

/**
 * Build a full URL that can be shared.
 * `targetPage` is the page where the user should land – e.g. "room.html" or "game.html".
 * The function does **not** hard‑code localhost; it uses the current origin.
 */
export function buildInviteLink(roomCode, targetPage = "room.html") {
  const origin = window.location.origin; // works for localhost, dev, prod
  const sanitized = String(roomCode).toUpperCase().trim();
  return `${origin}/${targetPage}?room=${encodeURIComponent(sanitized)}`;
}

/**
 * Copy a plain room code to clipboard.
 * Shows a toast on success or error.
 */
export async function copyRoomCode(roomCode) {
  const text = String(roomCode).toUpperCase().trim();
  await _copyText(text);
  showToast("Mã phòng đã sao chép!", { type: "success" });
}

/**
 * Copy the full invite link (room or game) to clipboard.
 * `targetPage` defaults to "room.html" but can be overridden.
 */
export async function copyInviteLink(roomCode, targetPage = "room.html") {
  const link = buildInviteLink(roomCode, targetPage);
  await _copyText(link);
  showToast("Liên kết đã sao chép!", { type: "success" });
}

/** Internal clipboard helper with graceful fallback. */
async function _copyText(text) {
  // Preferred API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (e) {
      // fall through to fallback
    }
  }

  // Fallback using a temporary textarea + execCommand('copy')
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed"; // avoid scrolling to bottom
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const successful = document.execCommand("copy");
    if (!successful) throw new Error("execCommand copy failed");
  } finally {
    document.body.removeChild(textarea);
  }
}

/** Parse ?room=CODE from current URL. Returns null if missing/invalid. */
export function getRoomCodeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("room");
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  // Simple validation – 6 alphanumeric uppercase characters (excluding ambiguous ones is optional)
  const valid = /^[A-Z0-9]{6}$/.test(code);
  return valid ? code : null;
}

/**
 * Initialize UI elements (if present) for copy actions and pre‑fill the join form.
 * Expected IDs in the page (optional):
 *   - "join-room-code"   : <input> where the code should be pre‑filled.
 *   - "copy-room-code"   : button that copies only the code.
 *   - "copy-invite-link" : button that copies the full link.
 *   - "invite-target"    : optional hidden input or data‑attribute indicating target page (room.html or game.html).
 */
export function initInvite({ defaultTargetPage = "room.html" } = {}) {
  const code = getRoomCodeFromQuery();

  // Prefill input if present
  const input = document.getElementById("join-room-code");
  if (input && code) {
    input.value = code;
  }

  // Set up copy‑code button
  const copyBtn = document.getElementById("copy-room-code");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!code) {
        showToast("Mã phòng không hợp lệ.", { type: "error" });
        return;
      }
      copyRoomCode(code).catch(() =>
        showToast("Sao chép thất bại.", { type: "error" })
      );
    });
  }

  // Set up copy‑link button
  const linkBtn = document.getElementById("copy-invite-link");
  if (linkBtn) {
    // allow a custom target page via data attribute
    const targetPage = linkBtn.dataset.targetPage || defaultTargetPage;
    linkBtn.addEventListener("click", () => {
      if (!code) {
        showToast("Mã phòng không hợp lệ.", { type: "error" });
        return;
      }
      copyInviteLink(code, targetPage).catch(() =>
        showToast("Sao chép thất bại.", { type: "error" })
      );
    });
  }
}

export default { buildInviteLink, copyRoomCode, copyInviteLink, getRoomCodeFromQuery, initInvite };
