/**
 * ============================================================================
 * onlineGame.js - Điều phối chế độ chơi Cờ Tướng Trực tuyến (Online Match)
 * ============================================================================
 * 
 * Nhiệm vụ:
 * 1. Đóng vai trò orchestrator duy nhất kết nối giữa Socket.IO Client (socketClient)
 *    và hệ thống Renderers giao diện của Người 1 (boardRenderer, pieceRenderer, gameStatus).
 * 2. Đọc token và danh tính người chơi từ authManager.
 * 3. Lắng nghe và xử lý chuẩn xác các events realtime:
 *    - `game-started`: Thiết lập ván cờ, render quân ban đầu, gán phe RED/BLACK.
 *    - `move-accepted` / `update-board`: Cập nhật stateVersion, render state mới,
 *      highlight nước đi vừa đi (lastMove), cập nhật lượt và thêm lịch sử.
 *    - `move-rejected`: Reset UI selection/highlight, hiển thị thông báo lỗi nhưng
 *      tuyệt đối KHÔNG tự sửa hoặc mutate server state.
 *    - `timer-sync`: Đồng bộ thời gian còn lại của RED và BLACK (không âm), cập nhật DOM.
 *    - `game-over`: Dừng timer, hiển thị kết quả chung cuộc (CHECKMATE, RESIGN, TIMEOUT).
 *    - `player-disconnected` / `player-reconnected`: Hiển thị cảnh báo grace period.
 *    - `game-resync`: Phục hồi toàn bộ trạng thái khi F5 hoặc reconnect.
 * 4. Xử lý tương tác người dùng: Click chọn quân, gửi `send-move`, nút xin thua `resign`.
 * 5. Tuân thủ nghiêm ngặt các tiêu chí:
 *    - Không tự tính hoặc duplicate luật Cờ Tướng (Server authoritative).
 *    - Không tin currentTurn / boardState từ client.
 *    - Dọn dẹp sạch listeners khi rời trang / kết thúc game (Cleanup).
 */

import socketClient from './socketClient.js';
import {
    renderBoard,
    getSquareElement,
    highlightMoves,
    highlightLastMove,
    highlightCheck,
    clearHighlights
} from '../ui/boardRenderer.js';
import { renderPieces } from '../ui/pieceRenderer.js';
import { updateTurnIndicator } from '../ui/gameStatus.js';

/**
 * Lấy authManager từ môi trường toàn cục
 * @returns {Object|null}
 */
function getAuthManager() {
    if (typeof window !== 'undefined' && window.authManager) {
        return window.authManager;
    }
    if (typeof global !== 'undefined' && global.authManager) {
        return global.authManager;
    }
    try {
        if (typeof require === 'function') {
            return require('../auth/authManager');
        }
    } catch (e) {}
    return null;
}

/**
 * Lớp điều phối ván đấu Online
 */
class OnlineGame {
    constructor() {
        this.socketClient = socketClient;

        // Trạng thái định danh ván cờ
        this.gameId = null;
        this.roomCode = null;
        this.playerColor = null; // 'RED' | 'BLACK' | null (spectator)
        this.currentTurn = 'RED'; // 'RED' | 'BLACK'
        
        // Trạng thái bàn cờ authoritative từ server
        this.boardState = null;
        this.stateVersion = 0;

        // Trạng thái tương tác click & di chuyển
        this.selectedSquare = null; // { row, col, piece }
        this.clientMoveCounter = 0;
        this.isGameOver = false;

        // Đồng hồ đếm giờ
        this.timers = {
            redSeconds: 900,
            blackSeconds: 900
        };
        this.timerInterval = null;

        // Danh sách di chuyển để render history
        this.moveHistory = [];

        // Tham chiếu DOM listeners để cleanup
        this._boundHandleBoardClick = this.handleBoardClick.bind(this);
        this._boundHandleResignClick = this.handleResignClick.bind(this);
        this._isInitialized = false;
    }

