/**
 * Xử lý logic đăng nhập tài khoản (login.js)
 * Tích hợp authApi và authManager, kiểm tra form tại client, xử lý loading/error an toàn
 */
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginInput = document.getElementById('loginInput');
    const passwordInput = document.getElementById('passwordInput');
    const submitBtn = document.getElementById('submitBtn');
    const authAlert = document.getElementById('authAlert');
    const alertIcon = document.getElementById('alertIcon');
    const alertMessage = document.getElementById('alertMessage');
    const loginError = document.getElementById('loginError');
    const passwordError = document.getElementById('passwordError');

    // Nếu người dùng đã đăng nhập và token còn hiệu lực, tự động chuyển về trang chủ
    if (typeof authManager !== 'undefined' && authManager.isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    /**
     * Hiển thị thông báo trên khu vực alert của form (thay vì dùng alert)
     * @param {string} message - Nội dung thông báo
     * @param {'error'|'success'} [type='error'] - Loại thông báo
     */
    function showAlert(message, type = 'error') {
        if (!authAlert) return;

        authAlert.classList.remove('auth-alert-error', 'auth-alert-success');
        authAlert.classList.add(type === 'success' ? 'auth-alert-success' : 'auth-alert-error');

        if (alertIcon) {
            alertIcon.textContent = type === 'success' ? '✅' : '⚠️';
        }
        if (alertMessage) {
            alertMessage.textContent = message;
        }

        authAlert.style.display = 'flex';
    }

    /**
     * Ẩn thông báo alert
     */
    function hideAlert() {
        if (authAlert) {
            authAlert.style.display = 'none';
        }
    }

    /**
     * Xóa các thông báo lỗi trường nhập
     */
    function clearFieldErrors() {
        if (loginError) loginError.textContent = '';
        if (passwordError) passwordError.textContent = '';
        if (loginInput) loginInput.classList.remove('is-invalid');
        if (passwordInput) passwordInput.classList.remove('is-invalid');
    }

    /**
     * Thiết lập trạng thái loading cho nút bấm submit
     * @param {boolean} isLoading
     */
    function setLoading(isLoading) {
        if (!submitBtn) return;
        submitBtn.disabled = isLoading;

        if (isLoading) {
            submitBtn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Đang đăng nhập...</span>';
        } else {
            submitBtn.innerHTML = '<span>Đăng nhập</span>';
        }
    }

    /**
     * Validate dữ liệu form tại client (DoD: test sai form không gọi API)
     * @returns {boolean} true nếu hợp lệ, false nếu có lỗi
     */
    function validateForm(loginVal, passwordVal) {
        clearFieldErrors();
        hideAlert();
        let isValid = true;

        if (!loginVal) {
            if (loginError) loginError.textContent = 'Vui lòng nhập tên đăng nhập hoặc email';
            if (loginInput) loginInput.classList.add('is-invalid');
            isValid = false;
        }

        if (!passwordVal) {
            if (passwordError) passwordError.textContent = 'Vui lòng nhập mật khẩu';
            if (passwordInput) passwordInput.classList.add('is-invalid');
            isValid = false;
        }

        if (!isValid) {
            showAlert('Vui lòng điền đầy đủ các trường bắt buộc', 'error');
        }

        return isValid;
    }

    // Lắng nghe sự kiện submit form
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const loginVal = loginInput ? loginInput.value.trim() : '';
            const passwordVal = passwordInput ? passwordInput.value : '';

            // 1. Kiểm tra tính hợp lệ cơ bản tại client - NẾU SAI KHÔNG ĐƯỢC GỌI API
            if (!validateForm(loginVal, passwordVal)) {
                return;
            }

            // 2. Disable nút submit và hiển thị spinner loading
            setLoading(true);
            hideAlert();

            try {
                // 3. Gọi API đăng nhập (chú ý: tuyệt đối không log password ra console)
                const response = await authApi.login({
                    login: loginVal,
                    password: passwordVal
                });

                // 4. Đăng nhập thành công -> lưu token & user vào authManager
                if (response && response.data && response.data.token) {
                    authManager.setAuth(response.data.token, response.data.user);

                    showAlert('Đăng nhập thành công! Đang chuyển hướng...', 'success');

                    // Chuyển hướng về trang chủ hoặc bàn cờ
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 800);
                } else {
                    throw new Error('Dữ liệu phản hồi từ máy chủ không hợp lệ');
                }
            } catch (error) {
                // 5. Xử lý lỗi từ server (401, network error, v.v.)
                // Hiển thị message thân thiện tại khu vực error của form
                const errMsg = error.message || 'Đăng nhập không thành công. Vui lòng thử lại.';
                showAlert(errMsg, 'error');

                if (error.status === 401) {
                    if (passwordInput) {
                        passwordInput.classList.add('is-invalid');
                        passwordInput.focus();
                    }
                }
            } finally {
                // 6. Phục hồi trạng thái nút submit nếu chưa chuyển trang
                setLoading(false);
            }
        });
    }

    // Xóa lỗi khi người dùng bắt đầu gõ lại
    if (loginInput) {
        loginInput.addEventListener('input', () => {
            if (loginError) loginError.textContent = '';
            loginInput.classList.remove('is-invalid');
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            if (passwordError) passwordError.textContent = '';
            passwordInput.classList.remove('is-invalid');
        });
    }
});
