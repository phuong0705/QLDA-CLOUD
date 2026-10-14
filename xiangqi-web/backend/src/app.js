/**
 * ============================================================================
 * app.js - Cấu hình ứng dụng Express và mount toàn bộ Router
 * ============================================================================
 *
 * Nhiệm vụ:
 * 1. Khởi tạo Express application.
 * 2. Cấu hình middleware chung (CORS, JSON body parser, static files).
 * 3. Mount các nhóm REST API routes:
 *    - /api/auth     -> authRoutes     (đăng ký, đăng nhập)
 *    - /api/users    -> userRoutes     (thông tin người dùng)
 *    - /api/rankings -> rankingRoutes  (bảng xếp hạng)
 *    - /api/rooms    -> roomRoutes     (phòng chơi)
 * 4. Endpoint healthcheck cơ bản tại GET /health.
 * 5. Middleware xử lý lỗi tập trung.
 */

const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();

// ──────────────────────────────────────────────────────────
// 1. Middleware phân tích body request
// ──────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────────────────
// 2. Cấu hình CORS (cho phép Frontend gọi API cross-origin)
// ──────────────────────────────────────────────────────────
let cors;
try {
    cors = require('cors');
} catch (e) {
    cors = null;
}

if (cors) {
    app.use(cors({
        origin: function (origin, callback) {
            // Cho phép các request không có origin (same-origin, Postman, test runner)
            if (!origin) return callback(null, true);
            // Trong môi trường dev, cho phép mọi localhost
            const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
            if (isLocalhost) return callback(null, true);
            // Mặc định cho phép (trong production nên cấu hình chặt hơn)
            return callback(null, true);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type']
    }));
} else {
    // Fallback CORS headers khi chưa cài package cors
    app.use((req, res, next) => {
        const origin = req.headers.origin || '*';
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(204);
        }
        next();
    });
}

// ──────────────────────────────────────────────────────────
// 3. Phục vụ file tĩnh Frontend (để có thể truy cập qua cùng cổng backend)
// ──────────────────────────────────────────────────────────
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));
app.use('/frontend', express.static(frontendPath));

// ──────────────────────────────────────────────────────────
// 4. Endpoint healthcheck
// ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────────────────
// 5. Mount các nhóm REST API Routes
// ──────────────────────────────────────────────────────────

// Auth Routes: POST /api/auth/register, POST /api/auth/login
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// User Routes: GET /api/users/me (cần token)
const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

// Ranking Routes: GET /api/rankings?limit=50
const rankingRoutes = require('./routes/rankingRoutes');
app.use('/api/rankings', rankingRoutes);

// Room Routes: POST /api/rooms (cần token)
const roomRoutes = require('./routes/roomRoutes');
app.use('/api/rooms', roomRoutes);

// ──────────────────────────────────────────────────────────
// 6. Middleware xử lý lỗi tập trung (Error Handler)
// ──────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('[App] Lỗi chưa được xử lý:', err.message || err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Lỗi hệ thống nội bộ'
    });
});

module.exports = app;
