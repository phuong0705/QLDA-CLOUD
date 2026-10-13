const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * Game Routes
 * 
 * Tuyến đường chính:
 * - GET  /api/games/:id          - Lấy chi tiết ván cờ (game, players, state, moves)
 * - POST /api/games/:id/save     - Lưu trạng thái ván cờ (snapshot)
 * - POST /api/games/:id/continue - Tiếp tục ván cờ đã lưu (resumable state)
 * 
 * Middleware:
 * - authenticateToken: Bắt buộc người dùng phải đăng nhập hợp lệ
 */

// Route hỗ trợ khi mount tại /api/games
router.get('/:id', authenticateToken, gameController.getGame);
router.post('/:id/save', authenticateToken, gameController.saveGame);
router.post('/:id/continue', authenticateToken, gameController.continueGame);

// Route dự phòng hỗ trợ nếu mount tại root /
router.get('/api/games/:id', authenticateToken, gameController.getGame);
router.post('/api/games/:id/save', authenticateToken, gameController.saveGame);
router.post('/api/games/:id/continue', authenticateToken, gameController.continueGame);

module.exports = router;
