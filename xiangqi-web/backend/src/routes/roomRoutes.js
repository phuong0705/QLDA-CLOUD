// backend/src/routes/roomRoutes.js

const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const authMiddleware = require('../middleware/auth');

// POST /api/rooms – create a new room (authenticated)
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    await roomController.createRoom(req, res, next);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
