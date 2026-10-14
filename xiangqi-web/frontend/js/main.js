// Điểm khởi tạo ứng dụng frontend; không chứa toàn bộ game logic.
import { renderBoard } from './ui/boardRenderer.js';
import { renderPieces } from './ui/pieceRenderer.js';

/**
 * Trạng thái bàn cờ ban đầu chuẩn Cờ Tướng (32 quân)
 * Bố trí theo luật:
 *   - Hàng 0: Quân Đen (Xe, Mã, Tượng, Sĩ, Tướng, Sĩ, Tượng, Mã, Xe)
 *   - Hàng 2: Pháo Đen (cột 1 và 7)
 *   - Hàng 3: Tốt Đen (cột 0, 2, 4, 6, 8)
 *   - Hàng 6: Tốt Đỏ
 *   - Hàng 7: Pháo Đỏ
 *   - Hàng 9: Quân Đỏ
 */
function getInitialBoardState() {
  const pieces = [
    // === Quân ĐEN (hàng 0 - 3) ===
    { id: 'b-chariot-1',  type: 'chariot',  color: 'BLACK', row: 0, col: 0 },
    { id: 'b-horse-1',    type: 'horse',    color: 'BLACK', row: 0, col: 1 },
    { id: 'b-elephant-1', type: 'elephant', color: 'BLACK', row: 0, col: 2 },
    { id: 'b-advisor-1',  type: 'advisor',  color: 'BLACK', row: 0, col: 3 },
    { id: 'b-general',    type: 'general',  color: 'BLACK', row: 0, col: 4 },
    { id: 'b-advisor-2',  type: 'advisor',  color: 'BLACK', row: 0, col: 5 },
    { id: 'b-elephant-2', type: 'elephant', color: 'BLACK', row: 0, col: 6 },
    { id: 'b-horse-2',    type: 'horse',    color: 'BLACK', row: 0, col: 7 },
    { id: 'b-chariot-2',  type: 'chariot',  color: 'BLACK', row: 0, col: 8 },
    { id: 'b-cannon-1',   type: 'cannon',   color: 'BLACK', row: 2, col: 1 },
    { id: 'b-cannon-2',   type: 'cannon',   color: 'BLACK', row: 2, col: 7 },
    { id: 'b-soldier-1',  type: 'soldier',  color: 'BLACK', row: 3, col: 0 },
    { id: 'b-soldier-2',  type: 'soldier',  color: 'BLACK', row: 3, col: 2 },
    { id: 'b-soldier-3',  type: 'soldier',  color: 'BLACK', row: 3, col: 4 },
    { id: 'b-soldier-4',  type: 'soldier',  color: 'BLACK', row: 3, col: 6 },
    { id: 'b-soldier-5',  type: 'soldier',  color: 'BLACK', row: 3, col: 8 },

    // === Quân ĐỎ (hàng 6 - 9) ===
    { id: 'r-soldier-1',  type: 'soldier',  color: 'RED', row: 6, col: 0 },
    { id: 'r-soldier-2',  type: 'soldier',  color: 'RED', row: 6, col: 2 },
    { id: 'r-soldier-3',  type: 'soldier',  color: 'RED', row: 6, col: 4 },
    { id: 'r-soldier-4',  type: 'soldier',  color: 'RED', row: 6, col: 6 },
    { id: 'r-soldier-5',  type: 'soldier',  color: 'RED', row: 6, col: 8 },
    { id: 'r-cannon-1',   type: 'cannon',   color: 'RED', row: 7, col: 1 },
    { id: 'r-cannon-2',   type: 'cannon',   color: 'RED', row: 7, col: 7 },
    { id: 'r-chariot-1',  type: 'chariot',  color: 'RED', row: 9, col: 0 },
    { id: 'r-horse-1',    type: 'horse',    color: 'RED', row: 9, col: 1 },
    { id: 'r-elephant-1', type: 'elephant', color: 'RED', row: 9, col: 2 },
    { id: 'r-advisor-1',  type: 'advisor',  color: 'RED', row: 9, col: 3 },
    { id: 'r-general',    type: 'general',  color: 'RED', row: 9, col: 4 },
    { id: 'r-advisor-2',  type: 'advisor',  color: 'RED', row: 9, col: 5 },
    { id: 'r-elephant-2', type: 'elephant', color: 'RED', row: 9, col: 6 },
    { id: 'r-horse-2',    type: 'horse',    color: 'RED', row: 9, col: 7 },
    { id: 'r-chariot-2',  type: 'chariot',  color: 'RED', row: 9, col: 8 },
  ];

  return { pieces };
}

document.addEventListener('DOMContentLoaded', () => {
  const chessBoard = document.getElementById('chess-board');
  if (chessBoard) {
    // Khởi tạo bàn cờ Cờ Tướng 9x10
    renderBoard(chessBoard);

    // Render tất cả 32 quân cờ ở vị trí khởi đầu
    const initialState = getInitialBoardState();
    renderPieces(initialState);
  }
});
