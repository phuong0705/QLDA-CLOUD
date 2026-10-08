/**
 * ============================================================================
 * gameStatus.js - Quản lý Hiển thị Trạng Thái Ván Đấu & Lượt Đi (Xiangqi UI)
 * ============================================================================
 * Nhiệm vụ duy nhất:
 * - Hiển thị rõ lượt đi hiện tại (RED TURN, BLACK TURN).
 * - Cập nhật lập tức giao diện người chơi (.active-turn trên #red-player / #black-player).
 * - Thông báo rõ tình trạng Chiếu tướng (CHECK) với class .check-state và hiệu ứng cảnh báo.
 * - Thông báo rõ kết quả ván đấu (RED WIN, BLACK WIN, DRAW, CHECKMATE, RESIGN, TIMEOUT).
 * - Tuyệt đối không tự tính luật di chuyển của quân cờ.
 * 
 * Contract:
 * - updateTurnIndicator(currentTurn, status)
 *   + currentTurn: "RED" | "BLACK"
 *   + status: string (e.g. "CHECK", "CHECKMATE", "RED_WIN", "BLACK_WIN", "DRAW", "RESIGN", "TIMEOUT", "PLAYING")
 */

/**
 * Cập nhật trạng thái hiển thị lượt đi và thông báo ván đấu
 * @param {"RED"|"BLACK"|string} currentTurn - Lượt đi hiện tại ("RED" hoặc "BLACK")
 * @param {string} [status] - Trạng thái đặc biệt (CHECK, CHECKMATE, RED_WIN, BLACK_WIN, DRAW,...)
 */
