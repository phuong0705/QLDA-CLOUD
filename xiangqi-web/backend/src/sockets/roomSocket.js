/**
 * ============================================================================
 * roomSocket.js - Quản lý sự kiện phòng chơi realtime (Xiangqi Web)
 * ============================================================================
 * 
 * Nhiệm vụ:
 * 1. Lắng nghe và xử lý các sự kiện `join-room` và `leave-room`.
 * 2. Validate payload `roomCode` chặt chẽ.
 * 3. Kiểm tra tính hợp lệ về membership qua RoomService của Người 4 trước khi cho
 *    phép socket join vào channel của room (Người ngoài membership không join được).
 * 4. Map userId -> active sockets để hỗ trợ nhiều tab/reconnect cho cùng một user.
 * 5. Khi disconnect: Đánh dấu presence (isOnline = false) và áp dụng Reconnect Policy
 *    (không xóa membership ngay trong thời gian chờ grace period).
 * 6. Phát sự kiện `room-updated` (RoomDto) và `player-joined` đến đúng room.
 * 7. Xử lý duplicate join cùng một socket (không tạo thêm player thừa, không emit rác).
 * 
 * Contract:
 * - client emit join-room { roomCode } -> server emit room-updated RoomDto / room-error
 * - client emit leave-room { roomCode } -> server emit room-updated RoomDto / left-room
 */

// 1. Tải RoomService của Người 4 (nếu đã triển khai)
let activeRoomService = null;
try {
    const serviceModule = require('../services/roomService');
    // Hỗ trợ cả default export lẫn named export/singleton
    activeRoomService = serviceModule?.default || serviceModule?.RoomService || serviceModule;
    if (typeof activeRoomService === 'function') {
        try {
            activeRoomService = new activeRoomService();
        } catch (e) {
            // Có thể là module chức năng thuần túy
        }
    }
} catch (err) {
    activeRoomService = null;
}

// ----------------------------------------------------------------------------
// In-Memory Membership Store (Fallback khi RoomService chưa triển khai hoặc cho Unit Tests)
// ----------------------------------------------------------------------------
class InMemoryRoomStore {
    constructor() {
        this.rooms = new Map();
    }

    createRoom({ roomCode, name, hostId, timeControl = 15 }) {
        const code = String(roomCode).trim().toUpperCase();
        const room = {
            roomCode: code,
            name: name || `Phòng ${code}`,
            hostId: Number(hostId),
            status: 'waiting',
            timeControl: Number(timeControl),
            players: [
                {
                    userId: Number(hostId),
                    username: `Host_${hostId}`,
                    role: 'red',
                    isHost: true,
                    joinedAt: new Date().toISOString()
                }
            ],
            spectators: []
        };
        this.rooms.set(code, room);
        return room;
    }

    getRoom(roomCode) {
        if (!roomCode) return null;
        return this.rooms.get(String(roomCode).trim().toUpperCase()) || null;
    }

    addMember(roomCode, { userId, username, role = 'black' }) {
        const room = this.getRoom(roomCode);
        if (!room) return null;

        const uid = Number(userId);
        const existing = room.players.find((p) => p.userId === uid);
        if (existing) {
            return existing;
        }

        const newPlayer = {
            userId: uid,
            username: username || `User_${uid}`,
            role: role || (room.players.length === 0 ? 'red' : 'black'),
            isHost: room.players.length === 0 || room.hostId === uid,
            joinedAt: new Date().toISOString()
        };
        room.players.push(newPlayer);
        return newPlayer;
    }

    removeMember(roomCode, userId) {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        const uid = Number(userId);
        const index = room.players.findIndex((p) => p.userId === uid);
        if (index !== -1) {
            room.players.splice(index, 1);
            return true;
        }
        return false;
    }

    isMember(roomCode, userId) {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        const uid = Number(userId);
        return room.players.some((p) => p.userId === uid);
    }

    reset() {
        this.rooms.clear();
    }
}

const inMemoryRoomStore = new InMemoryRoomStore();

// ----------------------------------------------------------------------------
// State Management: Ánh xạ UserId -> Active Sockets & Room Presence Tracking
// ----------------------------------------------------------------------------
// userId -> Set<socketId>
const userSocketsMap = new Map();

// socketId -> Set<roomCode>
const socketRoomsMap = new Map();

// roomCode -> Map<userId, { isOnline: boolean, activeSockets: Set<socketId>, reconnectTimer: Timeout|null, lastSeen: number }>
const roomPresenceMap = new Map();

