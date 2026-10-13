/**
 * ============================================================================
 * gameManager.js - Quản lý In-Memory Active Games, Move, Timers & Reconnect
 * ============================================================================
 * 
 * Nhiệm vụ:
 * 1. Quản lý active games in-memory và Authoritative Timer (1s tick).
 * 2. Triển khai Reconnect Grace Period (mặc định 60 giây):
 *    - Khi socket disconnect: đánh dấu player disconnected, phát player-disconnected,
 *      không kết thúc game ngay.
 *    - Khi user kết nối lại với JWT và emit rejoin-game:
 *      + Xác thực user là participant (ngăn chặn user khác đoán gameId để rejoin).
 *      + Join socket room, clear reconnect timer.
 *      + Phát player-reconnected cho cả phòng.
 *      + Gửi game-resync { state, timers, stateVersion, moves } mới nhất.
 *    - Nếu quá grace period: áp dụng policy Forfeit (đối thủ thắng) qua finalizeGame.
 * 3. Hỗ trợ đầy đủ DoD:
 *    - Test disconnect RED, BLACK, cả hai và reconnect thành công.
 *    - Refresh browser trong grace period quay lại đúng game với state/timer chuẩn.
 * 4. Hàm finalizeGame Idempotent (ngăn double-click resign, concurrent timeout).
 * 
 * Contract:
 * - rejoin-game {gameId}
 * - game-resync {state, timers, stateVersion, moves?}
 * - game-over {gameId, winnerId, result, reason, finalState}
 * - timer-sync {redSeconds, blackSeconds, currentTurn, serverTime}
 */

const EventEmitter = require('events');

// Tải module kiểm tra nước đi từ Người 2
let moveValidatorModule;
try {
    moveValidatorModule = require('../game/rules/moveValidator');
} catch (e) {
    moveValidatorModule = null;
}

// Tải GameState từ Người 2
let GameStateModule;
try {
    GameStateModule = require('../game/GameState');
} catch (e) {
    GameStateModule = null;
}

// Tải UserService từ Người 3 (Xử lý Elo)
let userServiceInstance;
try {
    const us = require('../services/userService');
    userServiceInstance = us?.default || us?.UserService || us;
} catch (e) {
    userServiceInstance = null;
}

// Tải GameService từ Người 5
let gameServiceInstance;
try {
    const gs = require('../services/gameService');
    gameServiceInstance = gs?.default || gs?.GameService || gs;
} catch (e) {
    gameServiceInstance = null;
}

// Tải RoomService từ Người 4
let roomServiceInstance;
try {
    const rs = require('../services/roomService');
    roomServiceInstance = rs?.default || rs?.RoomService || rs;
} catch (e) {
    roomServiceInstance = null;
}

/**
 * Lớp biểu diễn một ván cờ đang hoạt động (ActiveGame)
 */
class ActiveGame {
    /**
     * @param {Object} params
     * @param {number|string} params.gameId - ID ván đấu từ GameService
     * @param {string} params.roomCode - Mã phòng cờ
     * @param {Object} params.state - Serialized GameState khởi tạo từ Người 2
     * @param {Object} params.players - Mapping người chơi { red, black }
     * @param {number} [params.timeControl=15] - Thời gian mỗi bên (phút)
     */
    constructor({ gameId, roomCode, state, players, timeControl = 15 }) {
        this.gameId = gameId;
        this.roomCode = String(roomCode).trim().toUpperCase();
        this.state = state;
        this.players = players;

        const defaultMinutes = parseInt(process.env.DEFAULT_TIME_CONTROL_MINUTES, 10) || 15;
        const initialMinutes = Number(timeControl) > 0 ? Number(timeControl) : defaultMinutes;
        const initialSeconds = initialMinutes * 60;

        this.timers = {
            redSeconds: initialSeconds,
            blackSeconds: initialSeconds,
            turnStartedAt: Date.now(),
            timeControl: initialMinutes,
            intervalId: null
        };

        this.version = 1;
        this.status = 'playing';
        this.isFinalizing = false;
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();

        // Chống double submission
        this.processedMoveIds = new Set();

        // Quản lý presence và grace period reconnect cho từng người chơi
        this.presence = {
            red: {
                isOnline: true,
                disconnectedAt: null,
                disconnectTimer: null,
                activeSockets: new Set()
            },
            black: {
                isOnline: true,
                disconnectedAt: null,
                disconnectTimer: null,
                activeSockets: new Set()
            }
        };
    }

    /**
     * Kiểm tra user có phải là người chơi (participant) trong ván cờ hay không
     * @param {number} userId
     * @returns {'red'|'black'|null}
     */
    isParticipant(userId) {
        const uid = Number(userId);
        if (this.players.red && Number(this.players.red.userId) === uid) {
            return 'red';
        }
        if (this.players.black && Number(this.players.black.userId) === uid) {
            return 'black';
        }
        return null;
    }

    /**
     * Đánh dấu người chơi mất kết nối và khởi động timer grace period
     * @param {'red'|'black'} color
     * @param {Function} onTimeout
     * @param {number} gracePeriodMs
     */
    markPlayerDisconnected(color, onTimeout, gracePeriodMs) {
        if (!this.presence[color]) return;

        this.presence[color].isOnline = false;
        this.presence[color].disconnectedAt = Date.now();

        if (this.presence[color].disconnectTimer) {
            clearTimeout(this.presence[color].disconnectTimer);
        }

        this.presence[color].disconnectTimer = setTimeout(() => {
            if (!this.presence[color].isOnline && this.status === 'playing') {
                onTimeout();
            }
        }, gracePeriodMs);
    }

    /**
     * Đánh dấu người chơi đã kết nối lại và xoá timer grace period
     * @param {'red'|'black'} color
     * @param {string} socketId
     */
    markPlayerReconnected(color, socketId) {
        if (!this.presence[color]) return;

        this.presence[color].isOnline = true;
        this.presence[color].disconnectedAt = null;

        if (this.presence[color].disconnectTimer) {
            clearTimeout(this.presence[color].disconnectTimer);
            this.presence[color].disconnectTimer = null;
        }

        if (socketId) {
            this.presence[color].activeSockets.add(socketId);
        }
    }

