// backend/src/routes/roomRoutes.js

const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const authMiddleware = require('../middleware/auth');

// POST /api/rooms – create a new room (authenticated)
router.post('/', authMiddleware, roomController.createRoom);

// POST /api/rooms/join – join an existing room (authenticated)
router.post('/join', authMiddleware, roomController.joinRoom);

// POST /api/rooms/leave – leave an existing room (authenticated)
router.post('/leave', authMiddleware, roomController.leaveRoom);

// GET /api/rooms/:id – get room details by ID (can be public or authenticated)
router.get('/:id', roomController.getRoom);

module.exports = router;