// Thời gian chờ cho phép người chơi reconnect lại trước khi kick khỏi phòng (60 giây)
const RECONNECT_GRACE_PERIOD_MS = parseInt(process.env.ROOM_RECONNECT_TIMEOUT_MS, 10) || 60000;

/**
 * Validate định dạng roomCode
 * @param {any} payload - Dữ liệu client gửi lên
 * @returns {{ isValid: boolean, roomCode?: string, error?: string }}
 */
function validateRoomCode(payload) {
    let rawCode = null;
    if (typeof payload === 'string') {
        rawCode = payload;
    } else if (payload && typeof payload === 'object') {
        rawCode = payload.roomCode || payload.code || payload.roomId;
    }

    if (!rawCode || typeof rawCode !== 'string') {
        return { isValid: false, error: 'Mã phòng (roomCode) không được để trống' };
    }

    const trimmed = rawCode.trim().toUpperCase();
    if (trimmed.length < 2 || trimmed.length > 50) {
        return { isValid: false, error: 'Mã phòng phải có độ dài từ 2 đến 50 ký tự' };
    }

    if (!/^[A-Z0-9_-]+$/.test(trimmed)) {
        return { isValid: false, error: 'Mã phòng chứa ký tự không hợp lệ' };
    }

    return { isValid: true, roomCode: trimmed };
}

/**
 * Kiểm tra xem user có phải là thành viên hợp lệ (RoomPlayers) của phòng hay không
 * Sử dụng RoomService của Người 4 hoặc fallback qua inMemoryRoomStore
 * @param {string} roomCode
 * @param {number|string} userId
 * @returns {Promise<boolean>}
 */
async function checkMembership(roomCode, userId) {
    const uid = Number(userId);

    // 1. Kiểm tra qua RoomService nếu service có hỗ trợ
    if (activeRoomService) {
        try {
            if (typeof activeRoomService.checkMembership === 'function') {
                return Boolean(await activeRoomService.checkMembership(roomCode, uid));
            }
            if (typeof activeRoomService.isMember === 'function') {
                return Boolean(await activeRoomService.isMember(roomCode, uid));
            }
            if (typeof activeRoomService.getRoomByCode === 'function') {
                const room = await activeRoomService.getRoomByCode(roomCode);
                if (room) return isUserInRoomPlayers(room, uid);
            }
            if (typeof activeRoomService.getRoom === 'function') {
                const room = await activeRoomService.getRoom(roomCode);
                if (room) return isUserInRoomPlayers(room, uid);
            }
        } catch (err) {
            console.error('[RoomSocket] Lỗi khi gọi RoomService.checkMembership:', err.message);
        }
    }

    // 2. Fallback kiểm tra trong InMemoryRoomStore
    return inMemoryRoomStore.isMember(roomCode, uid);
}

/**
 * Kiểm tra xem userId có nằm trong mảng RoomPlayers của room object hay không
 */
function isUserInRoomPlayers(room, uid) {
    if (!room) return false;
    const players = room.players || room.RoomPlayers || room.members || [];
    const isInPlayers = players.some((p) => {
        const pId = p.userId ?? p.id ?? p.UserID;
        return Number(pId) === uid;
    });

    if (isInPlayers) return true;

    // Kiểm tra thêm hostId / redPlayerId / blackPlayerId
    const hostId = room.hostId ?? room.HostID;
    const redId = room.redPlayerId ?? room.RedPlayerID;
    const blackId = room.blackPlayerId ?? room.BlackPlayerID;
    return Number(hostId) === uid || Number(redId) === uid || Number(blackId) === uid;
}

/**
 * Lấy dữ liệu DTO chuẩn của phòng (RoomDto) kết hợp dữ liệu presence realtime
 * @param {string} roomCode
 * @returns {Promise<Object>} RoomDto
 */