    /**
     * Lấy snapshot đồng hồ hiện tại chính xác (không âm)
     * Contract: { redSeconds, blackSeconds, currentTurn, serverTime }
     */
    getTimerSnapshot() {
        const now = Date.now();
        let red = this.timers.redSeconds;
        let black = this.timers.blackSeconds;

        if (this.status === 'playing') {
            const elapsed = Math.floor((now - this.timers.turnStartedAt) / 1000);
            const currentTurn = String(this.state?.currentTurn || 'red').toLowerCase();

            if (currentTurn === 'red') {
                red = Math.max(0, red - elapsed);
            } else {
                black = Math.max(0, black - elapsed);
            }
        }

        return {
            redSeconds: Math.max(0, Math.floor(red)),
            blackSeconds: Math.max(0, Math.floor(black)),
            currentTurn: this.state?.currentTurn || 'red',
            serverTime: now
        };
    }

    commitTurnTime(playerColor) {
        const now = Date.now();
        const elapsed = Math.floor((now - this.timers.turnStartedAt) / 1000);

        if (playerColor === 'red') {
            this.timers.redSeconds = Math.max(0, this.timers.redSeconds - elapsed);
        } else {
            this.timers.blackSeconds = Math.max(0, this.timers.blackSeconds - elapsed);
        }

        this.timers.turnStartedAt = now;
    }
}

function cloneState(state) {
    if (!state) return null;
    return {
        board: state.board ? state.board.map((row) => row.map((cell) => (cell ? { ...cell } : null))) : [],
        currentTurn: state.currentTurn,
        status: state.status || 'playing',
        moveCount: Number(state.moveCount || 0),
        checked: Boolean(state.checked),
        history: Array.isArray(state.history) ? state.history.map((h) => ({ ...h })) : []
    };
}

/**
 * Quản lý trạng thái in-memory của tất cả active games
 */
class GameManager extends EventEmitter {
    constructor(
        gameService = gameServiceInstance,
        roomService = roomServiceInstance,
        userService = userServiceInstance
    ) {
        super();
        this.gameService = gameService;
        this.roomService = roomService;
        this.userService = userService;
        this.customMoveValidator = null;

        this.activeGames = new Map();
        this.gamesById = new Map();

        this.creationLocks = new Map();
        this.finalizingLocks = new Map();
        this.finalizedGames = new Map();

        // Ánh xạ phục vụ Reconnect & Grace Period
        this.userActiveGames = new Map();   // userId -> Set<gameId>
        this.socketActiveGames = new Map(); // socketId -> Set<gameId>

        this._nextFallbackId = 1000;
        this.reconnectGracePeriodMs = parseInt(process.env.GAME_RECONNECT_TIMEOUT_MS, 10) || 60000; // 60s
    }

    _initGameState() {
        if (GameStateModule) {
            try {
                let engineState = null;
                if (typeof GameStateModule === 'function') {
                    engineState = new GameStateModule();
                } else if (typeof GameStateModule.createInitialState === 'function') {
                    engineState = GameStateModule.createInitialState();
                } else if (GameStateModule.GameState && typeof GameStateModule.GameState === 'function') {
                    engineState = new GameStateModule.GameState();
                }

                if (engineState) {
                    if (typeof engineState.serialize === 'function') return engineState.serialize();
                    if (typeof engineState.toJSON === 'function') return engineState.toJSON();
                    if (typeof engineState.getState === 'function') return engineState.getState();
                    if (engineState.board) {
                        return {
                            board: engineState.board,
                            currentTurn: engineState.currentTurn || 'red',
                            status: engineState.status || 'playing',
                            moveCount: engineState.moveCount || 0,
                            checked: false,
                            history: []
                        };
                    }
                }
            } catch (err) {
                console.warn('[GameManager] Lỗi khi gọi GameState Người 2:', err.message);
            }
        }

        const board = Array(10).fill(null).map(() => Array(9).fill(null));

        board[0][0] = { type: 'chariot', color: 'black' };
        board[0][1] = { type: 'horse', color: 'black' };
        board[0][2] = { type: 'elephant', color: 'black' };
        board[0][3] = { type: 'advisor', color: 'black' };
        board[0][4] = { type: 'general', color: 'black' };
        board[0][5] = { type: 'advisor', color: 'black' };
        board[0][6] = { type: 'elephant', color: 'black' };
        board[0][7] = { type: 'horse', color: 'black' };
        board[0][8] = { type: 'chariot', color: 'black' };

        board[2][1] = { type: 'cannon', color: 'black' };
        board[2][7] = { type: 'cannon', color: 'black' };

        board[3][0] = { type: 'soldier', color: 'black' };
        board[3][2] = { type: 'soldier', color: 'black' };
        board[3][4] = { type: 'soldier', color: 'black' };
        board[3][6] = { type: 'soldier', color: 'black' };
        board[3][8] = { type: 'soldier', color: 'black' };

        board[6][0] = { type: 'soldier', color: 'red' };
        board[6][2] = { type: 'soldier', color: 'red' };
        board[6][4] = { type: 'soldier', color: 'red' };
        board[6][6] = { type: 'soldier', color: 'red' };
        board[6][8] = { type: 'soldier', color: 'red' };

        board[7][1] = { type: 'cannon', color: 'red' };
        board[7][7] = { type: 'cannon', color: 'red' };

        board[9][0] = { type: 'chariot', color: 'red' };
        board[9][1] = { type: 'horse', color: 'red' };
        board[9][2] = { type: 'elephant', color: 'red' };
        board[9][3] = { type: 'advisor', color: 'red' };
        board[9][4] = { type: 'general', color: 'red' };
        board[9][5] = { type: 'advisor', color: 'red' };
        board[9][6] = { type: 'elephant', color: 'red' };
        board[9][7] = { type: 'horse', color: 'red' };
        board[9][8] = { type: 'chariot', color: 'red' };

        return {
            board,
            currentTurn: 'red',
            status: 'playing',
            moveCount: 0,
            checked: false,
            history: []
        };
    }

