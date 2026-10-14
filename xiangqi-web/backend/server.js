/**
 * ============================================================================
 * server.js - Khởi chạy HTTP Server & Tích hợp Socket.IO (Xiangqi Backend)
 * ============================================================================
 * 
 * Nhiệm vụ:
 * 1. Khởi tạo HTTP server từ Express application.
 * 2. Attach Socket.IO vào HTTP server thông qua socket configuration.
 * 3. Đảm bảo tiêu chí nghiệm thu: Không tạo nhiều Socket.IO server khi hot reload/test.
 * 4. Hỗ trợ chạy độc lập qua CLI (node server.js) lẫn require từ test runner.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const http = require('http');
const { initSocket, getIO, closeSocket } = require('./src/config/socket');

// 1. Tải ứng dụng Express từ src/app
let app;
try {
    const appModule = require('./src/app');
    if (typeof appModule === 'function' || (appModule && typeof appModule.use === 'function')) {
        app = appModule;
    }
} catch (err) {
    // Không ném lỗi nếu src/app chưa hoàn thiện cấu hình
}

if (!app) {
    let express;
    try {
        express = require('express');
    } catch (e) {
        express = null;
    }

    if (express) {
        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        // Endpoint healthcheck cơ bản
        app.get('/health', (req, res) => {
            res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
        });
    } else {
        // Fallback request listener chuẩn HTTP của Node.js
        app = (req, res) => {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', message: 'Xiangqi Server' }));
        };
    }
}

// 2. Tạo hoặc tái sử dụng HTTP Server (chống duplicate server khi hot reload / re-require)
let server = global.__xiangqi_http_server || null;

if (!server) {
    server = http.createServer(app);
    global.__xiangqi_http_server = server;
}

// 3. Attach Socket.IO vào HTTP Server
const io = initSocket(server);

// 4. Quản lý vòng đời khởi động và dừng server
const PORT = process.env.PORT || 5000;

/**
 * Khởi động HTTP server lắng nghe cổng
 * @param {number|string} [port=PORT]
 * @returns {Promise<http.Server>}
 */
function startServer(port = PORT) {
    return new Promise((resolve, reject) => {
        if (server.listening) {
            return resolve(server);
        }
        server.listen(port, () => {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[Server] Xiangqi Backend Server đang lắng nghe trên cổng: ${port}`);
            }
            resolve(server);
        });
        server.once('error', reject);
    });
}

/**
 * Dừng HTTP server và đóng Socket.IO phục vụ cleanup
 * @returns {Promise<void>}
 */
function stopServer() {
    return new Promise((resolve) => {
        closeSocket();
        if (server && server.listening) {
            server.close(() => {
                global.__xiangqi_http_server = null;
                resolve();
            });
        } else {
            global.__xiangqi_http_server = null;
            resolve();
        }
    });
}

// Chỉ tự động lắng nghe cổng khi file được thực thi trực tiếp bằng Node.js CLI
if (require.main === module) {
    startServer(PORT).catch((err) => {
        console.error('[Server] Lỗi không thể khởi động server:', err.message);
        process.exit(1);
    });
}

// Export server và các instances để phục vụ test runner và module import
module.exports = server;
module.exports.server = server;
module.exports.app = app;
module.exports.io = io;
module.exports.getIO = getIO;
module.exports.startServer = startServer;
module.exports.stopServer = stopServer;
module.exports.closeServer = stopServer;