async function getRoomDto(roomCode) {
    let baseRoom = null;

    if (activeRoomService) {
        try {
            if (typeof activeRoomService.getRoomDto === 'function') {
                return await activeRoomService.getRoomDto(roomCode);
            }
            if (typeof activeRoomService.getRoomByCode === 'function') {
                baseRoom = await activeRoomService.getRoomByCode(roomCode);
            } else if (typeof activeRoomService.getRoom === 'function') {
                baseRoom = await activeRoomService.getRoom(roomCode);
            }
        } catch (err) {
            console.error('[RoomSocket] Lỗi lấy RoomDto từ RoomService:', err.message);
        }
    }

    if (!baseRoom) {
        baseRoom = inMemoryRoomStore.getRoom(roomCode);
    }

    if (!baseRoom) {
        return {
            roomCode,
            status: 'waiting',
            players: [],
            spectators: [],
            updatedAt: new Date().toISOString()
        };
    }

    // Lấy presence realtime của các người chơi trong phòng
    const presences = roomPresenceMap.get(roomCode) || new Map();
    const rawPlayers = baseRoom.players || baseRoom.RoomPlayers || [];

    const mappedPlayers = rawPlayers.map((p) => {
        const pUserId = Number(p.userId ?? p.id ?? p.UserID);
        const presence = presences.get(pUserId);
        const isOnline = presence ? presence.isOnline : false;

        return {
            userId: pUserId,
            username: p.username ?? p.Username ?? `User_${pUserId}`,
            role: p.role ?? p.Role ?? (p.isHost ? 'red' : 'black'),
            isHost: Boolean(p.isHost || pUserId === Number(baseRoom.hostId ?? baseRoom.HostID)),
            isOnline,
            joinedAt: p.joinedAt || p.CreatedAt || new Date().toISOString()
        };
    });

    return {
        roomCode: baseRoom.roomCode || roomCode,
        id: baseRoom.id ?? baseRoom.roomId ?? baseRoom.RoomID ?? 1,
        name: baseRoom.name ?? baseRoom.RoomName ?? `Phòng ${roomCode}`,
        hostId: Number(baseRoom.hostId ?? baseRoom.HostID ?? (mappedPlayers[0]?.userId || 0)),
        status: baseRoom.status ?? baseRoom.Status ?? 'waiting',
        timeControl: Number(baseRoom.timeControl ?? baseRoom.TimeControl ?? 15),
        players: mappedPlayers,
        spectators: baseRoom.spectators || [],
        updatedAt: new Date().toISOString()
    };
}

/**
 * Đánh dấu user online trong phòng và huỷ bỏ timer reconnect nếu có
 */
function markUserOnlineInRoom(roomCode, userId, username, socketId) {
    const uid = Number(userId);
    let roomPresences = roomPresenceMap.get(roomCode);
    if (!roomPresences) {
        roomPresences = new Map();
        roomPresenceMap.set(roomCode, roomPresences);
    }

    let presence = roomPresences.get(uid);
    if (!presence) {
        presence = {
            userId: uid,
            username: username || `User_${uid}`,
            isOnline: true,
            activeSockets: new Set(),
            reconnectTimer: null,
            lastSeen: Date.now()
        };
        roomPresences.set(uid, presence);
    }

    // Huỷ Reconnect Policy Timer vì người chơi đã kết nối lại thành công!
    if (presence.reconnectTimer) {
        clearTimeout(presence.reconnectTimer);
        presence.reconnectTimer = null;
    }

    presence.isOnline = true;
    presence.activeSockets.add(socketId);
    presence.lastSeen = Date.now();
}

/**
 * Đánh dấu user offline khi disconnect, áp dụng Reconnect Policy
 */
function markUserOfflineInRoom(roomCode, userId, socketId, io) {
    const uid = Number(userId);
    const roomPresences = roomPresenceMap.get(roomCode);
    if (!roomPresences) return;

    const presence = roomPresences.get(uid);
    if (!presence) return;

    presence.activeSockets.delete(socketId);

    // Nếu user vẫn còn socket khác đang mở (ví dụ tab trình duyệt khác), vẫn giữ isOnline = true
    if (presence.activeSockets.size > 0) {
        return;
    }

    // Đánh dấu presence: offline tạm thời
    presence.isOnline = false;
    presence.lastSeen = Date.now();

    // Thông báo cho phòng về trạng thái disconnected của người chơi
    getRoomDto(roomCode).then((dto) => {
        io.to(roomCode).emit('room-updated', dto);
        io.to(roomCode).emit('player-status-changed', {
            userId: uid,
            roomCode,
            isOnline: false,
            timestamp: new Date().toISOString()
        });
    }).catch(() => {});

    // Huỷ timer cũ nếu tồn tại
    if (presence.reconnectTimer) {
        clearTimeout(presence.reconnectTimer);
    }

    // Khởi chạy Reconnect Policy: KHÔNG xóa membership ngay trong thời gian chờ
    presence.reconnectTimer = setTimeout(async () => {
        const currentPresences = roomPresenceMap.get(roomCode);
        const currentPresence = currentPresences?.get(uid);

        // Hết thời gian chờ mà người chơi vẫn chưa online lại
        if (currentPresence && !currentPresence.isOnline) {
            currentPresences.delete(uid);

            // Gọi RoomService để cập nhật/rời phòng nếu cần
            if (activeRoomService) {
                try {
                    if (typeof activeRoomService.removePlayer === 'function') {
                        await activeRoomService.removePlayer(roomCode, uid);
                    } else if (typeof activeRoomService.leaveRoom === 'function') {
                        await activeRoomService.leaveRoom(roomCode, uid);
                    }
                } catch (e) {}
            } else {
                inMemoryRoomStore.removeMember(roomCode, uid);
            }

            const updatedDto = await getRoomDto(roomCode);
            io.to(roomCode).emit('room-updated', updatedDto);
            io.to(roomCode).emit('player-left', {
                userId: uid,
                roomCode,
                reason: 'reconnect_timeout',
                timestamp: new Date().toISOString()
            });
        }
    }, RECONNECT_GRACE_PERIOD_MS);
}