    _generateGameId() {
        return ++this._nextFallbackId;
    }

    startTimer(activeGame, io) {
        if (!activeGame) return;

        this.stopTimer(activeGame);

        activeGame.timers.turnStartedAt = Date.now();

        activeGame.timers.intervalId = setInterval(() => {
            if (activeGame.status !== 'playing') {
                this.stopTimer(activeGame);
                return;
            }

            const snapshot = activeGame.getTimerSnapshot();

            if (snapshot.redSeconds <= 0 || snapshot.blackSeconds <= 0) {
                this.stopTimer(activeGame);
                const winnerColor = snapshot.redSeconds <= 0 ? 'black' : 'red';
                this.finalizeGame(activeGame.gameId, {
                    winner: winnerColor,
                    reason: 'TIMEOUT',
                    result: `${winnerColor}_win`
                }, io).catch(() => {});
                return;
            }

            if (io) {
                io.to(activeGame.roomCode).emit('timer-sync', snapshot);
            }
        }, 1000);
    }

    stopTimer(activeGame) {
        if (activeGame?.timers?.intervalId) {
            clearInterval(activeGame.timers.intervalId);
            activeGame.timers.intervalId = null;
        }
    }

    /**
     * Quản lý Grace Period khi một socket bị disconnect
     * Đánh dấu player disconnected, broadcast player-disconnected nhưng KHÔNG kết thúc game ngay
     */
    handlePlayerDisconnect(socketId, userId, io) {
        const uid = Number(userId);
        const gameIds = this.userActiveGames.get(uid);
        if (!gameIds || gameIds.size === 0) return;

        gameIds.forEach((gameId) => {
            const activeGame = this.getGameById(gameId);
            if (!activeGame || activeGame.status !== 'playing') return;

            const playerColor = activeGame.isParticipant(uid);
            if (!playerColor) return;

            // Xóa socketId khỏi activeSockets của player
            if (activeGame.presence[playerColor]) {
                activeGame.presence[playerColor].activeSockets.delete(socketId);
                // Nếu user vẫn còn socket khác (tab khác) đang kết nối thì chưa coi là disconnect
                if (activeGame.presence[playerColor].activeSockets.size > 0) {
                    return;
                }
            }

            // Bắt đầu đếm ngược Grace Period
            activeGame.markPlayerDisconnected(
                playerColor,
                async () => {
                    // Hết hạn Grace Period: Áp dụng Policy xử thua (Forfeit) cho người bỏ cuộc
                    if (activeGame.status === 'playing') {
                        const winnerColor = playerColor === 'red' ? 'black' : 'red';
                        await this.finalizeGame(activeGame.gameId, {
                            winner: winnerColor,
                            reason: 'RESIGN',
                            result: `${winnerColor}_win`
                        }, io);
                    }
                },
                this.reconnectGracePeriodMs
            );

            // Broadcast player-disconnected cho phòng/đối thủ
            if (io) {
                io.to(activeGame.roomCode).emit('player-disconnected', {
                    gameId: activeGame.gameId,
                    roomCode: activeGame.roomCode,
                    userId: uid,
                    playerColor,
                    gracePeriodSeconds: Math.floor(this.reconnectGracePeriodMs / 1000),
                    timestamp: new Date().toISOString()
                });
            }
        });

        this.socketActiveGames.delete(socketId);
    }

    /**
     * Xử lý Rejoin Game khi người chơi kết nối lại trong Grace Period
     * AI thực hiện:
     * - Không cho user khác rejoin bằng gameId đoán được (Xác thực participant).
     * - Clear reconnect timer khi player trở lại.
     * - Phát player-reconnected.
     * - Resync full state (state, timers, stateVersion, moves).
     */
    async handlePlayerRejoin(gameId, userId, socket, io) {
        const uid = Number(userId);
        const activeGame = this.getGameById(gameId) || this.getGameByRoom(gameId);

        if (!activeGame) {
            // Kiểm tra xem game đã finalized chưa
            const finalized = this.finalizedGames.get(String(gameId));
            if (finalized) {
                return {
                    isFinalized: true,
                    gameId: finalized.gameId,
                    roomCode: finalized.roomCode,
                    state: finalized.finalState,
                    timers: { redSeconds: 0, blackSeconds: 0, currentTurn: finalized.finalState?.currentTurn, serverTime: Date.now() },
                    stateVersion: finalized.finalState?.version || 1,
                    moves: finalized.finalState?.history || [],
                    players: activeGame ? activeGame.players : null
                };
            }
            throw new Error(`Không tìm thấy ván cờ với ID: ${gameId}`);
        }

        // 1. Xác thực bảo mật: User phải là participant của ván cờ
        // Tuyệt đối không cho user khác rejoin bằng gameId đoán được
        const playerColor = activeGame.isParticipant(uid);
        if (!playerColor) {
            const err = new Error('Bạn không phải là kỳ thủ trong ván cờ này (Forbidden)');
            err.code = 'FORBIDDEN';
            throw err;
        }

        // 2. Cho socket join vào room channel
        socket.join(activeGame.roomCode);

        // 3. Clear reconnect timer và đánh dấu online
        activeGame.markPlayerReconnected(playerColor, socket.id);

        // Ghi nhận mapping socketId & userId
        if (!this.userActiveGames.has(uid)) {
            this.userActiveGames.set(uid, new Set());
        }
        this.userActiveGames.get(uid).add(activeGame.gameId);

        if (!this.socketActiveGames.has(socket.id)) {
            this.socketActiveGames.set(socket.id, new Set());
        }
        this.socketActiveGames.get(socket.id).add(activeGame.gameId);

        // 4. Phát sự kiện player-reconnected cho cả phòng
        if (io) {
            io.to(activeGame.roomCode).emit('player-reconnected', {
                gameId: activeGame.gameId,
                roomCode: activeGame.roomCode,
                userId: uid,
                playerColor,
                timestamp: new Date().toISOString()
            });
        }

        // 5. Chuẩn bị dữ liệu resync full state
        const currentTimers = activeGame.getTimerSnapshot();
        const moves = activeGame.state?.history || [];

        return {
            isFinalized: false,
            gameId: activeGame.gameId,
            roomCode: activeGame.roomCode,
            state: activeGame.state,
            timers: currentTimers,
            stateVersion: activeGame.version,
            moves,
            players: activeGame.players,
            playerColor
        };
    }

