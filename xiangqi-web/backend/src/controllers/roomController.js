// backend/src/controllers/roomController.js

const roomService = require('../services/roomService');

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

module.exports = {
  createRoom,
  joinRoom
};
