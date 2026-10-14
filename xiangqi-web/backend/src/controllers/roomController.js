// backend/src/controllers/roomController.js

const roomService = require('../services/roomService');
const roomRepository = require('../repositories/roomRepository');

/**
 * POST /api/rooms – create a new room (authenticated)
 */
async function createRoom(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    const room = await roomService.createRoomForUser(userId);
    const playersDto = (room.players || []).map(p => ({
      userId: p.userId,
      username: p.username,
      color: p.side
    }));
    const responseDto = {
      roomId: room.id,
      roomCode: room.roomCode,
      status: room.status,
      players: playersDto
    };
    return res.status(201).json(responseDto);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/join – join an existing waiting room (authenticated)
 * Body: { roomCode }
 */
async function joinRoom(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    const { roomCode } = req.body;
    const room = await roomService.joinRoomForUser(userId, roomCode);
    const playersDto = (room.players || []).map(p => ({
      userId: p.userId,
      username: p.username,
      color: p.side
    }));
    const responseDto = {
      roomId: room.id,
      roomCode: room.roomCode,
      status: room.status,
      players: playersDto
    };
    return res.status(200).json(responseDto);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/rooms/:id – get room details by ID
 */
async function getRoom(req, res, next) {
  try {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) {
      return res.status(400).json({ error: 'INVALID_ROOM_ID' });
    }
    const room = await roomRepository.findById(roomId, { includePlayers: true });
    if (!room) {
      return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    }
    const playersDto = (room.players || []).map(p => ({
      userId: p.userId,
      username: p.username,
      color: p.side
    }));
    const responseDto = {
      roomId: room.id,
      roomCode: room.roomCode,
      status: room.status,
      players: playersDto
    };
    return res.status(200).json(responseDto);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/leave – leave a waiting room (authenticated)
 * Body: { roomCode }
 */
async function leaveRoom(req, res, next) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    const { roomCode } = req.body;
    const room = await roomService.leaveRoomForUser(userId, roomCode);
    return res.status(200).json({ success: true, room });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  leaveRoom
};
