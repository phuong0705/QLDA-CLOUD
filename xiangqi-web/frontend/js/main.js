// Điểm khởi tạo ứng dụng frontend; không chứa toàn bộ game logic.
import { renderBoard } from './ui/boardRenderer.js';

document.addEventListener('DOMContentLoaded', () => {
  const chessBoard = document.getElementById('chess-board');
  if (chessBoard) {
    // Khởi tạo bàn cờ Cờ Tướng 9x10
    renderBoard(chessBoard);
  }
});
