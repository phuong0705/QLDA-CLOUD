/**
 * ============================================================================
 * gameSocket.js - Quản lý sự kiện ván đấu, Nước đi, Timer & Reconnect Grace Period
 * ============================================================================
 * 
 * Nhiệm vụ:
 * 1. Lắng nghe và điều phối sự kiện `send-move`, `start-game`, `resign`.
 * 2. Triển khai Reconnect Grace Period:
 *    - Khi socket disconnect: đánh dấu player disconnected, phát player-disconnected
 *      cho đối thủ nhưng không kết thúc game ngay.
 *    - Khi user kết nối lại và emit `rejoin-game`:
 *      + Xác thực user là participant (ngăn chặn user khác đoán gameId để rejoin).
 *      + Join socket room, clear reconnect timer.
 *      + Phát player-reconnected cho cả phòng.
 *      + Gửi game-resync { state, timers, stateVersion, moves } mới nhất.
 * 3. Contract bắt buộc:
 *    - rejoin-game {gameId}
 *    - game-resync {state, timers, stateVersion, moves?}
 *    - timer-sync {redSeconds, blackSeconds, currentTurn, serverTime}
 *    - game-over {gameId, winnerId, result, reason, finalState}
 *    - move-accepted / move-rejected
 */

const gameManager = require('../services/gameManager');

/**
 * Đăng ký sự kiện ván cờ cho Socket đã authenticated
 * @param {Object} io - Socket.IO Server instance
 * @param {Object} socket - Client socket instance (socket.user = { userId, username })
 */
