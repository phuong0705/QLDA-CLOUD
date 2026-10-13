const rankingService = require('../services/rankingService');

/**
 * Controller xử lý các request liên quan đến Bảng xếp hạng (Ranking Controller)
 */
class RankingController {
    /**
     * @param {Object} [service=rankingService] - Service xếp hạng
     */
    constructor(service = rankingService) {
        this.rankingService = service;
        this.getLeaderboard = this.getLeaderboard.bind(this);
    }

    /**
     * Lấy danh sách bảng xếp hạng người chơi
     * Endpoint: GET /api/rankings?limit=50
     * 
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} [next]
     */
    async getLeaderboard(req, res, next) {
        try {
            const { limit } = req.query || {};

            const rankings = await this.rankingService.getLeaderboard(limit);

            return res.status(200).json({
                success: true,
                message: 'Lấy bảng xếp hạng thành công',
                data: {
                    rankings,
                    total: rankings.length
                },
                rankings,
                total: rankings.length
            });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (statusCode === 400) {
                return res.status(400).json({
                    success: false,
                    message: error.message || 'Tham số truy vấn không hợp lệ'
                });
            }

            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Lỗi hệ thống'
            });
        }
    }
}

const defaultInstance = new RankingController();

module.exports = defaultInstance;
module.exports.RankingController = RankingController;
module.exports.getLeaderboard = defaultInstance.getLeaderboard.bind(defaultInstance);