    /**
     * finalizeGame Idempotent
     */
    async finalizeGame(gameId, resultData = {}, io = null) {
        const targetId = Number(gameId) || gameId;
        const key = String(targetId);

        if (this.finalizedGames.has(key)) {
            const cachedResult = this.finalizedGames.get(key);
            if (io && cachedResult) {
                io.to(cachedResult.roomCode || targetId).emit('game-over', cachedResult);
            }
            return cachedResult;
        }

        if (this.finalizingLocks.has(key)) {
            return await this.finalizingLocks.get(key);
        }

        const activeGame = this.getGameById(targetId) || this.getGameByRoom(gameId);
        if (!activeGame) {
            if (this.finalizedGames.has(String(gameId).trim().toUpperCase())) {
                return this.finalizedGames.get(String(gameId).trim().toUpperCase());
            }
            throw new Error(`Không tìm thấy ván cờ với ID/Room: ${gameId}`);
        }

        if (activeGame.status === 'finished' || activeGame.isFinalizing) {
            const cached = this.finalizedGames.get(String(activeGame.gameId));
            if (cached) return cached;
        }

        activeGame.isFinalizing = true;

        const finalizePromise = (async () => {
            try {
                if (this.finalizedGames.has(String(activeGame.gameId))) {
                    return this.finalizedGames.get(String(activeGame.gameId));
                }
                return await this._doFinalizeGame(activeGame, resultData, io);
            } finally {
                this.finalizingLocks.delete(key);
                this.finalizingLocks.delete(String(activeGame.gameId));
            }
        })();

        this.finalizingLocks.set(key, finalizePromise);
        this.finalizingLocks.set(String(activeGame.gameId), finalizePromise);

        return await finalizePromise;
    }

    async _doFinalizeGame(activeGame, resultData = {}, io = null) {
        this.stopTimer(activeGame);

        // Huỷ bỏ các grace period timer nếu còn chạy dở
        if (activeGame.presence.red.disconnectTimer) {
            clearTimeout(activeGame.presence.red.disconnectTimer);
            activeGame.presence.red.disconnectTimer = null;
        }
        if (activeGame.presence.black.disconnectTimer) {
            clearTimeout(activeGame.presence.black.disconnectTimer);
            activeGame.presence.black.disconnectTimer = null;
        }

        let rawReason = String(resultData.reason || 'UNKNOWN').toUpperCase();
        let reason = 'RESIGN';

        if (rawReason.includes('CHECKMATE')) reason = 'CHECKMATE';
        else if (rawReason.includes('RESIGN')) reason = 'RESIGN';
        else if (rawReason.includes('TIMEOUT')) reason = 'TIMEOUT';
        else if (rawReason.includes('DRAW')) reason = 'DRAW';
        else if (rawReason.includes('FORFEIT')) reason = 'RESIGN';

        let winnerColor = resultData.winner ? String(resultData.winner).toLowerCase() : null;
        let winnerId = resultData.winnerId ?? null;
        let result = resultData.result || null;

        if (reason === 'DRAW') {
            winnerColor = null;
            winnerId = null;
            result = 'draw';
        } else {
            if (!winnerColor && winnerId) {
                if (Number(activeGame.players.red?.userId) === Number(winnerId)) winnerColor = 'red';
                else if (Number(activeGame.players.black?.userId) === Number(winnerId)) winnerColor = 'black';
            }

            if (winnerColor === 'red') {
                winnerId = activeGame.players.red ? activeGame.players.red.userId : null;
                result = 'red_win';
            } else if (winnerColor === 'black') {
                winnerId = activeGame.players.black ? activeGame.players.black.userId : null;
                result = 'black_win';
            } else {
                winnerColor = 'red';
                winnerId = activeGame.players.red ? activeGame.players.red.userId : null;
                result = 'red_win';
            }
        }

        activeGame.status = 'finished';
        activeGame.state.status = reason.toLowerCase();

        // 3. Cập nhật Elo qua Người 3 (UserService)
        let eloResult = null;
        const redId = Number(activeGame.players.red?.userId);
        const blackId = Number(activeGame.players.black?.userId);

        if (redId && blackId && redId !== blackId && this.userService) {
            try {
                if (typeof this.userService.applyGameResult === 'function') {
                    eloResult = await this.userService.applyGameResult(
                        activeGame.gameId,
                        redId,
                        blackId,
                        result
                    );
                }
            } catch (eloErr) {
                console.error('[GameManager] Lỗi gọi applyGameResult của Người 3:', eloErr.message);
            }
        }

        // 4. Cập nhật Games qua Người 5 (GameService)
        if (this.gameService) {
            try {
                if (typeof this.gameService.finalizeGame === 'function') {
                    await this.gameService.finalizeGame({
                        gameId: activeGame.gameId,
                        winnerId,
                        result,
                        reason,
                        status: 'FINISHED'
                    });
                } else if (typeof this.gameService.endGame === 'function') {
                    await this.gameService.endGame(activeGame.gameId, {
                        winnerId,
                        result,
                        reason
                    });
                }
            } catch (gameErr) {
                console.warn('[GameManager] Lỗi khi cập nhật GameService finalize:', gameErr.message);
            }
        }

        // 5. Cập nhật room qua Người 4 (RoomService)
        if (this.roomService) {
            try {
                if (typeof this.roomService.updateRoomStatus === 'function') {
                    await this.roomService.updateRoomStatus(activeGame.roomCode, 'FINISHED');
                } else if (typeof this.roomService.setRoomStatus === 'function') {
                    await this.roomService.setRoomStatus(activeGame.roomCode, 'FINISHED');
                }
            } catch (roomErr) {
                console.warn('[GameManager] Lỗi cập nhật status RoomService:', roomErr.message);
            }
        }

        // 6. Payload game-over chuẩn contract
        const finalGameOver = {
            gameId: activeGame.gameId,
            roomCode: activeGame.roomCode,
            winnerId,
            result,
            reason,
            finalState: activeGame.state,
            elo: eloResult || null
        };

        const keyId = String(activeGame.gameId);
        this.finalizedGames.set(keyId, finalGameOver);
        this.finalizedGames.set(activeGame.roomCode, finalGameOver);

        if (io) {
            io.to(activeGame.roomCode).emit('game-over', {
                gameId: finalGameOver.gameId,
                winnerId: finalGameOver.winnerId,
                result: finalGameOver.result,
                reason: finalGameOver.reason,
                finalState: finalGameOver.finalState
            });
        }

        const CLEANUP_DELAY_MS = parseInt(process.env.GAME_CLEANUP_DELAY_MS, 10) || 30000;
        setTimeout(() => {
            this.activeGames.delete(activeGame.roomCode);
            this.gamesById.delete(activeGame.gameId);
            if (redId && this.userActiveGames.has(redId)) this.userActiveGames.get(redId).delete(activeGame.gameId);
            if (blackId && this.userActiveGames.has(blackId)) this.userActiveGames.get(blackId).delete(activeGame.gameId);
        }, CLEANUP_DELAY_MS);

        this.emit('game-over', finalGameOver);
        return finalGameOver;
    }