    /**
     * Lấy thông tin user hiện tại từ authManager
     * @returns {Object|null}
     */
    getCurrentUser() {
        const am = getAuthManager();
        if (am && typeof am.getUser === 'function') {
            return am.getUser();
        }
        if (typeof localStorage !== 'undefined') {
            try {
                const raw = localStorage.getItem('xiangqi_auth_user');
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    /**
     * Chuẩn hóa tên màu ('RED' hoặc 'BLACK')
     * @param {string} color
     * @returns {'RED'|'BLACK'}
     */
    normalizeColor(color) {
        if (!color) return 'RED';
        const c = String(color).trim().toUpperCase();
        if (c === 'RED' || c === 'R' || c === 'ĐỎ') return 'RED';
        if (c === 'BLACK' || c === 'B' || c === 'ĐEN') return 'BLACK';
        return c;
    }

    /**
     * Khởi tạo hoặc khởi động ván chơi online
     * Hỗ trợ đọc roomCode / gameId từ tham số truyền vào hoặc URL query string
     * 
     * @param {Object} [config={}]
     * @param {string} [config.roomCode]
     * @param {string|number} [config.gameId]
     * @param {Object} [config.socketClient]
     */
    async init(config = {}) {
        // Đảm bảo bàn cờ được dựng trong DOM nếu chưa có
        if (typeof document !== 'undefined') {
            const boardContainer = document.getElementById('chess-board');
            if (boardContainer && !boardContainer.querySelector('.board-frame-layer')) {
                renderBoard(boardContainer);
            }
        }

        // Đọc tham số từ URL nếu không truyền trong config
        let roomCode = config.roomCode;
        let gameId = config.gameId;

        if (typeof window !== 'undefined' && window.location && window.location.search) {
            const params = new URLSearchParams(window.location.search);
            if (!roomCode) roomCode = params.get('room') || params.get('roomCode');
            if (!gameId) gameId = params.get('gameId') || params.get('game');
        }

        if (roomCode) this.roomCode = String(roomCode).trim().toUpperCase();
        if (gameId) this.gameId = gameId;

        if (config.socketClient) {
            this.socketClient = config.socketClient;
        }

        // 1. Kết nối Socket.IO qua socketClient duy nhất (Singleton)
        this.socketClient.connect();

        // 2. Đăng ký các listeners sự kiện realtime
        this.setupSocketListeners();

        // 3. Đăng ký DOM event listeners
        this.setupDomListeners();

        this._isInitialized = true;

        // 4. Nếu có roomCode, tham gia phòng
        if (this.roomCode) {
            await this.socketClient.joinRoom(this.roomCode);
        }

        // 5. Nếu có gameId, thử đồng bộ lại trạng thái ván cờ
        if (this.gameId) {
            await this.socketClient.rejoinGame(this.gameId);
        }

        return this;
    }

    /**
     * Đăng ký toàn bộ event listeners của Socket.IO
     */
    setupSocketListeners() {
        const sc = this.socketClient;

        // Dọn dẹp listeners cũ trước khi đăng ký lại để tránh trùng lặp
        sc.cleanupListeners();

        // Sự kiện: Bắt đầu ván cờ
        sc.on('game-started', (data) => this.handleGameStarted(data));

        // Sự kiện: Nước đi hợp lệ được server chấp nhận
        sc.on('move-accepted', (data) => this.handleMoveAccepted(data));
        sc.on('update-board', (data) => this.handleMoveAccepted(data));

        // Sự kiện: Nước đi bị từ chối
        sc.on('move-rejected', (data) => this.handleMoveRejected(data));

        // Sự kiện: Đồng bộ đồng hồ
        sc.on('timer-sync', (data) => this.handleTimerSync(data));

        // Sự kiện: Kết thúc ván cờ
        sc.on('game-over', (data) => this.handleGameOver(data));

        // Sự kiện: Người chơi mất kết nối / kết nối lại trong Grace Period
        sc.on('player-disconnected', (data) => this.handlePlayerDisconnected(data));
        sc.on('player-reconnected', (data) => this.handlePlayerReconnected(data));

        // Sự kiện: Đồng bộ đầy đủ trạng thái khi reconnect
        sc.on('game-resync', (data) => this.handleGameResync(data));

        // Sự kiện lỗi phòng / lỗi game
        sc.on('game-error', (data) => {
            console.warn('[OnlineGame] Nhận game-error:', data);
            this.showStatusMessage(data?.message || 'Có lỗi xảy ra trong ván đấu', 'error');
        });
    }

    /**
     * Đăng ký tương tác bàn phím / click chuột trên giao diện
     */
    setupDomListeners() {
        if (typeof document === 'undefined') return;

        // Click trên bàn cờ (Event Delegation)
        const boardContainer = document.getElementById('chess-board');
        if (boardContainer) {
            boardContainer.removeEventListener('click', this._boundHandleBoardClick);
            boardContainer.addEventListener('click', this._boundHandleBoardClick);
        }

        // Click nút Đầu hàng
        const resignBtn = document.getElementById('btn-resign');
        if (resignBtn) {
            resignBtn.removeEventListener('click', this._boundHandleResignClick);
            resignBtn.addEventListener('click', this._boundHandleResignClick);
        }
    }

    // ========================================================================
    // Các Handlers xử lý sự kiện realtime từ Server
    // ========================================================================

    /**
     * Xử lý sự kiện game-started
     * Contract: { gameId, roomCode, state, players }
     * @param {Object} payload
     */
    handleGameStarted(payload) {
        if (!payload) return;

        this.gameId = payload.gameId;
        this.roomCode = payload.roomCode;
        this.stateVersion = payload.state?.version || 1;
        this.boardState = payload.state;
        this.isGameOver = false;
        this.currentTurn = this.normalizeColor(payload.state?.currentTurn || 'RED');

        // Xác định phe của người chơi hiện tại bằng cách so khớp userId với players
        const currentUser = this.getCurrentUser();
        const currentUserId = currentUser ? Number(currentUser.id) : null;

        const players = payload.players || {};
        if (currentUserId && players.red && Number(players.red.userId) === currentUserId) {
            this.playerColor = 'RED';
        } else if (currentUserId && players.black && Number(players.black.userId) === currentUserId) {
            this.playerColor = 'BLACK';
        } else {
            this.playerColor = null; // Khán giả / Spectator
        }

        // Cập nhật thông tin kỳ thủ lên UI
        this.updatePlayerCards(players);

        // Reset highlights & selections
        this.clearSelection();
        clearHighlights('all');

        // Render quân cờ ban đầu từ server authoritative state
        renderPieces(this.boardState);

        // Cập nhật chỉ báo lượt đi
        updateTurnIndicator(this.currentTurn, 'PLAYING');

        // Reset bảng lịch sử nước đi
        this.resetMoveHistory();

        this.showStatusMessage('Ván cờ đã bắt đầu! Chúc bạn may mắn.', 'info');
    }

    /**
     * Xử lý sự kiện move-accepted / update-board
     * Contract: { move, state, currentTurn, status, stateVersion }
     * @param {Object} payload
     */
    handleMoveAccepted(payload) {
        if (!payload) return;

        const { move, state, currentTurn, status, stateVersion } = payload;

        // Idempotency / Stale check: Nếu version nhỏ hơn version hiện tại thì bỏ qua packet cũ
        if (stateVersion != null && stateVersion < this.stateVersion) {
            return;
        }

        this.stateVersion = stateVersion != null ? stateVersion : (this.stateVersion + 1);
        this.boardState = state || this.boardState;
        this.currentTurn = this.normalizeColor(currentTurn || state?.currentTurn);

        // Xóa selection cũ
        this.clearSelection();
        clearHighlights('moves');

        // 1. Render trạng thái quân cờ mới
        renderPieces(this.boardState);

        // 2. Highlight nước đi vừa thực hiện (from -> to)
        if (move && move.from && move.to) {
            highlightLastMove(move.from, move.to);
        }

        // 3. Highlight cảnh báo chiếu Tướng nếu có
        const normStatus = String(status || '').toUpperCase();
        if (normStatus.includes('CHECK') && !normStatus.includes('CHECKMATE')) {
            const kingPos = this.findKingPosition(this.currentTurn);
            if (kingPos) {
                highlightCheck(kingPos);
            }
        } else {
            clearHighlights('check');
        }

        // 4. Cập nhật thanh hiển thị trạng thái lượt đi
        updateTurnIndicator(this.currentTurn, status || 'PLAYING');

        // 5. Thêm nước đi vào bảng lịch sử
        if (move) {
            this.appendMoveToHistory(move);
        }
    }

    /**
     * Xử lý sự kiện move-rejected
     * Contract: { clientMoveId, reason, stateVersion }
     * Quy tắc bắt buộc:
     * - Gọi UI reset / highlight message.
     * - Tuyệt đối KHÔNG tự sửa hoặc mutate server state.
     * @param {Object} payload
     */
    handleMoveRejected(payload) {
        // 1. Dọn dẹp ô đang chọn và các highlight gợi ý
        this.clearSelection();
        clearHighlights('moves');

        // 2. Hiển thị thông báo từ chối nước đi lên giao diện
        const reason = payload?.reason || 'Nước đi không hợp lệ theo luật Cờ Tướng!';
        this.showStatusMessage(`Nước đi bị từ chối: ${reason}`, 'error');

        // 3. Không mutate server state; nếu cần đảm bảo giao diện đồng bộ, re-render lại state hiện có
        if (this.boardState) {
            renderPieces(this.boardState);
        }
    }

    /**
     * Xử lý sự kiện timer-sync
     * Contract: { redSeconds, blackSeconds, currentTurn, serverTime }
     * @param {Object} payload
     */
    handleTimerSync(payload) {
        if (!payload) return;

        const { redSeconds, blackSeconds, currentTurn } = payload;

        // Lưu thời gian và bảo đảm không âm (>= 0)
        if (redSeconds != null) {
            this.timers.redSeconds = Math.max(0, Math.floor(Number(redSeconds)));
        }
        if (blackSeconds != null) {
            this.timers.blackSeconds = Math.max(0, Math.floor(Number(blackSeconds)));
        }
        if (currentTurn) {
            this.currentTurn = this.normalizeColor(currentTurn);
        }

        this.updateTimerDisplay();

        // Khởi động đồng hồ đếm lùi client (interpolation 1 giây) nếu chưa chạy
        if (!this.isGameOver && !this.timerInterval) {
            this.startLocalTimerTick();
        }
    }

    /**
     * Xử lý sự kiện game-over
     * Contract: { gameId, winnerId, result, reason, finalState }
     * @param {Object} payload
     */
    handleGameOver(payload) {
        this.isGameOver = true;
        this.stopLocalTimerTick();

        const { winnerId, result, reason, finalState } = payload || {};

        if (finalState) {
            this.boardState = finalState;
            renderPieces(finalState);
        }

        this.clearSelection();
        clearHighlights('moves');

        let statusKey = 'GAME_OVER';
        const normReason = String(reason || '').toUpperCase();
        const normResult = String(result || '').toUpperCase();

        if (normReason.includes('CHECKMATE')) {
            statusKey = 'CHECKMATE';
        } else if (normReason.includes('RESIGN')) {
            statusKey = 'RESIGN';
        } else if (normReason.includes('TIMEOUT')) {
            statusKey = 'TIMEOUT';
        } else if (normResult.includes('RED_WIN')) {
            statusKey = 'RED_WIN';
        } else if (normResult.includes('BLACK_WIN')) {
            statusKey = 'BLACK_WIN';
        } else if (normResult.includes('DRAW')) {
            statusKey = 'DRAW';
        }

        updateTurnIndicator(null, statusKey);

        const currentUser = this.getCurrentUser();
        let message = 'Trận đấu đã kết thúc.';
        if (winnerId != null && currentUser) {
            if (Number(currentUser.id) === Number(winnerId)) {
                message = `Chúc mừng! Bạn đã chiến thắng (${reason || result})!`;
            } else {
                message = `Bạn đã thua (${reason || result}). Chúc bạn may mắn lần sau!`;
            }
        } else if (normResult.includes('DRAW')) {
            message = 'Trận đấu hòa!';
        }

        this.showStatusMessage(message, 'info');
    }

    /**
     * Xử lý sự kiện player-disconnected
     * @param {Object} payload
     */
    handlePlayerDisconnected(payload) {
        const { username, color, gracePeriodSeconds } = payload || {};
        const seconds = gracePeriodSeconds || 60;
        const displayName = username || (color === 'red' ? 'Quân Đỏ' : 'Quân Đen');
        this.showStatusMessage(`Kỳ thủ [${displayName}] mất kết nối! Đang chờ kết nối lại (${seconds}s)...`, 'warning');
    }

    /**
     * Xử lý sự kiện player-reconnected
     * @param {Object} payload
     */
    handlePlayerReconnected(payload) {
        const { username, color } = payload || {};
        const displayName = username || (color === 'red' ? 'Quân Đỏ' : 'Quân Đen');
        this.showStatusMessage(`Kỳ thủ [${displayName}] đã kết nối lại. Ván cờ tiếp tục!`, 'success');
    }

    /**
     * Xử lý sự kiện game-resync (F5 / Rejoin trong Grace Period)
     * Contract: { state, timers, stateVersion, moves }
     * @param {Object} payload
     */
    handleGameResync(payload) {
        if (!payload) return;

        const { state, timers, stateVersion, moves } = payload;

        if (stateVersion != null) {
            this.stateVersion = stateVersion;
        }

        if (state) {
            this.boardState = state;
            this.currentTurn = this.normalizeColor(state.currentTurn || 'RED');
            renderPieces(this.boardState);
            updateTurnIndicator(this.currentTurn, state.status || 'PLAYING');
        }

        if (timers) {
            this.handleTimerSync(timers);
        }

        if (Array.isArray(moves)) {
            this.rebuildMoveHistory(moves);
        }

        this.showStatusMessage('Đã đồng bộ lại dữ liệu ván đấu từ server.', 'success');
    }

    // ========================================================================
    // Tương tác Người dùng (Board Clicks & Resign Action)
    // ========================================================================

    /**
     * Xử lý click trên bàn cờ
     * @param {MouseEvent} event
     */
    handleBoardClick(event) {
        if (this.isGameOver) return;

        const targetSquare = event.target.closest('.board-square');
        if (!targetSquare) return;

        const row = parseInt(targetSquare.dataset.row, 10);
        const col = parseInt(targetSquare.dataset.col, 10);
        if (isNaN(row) || isNaN(col)) return;

        // Nếu là khán giả, không cho phép di chuyển
        if (!this.playerColor) {
            this.showStatusMessage('Bạn đang xem trận đấu với tư cách Khán giả.', 'info');
            return;
        }

        // Kiểm tra xem có đang đúng lượt đi của người này không
        if (this.currentTurn !== this.playerColor) {
            this.showStatusMessage('Chưa đến lượt đi của bạn. Vui lòng chờ đối thủ!', 'warning');
            return;
        }

        const clickedPiece = this.getPieceAt(row, col);

        // Trường hợp 1: Chưa chọn quân cờ nào
        if (!this.selectedSquare) {
            if (clickedPiece && this.normalizeColor(clickedPiece.color) === this.playerColor) {
                this.selectSquare(row, col, clickedPiece);
            }
            return;
        }

        // Trường hợp 2: Đã có ô cờ được chọn trước đó (from)
        const from = this.selectedSquare;

        // 2a. Click lại chính ô đã chọn -> Hủy chọn
        if (from.row === row && from.col === col) {
            this.clearSelection();
            return;
        }

        // 2b. Click vào quân cờ khác cùng phe mình -> Chuyển vùng chọn sang quân mới
        if (clickedPiece && this.normalizeColor(clickedPiece.color) === this.playerColor) {
            this.clearSelection();
            this.selectSquare(row, col, clickedPiece);
            return;
        }

        // 2c. Click vào ô trống hoặc quân của đối thủ -> Gửi yêu cầu nước đi lên server
        const clientMoveId = `move_${Date.now()}_${++this.clientMoveCounter}`;
        const movePayload = {
            gameId: this.gameId,
            from: { row: from.row, col: from.col },
            to: { row, col },
            clientMoveId
        };

        // Dọn vùng chọn trên UI nhưng KHÔNG tự sửa trạng thái quân cờ
        this.clearSelection();

        // Gửi nước đi tới server Socket.IO
        this.socketClient.sendMove(movePayload);
    }

    /**
     * Xử lý click nút Đầu hàng (Resign)
     */
    async handleResignClick() {
        if (this.isGameOver || !this.gameId) return;

        if (!this.playerColor) {
            this.showStatusMessage('Bạn là khán giả, không thể đầu hàng!', 'warning');
            return;
        }

        const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
            ? window.confirm('Bạn có chắc chắn muốn xin đầu hàng ván đấu này không?')
            : true;

        if (confirmed) {
            await this.socketClient.resign(this.gameId);
        }
    }

    // ========================================================================
    // Tiện ích UI, Selection, Timer & History
    // ========================================================================

    /**
     * Tìm quân cờ tại tọa độ (row, col) trong boardState authoritative
     * @param {number} row
     * @param {number} col
     * @returns {Object|null}
     */
    getPieceAt(row, col) {
        if (!this.boardState || !Array.isArray(this.boardState.pieces)) return null;
        return this.boardState.pieces.find(
            p => !p.captured && Number(p.row) === Number(row) && Number(p.col) === Number(col)
        ) || null;
    }

    /**
     * Tìm tọa độ quân Tướng của phe chỉ định
     * @param {'RED'|'BLACK'} color
     * @returns {{ row: number, col: number }|null}
     */
    findKingPosition(color) {
        if (!this.boardState || !Array.isArray(this.boardState.pieces)) return null;
        const norm = this.normalizeColor(color);
        const king = this.boardState.pieces.find(
            p => !p.captured && this.normalizeColor(p.color) === norm && (p.type === 'general' || p.type === 'king' || p.type === 'g' || p.type === 'k')
        );
        return king ? { row: Number(king.row), col: Number(king.col) } : null;
    }

    /**
     * Chọn một ô cờ và highlight trên giao diện
     * @param {number} row
     * @param {number} col
     * @param {Object} piece
     */
    selectSquare(row, col, piece) {
        this.selectedSquare = { row, col, piece };
        const sq = getSquareElement(row, col);
        if (sq) {
            sq.classList.add('square-selected');
        }
    }

    /**
     * Xóa trạng thái chọn ô cờ
     */
    clearSelection() {
        if (this.selectedSquare) {
            const sq = getSquareElement(this.selectedSquare.row, this.selectedSquare.col);
            if (sq) {
                sq.classList.remove('square-selected');
            }
            this.selectedSquare = null;
        }
        clearHighlights('selected');
    }

    /**
     * Khởi động tick đồng hồ 1 giây trên client
     */
    startLocalTimerTick() {
        this.stopLocalTimerTick();
        this.timerInterval = setInterval(() => {
            if (this.isGameOver) {
                this.stopLocalTimerTick();
                return;
            }

            if (this.currentTurn === 'RED') {
                this.timers.redSeconds = Math.max(0, this.timers.redSeconds - 1);
            } else if (this.currentTurn === 'BLACK') {
                this.timers.blackSeconds = Math.max(0, this.timers.blackSeconds - 1);
            }

            this.updateTimerDisplay();
        }, 1000);
    }

    /**
     * Dừng tick đồng hồ client
     */
    stopLocalTimerTick() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * Định dạng số giây sang chuỗi "mm:ss"
     * @param {number} totalSeconds
     * @returns {string}
     */
    formatSeconds(totalSeconds) {
        const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    /**
     * Cập nhật thời gian hiển thị lên các phần tử #red-timer và #black-timer
     */
    updateTimerDisplay() {
        if (typeof document === 'undefined') return;

        const redTimer = document.getElementById('red-timer');
        const blackTimer = document.getElementById('black-timer');

        if (redTimer) {
            redTimer.textContent = this.formatSeconds(this.timers.redSeconds);
        }
        if (blackTimer) {
            blackTimer.textContent = this.formatSeconds(this.timers.blackSeconds);
        }
    }

    /**
     * Cập nhật thông tin thẻ người chơi (#red-player, #black-player)
     * @param {Object} players - { red: { userId, username, elo }, black: { userId, username, elo } }
     */
    updatePlayerCards(players) {
        if (typeof document === 'undefined' || !players) return;

        const redPlayerEl = document.getElementById('red-player');
        const blackPlayerEl = document.getElementById('black-player');

        if (redPlayerEl && players.red) {
            const nameEl = redPlayerEl.querySelector('.player-name');
            const eloEl = redPlayerEl.querySelector('.player-elo');
            const isMe = this.playerColor === 'RED';
            if (nameEl) nameEl.textContent = `${players.red.username || 'Kỳ thủ Đỏ'}${isMe ? ' (Bạn)' : ''}`;
            if (eloEl) eloEl.innerHTML = `<span class="elo-star" aria-hidden="true">★</span> ${players.red.elo || 1500} Elo`;
        }

        if (blackPlayerEl && players.black) {
            const nameEl = blackPlayerEl.querySelector('.player-name');
            const eloEl = blackPlayerEl.querySelector('.player-elo');
            const isMe = this.playerColor === 'BLACK';
            if (nameEl) nameEl.textContent = `${players.black.username || 'Kỳ thủ Đen'}${isMe ? ' (Bạn)' : ''}`;
            if (eloEl) eloEl.innerHTML = `<span class="elo-star" aria-hidden="true">★</span> ${players.black.elo || 1500} Elo`;
        }
    }

    /**
     * Hiển thị thông báo trạng thái lên phần tử #game-status .status-message
     * @param {string} message
     * @param {'info'|'warning'|'error'|'success'} [type='info']
     */
    showStatusMessage(message, type = 'info') {
        if (typeof document === 'undefined') return;
        const msgEl = document.querySelector('#game-status .status-message');
        if (msgEl) {
            msgEl.textContent = message;
            msgEl.className = `status-message status-${type}`;
        }
    }

    /**
     * Định dạng mô tả nước đi
     * @param {Object} move
     * @returns {string}
     */
    formatMoveNotation(move) {
        if (!move || !move.from || !move.to) return '-';
        if (move.notation) return move.notation;
        const pType = move.piece?.type || move.pieceType || '';
        return `${pType} [${move.from.row},${move.from.col}] → [${move.to.row},${move.to.col}]`;
    }

    /**
     * Thêm nước đi vào bảng lịch sử
     * @param {Object} move
     */
    appendMoveToHistory(move) {
        if (typeof document === 'undefined') return;
        const tbody = document.querySelector('#move-history tbody');
        if (!tbody) return;

        // Nếu bảng đang có dòng placeholder dấu "-", xóa đi
        const firstRow = tbody.querySelector('tr');
        if (firstRow) {
            const rTd = firstRow.querySelector('.col-red');
            const bTd = firstRow.querySelector('.col-black');
            if (rTd && rTd.textContent.trim() === '-' && bTd && bTd.textContent.trim() === '-') {
                tbody.innerHTML = '';
            }
        }

        const notation = this.formatMoveNotation(move);
        const pieceColor = this.normalizeColor(move.piece?.color || (this.currentTurn === 'RED' ? 'BLACK' : 'RED'));

        const rows = tbody.querySelectorAll('tr');

        if (pieceColor === 'RED') {
            const rowNumber = rows.length + 1;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-index">${rowNumber}</td>
                <td class="col-red">${notation}</td>
                <td class="col-black">-</td>
            `;
            tbody.appendChild(tr);
        } else {
            const lastRow = rows[rows.length - 1];
            if (lastRow) {
                const bTd = lastRow.querySelector('.col-black');
                if (bTd) bTd.textContent = notation;
            } else {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="col-index">1</td>
                    <td class="col-red">-</td>
                    <td class="col-black">${notation}</td>
                `;
                tbody.appendChild(tr);
            }
        }

        // Tự động cuộn xuống cuối bảng lịch sử
        const container = document.getElementById('move-history');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    /**
     * Dựng lại toàn bộ bảng lịch sử từ danh sách moves
     * @param {Array<Object>} moves
     */
    rebuildMoveHistory(moves) {
        this.resetMoveHistory();
        if (Array.isArray(moves)) {
            moves.forEach(m => this.appendMoveToHistory(m));
        }
    }

    /**
     * Xóa sạch bảng lịch sử nước đi về trạng thái ban đầu
     */
    resetMoveHistory() {
        if (typeof document === 'undefined') return;
        const tbody = document.querySelector('#move-history tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td class="col-index">1</td>
                    <td class="col-red">-</td>
                    <td class="col-black">-</td>
                </tr>
            `;
        }
    }

    /**
     * Tiêu chí nghiệm thu: Dọn dẹp sạch toàn bộ listeners và timer khi rời trang/game
     */
    destroy() {
        this.stopLocalTimerTick();

        if (typeof document !== 'undefined') {
            const boardContainer = document.getElementById('chess-board');
            if (boardContainer) {
                boardContainer.removeEventListener('click', this._boundHandleBoardClick);
            }
            const resignBtn = document.getElementById('btn-resign');
            if (resignBtn) {
                resignBtn.removeEventListener('click', this._boundHandleResignClick);
            }
        }

        // Dọn sạch listeners socket
        this.socketClient.cleanupListeners();
        this._isInitialized = false;
    }
}

// Khởi tạo Singleton instance
const onlineGame = new OnlineGame();

// Tự động nạp khi vào trang game có tham số room hoặc gameId
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const board = document.getElementById('chess-board');
        if (board) {
            const params = new URLSearchParams(window.location.search);
            const room = params.get('room') || params.get('roomCode');
            const gameId = params.get('gameId') || params.get('game');
            // Nếu có room hoặc gameId thì tự động init onlineGame
            if (room || gameId) {
                onlineGame.init({ roomCode: room, gameId: gameId });
            }
        }
    });
}

// Xuất bản cho trình duyệt (Window)
if (typeof window !== 'undefined') {
    window.OnlineGame = OnlineGame;
    window.onlineGame = onlineGame;
}

// Xuất bản cho môi trường Node.js / CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = onlineGame;
    module.exports.OnlineGame = OnlineGame;
    module.exports.onlineGame = onlineGame;
    module.exports.default = onlineGame;
}

// Xuất bản theo chuẩn ES Modules
export { OnlineGame, onlineGame };
export default onlineGame;