export function updateTurnIndicator(currentTurn, status) {
  const statusContainer = document.getElementById('game-status');
  const dotElement = statusContainer
    ? statusContainer.querySelector('.status-indicator-dot')
    : document.querySelector('.status-indicator-dot');
  const turnTextElement = statusContainer
    ? statusContainer.querySelector('.status-turn-text')
    : document.querySelector('.status-turn-text');
  const statusMessageElement = statusContainer
    ? statusContainer.querySelector('.status-message')
    : document.querySelector('.status-message');

  const redPlayer = document.getElementById('red-player');
  const blackPlayer = document.getElementById('black-player');

  const normalizedTurn = String(currentTurn || '').toUpperCase().trim();
  const rawStatus = typeof status === 'string' ? status.trim() : '';
  const normalizedStatus = rawStatus.toUpperCase();

  // 1. Cập nhật lượt đi và đánh dấu người chơi đang đến lượt (.active-turn)
  if (normalizedTurn === 'RED') {
    if (dotElement) {
      dotElement.classList.remove('black-turn');
    }
    if (turnTextElement) {
      turnTextElement.textContent = 'Lượt đi: Quân Đỏ (RED TURN)';
    }
    if (redPlayer) redPlayer.classList.add('active-turn');
    if (blackPlayer) blackPlayer.classList.remove('active-turn');
  } else if (normalizedTurn === 'BLACK') {
    if (dotElement) {
      dotElement.classList.add('black-turn');
    }
    if (turnTextElement) {
      turnTextElement.textContent = 'Lượt đi: Quân Đen (BLACK TURN)';
    }
    if (blackPlayer) blackPlayer.classList.add('active-turn');
    if (redPlayer) redPlayer.classList.remove('active-turn');
  }

  // 2. Reset các lớp trạng thái đặc biệt
  if (statusContainer) {
    statusContainer.classList.remove('check-state', 'gameover-state');
  }

  // 3. Phân loại và hiển thị trạng thái ván cờ
  const isCheck = normalizedStatus === 'CHECK' ||
    (normalizedStatus.includes('CHECK') && !normalizedStatus.includes('CHECKMATE'));

  const isGameOver = normalizedStatus.includes('WIN') ||
    normalizedStatus.includes('WON') ||
    normalizedStatus.includes('DRAW') ||
    normalizedStatus.includes('STALEMATE') ||
    normalizedStatus.includes('CHECKMATE') ||
    normalizedStatus.includes('RESIGN') ||
    normalizedStatus.includes('TIMEOUT') ||
    normalizedStatus.includes('GAME_OVER') ||
    normalizedStatus.includes('GAMEOVER');

  if (isCheck) {
    // Trạng thái Chiếu tướng (CHECK)
    if (statusContainer) {
      statusContainer.classList.add('check-state');
    }
    if (statusMessageElement) {
      const sideInCheck = normalizedTurn === 'RED' ? 'Quân Đỏ' : 'Quân Đen';
      statusMessageElement.textContent = `CHIẾU TƯỚNG! (CHECK) - ${sideInCheck} đang bị chiếu! Cần giải chiếu ngay!`;
    }
  } else if (isGameOver) {
    // Trạng thái Kết thúc trận đấu (Game Result)
    if (statusContainer) {
      statusContainer.classList.add('gameover-state');
    }

    let resultTitle = 'TRẬN ĐẤU KẾT THÚC (GAME OVER)';
    let resultDetail = '';

    if (normalizedStatus.includes('RED_WIN') || normalizedStatus.includes('RED_WON') || normalizedStatus === 'RED WINS') {
      resultTitle = 'KẾT THÚC: Quân Đỏ thắng! (RED WIN)';
      resultDetail = 'Trận đấu kết thúc: Quân Đỏ giành chiến thắng! (RED WIN)';
      if (redPlayer) redPlayer.classList.add('active-turn');
      if (blackPlayer) blackPlayer.classList.remove('active-turn');
    } else if (normalizedStatus.includes('BLACK_WIN') || normalizedStatus.includes('BLACK_WON') || normalizedStatus === 'BLACK WINS') {
      resultTitle = 'KẾT THÚC: Quân Đen thắng! (BLACK WIN)';
      resultDetail = 'Trận đấu kết thúc: Quân Đen giành chiến thắng! (BLACK WIN)';
      if (blackPlayer) blackPlayer.classList.add('active-turn');
      if (redPlayer) redPlayer.classList.remove('active-turn');
    } else if (normalizedStatus.includes('DRAW') || normalizedStatus.includes('STALEMATE')) {
      resultTitle = 'KẾT THÚC: Hòa cờ! (DRAW)';
      resultDetail = 'Hai bên bất phân thắng bại, trận đấu hòa! (DRAW)';
      if (redPlayer) redPlayer.classList.remove('active-turn');
      if (blackPlayer) blackPlayer.classList.remove('active-turn');
    } else if (normalizedStatus.includes('CHECKMATE')) {
      const winner = normalizedTurn === 'RED' ? 'Quân Đen (BLACK WIN)' : 'Quân Đỏ (RED WIN)';
      resultTitle = 'CHIẾU BÍ! (CHECKMATE)';
      resultDetail = `Chiếu bí hoàn toàn! ${winner} giành chiến thắng chung cuộc!`;
    } else if (normalizedStatus.includes('RESIGN')) {
      resultTitle = 'TRẬN ĐẤU KẾT THÚC: Đầu hàng! (RESIGN)';
      resultDetail = 'Một bên đã xin đầu hàng. Trận đấu kết thúc! (RESIGN)';
    } else if (normalizedStatus.includes('TIMEOUT')) {
      resultTitle = 'TRẬN ĐẤU KẾT THÚC: Hết giờ! (TIMEOUT)';
      resultDetail = 'Đã hết thời gian thi đấu! Trận đấu kết thúc! (TIMEOUT)';
    } else {
      resultTitle = `KẾT THÚC: ${rawStatus}`;
      resultDetail = `Trận đấu kết thúc với kết quả: ${rawStatus}`;
    }

    if (turnTextElement) {
      turnTextElement.textContent = resultTitle;
    }
    if (statusMessageElement) {
      statusMessageElement.textContent = resultDetail;
    }
  } else {
    // Trạng thái thi đấu bình thường
    if (statusMessageElement) {
      if (rawStatus && rawStatus !== 'PLAYING') {
        statusMessageElement.textContent = rawStatus;
      } else {
        const sideText = normalizedTurn === 'RED' ? 'Quân Đỏ' : 'Quân Đen';
        statusMessageElement.textContent = `Đang trong lượt đi của ${sideText}.`;
      }
    }
  }
}

// Đăng ký toàn cục cho môi trường không dùng bundler hoặc script thuần
if (typeof window !== 'undefined') {
  window.updateTurnIndicator = updateTurnIndicator;
  window.gameStatus = {
    updateTurnIndicator
  };
}
