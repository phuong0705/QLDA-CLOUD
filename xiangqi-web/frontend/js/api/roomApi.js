/**
 * RoomApi: Lớp giao tiếp với REST API phòng chơi của backend
 */

function getBaseUrl() {
    if (typeof window !== 'undefined' && window.API_BASE_URL) {
        return window.API_BASE_URL;
    }
    if (typeof window !== 'undefined' && window.location) {
        if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '5000')) {
            return 'http://localhost:5000/api/rooms';
        }
    }
    return '/api/rooms';
}

function getAuthHeaders() {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
}

/**
 * Lấy thông tin phòng qua ID
 * @param {number|string} roomId
 * @returns {Promise<Object>}
 */
export async function getRoom(roomId) {
    const baseUrl = getBaseUrl();
    const res = await fetch(`${baseUrl}/${roomId}`, {
        method: 'GET',
        headers: getAuthHeaders()
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Lỗi tải thông tin phòng' }));
        throw new Error(error.message || `Lỗi tải thông tin phòng: ${res.status}`);
    }

    return await res.json();
}

/**
 * Tạo phòng chơi mới
 * @returns {Promise<Object>}
 */
export async function createRoom() {
    const baseUrl = getBaseUrl();
    const res = await fetch(baseUrl, {
        method: 'POST',
        headers: getAuthHeaders()
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Lỗi tạo phòng' }));
        throw new Error(error.message || `Lỗi tạo phòng: ${res.status}`);
    }

    return await res.json();
}

/**
 * Tham gia phòng chơi bằng mã phòng
 * @param {string} roomCode
 * @returns {Promise<Object>}
 */
export async function joinRoom(roomCode) {
    const baseUrl = getBaseUrl();
    const res = await fetch(`${baseUrl}/join`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ roomCode })
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Lỗi tham gia phòng' }));
        throw new Error(error.message || `Lỗi tham gia phòng: ${res.status}`);
    }

    return await res.json();
}

/**
 * Rời phòng chơi
 * @param {string} roomCode
 * @returns {Promise<Object>}
 */
export async function leaveRoom(roomCode) {
    const baseUrl = getBaseUrl();
    const res = await fetch(`${baseUrl}/leave`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ roomCode })
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Lỗi rời phòng' }));
        throw new Error(error.message || `Lỗi rời phòng: ${res.status}`);
    }

    return await res.json();
}

export default {
    getRoom,
    createRoom,
    joinRoom,
    leaveRoom
};
