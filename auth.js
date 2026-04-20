/**
 * MODULE: AUTHENTICATION & RBAC (Frontend)
 * Separated from app.js for better management.
 */

/**
 * Khởi tạo Auth: Kiểm tra session cũ hoặc hiện màn hình Login
 */
function initAuth() {
  console.log("Auth Module Initializing...");
  const savedUser = localStorage.getItem('payroll_user');
  if (savedUser) {
    try {
      applyLogin(JSON.parse(savedUser));
    } catch(e) { 
      console.error("Session Corrupted:", e);
      logout(true); // Tự động đăng xuất nếu session lỗi
    }
  } else {
    showLogin(true);
  }
}

/**
 * Điều khiển ẩn/hiện màn hình Đăng nhập
 * @param {boolean} show 
 */
function showLogin(show) {
  const lv = document.getElementById('loginView');
  if (!lv) return;

  if (show) {
    lv.style.display = 'flex';
    document.body.classList.add('login-pending');
  } else {
    lv.style.display = 'none';
    document.body.classList.remove('login-pending');
  }
}

/**
 * Áp dụng trạng thái Đăng nhập vào hệ thống
 * @param {Object} user - Đối tượng User từ Backend
 */
function applyLogin(user) {
  state.currentUser = user;
  localStorage.setItem('payroll_user', JSON.stringify(user));
  
  // 1. Cập nhật thông tin User trên Sidebar
  const sideProfile = document.getElementById('sidebarUserProfile');
  const sideName = document.getElementById('sideUserName');
  const sideRole = document.getElementById('sideUserRole');
  const sideAvatar = document.getElementById('sideUserAvatar');

  if (sideProfile) sideProfile.style.display = 'flex';
  if (sideName) sideName.innerText = user.FullName;
  if (sideRole) sideRole.innerText = user.Role;
  if (sideAvatar && user.AvatarURL) sideAvatar.src = user.AvatarURL;

  // 2. Phân quyền Admin
  if (user.Role === 'Admin') document.body.classList.add('is-admin');
  else document.body.classList.remove('is-admin');

  // 3. Ẩn màn hình Login
  showLogin(false);
  
  // 4. Đồng bộ dữ liệu dựa trên Role
  if (!API_URL) {
    injectMockData();
  } else {
    fetchAllData();
  }

  console.log("User applied:", user.Username);
}

/**
 * Đăng xuất: Xoá session và reload ứng dụng
 */
function logout(force = false) {
  if (force) {
    performLogout();
    return;
  }
  
  const modal = document.getElementById('logoutConfirmModal');
  if (modal) {
    modal.classList.add('active');
  } else {
    // Fallback nếu không tìm thấy modal
    if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?")) {
      performLogout();
    }
  }
}

/**
 * Thực hiện các bước kỹ thuật để đăng xuất
 */
function performLogout() {
  localStorage.removeItem('payroll_user');
  if (typeof state !== 'undefined') state.currentUser = null;
  document.body.classList.remove('is-admin');
  location.reload(); 
}

/**
 * Gán sự kiện cho màn hình Đăng nhập
 */
function setupAuthEvents() {
  const btnLogin = document.getElementById('btnDoLogin');
  const loginCard = document.querySelector('.login-card');
  const errDiv = document.getElementById('loginError');

  const triggerLogin = async () => {
    const uInput = document.getElementById('loginUser');
    const pInput = document.getElementById('loginPass');
    if (!uInput || !pInput) return;

    const u = uInput.value.trim();
    const p = pInput.value.trim();
    if (errDiv) errDiv.style.display = 'none';

    if (!u || !p) {
      showLoginError("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
      return;
    }

    // Xử lý Mock (Nếu chưa có API_URL)
    if (!API_URL) {
      if (u === 'namhr' && p === '123') {
        applyLogin({Username: 'namhr', FullName: 'Quản trị viên (Nam)', Role: 'Admin', AvatarURL: ''});
      } else if (u === 'ketoan' && p === '123') {
        applyLogin({Username: 'ketoan', FullName: 'Kế toán tổng hợp', Role: 'User', AvatarURL: ''});
      } else {
        showLoginError("Tài khoản giả lập không đúng. Thử: namhr/123");
      }
      return;
    }

    // Xử lý API thật
    showLoader(true);
    try {
      const resp = await fetch(`${API_URL}?action=login&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`);
      const json = await resp.json();
      if (json.status === 'success') {
        applyLogin(json.user);
        logToServer("Login", "Đăng nhập thành công");
      } else {
        showLoginError(json.message || "Tài khoản hoặc mật khẩu không đúng.");
      }
    } catch (e) { 
      console.error("Login Error:", e);
      showLoginError("Không thể kết nối với máy chủ. Vui lòng kiểm tra API_URL."); 
    }
    showLoader(false);
  };

  const showLoginError = (msg) => {
    if (!errDiv) return alert(msg);
    errDiv.innerText = msg;
    errDiv.style.display = 'block';
    if (loginCard) {
      loginCard.classList.remove('shake');
      void loginCard.offsetWidth; // Trigger reflow
      loginCard.classList.add('shake');
    }
  };

  if (btnLogin) {
    btnLogin.addEventListener('click', (e) => {
      e.preventDefault();
      triggerLogin();
    });
  }

  // Hỗ trợ nhấn Enter
  document.getElementById('loginPass')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') triggerLogin();
  });
  document.getElementById('loginUser')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') triggerLogin();
  });
}

// Global Click Delegator chuyên biệt cho Logout & Modals
document.addEventListener('click', (e) => {
  // Nút mở Logout Modal
  const logoutBtn = e.target.id === 'btnLogout' || e.target.closest('#btnLogout');
  if (logoutBtn) {
    e.preventDefault();
    logout();
  }

  // Nút xác nhận Đăng xuất ngay trên Popup
  if (e.target.id === 'btnDoLogoutConfirm') {
    e.preventDefault();
    performLogout();
  }

  // Nút Hủy trên Logout Popup
  if (e.target.id === 'btnCancelLogout') {
    e.preventDefault();
    document.getElementById('logoutConfirmModal')?.classList.remove('active');
  }
});