function gameSocket(io, socket) {
    if (!socket || !socket.user) {
        return;
    }

    const userId = Number(socket.user.userId);
    const username = socket.user.username || `User_${userId}`;

    // ========================================================================
    // Event: start-game
    // Kích hoạt khi phòng đủ 2 người và sẵn sàng bắt đầu
    // ========================================================================
    socket.on('start-game', async (payload, ackCallback) => {
        try {
            const rawRoomCode = typeof payload === 'string' ? payload : payload?.roomCode;
            if (!rawRoomCode || typeof rawRoomCode !== 'string') {
                socket.emit('game-error', {
                    code: 'INVALID_ROOM_CODE',
                    message: 'Mã phòng (roomCode) không hợp lệ'
                });
                if (typeof ackCallback === 'function') {
                    ackCallback({ success: false, error: 'Thiếu mã phòng' });
                }
                return;
            }

            const roomCode = rawRoomCode.trim().toUpperCase();

            // Khởi tạo ván cờ với Idempotency Guard từ GameManager
            const activeGame = await gameManager.startGameForRoom(roomCode, { io });

            const responsePayload = {
                gameId: activeGame.gameId,
                roomCode: activeGame.roomCode,
                state: activeGame.state,
                players: activeGame.players
            };

            io.to(roomCode).emit('game-started', responsePayload);

            const initialTimer = activeGame.getTimerSnapshot();
            io.to(roomCode).emit('timer-sync', initialTimer);

            if (typeof ackCallback === 'function') {
                ackCallback({ success: true, game: responsePayload, timer: initialTimer });
            }
        } catch (err) {
            console.error('[GameSocket] Lỗi trong start-game:', err.message);
            socket.emit('game-error', {
                code: 'CANNOT_START_GAME',
                message: err.message || 'Không thể bắt đầu ván cờ'
            });
            if (typeof ackCallback === 'function') {
                ackCallback({ success: false, error: err.message });
            }
        }
    });

    // ========================================================================
    // Event: send-move
    // Xử lý nước đi do client gửi lên
    // ========================================================================
    socket.on('send-move', async (payload, ackCallback) => {
        try {
            const { gameId, from, to, clientMoveId } = payload || {};

            if (!gameId || !from || !to) {
                const rejectPayload = {
                    clientMoveId: clientMoveId || null,
                    reason: 'Dữ liệu nước đi không đầy đủ (yêu cầu gameId, from, to)',
                    stateVersion: null
                };
                socket.emit('move-rejected', rejectPayload);
                if (typeof ackCallback === 'function') {
                    ackCallback({ success: false, ...rejectPayload });
                }
                return;
            }

            const result = await gameManager.processMove({
                gameId,
                from,
                to,
                clientMoveId,
                userId,
                io
            });

            // 1. Trường hợp nước đi không hợp lệ (Invalid Move)
            if (!result.success) {
                const rejectPayload = {
                    clientMoveId: result.clientMoveId || clientMoveId || null,
                    reason: result.reason || 'Nước đi không hợp lệ',
                    stateVersion: result.stateVersion ?? null
                };

                socket.emit('move-rejected', rejectPayload);

                if (typeof ackCallback === 'function') {
                    ackCallback({ success: false, ...rejectPayload });
                }
                return;
            }

            // 2. Trường hợp nước đi hợp lệ (Valid Move)
            const acceptedPayload = {
                move: result.move,
                state: result.state,
                currentTurn: result.currentTurn,
                status: result.status,
                stateVersion: result.stateVersion
            };

            io.to(result.roomCode).emit('move-accepted', acceptedPayload);
            io.to(result.roomCode).emit('update-board', acceptedPayload);

            if (result.timer) {
                io.to(result.roomCode).emit('timer-sync', result.timer);
            }

            if (typeof ackCallback === 'function') {
                ackCallback({ success: true, ...acceptedPayload, timer: result.timer });
            }
        } catch (err) {
            console.error('[GameSocket] Lỗi xử lý send-move:', err.message);
            const fallbackReject = {
                clientMoveId: payload?.clientMoveId || null,
                reason: err.message || 'Lỗi hệ thống khi xử lý nước đi',
                stateVersion: null
            };
            socket.emit('move-rejected', fallbackReject);
            if (typeof ackCallback === 'function') {
                ackCallback({ success: false, ...fallbackReject });
            }
        }
    });

    // ========================================================================
    // Event: resign (Đầu hàng)
    // ========================================================================
    socket.on('resign', async (payload, ackCallback) => {
        try {
            const rawKey = typeof payload === 'string' ? payload : (payload?.gameId || payload?.roomCode);

            let activeGame = null;
            if (rawKey) {
                activeGame = gameManager.getGameById(rawKey) || gameManager.getGameByRoom(rawKey);
            }

            if (!activeGame) {
                const rooms = socket.rooms;
                if (rooms) {
                    for (const r of rooms) {
                        activeGame = gameManager.getGameByRoom(r);
                        if (activeGame) break;
                    }
                }
            }

            if (!activeGame) {
                socket.emit('game-error', {
                    code: 'GAME_NOT_FOUND',
                    message: 'Không tìm thấy ván cờ đang hoạt động'
                });
                if (typeof ackCallback === 'function') {
                    ackCallback({ success: false, error: 'Không tìm thấy ván cờ' });
                }
                return;
            }

            let winnerColor = null;
            if (Number(activeGame.players.red?.userId) === userId) {
                winnerColor = 'black';
            } else if (Number(activeGame.players.black?.userId) === userId) {
                winnerColor = 'red';
            } else {
                socket.emit('game-error', {
                    code: 'NOT_A_PLAYER',
                    message: 'Bạn không phải là kỳ thủ trong ván cờ này'
                });
                if (typeof ackCallback === 'function') {
                    ackCallback({ success: false, error: 'Không phải kỳ thủ trong trận' });
                }
                return;
            }

            const finalResult = await gameManager.finalizeGame(activeGame.gameId, {
                winner: winnerColor,
                reason: 'RESIGN',
                result: `${winnerColor}_win`
            }, io);

            if (typeof ackCallback === 'function') {
                ackCallback({
                    success: true,
                    gameId: finalResult.gameId,
                    winnerId: finalResult.winnerId,
                    result: finalResult.result,
                    reason: finalResult.reason
                });
            }
        } catch (err) {
            console.error('[GameSocket] Lỗi xử lý resign:', err.message);
            socket.emit('game-error', {
                code: 'RESIGN_ERROR',
                message: err.message || 'Lỗi khi xử lý đầu hàng'
            });
        }
    });

    // ========================================================================
    // Event: rejoin-game
    // Reconnect trong Grace Period
    // Contract:
    // client emit: rejoin-game { gameId }
    // server emit: game-resync { state, timers, stateVersion, moves }
    // ========================================================================
    socket.on('rejoin-game', async (payload, ackCallback) => {
        try {
            const rawGameId = typeof payload === 'string' ? payload : (payload?.gameId || payload?.roomCode);

            if (!rawGameId) {
                socket.emit('game-error', {
                    code: 'INVALID_PAYLOAD',
                    message: 'Thiếu gameId để tham gia lại ván cờ'
                });
                if (typeof ackCallback === 'function') {
                    ackCallback({ success: false, error: 'Thiếu gameId' });
                }
                return;
            }

            // Gọi gameManager xử lý rejoin (xác thực participant, clear timer, join room)
            const resyncData = await gameManager.handlePlayerRejoin(rawGameId, userId, socket, io);

            // Gửi packet resync chuẩn contract
            const resyncPayload = {
                state: resyncData.state,
                timers: resyncData.timers,
                stateVersion: resyncData.stateVersion,
                moves: resyncData.moves || []
            };

            // Emit game-resync cho chính client vừa kết nối lại
            socket.emit('game-resync', resyncPayload);

            // Đồng bộ snapshot timer
            if (resyncData.timers) {
                socket.emit('timer-sync', resyncData.timers);
            }

            if (typeof ackCallback === 'function') {
                ackCallback({
                    success: true,
                    gameId: resyncData.gameId,
                    roomCode: resyncData.roomCode,
                    playerColor: resyncData.playerColor,
                    resync: resyncPayload
                });
            }
        } catch (err) {
            console.error('[GameSocket] Lỗi xử lý rejoin-game:', err.message);
            const errCode = err.code || 'REJOIN_ERROR';
            socket.emit('game-error', {
                code: errCode,
                message: err.message || 'Không thể tham gia lại ván cờ'
            });
            if (typeof ackCallback === 'function') {
                ackCallback({ success: false, error: err.message, code: errCode });
            }
        }
    });

    // ========================================================================
    // Event: sync-game / get-game
    // ========================================================================
    socket.on('sync-game', (payload, ackCallback) => {
        try {
            const rawRoomCode = typeof payload === 'string' ? payload : (payload?.roomCode || payload?.gameId);
            if (!rawRoomCode) return;

            const targetKey = String(rawRoomCode).trim().toUpperCase();
            const activeGame = gameManager.getGameByRoom(targetKey) || gameManager.getGameById(targetKey);

            if (!activeGame) {
                const finalized = gameManager.finalizedGames.get(targetKey);
                if (finalized) {
                    socket.emit('game-over', {
                        gameId: finalized.gameId,
                        winnerId: finalized.winnerId,
                        result: finalized.result,
                        reason: finalized.reason,
                        finalState: finalized.finalState
                    });
                    if (typeof ackCallback === 'function') {
                        ackCallback({ success: true, finished: true, game: finalized });
                    }
                    return;
                }

                socket.emit('game-error', {
                    code: 'GAME_NOT_FOUND',
                    message: 'Không tìm thấy ván cờ đang hoạt động'
                });
                return;
            }

            const currentTimerSnapshot = activeGame.getTimerSnapshot();

            const gameData = {
                gameId: activeGame.gameId,
                roomCode: activeGame.roomCode,
                state: activeGame.state,
                players: activeGame.players,
                timers: activeGame.timers,
                version: activeGame.version,
                stateVersion: activeGame.version,
                timer: currentTimerSnapshot
            };

            socket.emit('game-started', {
                gameId: activeGame.gameId,
                roomCode: activeGame.roomCode,
                state: activeGame.state,
                players: activeGame.players
            });

            socket.emit('timer-sync', currentTimerSnapshot);

            if (typeof ackCallback === 'function') {
                ackCallback({ success: true, game: gameData });
            }
        } catch (err) {
            console.error('[GameSocket] Lỗi trong sync-game:', err.message);
        }
    });

    // ========================================================================
    // Event: disconnect
    // Bắt đầu đếm ngược Grace Period cho kỳ thủ, không kết thúc game ngay
    // ========================================================================
    socket.on('disconnect', () => {
        gameManager.handlePlayerDisconnect(socket.id, userId, io);
    });
}

// ----------------------------------------------------------------------------
// Exports và Test Utilities
// ----------------------------------------------------------------------------
module.exports = gameSocket;
module.exports.register = gameSocket;
module.exports.gameManager = gameManager;

module.exports.triggerGameStart = async (roomCode, io) => {
    return await gameManager.startGameForRoom(roomCode, { io });
};
