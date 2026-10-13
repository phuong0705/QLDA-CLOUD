// backend/src/services/roomService.js

const roomRepository = require('../repositories/roomRepository');
const { generateUniqueRoomCode } = require('../utils/roomCodeGenerator');

/**
 * Business logic for creating a room.
 */
async function createRoomForUser(userId) {
  const existing = await roomRepository.findActiveRoomByUserId(userId);
  if (existing) {
    throw { status: 409, message: 'ALREADY_IN_ACTIVE_ROOM' };
  }

  const roomCode = await generateUniqueRoomCode(roomRepository);
  const room = await roomRepository.create({
    roomCode,
    hostUserId: userId,
    maxPlayers: 2,
    status: 'WAITING'
  });
  return room;
}

/**
 * Business logic for joining a room.
 */
async function joinRoomForUser(userId, rawRoomCode) {
  if (!rawRoomCode || typeof rawRoomCode !== 'string') {
    throw { status: 400, message: 'INVALID_ROOM_CODE' };
  }
  const roomCode = rawRoomCode.trim().toUpperCase();

  const room = await roomRepository.findByCode(roomCode, { includePlayers: true });
  if (!room) {
    throw { status: 404, message: 'ROOM_NOT_FOUND' };
  }

  if (room.status !== room.STATUS.WAITING) {
    throw { status: 409, message: 'ROOM_NOT_WAITING' };
  }

  const currentCount = room.playerCount;
  if (currentCount >= room.maxPlayers) {
    throw { status: 409, message: 'ROOM_FULL' };
  }

  const already = room.players.some(p => p.userId === userId);
  if (already) {
    throw { status: 409, message: 'ALREADY_JOINED' };
  }

  await roomRepository.addPlayer(room.id, userId);
  const updatedRoom = await roomRepository.findById(room.id, { includePlayers: true });
  return updatedRoom;
}

/**
 * Business logic for leaving a room.
 * - Guest leaving while status = WAITING: remove player, keep room WAITING.
 * - Host leaving before game starts: set room status to CLOSED.
 *   Guest(s) will be notified via socket (outside this function).
 */
async function leaveRoomForUser(userId, rawRoomCode) {
  if (!rawRoomCode || typeof rawRoomCode !== 'string') {
    throw { status: 400, message: 'INVALID_ROOM_CODE' };
  }
  const roomCode = rawRoomCode.trim().toUpperCase();

  const room = await roomRepository.findByCode(roomCode, { includePlayers: true });
  if (!room) {
    throw { status: 404, message: 'ROOM_NOT_FOUND' };
  }

  // If the user is not part of the room, treat as not found / unauthorized
  const isParticipant = room.players.some(p => p.userId === userId) || room.hostUserId === userId;
  if (!isParticipant) {
    throw { status: 404, message: 'PLAYER_NOT_IN_ROOM' };
  }

  if (room.hostUserId === userId) {
    // Host leaves before start -> close room
    await roomRepository.updateStatus(room.id, 'CLOSED');
    // Optionally remove all players (not required for UI, they will be informed via socket)
    return await roomRepository.findById(room.id, { includePlayers: true });
  } else {
    // Guest leaves
    await roomRepository.removePlayer(room.id, userId);
    return await roomRepository.findById(room.id, { includePlayers: true });
  }
}

/**
 * Validate an invite payload.
 * fromUserId: numeric id of inviter (must be authenticated)
 * toUsername: string username of invitee (cannot be same as inviter's username)
 * roomCode: 6‑character code (already normalized by caller)
 */
function validateInvite(fromUserId, toUsername, roomCode) {
  if (!fromUserId || typeof fromUserId !== 'number') {
    throw { status: 400, message: 'INVALID_FROM_USER' };
  }
  if (!toUsername || typeof toUsername !== 'string') {
    throw { status: 400, message: 'INVALID_TO_USERNAME' };
  }
  // Simple same‑user check – in real code we would look up the userId of toUsername
  if (String(fromUserId) === toUsername) {
    throw { status: 400, message: 'CANNOT_INVITE_SELF' };
  }
  if (!roomCode || !/^[A-Z0-9]{6}$/.test(roomCode)) {
    throw { status: 400, message: 'INVALID_ROOM_CODE' };
  }
  // Additional checks (e.g., room existence) can be performed by callers.
  return true;
}

module.exports = {
  createRoomForUser,
  joinRoomForUser,
  leaveRoomForUser,
  validateInvite
};