    async startGameForRoom(roomCode, options = {}) {
        if (!roomCode) {
            throw new Error('roomCode là bắt buộc');
        }

        const normalizedCode = String(roomCode).trim().toUpperCase();

        if (this.activeGames.has(normalizedCode)) {
            const existing = this.activeGames.get(normalizedCode);
            if (options.io) {
                this.broadcastGameStarted(existing, options.io);
                options.io.to(normalizedCode).emit('timer-sync', existing.getTimerSnapshot());
            }
            return existing;
        }

        if (this.creationLocks.has(normalizedCode)) {
            return await this.creationLocks.get(normalizedCode);
        }

        const creationPromise = (async () => {
            try {
                if (this.activeGames.has(normalizedCode)) {
                    return this.activeGames.get(normalizedCode);
                }
                return await this._executeCreateGame(normalizedCode, options);
            } finally {
                this.creationLocks.delete(normalizedCode);
            }
        })();

        this.creationLocks.set(normalizedCode, creationPromise);
        const resultGame = await creationPromise;

        if (options.io && resultGame) {
            this.broadcastGameStarted(resultGame, options.io);
            this.startTimer(resultGame, options.io);
            options.io.to(resultGame.roomCode).emit('timer-sync', resultGame.getTimerSnapshot());
        }

        return resultGame;
    }

    async _executeCreateGame(roomCode, options = {}) {
        let room = options.room || null;

        if (!room && this.roomService) {
            try {
                if (typeof this.roomService.getRoomByCode === 'function') {
                    room = await this.roomService.getRoomByCode(roomCode);
                } else if (typeof this.roomService.getRoom === 'function') {
                    room = await this.roomService.getRoom(roomCode);
                }
            } catch (err) {
                console.error('[GameManager] Lỗi truy vấn RoomService:', err.message);
            }
        }

        if (!room) {
            try {
                const roomSocket = require('../sockets/roomSocket');
                if (roomSocket && roomSocket.inMemoryRoomStore) {
                    room = roomSocket.inMemoryRoomStore.getRoom(roomCode);
                }
            } catch (e) {}
        }

        if (!room) {
            throw new Error(`Không tìm thấy phòng với mã: ${roomCode}`);
        }

        const currentStatus = String(room.status || room.Status || '').toUpperCase();
        if (currentStatus !== 'WAITING' && currentStatus !== 'READY') {
            if (this.activeGames.has(roomCode)) {
                return this.activeGames.get(roomCode);
            }
            throw new Error(`Phòng ${roomCode} không ở trạng thái WAITING (trạng thái hiện tại: ${currentStatus})`);
        }

        const rawPlayers = room.players || room.RoomPlayers || room.members || [];
        if (!Array.isArray(rawPlayers) || rawPlayers.length < 2) {
            throw new Error(`Phòng ${roomCode} chưa đủ hai người chơi để bắt đầu (hiện có: ${rawPlayers.length})`);
        }

        const player1 = rawPlayers[0];
        const player2 = rawPlayers[1];

        const isP1Red = player1.role === 'red' || player1.isHost || Number(player1.userId ?? player1.id) === Number(room.hostId ?? room.HostID);

        const redRaw = isP1Red ? player1 : player2;
        const blackRaw = isP1Red ? player2 : player1;

        const players = {
            red: {
                userId: Number(redRaw.userId ?? redRaw.id ?? redRaw.UserID),
                username: redRaw.username ?? redRaw.Username ?? `User_${redRaw.userId}`,
                role: 'red'
            },
            black: {
                userId: Number(blackRaw.userId ?? blackRaw.id ?? blackRaw.UserID),
                username: blackRaw.username ?? blackRaw.Username ?? `User_${blackRaw.userId}`,
                role: 'black'
            }
        };

        const timeControl = Number(room.timeControl || room.TimeControl || options.timeControl || 15);

        let gameId = null;
        if (this.gameService) {
            try {
                let createdRow = null;
                if (typeof this.gameService.createGame === 'function') {
                    createdRow = await this.gameService.createGame({
                        roomCode,
                        redPlayerId: players.red.userId,
                        blackPlayerId: players.black.userId,
                        timeControl
                    });
                } else if (typeof this.gameService.create === 'function') {
                    createdRow = await this.gameService.create({
                        roomCode,
                        redPlayerId: players.red.userId,
                        blackPlayerId: players.black.userId,
                        timeControl
                    });
                }

                if (createdRow) {
                    gameId = createdRow.id ?? createdRow.gameId ?? createdRow.GameID;
                }
            } catch (err) {
                console.error('[GameManager] Lỗi gọi GameService.createGame:', err.message);
                throw err;
            }
        }

        if (!gameId) {
            gameId = this._generateGameId();
        }

        const state = this._initGameState();

        if (this.roomService) {
            try {
                if (typeof this.roomService.updateRoomStatus === 'function') {
                    await this.roomService.updateRoomStatus(roomCode, 'PLAYING');
                } else if (typeof this.roomService.setRoomStatus === 'function') {
                    await this.roomService.setRoomStatus(roomCode, 'PLAYING');
                } else if (typeof this.roomService.updateStatus === 'function') {
                    await this.roomService.updateStatus(roomCode, 'PLAYING');
                }
            } catch (err) {
                console.warn('[GameManager] Lỗi cập nhật status RoomService:', err.message);
            }
        }

        room.status = 'PLAYING';

        const activeGame = new ActiveGame({
            gameId,
            roomCode,
            state,
            players,
            timeControl
        });

        this.activeGames.set(roomCode, activeGame);
        this.gamesById.set(gameId, activeGame);

        // Lưu mapping phục vụ reconnect
        if (!this.userActiveGames.has(players.red.userId)) {
            this.userActiveGames.set(players.red.userId, new Set());
        }
        this.userActiveGames.get(players.red.userId).add(gameId);

        if (!this.userActiveGames.has(players.black.userId)) {
            this.userActiveGames.set(players.black.userId, new Set());
        }
        this.userActiveGames.get(players.black.userId).add(gameId);

        this.emit('game-created', activeGame);

        return activeGame;
    }

