const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * Route thông tin người dùng (User Routes)
 * Tuyến đường: GET /api/users/me (khi mount tại /api/users)
 * Bảo vệ bằng middleware authenticateToken
 */
router.get('/me', authenticateToken, userController.getProfile);

module.exports = router;
