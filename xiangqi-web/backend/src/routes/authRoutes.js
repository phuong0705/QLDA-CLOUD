const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

/**
 * Route xác thực người dùng (Authentication Routes)
 * Tuyến đường: POST /api/auth/register (khi mount tại /api/auth)
 * Tuyến đường: POST /api/auth/login    (khi mount tại /api/auth)
 */
router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;