    broadcastGameStarted(activeGame, io) {
        if (!activeGame || !io) return;

        const payload = {
            gameId: activeGame.gameId,
            roomCode: activeGame.roomCode,
            state: activeGame.state,
            players: activeGame.players
        };

        io.to(activeGame.roomCode).emit('game-started', payload);
    }

    async validateMove(gameState, move, playerColor) {
        if (typeof this.customMoveValidator === 'function') {
            const customRes = await this.customMoveValidator(gameState, move, playerColor);
            if (customRes !== null && customRes !== undefined) {
                return typeof customRes === 'boolean'
                    ? { isValid: customRes, reason: customRes ? null : 'Nước đi không hợp lệ' }
                    : customRes;
            }
        }

        if (moveValidatorModule) {
            try {
                let validatorFn = moveValidatorModule.validateMove || moveValidatorModule.isValidMove || moveValidatorModule;
                if (typeof validatorFn === 'function') {
                    const engineRes = await validatorFn(gameState, move, playerColor);
                    if (engineRes !== null && engineRes !== undefined) {
                        return typeof engineRes === 'boolean'
                            ? { isValid: engineRes, reason: engineRes ? null : 'Nước đi không hợp lệ theo luật Người 2' }
                            : engineRes;
                    }
                }
            } catch (err) {
                console.warn('[GameManager] Lỗi khi gọi moveValidator Người 2:', err.message);
            }
        }

        const { from, to } = move;
        const board = gameState.board;

        if (
            from.row < 0 || from.row > 9 || from.col < 0 || from.col > 8 ||
            to.row < 0 || to.row > 9 || to.col < 0 || to.col > 8
        ) {
            return { isValid: false, reason: 'Tọa độ nước đi vượt ngoài bàn cờ' };
        }

        if (from.row === to.row && from.col === to.col) {
            return { isValid: false, reason: 'Tọa độ đích trùng với tọa độ xuất phát (illegal pattern)' };
        }

        const piece = board[from.row][from.col];
        if (!piece) {
            return { isValid: false, reason: 'Ô xuất phát không có quân cờ (wrong piece)' };
        }

        if (piece.color !== playerColor) {
            return { isValid: false, reason: `Không thể điều khiển quân cờ của đối phương (${piece.color} !== ${playerColor}) (wrong piece)` };
        }

        const targetPiece = board[to.row][to.col];
        if (targetPiece && targetPiece.color === playerColor) {
            return { isValid: false, reason: 'Không thể đi vào ô có quân cờ cùng màu của mình (illegal pattern)' };
        }

        const dRow = to.row - from.row;
        const dCol = to.col - from.col;
        const absRow = Math.abs(dRow);
        const absCol = Math.abs(dCol);

        const countPiecesBetween = (r1, c1, r2, c2) => {
            let count = 0;
            if (r1 === r2) {
                const minC = Math.min(c1, c2);
                const maxC = Math.max(c1, c2);
                for (let c = minC + 1; c < maxC; c++) {
                    if (board[r1][c]) count++;
                }
            } else if (c1 === c2) {
                const minR = Math.min(r1, r2);
                const maxR = Math.max(r1, r2);
                for (let r = minR + 1; r < maxR; r++) {
                    if (board[r][c1]) count++;
                }
            }
            return count;
        };

        const pieceType = piece.type.toLowerCase();

        switch (pieceType) {
            case 'soldier': {
                const forward = playerColor === 'red' ? -1 : 1;
                const crossedRiver = playerColor === 'red' ? from.row < 5 : from.row > 4;

                if (!crossedRiver) {
                    if (dRow !== forward || absCol !== 0) {
                        return { isValid: false, reason: 'Tốt chưa qua sông chỉ được tiến thẳng 1 ô (illegal pattern)' };
                    }
                } else {
                    const isForward = dRow === forward && absCol === 0;
                    const isSideway = dRow === 0 && absCol === 1;
                    if (!isForward && !isSideway) {
                        return { isValid: false, reason: 'Tốt qua sông chỉ được tiến hoặc đi ngang 1 ô, không được đi lùi (illegal pattern)' };
                    }
                }
                break;
            }

            case 'chariot': {
                if (absRow !== 0 && absCol !== 0) {
                    return { isValid: false, reason: 'Xe chỉ được đi thẳng hoặc ngang (illegal pattern)' };
                }
                if (countPiecesBetween(from.row, from.col, to.row, to.col) !== 0) {
                    return { isValid: false, reason: 'Đường đi của Xe bị cản bởi quân cờ khác (illegal pattern)' };
                }
                break;
            }

            case 'cannon': {
                if (absRow !== 0 && absCol !== 0) {
                    return { isValid: false, reason: 'Pháo chỉ được đi thẳng hoặc ngang (illegal pattern)' };
                }
                const count = countPiecesBetween(from.row, from.col, to.row, to.col);
                if (!targetPiece) {
                    if (count !== 0) {
                        return { isValid: false, reason: 'Pháo di chuyển không ăn quân không được nhảy qua quân cản (illegal pattern)' };
                    }
                } else {
                    if (count !== 1) {
                        return { isValid: false, reason: 'Pháo ăn quân phải có đúng một quân cờ làm ngòi (illegal pattern)' };
                    }
                }
                break;
            }

            case 'horse': {
                if (!((absRow === 2 && absCol === 1) || (absRow === 1 && absCol === 2))) {
                    return { isValid: false, reason: 'Mã phải di chuyển theo hình chữ L (illegal pattern)' };
                }
                const blockRow = absRow === 2 ? from.row + dRow / 2 : from.row;
                const blockCol = absCol === 2 ? from.col + dCol / 2 : from.col;
                if (board[blockRow][blockCol]) {
                    return { isValid: false, reason: 'Mã bị cản chân mã (illegal pattern)' };
                }
                break;
            }

            case 'elephant': {
                if (absRow !== 2 || absCol !== 2) {
                    return { isValid: false, reason: 'Tượng phải đi chéo 2 ô (illegal pattern)' };
                }
                const riverLimit = playerColor === 'red' ? to.row >= 5 : to.row <= 4;
                if (!riverLimit) {
                    return { isValid: false, reason: 'Tượng không được phép qua sông (illegal pattern)' };
                }
                const eyeRow = from.row + dRow / 2;
                const eyeCol = from.col + dCol / 2;
                if (board[eyeRow][eyeCol]) {
                    return { isValid: false, reason: 'Tượng bị cản mắt tượng (illegal pattern)' };
                }
                break;
            }

            case 'advisor': {
                if (absRow !== 1 || absCol !== 1) {
                    return { isValid: false, reason: 'Sĩ phải đi chéo 1 ô (illegal pattern)' };
                }
                const inPalaceCol = to.col >= 3 && to.col <= 5;
                const inPalaceRow = playerColor === 'red' ? to.row >= 7 && to.row <= 9 : to.row >= 0 && to.row <= 2;
                if (!inPalaceCol || !inPalaceRow) {
                    return { isValid: false, reason: 'Sĩ không được đi ra khỏi cung cấm (illegal pattern)' };
                }
                break;
            }

            case 'general': {
                if (absRow + absCol !== 1) {
                    return { isValid: false, reason: 'Tướng chỉ được đi ngang hoặc dọc 1 ô (illegal pattern)' };
                }
                const inPalaceCol = to.col >= 3 && to.col <= 5;
                const inPalaceRow = playerColor === 'red' ? to.row >= 7 && to.row <= 9 : to.row >= 0 && to.row <= 2;
                if (!inPalaceCol || !inPalaceRow) {
                    return { isValid: false, reason: 'Tướng không được đi ra khỏi cung cấm (illegal pattern)' };
                }
                break;
            }

            default:
                break;
        }

        return {
            isValid: true,
            movedPiece: piece,
            capturedPiece: targetPiece || null
        };
    }

