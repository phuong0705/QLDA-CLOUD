/**
 * Xử lý logic đăng ký tài khoản (register.js)
 * Tích hợp authApi, kiểm tra form tại client, xử lý loading/error và chuyển hướng an toàn
 */
document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const usernameInput = document.getElementById('usernameInput');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const confirmPasswordInput = document.getElementById('confirmPasswordInput');
    const submitBtn = document.getElementById('submitBtn');
    const authAlert = document.getElementById('authAlert');
    const alertIcon = document.getElementById('alertIcon');
    const alertMessage = document.getElementById('alertMessage');
    const usernameError = document.getElementById('usernameError');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const confirmPasswordError = document.getElementById('confirmPasswordError');

    /**
     * Hiển thị thông báo trên khu vực alert của form (thay vì alert)
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
        if (usernameError) usernameError.textContent = '';
        if (emailError) emailError.textContent = '';
        if (passwordError) passwordError.textContent = '';
        if (confirmPasswordError) confirmPasswordError.textContent = '';

        [usernameInput, emailInput, passwordInput, confirmPasswordInput].forEach(input => {
            if (input) input.classList.remove('is-invalid');
        });
    }

    /**
     * Thiết lập trạng thái loading cho nút bấm submit
     * @param {boolean} isLoading
     */
    function setLoading(isLoading) {
        if (!submitBtn) return;
        submitBtn.disabled = isLoading;

        if (isLoading) {
            submitBtn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Đang đăng ký...</span>';
        } else {
            submitBtn.innerHTML = '<span>Đăng ký tài khoản</span>';
        }
    }

    /**
     * Validate dữ liệu form tại client (DoD: test sai form không gọi API)
     * @returns {boolean} true nếu hợp lệ, false nếu có lỗi
     */
    function validateForm(usernameVal, emailVal, passwordVal, confirmVal) {
        clearFieldErrors();
        hideAlert();
        let isValid = true;

        // 1. Kiểm tra Username
        if (!usernameVal) {
            if (usernameError) usernameError.textContent = 'Vui lòng nhập tên người dùng';
            if (usernameInput) usernameInput.classList.add('is-invalid');
            isValid = false;
        } else if (usernameVal.length < 3) {
            if (usernameError) usernameError.textContent = 'Tên người dùng phải có ít nhất 3 ký tự';
            if (usernameInput) usernameInput.classList.add('is-invalid');
            isValid = false;
        } else if (usernameVal.length > 50) {
            if (usernameError) usernameError.textContent = 'Tên người dùng không được vượt quá 50 ký tự';
            if (usernameInput) usernameInput.classList.add('is-invalid');
            isValid = false;
        } else if (!/^[a-zA-Z0-9_]+$/.test(usernameVal)) {
            if (usernameError) usernameError.textContent = 'Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới';
            if (usernameInput) usernameInput.classList.add('is-invalid');
            isValid = false;
        }

        // 2. Kiểm tra Email
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailVal) {
            if (emailError) emailError.textContent = 'Vui lòng nhập địa chỉ email';
            if (emailInput) emailInput.classList.add('is-invalid');
            isValid = false;
        } else if (!emailRegex.test(emailVal)) {
            if (emailError) emailError.textContent = 'Địa chỉ email không đúng định dạng';
            if (emailInput) emailInput.classList.add('is-invalid');
            isValid = false;
        }

        // 3. Kiểm tra Password
        if (!passwordVal) {
            if (passwordError) passwordError.textContent = 'Vui lòng nhập mật khẩu';
            if (passwordInput) passwordInput.classList.add('is-invalid');
            isValid = false;
        } else if (passwordVal.length < 6) {
            if (passwordError) passwordError.textContent = 'Mật khẩu phải có ít nhất 6 ký tự';
            if (passwordInput) passwordInput.classList.add('is-invalid');
            isValid = false;
        }

        // 4. Kiểm tra Confirm Password
        if (!confirmVal) {
            if (confirmPasswordError) confirmPasswordError.textContent = 'Vui lòng xác nhận mật khẩu';
            if (confirmPasswordInput) confirmPasswordInput.classList.add('is-invalid');
            isValid = false;
        } else if (confirmVal !== passwordVal) {
            if (confirmPasswordError) confirmPasswordError.textContent = 'Mật khẩu xác nhận không khớp';
            if (confirmPasswordInput) confirmPasswordInput.classList.add('is-invalid');
            isValid = false;
        }

        if (!isValid) {
            showAlert('Vui lòng kiểm tra và sửa các thông tin chưa chính xác', 'error');
        }

        return isValid;
    }

    // Lắng nghe sự kiện submit form
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const usernameVal = usernameInput ? usernameInput.value.trim() : '';
            const emailVal = emailInput ? emailInput.value.trim() : '';
            const passwordVal = passwordInput ? passwordInput.value : '';
            const confirmVal = confirmPasswordInput ? confirmPasswordInput.value : '';

            // 1. Kiểm tra tính hợp lệ cơ bản tại client - NẾU SAI KHÔNG ĐƯỢC GỌI API
            if (!validateForm(usernameVal, emailVal, passwordVal, confirmVal)) {
                return;
            }

            // 2. Disable nút submit và hiển thị spinner loading
            setLoading(true);
            hideAlert();

            try {
                // 3. Gọi API đăng ký (chú ý: tuyệt đối không log password ra console)
                const response = await authApi.register({
                    username: usernameVal,
                    email: emailVal,
                    password: passwordVal
                });

                // 4. Đăng ký thành công -> hiển thị thông báo và chuyển sang trang đăng nhập
                showAlert('Đăng ký tài khoản thành công! Đang chuyển hướng đến đăng nhập...', 'success');

                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1200);
            } catch (error) {
                // 5. Xử lý lỗi từ server (409 Conflict, 400 Bad Request, Network Error)
                const errMsg = error.message || 'Đăng ký tài khoản không thành công. Vui lòng thử lại.';
                showAlert(errMsg, 'error');

                // Đánh dấu trường trùng lặp nếu là lỗi 409
                if (error.status === 409) {
                    if (errMsg.toLowerCase().includes('username') && usernameInput) {
                        usernameInput.classList.add('is-invalid');
                        if (usernameError) usernameError.textContent = errMsg;
                        usernameInput.focus();
                    } else if (errMsg.toLowerCase().includes('email') && emailInput) {
                        emailInput.classList.add('is-invalid');
                        if (emailError) emailError.textContent = errMsg;
                        emailInput.focus();
                    }
                }
            } finally {
                // 6. Phục hồi trạng thái nút submit nếu chưa chuyển trang
                setLoading(false);
            }
        });
    }

    // Xóa lỗi tức thời khi người dùng chỉnh sửa trường
    [
        { input: usernameInput, error: usernameError },
        { input: emailInput, error: emailError },
        { input: passwordInput, error: passwordError },
        { input: confirmPasswordInput, error: confirmPasswordError }
    ].forEach(({ input, error }) => {
        if (input) {
            input.addEventListener('input', () => {
                if (error) error.textContent = '';
                input.classList.remove('is-invalid');
            });
        }
    });
});