/**
 * Đăng ký các sự kiện socket cho phòng chơi
 * @param {Object} io - Socket.IO Server instance
 * @param {Object} socket - Socket instance của client đã xác thực (socket.user={userId, username})
 */
function roomSocket(io, socket) {
    if (!socket || !socket.user) {
        return;
    }

    const userId = Number(socket.user.userId);
    const username = socket.user.username || `User_${userId}`;

    // Lưu ánh xạ userId -> socketId
    if (!userSocketsMap.has(userId)) {
        userSocketsMap.set(userId, new Set());
    }
    userSocketsMap.get(userId).add(socket.id);

    // ========================================================================
    // Event: join-room
    // Contract: client emit join-room {roomCode} => server emit room-updated RoomDto / room-error
    // ========================================================================
    socket.on('join-room', async (payload, ackCallback) => {
        try {
            // 1. Validate payload roomCode
            const validation = validateRoomCode(payload);
            if (!validation.isValid) {
                socket.emit('room-error', {
                    code: 'INVALID_ROOM_CODE',
                    message: validation.error
                });
                if (typeof ackCallback === 'function') {
                    ackCallback({ success: false, error: validation.error });
                }
                return;
            }

            const roomCode = validation.roomCode;

            // 2. Kiểm tra Duplicate Join cùng socket (Tiêu chí nghiệm thu DoD)
            const joinedRooms = socketRoomsMap.get(socket.id) || new Set();
            const isAlreadyJoined = joinedRooms.has(roomCode);

            // 3. Kiểm tra Room Membership qua RoomService/Repository
            // Tuyệt đối không cho user chỉ biết roomCode mà chưa được add RoomPlayers vào socket room
            const isMember = await checkMembership(roomCode, userId);
            if (!isMember) {
                socket.emit('room-error', {
                    code: 'NOT_A_MEMBER',
                    message: 'Bạn chưa tham gia phòng này. Vui lòng vào phòng qua hệ thống trước khi tham gia socket.'
                });
                if (typeof ackCallback === 'function') {
                    ackCallback({
                        success: false,
                        error: 'Người dùng không nằm trong danh sách RoomPlayers'
                    });
                }
                return;
            }

            // Nếu socket đã join room này từ trước (duplicate join trên cùng socket):
            if (isAlreadyJoined) {
                // Không tạo lại duplicate player, chỉ gửi lại DTO hiện tại để đồng bộ
                const currentDto = await getRoomDto(roomCode);
                socket.emit('room-updated', currentDto);
                if (typeof ackCallback === 'function') {
                    ackCallback({ success: true, duplicate: true, room: currentDto });
                }
                return;
            }

            // 4. Cho socket gia nhập room channel của Socket.IO
            socket.join(roomCode);
            joinedRooms.add(roomCode);
            socketRoomsMap.set(socket.id, joinedRooms);

            // 5. Cập nhật presence và đánh dấu online
            markUserOnlineInRoom(roomCode, userId, username, socket.id);

            // 6. Cập nhật trạng thái presence lên RoomService nếu service có hỗ trợ
            if (activeRoomService && typeof activeRoomService.updatePresence === 'function') {
                try {
                    await activeRoomService.updatePresence(roomCode, userId, true);
                } catch (e) {}
            }

            // 7. Lấy RoomDto cập nhật mới nhất
            const roomDto = await getRoomDto(roomCode);

            // 8. Phát room-updated và player-joined cho đúng room
            io.to(roomCode).emit('room-updated', roomDto);
            io.to(roomCode).emit('player-joined', {
                userId,
                username,
                roomCode,
                timestamp: new Date().toISOString()
            });

            if (typeof ackCallback === 'function') {
                ackCallback({ success: true, room: roomDto });
            }
        } catch (err) {
            console.error('[RoomSocket] Lỗi xử lý join-room:', err.message);
            socket.emit('room-error', {
                code: 'INTERNAL_ERROR',
                message: 'Đã xảy ra lỗi nội bộ khi tham gia phòng'
            });
            if (typeof ackCallback === 'function') {
                ackCallback({ success: false, error: err.message });
            }
        }
    });

    // ========================================================================
    // Event: leave-room
    // ========================================================================
    socket.on('leave-room', async (payload, ackCallback) => {
        try {
            const validation = validateRoomCode(payload);
            let roomCode = validation.isValid ? validation.roomCode : null;

            if (!roomCode) {
                const userRooms = socketRoomsMap.get(socket.id);
                if (userRooms && userRooms.size > 0) {
                    roomCode = Array.from(userRooms)[0];
                }
            }

            if (!roomCode) {
                socket.emit('room-error', {
                    code: 'INVALID_ROOM_CODE',
                    message: 'Thiếu mã phòng để rời'
                });
                return;
            }

            // Rời socket channel
            socket.leave(roomCode);
            const joinedRooms = socketRoomsMap.get(socket.id);
            if (joinedRooms) {
                joinedRooms.delete(roomCode);
            }

            // Xóa khỏi presence
            const roomPresences = roomPresenceMap.get(roomCode);
            if (roomPresences) {
                const pres = roomPresences.get(userId);
                if (pres && pres.reconnectTimer) {
                    clearTimeout(pres.reconnectTimer);
                }
                roomPresences.delete(userId);
            }

            // Gọi RoomService rời phòng
            if (activeRoomService) {
                try {
                    if (typeof activeRoomService.leaveRoom === 'function') {
                        await activeRoomService.leaveRoom(roomCode, userId);
                    } else if (typeof activeRoomService.removePlayer === 'function') {
                        await activeRoomService.removePlayer(roomCode, userId);
                    }
                } catch (e) {}
            } else {
                inMemoryRoomStore.removeMember(roomCode, userId);
            }

            // Lấy RoomDto cập nhật và broadcast
            const updatedDto = await getRoomDto(roomCode);
            io.to(roomCode).emit('room-updated', updatedDto);
            io.to(roomCode).emit('player-left', {
                userId,
                username,
                roomCode,
                timestamp: new Date().toISOString()
            });

            socket.emit('left-room', { roomCode });

            if (typeof ackCallback === 'function') {
                ackCallback({ success: true, roomCode });
            }
        } catch (err) {
            console.error('[RoomSocket] Lỗi xử lý leave-room:', err.message);
            socket.emit('room-error', {
                code: 'INTERNAL_ERROR',
                message: 'Đã xảy ra lỗi khi rời phòng'
            });
        }
    });

    // ========================================================================
    // Event: disconnect
    // Khi disconnect: Đánh dấu presence nhưng KHÔNG xóa membership ngay (Reconnect Policy)
    // ========================================================================
    socket.on('disconnect', () => {
        // Gỡ socket khỏi danh sách active sockets của user
        const activeSockets = userSocketsMap.get(userId);
        if (activeSockets) {
            activeSockets.delete(socket.id);
            if (activeSockets.size === 0) {
                userSocketsMap.delete(userId);
            }
        }

        // Xử lý presence cho tất cả các phòng mà socket này đã tham gia
        const joinedRooms = socketRoomsMap.get(socket.id);
        if (joinedRooms && joinedRooms.size > 0) {
            joinedRooms.forEach((roomCode) => {
                markUserOfflineInRoom(roomCode, userId, socket.id, io);
            });
        }

        socketRoomsMap.delete(socket.id);
    });
}

// ----------------------------------------------------------------------------
// Exports và Test Helpers
// ----------------------------------------------------------------------------
module.exports = roomSocket;
module.exports.register = roomSocket;
module.exports.validateRoomCode = validateRoomCode;
module.exports.checkMembership = checkMembership;
module.exports.getRoomDto = getRoomDto;
module.exports.inMemoryRoomStore = inMemoryRoomStore;
module.exports.userSocketsMap = userSocketsMap;
module.exports.socketRoomsMap = socketRoomsMap;
module.exports.roomPresenceMap = roomPresenceMap;

// Hàm hỗ trợ inject RoomService phục vụ Unit Test
module.exports.setRoomService = (service) => {
    activeRoomService = service;
};
module.exports.getRoomService = () => activeRoomService;

// Hàm reset toàn bộ presence state phục vụ kiểm thử
module.exports.resetState = () => {
    userSocketsMap.clear();
    socketRoomsMap.clear();
    roomPresenceMap.forEach((presences) => {
        presences.forEach((p) => {
            if (p.reconnectTimer) clearTimeout(p.reconnectTimer);
        });
    });
    roomPresenceMap.clear();
    inMemoryRoomStore.reset();
};