    async processMove({ gameId, from, to, clientMoveId, userId, io }) {
        const activeGame = this.getGameById(gameId) || this.getGameByRoom(gameId);
        if (!activeGame) {
            return {
                success: false,
                reason: 'Ván cờ không tồn tại hoặc đã kết thúc',
                stateVersion: null
            };
        }

        if (activeGame.status !== 'playing') {
            return {
                success: false,
                reason: `Ván cờ đã kết thúc với trạng thái: ${activeGame.status}`,
                stateVersion: activeGame.version
            };
        }

        const currentVersion = activeGame.version;

        if (clientMoveId && activeGame.processedMoveIds.has(clientMoveId)) {
            return {
                success: false,
                reason: 'Nước đi đã được xử lý trước đó (duplicate move)',
                stateVersion: currentVersion,
                clientMoveId
            };
        }

        const uid = Number(userId);
        let userColor = null;

        if (activeGame.players.red && Number(activeGame.players.red.userId) === uid) {
            userColor = 'red';
        } else if (activeGame.players.black && Number(activeGame.players.black.userId) === uid) {
            userColor = 'black';
        } else {
            return {
                success: false,
                reason: 'Người dùng không phải là kỳ thủ trong ván cờ này',
                stateVersion: currentVersion,
                clientMoveId
            };
        }

        const currentTurn = String(activeGame.state.currentTurn || 'red').toLowerCase();
        if (userColor !== currentTurn) {
            return {
                success: false,
                reason: `Chưa tới lượt đi của bạn (hiện tại là lượt ${currentTurn}) (wrong turn)`,
                stateVersion: currentVersion,
                clientMoveId
            };
        }

        const timerSnapshot = activeGame.getTimerSnapshot();
        if (timerSnapshot.redSeconds <= 0 || timerSnapshot.blackSeconds <= 0) {
            const winnerColor = timerSnapshot.redSeconds <= 0 ? 'black' : 'red';
            this.finalizeGame(activeGame.gameId, {
                winner: winnerColor,
                reason: 'TIMEOUT',
                result: `${winnerColor}_win`
            }, io).catch(() => {});
            return {
                success: false,
                reason: 'Hết thời gian thi đấu (TIMEOUT)',
                stateVersion: currentVersion,
                clientMoveId
            };
        }

        const normFrom = this._normalizeCoords(from);
        const normTo = this._normalizeCoords(to);

        if (!normFrom || !normTo) {
            return {
                success: false,
                reason: 'Tọa độ nước đi không hợp lệ',
                stateVersion: currentVersion,
                clientMoveId
            };
        }

        const moveObj = { from: normFrom, to: normTo, color: userColor };
        const validation = await this.validateMove(activeGame.state, moveObj, userColor);

        if (!validation.isValid) {
            return {
                success: false,
                reason: validation.reason || 'Nước đi vi phạm luật Cờ Tướng (illegal pattern)',
                stateVersion: currentVersion,
                clientMoveId
            };
        }

        const nextState = cloneState(activeGame.state);
        const movingPiece = nextState.board[normFrom.row][normFrom.col];
        const capturedPiece = nextState.board[normTo.row][normTo.col];

        nextState.board[normTo.row][normTo.col] = movingPiece;
        nextState.board[normFrom.row][normFrom.col] = null;

        nextState.currentTurn = currentTurn === 'red' ? 'black' : 'red';
        nextState.moveCount = (nextState.moveCount || 0) + 1;

        nextState.history.push({
            from: normFrom,
            to: normTo,
            piece: movingPiece,
            captured: capturedPiece || null,
            moveNumber: nextState.moveCount,
            playedBy: uid
        });

        const nextVersion = currentVersion + 1;
        const nextMoveNumber = nextState.moveCount;

        if (this.gameService) {
            try {
                if (typeof this.gameService.saveMove === 'function') {
                    await this.gameService.saveMove({
                        gameId: activeGame.gameId,
                        moveNumber: nextMoveNumber,
                        playerId: uid,
                        from: normFrom,
                        to: normTo,
                        piece: movingPiece?.type,
                        capturedPiece: capturedPiece?.type
                    });
                } else if (typeof this.gameService.recordMove === 'function') {
                    await this.gameService.recordMove({
                        gameId: activeGame.gameId,
                        moveNumber: nextMoveNumber,
                        playerId: uid,
                        from: normFrom,
                        to: normTo
                    });
                }
            } catch (persistErr) {
                console.error('[GameManager] Lỗi khi persist nước đi qua GameService:', persistErr.message);
                return {
                    success: false,
                    reason: 'Lỗi lưu trữ nước đi vào cơ sở dữ liệu: ' + persistErr.message,
                    stateVersion: currentVersion,
                    clientMoveId
                };
            }
        }

        activeGame.commitTurnTime(userColor);
        activeGame.state = nextState;
        activeGame.version = nextVersion;
        activeGame.updatedAt = new Date().toISOString();

        if (clientMoveId) {
            activeGame.processedMoveIds.add(clientMoveId);
        }

        const updatedTimer = activeGame.getTimerSnapshot();

        if (capturedPiece && capturedPiece.type === 'general') {
            const winner = userColor;
            this.finalizeGame(activeGame.gameId, {
                winner,
                reason: 'CHECKMATE',
                result: `${winner}_win`
            }, io).catch(() => {});
        }

        return {
            success: true,
            roomCode: activeGame.roomCode,
            gameId: activeGame.gameId,
            move: {
                from: normFrom,
                to: normTo,
                piece: movingPiece,
                capturedPiece: capturedPiece || null,
                clientMoveId: clientMoveId || null
            },
            state: activeGame.state,
            currentTurn: activeGame.state.currentTurn,
            status: activeGame.state.status,
            stateVersion: activeGame.version,
            timer: updatedTimer
        };
    }

