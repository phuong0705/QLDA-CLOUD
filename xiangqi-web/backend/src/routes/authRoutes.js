const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

/**
 * Route xác thực người dùng (Authentication Routes)
 * Tuyến đường: POST /api/auth/register (khi mount tại /api/auth)
 */
router.post('/register', authController.register);

module.exports = router;
