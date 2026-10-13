const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * History Routes
 * 
 * Tuyến đường chính:
 * - GET /api/history (hoặc / khi router mount tại /api/history)
 * 
 * Middleware:
 * - authenticateToken: Bắt buộc người dùng phải đăng nhập hợp lệ
 */

// Route hỗ trợ khi mount tại /api/history
router.get('/', authenticateToken, historyController.getHistory);

// Route dự phòng hỗ trợ nếu mount tại root /
router.get('/api/history', authenticateToken, historyController.getHistory);

module.exports = router;