    _normalizeCoords(pos) {
        if (!pos) return null;
        if (typeof pos.row === 'number' && typeof pos.col === 'number') {
            return { row: Number(pos.row), col: Number(pos.col) };
        }
        if (Array.isArray(pos) && pos.length >= 2) {
            return { row: Number(pos[0]), col: Number(pos[1]) };
        }
        if (typeof pos.y === 'number' && typeof pos.x === 'number') {
            return { row: Number(pos.y), col: Number(pos.x) };
        }
        return null;
    }

    getGameByRoom(roomCode) {
        if (!roomCode) return null;
        return this.activeGames.get(String(roomCode).trim().toUpperCase()) || null;
    }

    getGameById(gameId) {
        if (!gameId) return null;
        return this.gamesById.get(Number(gameId)) || this.gamesById.get(gameId) || this.gamesById.get(String(gameId)) || null;
    }

    isGameActive(roomCode) {
        if (!roomCode) return false;
        return this.activeGames.has(String(roomCode).trim().toUpperCase());
    }

    endGame(roomCode) {
        const normalized = String(roomCode).trim().toUpperCase();
        const game = this.activeGames.get(normalized);
        if (game) {
            this.stopTimer(game);
            game.status = 'ended';
            this.activeGames.delete(normalized);
            this.gamesById.delete(game.gameId);
            this.emit('game-ended', game);
        }
    }

    reset() {
        this.activeGames.forEach((game) => {
            this.stopTimer(game);
            if (game.presence.red.disconnectTimer) clearTimeout(game.presence.red.disconnectTimer);
            if (game.presence.black.disconnectTimer) clearTimeout(game.presence.black.disconnectTimer);
        });
        this.activeGames.clear();
        this.gamesById.clear();
        this.creationLocks.clear();
        this.finalizingLocks.clear();
        this.finalizedGames.clear();
        this.userActiveGames.clear();
        this.socketActiveGames.clear();
        this._nextFallbackId = 1000;
        this.customMoveValidator = null;
    }

    setGameService(service) {
        this.gameService = service;
    }

    setRoomService(service) {
        this.roomService = service;
    }

    setUserService(service) {
        this.userService = service;
    }

    setMoveValidator(validatorFn) {
        this.customMoveValidator = validatorFn;
    }
}

// Singleton default instance
const defaultGameManager = new GameManager();

module.exports = defaultGameManager;
module.exports.GameManager = GameManager;
module.exports.ActiveGame = ActiveGame;
module.exports.cloneState = cloneState;
