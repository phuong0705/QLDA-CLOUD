const express = require('express');
const router = express.Router();
const rankingController = require('../controllers/rankingController');

/**
 * Route bảng xếp hạng (Ranking Routes)
 * Tuyến đường: GET /api/rankings?limit=50 (khi mount tại /api/rankings)
 */
router.get('/', rankingController.getLeaderboard);
router.get('/rankings', rankingController.getLeaderboard);

module.exports = router;
