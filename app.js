var API_URL = window.API_URL || "https://script.google.com/macros/s/AKfycbxeeTHOPy-nseJJRRGTibZlDuHv736E4sVaC1DJWbzwtYWv7UyZmwuAh2OWlrsId90r/exec";

// ==========================================
// STATE MANAGEMENT LƯU TRỮ DỮ LIỆU
// ==========================================
var state = {
  currentUser: null, // Lưu thông tin user đăng nhập
  employees: [],
  kpiData: [],
  timekeepingData: [],
  payroll: [],
  currentMonth: new Date().toISOString().substring(0, 7),
  zoomLevel: 100,
  searchQuery: '',
  currentStore: 'all',
  config: {
    companyName: "Bi's Mart - Hệ thống Cửa hàng",
    adminPass: "123456",
    bhRate: 10.5,
    isLocked: false
  }
};

// Elements
const loader = document.getElementById('loader');
const globalMonthInput = document.getElementById('globalMonth');

// ==========================================
// KHỞI TẠO & ĐIỀU HƯỚNG APP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  console.log("App Initializing...");

  try {
    // 1. Khởi tạo các giá trị cơ bản
    if (globalMonthInput) {
      globalMonthInput.value = state.currentMonth;
      updateMonthLabels(getFormattedMonth());
    }

    // 2. Khởi tạo Auth (Quan trọng nhất)
    setupAuthEvents();
    initAuth();

    // 3. Navigation Logic (Dùng Delegation cho ổn định)
    document.addEventListener('click', (e) => {
      const navItem = e.target.closest('.nav-item');
      if (navItem) {
        e.preventDefault();
        const targetId = navItem.getAttribute('data-target');

        // Kiểm tra quyền truy cập tab
        if (navItem.classList.contains('admin-only') && state.currentUser?.Role !== 'Admin') {
          alert("Bạn không có quyền truy cập mục này.");
          return;
        }

        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        navItem.classList.add('active');

        document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById(targetId);
        if (targetView) targetView.classList.add('active');

        const titleText = navItem.innerText.replace(/[^\p{L}\s]/gu, '').trim();
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) pageTitle.innerText = titleText;

        renderCurrentView(targetId);
      }


      // Delegation cho việc mở/đóng Modal - CẦN preventDefault
      if (e.target.id === 'btnOpenBulkPrint' || e.target.closest('#btnOpenBulkPrint')) {
        e.preventDefault();
        const modal = document.getElementById('bulkPrintModal');
        if (modal) modal.classList.add('active');
      }
      if (e.target.id === 'btnCloseBulkModal' || e.target.closest('#btnCloseBulkModal')) {
        e.preventDefault();
        const modal = document.getElementById('bulkPrintModal');
        if (modal) modal.classList.remove('active');
      }
      if (e.target.id === 'btnCloseHrmModal' || e.target.closest('#btnCloseHrmModal') || e.target.id === 'btnCancelEdit') {
        e.preventDefault();
        const modal = document.getElementById('hrmModal');
        if (modal) modal.classList.remove('active');
      }
    });

    // 4. Các bộ lắng nghe sự kiện khác (Bọc trong Safe Calls)
    safeInit(() => {
      globalMonthInput?.addEventListener('change', (e) => {
        state.currentMonth = e.target.value;
        updateMonthLabels(getFormattedMonth());
        if (API_URL) fetchPayrollData();
        else renderCurrentView(document.querySelector('.view-section.active')?.id);
      });

      document.getElementById('btnRefresh')?.addEventListener('click', () => {
        if (API_URL) fetchAllData();
        else renderCurrentView(document.querySelector('.view-section.active')?.id);
      });

      document.getElementById('storeFilter')?.addEventListener('change', (e) => {
        state.currentStore = e.target.value;
        renderCurrentView(document.querySelector('.view-section.active')?.id);
      });

      setupZoomEvents();
      setupSettingsEvents();
      setupHrmEvents();
      setupKpiGridEvents();
      setupTimekeepingEvents();
      setupPayrollEvents();
      setupBulkPrintEvents();
      setupAccountEvents();
    });

  } catch (error) {
    console.error("CRITICAL APP ERROR:", error);
  }
});

// Helper để khởi chạy các module mà không làm treo cả App
function safeInit(fn) {
  try { fn(); } catch (e) { console.error("Module Init Error:", e); }
}

// ==========================================
// API CALLS (BẰNG FETCH TO GAS)
// ==========================================

function showLoader(show) {
  if (show) loader.classList.add('active');
  else loader.classList.remove('active');
}

function getFormattedMonth() {
  const parts = state.currentMonth.split('-');
  return `${parts[1]}/${parts[0]}`; // MM/YYYY
}

function updateMonthLabels(str) {
  document.getElementById('lblTimekeepingMonth').innerText = str;
  document.getElementById('lblPayrollMonth').innerText = str;
}

async function fetchAllData() {
  showLoader(true);
  try {
    const resEmp = await fetch(`${API_URL}?action=getEmployees`);
    if (resEmp.ok) {
      const data = await resEmp.json();
      state.employees = Array.isArray(data) ? data : [];
    }

    const resKpi = await fetch(`${API_URL}?action=getKpiData&month=${encodeURIComponent(getFormattedMonth())}`);
    if (resKpi.ok) {
      const data = await resKpi.json();
      state.kpiData = Array.isArray(data) ? data : [];
    }

    try {
      const resTk = await fetch(`${API_URL}?action=getTimekeeping&month=${encodeURIComponent(getFormattedMonth())}`);
      if (resTk.ok) {
        const data = await resTk.json();
        state.timekeepingData = Array.isArray(data) ? data : [];
      }
    } catch (err) { }

    await fetchPayrollData();
    // Đồng bộ dữ liệu nhân viên vào các hạng mục KPI, Chấm công và Bảng lương
    syncData();
  } catch (err) {
    console.error("Fetch Data Error:", err);
  }
  showLoader(false);
  renderCurrentView(document.querySelector('.view-section.active').id);
}

function syncData() {
  // Liên kết KPI dữ liệu với thông tin nhân viên
  state.kpiData = state.kpiData.map(k => {
    const emp = state.employees.find(e => e.MaNV === k.MaNV);
    return { ...k, employee: emp };
  });

  // Liên kết dữ liệu chấm công
  state.timekeepingData = state.timekeepingData.map(t => {
    const emp = state.employees.find(e => e.MaNV === t.MaNV);
    return { ...t, employee: emp };
  });

  // Liên kết dữ liệu bảng lương
  state.payroll = state.payroll.map(p => {
    const emp = state.employees.find(e => e.MaNV === p.MaNV);
    return { ...p, employee: emp };
  });
}

async function fetchPayrollData() {
  showLoader(true);
  try {
    const res = await fetch(`${API_URL}?action=getPayroll&month=${encodeURIComponent(getFormattedMonth())}`);
    if (res.ok) state.payroll = await res.json();
  } catch (err) { }
  showLoader(false);
}

// ==========================================
// RENDER VIEWS
// ==========================================

function formatCurrency(num) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
}

function renderCurrentView(viewId) {
  console.log("Rendering view:", viewId);
  if (viewId === 'dashboardView') renderDashboard();
  else if (viewId === 'hrmView') renderHrm();
  else if (viewId === 'bonusConfigView') renderKpiGrid();
  else if (viewId === 'timekeepingView') renderTimekeeping();
  else if (viewId === 'payrollView') renderPayroll();
  else if (viewId === 'settingsView') renderSettings();
  else if (viewId === 'accountView') renderAccountView();
  else if (viewId === 'logsView') renderLogsView();
  else if (viewId === 'policyView') {
    document.getElementById('pageTitle').innerText = "Quy Chế Lương 2026";
  }
}

function toggleHrmModal(show) {
  const modal = document.getElementById('hrmModal');
  if (modal) modal.style.display = show ? 'flex' : 'none';
}

function updateStoreFilterOptions() {
  const sf = document.getElementById('storeFilter');
  const stores = [...new Set(state.employees.map(e => e.CuaHang).filter(Boolean))];
  const currentVal = sf.value;

  let html = '<option value="all">🏢 Tất cả cửa hàng</option>';
  stores.forEach(s => {
    html += `<option value="${s}" ${s === currentVal ? 'selected' : ''}>📍 ${s}</option>`;
  });
  sf.innerHTML = html;
}

function setupSettingsEvents() {
  document.getElementById('btnSaveSettings').addEventListener('click', () => {
    state.config.companyName = document.getElementById('setCompanyName').value;
    state.config.adminPass = document.getElementById('setAdminPass').value;
    state.config.bhRate = parseFloat(document.getElementById('setBhRate').value) || 10.5;
    state.config.isLocked = document.getElementById('setLockStatus').checked;

    // Cập nhật logo/tiêu đề nếu cần
    document.querySelector('.logo span').nextSibling.textContent = " " + state.config.companyName.split(' ')[0];

    alert("Đã lưu cấu hình hệ thống!");
    renderDashboard(); // Quay lại dashboard xem kết quả
  });
}

function renderSettings() {
  document.getElementById('setCompanyName').value = state.config.companyName;
  document.getElementById('setAdminPass').value = state.config.adminPass;
  document.getElementById('setBhRate').value = state.config.bhRate;
  document.getElementById('setLockStatus').checked = state.config.isLocked;
}

function checkLock() {
  if (state.config.isLocked) {
    const pass = prompt("Dữ liệu đang được KHÓA. Vui lòng nhập mã bảo mật để chỉnh sửa:");
    if (pass === state.config.adminPass) {
      return true;
    } else {
      alert("Sai mã bảo mật! Bạn không có quyền sửa dữ liệu đã chốt.");
      return false;
    }
  }
  return true;
}

// ------------------------------------------
// MODULE: DASHBOARD (Cải tiến lọc Store)
// ------------------------------------------
function renderDashboard() {
  const filteredPayroll = state.payroll.filter(p => {
    const emp = state.employees.find(e => e.MaNV === p.MaNV);
    return state.currentStore === 'all' || (emp && emp.CuaHang === state.currentStore);
  });

  const filteredEmployees = state.employees.filter(e => state.currentStore === 'all' || e.CuaHang === state.currentStore);

  document.getElementById('dashTotalEmp').innerText = filteredEmployees.length;
  let tPayroll = 0;
  let tBonus = 0;
  let tGross = 0;

  filteredPayroll.forEach(p => {
    tPayroll += parseFloat(p.ThucLanh || p.ThucNhan) || 0;
    tBonus += parseFloat(p.TongThuong || 0) || 0;
    tGross += parseFloat(p.TongGross || p.ThucLanh) || 0;
  });

  document.getElementById('dashTotalPayroll').innerText = formatCurrency(tPayroll);
  document.getElementById('dashTotalBonus').innerText = formatCurrency(tBonus);

  // --- Render Donut Chart ---
  const donut = document.getElementById('payrollDonut');
  const percentSpan = document.getElementById('donutPercent');
  if (donut) {
    const netRatio = tGross > 0 ? (tPayroll / tGross) * 100 : 0;
    percentSpan.innerText = Math.round(netRatio) + '%';
    donut.style.background = `conic-gradient(var(--primary-color) 0% ${netRatio}%, #EF4444 ${netRatio}% 100%)`;
  }

  // --- Render Bar Chart (Top 5 Earners) ---
  const barContainer = document.getElementById('topEarnersBar');
  if (barContainer) {
    const sorted = [...filteredPayroll]
      .sort((a, b) => (b.ThucLanh || b.ThucNhan) - (a.ThucLanh || a.ThucNhan))
      .slice(0, 5);

    const maxVal = sorted.length > 0 ? Math.max(...sorted.map(s => (s.ThucLanh || s.ThucNhan))) : 1;

    barContainer.innerHTML = sorted.map(s => {
      const val = s.ThucLanh || s.ThucNhan;
      const h = (val / maxVal) * 100;
      return `
        <div class="bar-item">
          <div class="bar-v" style="height: ${h}%" data-value="${(val / 1000000).toFixed(1)}M"></div>
          <div class="bar-label">${s.HoTen.split(' ').pop()}</div>
        </div>
      `;
    }).join('');
  }

  // --- New Insight: KPI Distribution ---
  const kpiContainer = document.getElementById('kpiDistChart');
  if (kpiContainer) {
    const buckets = { "100%": 0, "90%": 0, "80%": 0, "70%": 0, "<70%": 0 };
    state.kpiData.forEach(k => {
      const emp = state.employees.find(e => e.MaNV === k.MaNV);
      if (state.currentStore !== 'all' && (!emp || emp.CuaHang !== state.currentStore)) return;

      const rates = [
        (k.Actual_NU / k.Target_NU) * 100 || 0,
        (k.Actual_DST / k.Target_DST) * 100 || 0,
        (k.Actual_DSN1 / k.Target_DSN1) * 100 || 0
      ];
      const maxRate = Math.max(...rates);
      if (maxRate >= 100) buckets["100%"]++;
      else if (maxRate >= 90) buckets["90%"]++;
      else if (maxRate >= 80) buckets["80%"]++;
      else if (maxRate >= 70) buckets["70%"]++;
      else buckets["<70%"]++;
    });

    const maxCount = Math.max(...Object.values(buckets), 1);
    const colors = { "100%": "#059669", "90%": "#10B981", "80%": "#F59E0B", "70%": "#FBBF24", "<70%": "#94A3B8" };

    kpiContainer.innerHTML = Object.entries(buckets).map(([label, count]) => `
      <div class="kpi-row">
        <div class="kpi-label">${label}</div>
        <div class="kpi-progress-bg">
          <div class="kpi-progress-fill" style="width: ${(count / maxCount) * 100}%; background: ${colors[label]}"></div>
        </div>
        <div class="kpi-count">${count}</div>
      </div>
    `).join('');
  }

  // --- New Insight: Top Absentees ---
  const absContainer = document.getElementById('topAbsenteesList');
  if (absContainer) {
    const absData = state.timekeepingData
      .map(tk => ({
        ...tk,
        emp: state.employees.find(e => e.MaNV === tk.MaNV),
        totalAbs: (parseFloat(tk.TongP) || 0) + (parseFloat(tk.TongK) || 0)
      }))
      .filter(x => x.totalAbs > 0 && (state.currentStore === 'all' || (x.emp && x.emp.CuaHang === state.currentStore)))
      .sort((a, b) => b.totalAbs - a.totalAbs)
      .slice(0, 5);

    absContainer.innerHTML = absData.map(x => `
      <div class="insight-item">
        <div class="insight-info">
          <div class="insight-avatar">${x.emp ? x.emp.HoTen.split(' ').pop().charAt(0) : '?'}</div>
          <div>
            <div class="insight-name">${x.emp ? x.emp.HoTen : x.MaNV}</div>
            <div class="insight-meta">${x.emp ? x.emp.PhongBan : ''}</div>
          </div>
        </div>
        <div class="insight-value danger">${x.totalAbs} ngày</div>
      </div>
    `).join('') || '<div style="color:#64748B; font-size:0.85rem; text-align:center; padding:20px;">Không có vắng mặt</div>';
  }

  // --- New Insight: Top Bonuses ---
  const bonusContainer = document.getElementById('topBonusesList');
  if (bonusContainer) {
    const topBonuses = [...filteredPayroll]
      .sort((a, b) => (b.TongThuong || 0) - (a.TongThuong || 0))
      .filter(p => (p.TongThuong || 0) > 0)
      .slice(0, 5);

    bonusContainer.innerHTML = topBonuses.map(p => `
      <div class="insight-item">
        <div class="insight-info">
          <div class="insight-avatar" style="background:#ECFDF5; color:#059669">💰</div>
          <div>
            <div class="insight-name">${p.HoTen}</div>
            <div class="insight-meta">Tổng thưởng tháng</div>
          </div>
        </div>
        <div class="insight-value success">+${(p.TongThuong / 1000).toFixed(0)}k</div>
      </div>
    `).join('') || '<div style="color:#64748B; font-size:0.85rem; text-align:center; padding:20px;">Chưa có thưởng</div>';
  }

  // --- New Stats: New/Left Employees ---
  const curMonth = state.currentMonth; // YYYY-MM
  const newEmps = filteredEmployees.filter(e => e.NgayVaoLam && e.NgayVaoLam.startsWith(curMonth)).length;
  const leftEmps = filteredEmployees.filter(e => e.DaNghiViec && e.NgayNghiViec && e.NgayNghiViec.startsWith(curMonth)).length;

  document.getElementById('statNewEmp').innerText = newEmps;
  document.getElementById('statLeftEmp').innerText = leftEmps;
}

// ------------------------------------------
// MODULE: QUẢN LÝ NHÂN SỰ (HRM)
// ------------------------------------------
let editEmpIndex = -1;

function setupHrmEvents() {
  const btnOpen = document.getElementById('btnOpenAddHr');
  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      editEmpIndex = -1;
      document.getElementById('hrmModalTitle').innerText = "Thêm Nhân Viên Mới";
      document.getElementById('btnAddEmp').innerHTML = "💾 Xác nhận & Lưu";
      document.querySelectorAll('#hrmModal input').forEach(inp => inp.value = '');
      document.getElementById('dynamicKpiContainer').innerHTML = '';
      toggleHrmModal(true);
    });
  }

  const btnClose = document.getElementById('btnCloseHrmModal');
  if (btnClose) btnClose.addEventListener('click', () => toggleHrmModal(false));

  document.getElementById('btnCancelEdit').addEventListener('click', () => {
    toggleHrmModal(false);
  });

  document.getElementById('btnAddKpiLevel').addEventListener('click', () => {
    const container = document.getElementById('dynamicKpiContainer');
    const row = document.createElement('div');
    row.className = 'grid-cards kpi-row';
    row.style = 'grid-template-columns: 2fr 2fr auto; align-items: center; gap: 10px; margin-bottom: 5px;';
    row.innerHTML = `
      <input type="text" placeholder="Tên KPI (VD: Đạt 70%)" class="kpi-name" style="margin:0;">
      <input type="number" placeholder="Tiền thưởng (VNĐ)" class="kpi-value" style="margin:0;">
      <button class="btn btn-outline" style="color: red; padding: 0.6rem 1rem;" onclick="this.parentElement.remove()">Xóa</button>
    `;
    container.appendChild(row);
  });

  document.getElementById('btnAddEmp').addEventListener('click', () => {
    try {
      // Đảm bảo state.employees luôn là mảng để tránh lỗi .some / .push
      if (!Array.isArray(state.employees)) state.employees = [];

      const getV = (id) => document.getElementById(id)?.value?.trim() || "";
      const getN = (id) => parseFloat(document.getElementById(id)?.value) || 0;

      const maNV = getV('hrMaNV');
      const hoTen = getV('hrHoTen');
      if (!maNV || !hoTen) return alert("Mã NV và Họ Tên là bắt buộc!");

      let kpiList = [];
      document.querySelectorAll('.kpi-row').forEach(row => {
        let nameInp = row.querySelector('.kpi-name');
        let valInp = row.querySelector('.kpi-value');
        if (nameInp && nameInp.value.trim()) {
          kpiList.push({ name: nameInp.value.trim(), value: parseFloat(valInp.value) || 0 });
        }
      });

      const emp = {
        MaNV: maNV,
        HoTen: hoTen,
        CuaHang: getV('hrCuaHang'),
        PhongBan: getV('hrPhongBan'),
        ChucVu: getV('hrChucVu'),
        NgaySinh: getV('hrNgaySinh'),
        SDT: getV('hrSDT'),
        CCCD: getV('hrCCCD'),
        NoiCap: getV('hrNoiCap'),
        BangCap: getV('hrBangCap'),
        NguoiPhuThuoc: getN('hrNguoiPhuThuoc'),
        BHXH: getV('hrBHXH'),
        NgayThuViec: getV('hrNgayThuViec'),
        NgayKyHD: getV('hrNgayKyHD'),
        STK: getV('hrSTK'),
        LuongCoBan: getN('hrLuongCB'),
        ThuongChuyenCan: getN('hrThuongChuyenCan'),
        ThuongTrachNhiem: getN('hrThuongTrachNhiem'),
        KPI70_NU: getN('kpi70_nu'),
        KPI70_DSTong: getN('kpi70_dst'),
        KPI70_DSN1: getN('kpi70_dsn1'),
        KPI80_NU: getN('kpi80_nu'),
        KPI80_DSTong: getN('kpi80_dst'),
        KPI80_DSN1: getN('kpi80_dsn1'),
        KPI90_NU: getN('kpi90_nu'),
        KPI90_DSTong: getN('kpi90_dst'),
        KPI90_DSN1: getN('kpi90_dsn1'),
        KPI100_NU: getN('kpi100_nu'),
        KPI100_DSTong: getN('kpi100_dst'),
        KPI100_DSN1: getN('kpi100_dsn1'),
        DanhSachKPI: JSON.stringify(kpiList)
      };

      // Thêm hoặc cập nhật vào state
      if (editEmpIndex > -1) {
        state.employees[editEmpIndex] = emp;
        editEmpIndex = -1;
        document.getElementById('btnAddEmp').innerHTML = "+ Thêm Nhân Sự";
        document.getElementById('btnCancelEdit').style.display = "none";
      } else {
        // Kiểm tra trùng Mã NV khi thêm mới
        const isDuplicate = state.employees.some(e => e.MaNV === emp.MaNV);
        if (isDuplicate) return alert("Lỗi: Mã nhân viên này đã tồn tại trên hệ thống!");
        state.employees.push(emp);
      }

      renderHrm();

      // Clear form & Close
      document.querySelectorAll('#hrmModal input').forEach(inp => inp.value = '');
      document.getElementById('dynamicKpiContainer').innerHTML = '';
      toggleHrmModal(false);

    } catch (err) {
      console.error("Lỗi khi Lưu Nhân Sự:", err);
      alert("Đã xảy ra lỗi khi xử lý dữ liệu: " + err.message);
    }
  });

  const btnSaveSheet = document.getElementById('btnSaveHrm') || document.getElementById('btnSaveHRM');
  if (btnSaveSheet) {
    btnSaveSheet.addEventListener('click', async () => {
      if (!API_URL) return alert("Chỉ hoạt động khi cấu hình API_URL kết nối với Google Sheet gốc!");
      showLoader(true);
      try {
        await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "saveEmployees", data: state.employees })
        });
        alert("Đã lưu danh sách nhân sự thành công!");
        // After saving, refresh all data to sync across modules
        await fetchAllData();
        // Emit custom event for other modules
        document.dispatchEvent(new Event('data:updated'));
      } catch (err) {
        alert("Lỗi lưu data: " + err);
      }
      showLoader(false);
    });
  }
}

function renderHrm() {
  const tbody = document.querySelector('#hrmTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = state.employees.filter(e => {
    if (!e || !e.MaNV || !e.HoTen) return false;
    const matchSearch = e.MaNV.toLowerCase().includes(state.searchQuery) || e.HoTen.toLowerCase().includes(state.searchQuery);
    const matchStore = state.currentStore === 'all' || e.CuaHang === state.currentStore;
    return matchSearch && matchStore;
  });

  filtered.forEach((e, idx) => {
    tbody.innerHTML += `
      <tr>
        <td><b>${e.MaNV || 'N/A'}</b></td>
        <td>${e.HoTen || 'N/A'}</td>
        <td>${e.CuaHang || ''}</td>
        <td>${e.PhongBan || ''}</td>
        <td>${e.ChucVu || ''}</td>
        <td>${e.STK || ''}</td>
        <td>${e.SDT || ''}</td>
        <td>${e.CCCD || ''}</td>
        <td>${e.NgayThuViec || ''}</td>
        <td>${e.NgayKyHD || ''}</td>
        <td style="color: var(--primary-color); font-weight: 600;">${formatCurrency(e.LuongCoBan || 0)}</td>
        <td style="color: var(--secondary-color); font-weight: 600;">${formatCurrency(e.ThuongChuyenCan || e.PhuCap || 0)}</td>
        <td style="font-weight: 600;">${formatCurrency(e.ThuongTrachNhiem || 0)}</td>
        <td style="font-size: 0.85rem; color: #555; text-align: left;">
          <div><b>70%:</b> ${e.KPI70_NU || 0} / ${e.KPI70_DSTong || 0} / ${e.KPI70_DSN1 || 0}</div>
          <div><b>80%:</b> ${e.KPI80_NU || 0} / ${e.KPI80_DSTong || 0} / ${e.KPI80_DSN1 || 0}</div>
          <div><b>90%:</b> ${e.KPI90_NU || 0} / ${e.KPI90_DSTong || 0} / ${e.KPI90_DSN1 || 0}</div>
          <div><b>100%:</b> ${e.KPI100_NU || 0} / ${e.KPI100_DSTong || 0} / ${e.KPI100_DSN1 || 0}</div>
        </td>
        <td style="font-size: 0.85rem; color: #555; text-align: left;">
          ${(function () {
        try {
          const list = (typeof e.DanhSachKPI === 'string') ? JSON.parse(e.DanhSachKPI || "[]") : (e.DanhSachKPI || []);
          return list.map(k => '<div><b>' + k.name + '</b>: ' + k.value + '</div>').join('');
        } catch (err) { return ''; }
      })()}
        </td>
        <td style="text-align: center;">
          <button class="btn btn-outline" style="padding: 0.3rem 0.6rem; color: #3B82F6; margin-right: 5px;" onclick="editEmp(${idx})">Sửa</button>
          <button class="btn btn-outline" style="padding: 0.3rem 0.6rem; color: #EF4444;" onclick="removeEmp(${idx})">Xóa</button>
        </td>
      </tr>
    `;
  });
}

window.removeEmp = function (idx) {
  state.employees.splice(idx, 1);
  renderHrm();
}

window.editEmp = function (idx) {
  const e = state.employees[idx];
  editEmpIndex = idx;

  document.getElementById('hrmModalTitle').innerText = "Cập nhật Thông tin Nhân sự";
  document.getElementById('btnAddEmp').innerHTML = "💾 Cập nhật Thay đổi";
  toggleHrmModal(true);

  document.getElementById('hrMaNV').value = e.MaNV || "";
  document.getElementById('hrHoTen').value = e.HoTen || "";
  document.getElementById('hrCuaHang').value = e.CuaHang || "";
  document.getElementById('hrPhongBan').value = e.PhongBan || "";
  document.getElementById('hrChucVu').value = e.ChucVu || "";
  document.getElementById('hrNgaySinh').value = e.NgaySinh || "";
  document.getElementById('hrSDT').value = e.SDT || "";
  document.getElementById('hrCCCD').value = e.CCCD || "";
  document.getElementById('hrNoiCap').value = e.NoiCap || "";
  document.getElementById('hrBangCap').value = e.BangCap || "";
  document.getElementById('hrNguoiPhuThuoc').value = e.NguoiPhuThuoc || "";
  document.getElementById('hrBHXH').value = e.BHXH || "";
  document.getElementById('hrNgayThuViec').value = e.NgayThuViec || "";
  document.getElementById('hrNgayKyHD').value = e.NgayKyHD || "";
  document.getElementById('hrSTK').value = e.STK || "";
  document.getElementById('hrLuongCB').value = e.LuongCoBan || "";
  document.getElementById('hrThuongChuyenCan').value = e.ThuongChuyenCan || e.PhuCap || "";
  document.getElementById('hrThuongTrachNhiem').value = e.ThuongTrachNhiem || "";

  // KPIs
  document.getElementById('kpi70_nu').value = e.KPI70_NU || "";
  document.getElementById('kpi70_dst').value = e.KPI70_DSTong || "";
  document.getElementById('kpi70_dsn1').value = e.KPI70_DSN1 || "";
  document.getElementById('kpi80_nu').value = e.KPI80_NU || "";
  document.getElementById('kpi80_dst').value = e.KPI80_DSTong || "";
  document.getElementById('kpi80_dsn1').value = e.KPI80_DSN1 || "";
  document.getElementById('kpi90_nu').value = e.KPI90_NU || "";
  document.getElementById('kpi90_dst').value = e.KPI90_DSTong || "";
  document.getElementById('kpi90_dsn1').value = e.KPI90_DSN1 || "";
  document.getElementById('kpi100_nu').value = e.KPI100_NU || "";
  document.getElementById('kpi100_dst').value = e.KPI100_DSTong || "";
  document.getElementById('kpi100_dsn1').value = e.KPI100_DSN1 || "";

  // Dynamic KPIs
  const container = document.getElementById('dynamicKpiContainer');
  container.innerHTML = '';
  try {
    const list = JSON.parse(e.DanhSachKPI || "[]");
    list.forEach(k => {
      const row = document.createElement('div');
      row.className = 'grid-cards kpi-row';
      row.style = 'grid-template-columns: 2fr 2fr auto; align-items: center; gap: 10px; margin-bottom: 5px;';
      row.innerHTML = `
        <input type="text" placeholder="Tên KPI (VD: Đạt 70%)" class="kpi-name" style="margin:0;" value="${k.name}">
        <input type="number" placeholder="Tiền thưởng (VNĐ)" class="kpi-value" style="margin:0;" value="${k.value}">
        <button class="btn btn-outline" style="color: red; padding: 0.6rem 1rem;" onclick="this.parentElement.remove()">Xóa</button>
      `;
      container.appendChild(row);
    });
  } catch (err) { }

  document.getElementById('btnAddEmp').innerHTML = "💾 Lưu Cập Nhật";
  document.getElementById('btnCancelEdit').style.display = "inline-block";
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ------------------------------------------
// MODULE: THEO DÕI KPI
// ------------------------------------------
function setupKpiGridEvents() {
  document.getElementById('btnSaveKpiData').addEventListener('click', async () => {
    if (!API_URL) return alert("Chỉ hoạt động khi có API_URL (kết nối Google Sheet)");

    // Thu thập dữ liệu từ table
    let kpiArray = [];
    document.querySelectorAll('.row-kpi').forEach(tr => {
      const maNV = tr.getAttribute('data-manv');
      kpiArray.push({
        MaNV: maNV,
        Target_NU: tr.querySelector('.t-nu').value,
        Target_DST: tr.querySelector('.t-dst').value,
        Target_DSN1: tr.querySelector('.t-dsn1').value,
        Target_Khac: tr.querySelector('.t-khac').value,
        Actual_NU: tr.querySelector('.a-nu').value,
        Actual_DST: tr.querySelector('.a-dst').value,
        Actual_DSN1: tr.querySelector('.a-dsn1').value,
        Actual_Khac: tr.querySelector('.a-khac').value,
        ThuongVuot: tr.querySelector('.kpi-vuot').value,
        HoTroKhac: tr.querySelector('.kpi-hotro').value,
        TongThuongKPI: parseFloat(tr.querySelector('.total-kpi').innerText.replace(/[^\d.-]/g, '')) || 0
      });
    });

    showLoader(true);
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "saveKpiData", data: { month: getFormattedMonth(), records: kpiArray } })
    });
    showLoader(false);
    alert("Đã lưu dữ liệu KPI tháng " + getFormattedMonth());
  });

  document.querySelector('#kpiTableBody').addEventListener('input', (e) => {
    if (e.target.classList.contains('kpi-input')) {
      const tr = e.target.closest('tr');
      recalcKpiRow(tr);
    }
  });
}

function recalcKpiRow(tr) {
  const maNV = tr.getAttribute('data-manv');
  const emp = state.employees.find(x => x.MaNV === maNV);
  if (!emp) return;

  const getV = (sel) => parseFloat(tr.querySelector(sel).value) || 0;

  const t_nu = getV('.t-nu'); const a_nu = getV('.a-nu');
  const t_dst = getV('.t-dst'); const a_dst = getV('.a-dst');
  const t_dsn1 = getV('.t-dsn1'); const a_dsn1 = getV('.a-dsn1');
  const t_khac = getV('.t-khac'); const a_khac = getV('.a-khac');

  const rate_nu = t_nu > 0 ? (a_nu / t_nu) * 100 : 0;
  const rate_dst = t_dst > 0 ? (a_dst / t_dst) * 100 : 0;
  const rate_dsn1 = t_dsn1 > 0 ? (a_dsn1 / t_dsn1) * 100 : 0;
  const rate_khac = t_khac > 0 ? (a_khac / t_khac) * 100 : 0;

  tr.querySelector('.r-nu').innerText = rate_nu > 0 ? rate_nu.toFixed(1) + '%' : '';
  tr.querySelector('.r-dst').innerText = rate_dst > 0 ? rate_dst.toFixed(1) + '%' : '';
  tr.querySelector('.r-dsn1').innerText = rate_dsn1 > 0 ? rate_dsn1.toFixed(1) + '%' : '';
  tr.querySelector('.r-khac').innerText = rate_khac > 0 ? rate_khac.toFixed(1) + '%' : '';

  const calcBonus = (rate, typeStr) => {
    if (rate >= 100) return parseFloat(emp[`KPI100_${typeStr}`]) || 0;
    if (rate >= 90) return parseFloat(emp[`KPI90_${typeStr}`]) || 0;
    if (rate >= 80) return parseFloat(emp[`KPI80_${typeStr}`]) || 0;
    if (rate >= 70) return parseFloat(emp[`KPI70_${typeStr}`]) || 0;
    return 0;
  };

  const b_nu = calcBonus(rate_nu, 'NU');
  const b_dst = calcBonus(rate_dst, 'DSTong');
  const b_dsn1 = calcBonus(rate_dsn1, 'DSN1');

  let b_khac = 0;
  try {
    let custom = JSON.parse(emp.DanhSachKPI || "[]");
    if (custom.length > 0 && rate_khac >= 70) {
      b_khac = parseFloat(custom[0].value) || 0;
    }
  } catch (e) { }

  tr.querySelector('.b-nu').innerText = formatCurrency(b_nu);
  tr.querySelector('.b-dst').innerText = formatCurrency(b_dst);
  tr.querySelector('.b-dsn1').innerText = formatCurrency(b_dsn1);
  tr.querySelector('.b-khac').innerText = formatCurrency(b_khac);

  const vuot = getV('.kpi-vuot');
  const hotro = getV('.kpi-hotro');

  const total = b_nu + b_dst + b_dsn1 + b_khac + vuot + hotro;
  tr.querySelector('.total-kpi').innerText = formatCurrency(total);
}

function renderKpiGrid() {
  document.getElementById('lblKpiMonth').innerText = getFormattedMonth();
  const tbody = document.getElementById('kpiTableBody');
  tbody.innerHTML = '';

  const filtered = state.employees.filter(e => {
    const matchSearch = e.MaNV.toLowerCase().includes(state.searchQuery) || e.HoTen.toLowerCase().includes(state.searchQuery);
    const matchStore = state.currentStore === 'all' || e.CuaHang === state.currentStore;
    return matchSearch && matchStore;
  });

  filtered.forEach((e, idx) => {
    const saved = state.kpiData.find(x => x.MaNV === e.MaNV) || {};
    tbody.innerHTML += `
      <tr class="row-kpi" data-manv="${e.MaNV}">
        <td style="position: sticky; left: 0; background: #fff; z-index: 1; border-right:1px solid #ddd;">${idx + 1}</td>
        <td style="position: sticky; left: 40px; background: #fff; z-index: 1; font-weight:600; border-right:1px solid #ddd;">${e.MaNV}</td>
        <td style="position: sticky; left: 110px; background: #fff; z-index: 1; border-right:1px solid #ddd; white-space:nowrap;">${e.HoTen}</td>
        <td>${e.CuaHang || ''}</td>
        <td>${e.ChucVu || ''}</td>
        
        <td><input type="number" class="kpi-input t-nu" value="${saved.Target_NU || ''}"></td>
        <td><input type="number" class="kpi-input t-dst" value="${saved.Target_DST || ''}"></td>
        <td><input type="number" class="kpi-input t-dsn1" value="${saved.Target_DSN1 || ''}"></td>
        <td><input type="number" class="kpi-input t-khac" value="${saved.Target_Khac || ''}" placeholder="Tùy chọn"></td>
        
        <td><input type="number" class="kpi-input a-nu" value="${saved.Actual_NU || ''}"></td>
        <td><input type="number" class="kpi-input a-dst" value="${saved.Actual_DST || ''}"></td>
        <td><input type="number" class="kpi-input a-dsn1" value="${saved.Actual_DSN1 || ''}"></td>
        <td><input type="number" class="kpi-input a-khac" value="${saved.Actual_Khac || ''}"></td>

        <td class="r-nu font-bold" style="color: #64748B;"></td>
        <td class="r-dst font-bold" style="color: #64748B;"></td>
        <td class="r-dsn1 font-bold" style="color: #64748B;"></td>
        <td class="r-khac font-bold" style="color: #64748B;"></td>

        <td class="b-nu font-bold" style="color: #16A34A; white-space:nowrap;"></td>
        <td class="b-dst font-bold" style="color: #16A34A; white-space:nowrap;"></td>
        <td class="b-dsn1 font-bold" style="color: #16A34A; white-space:nowrap;"></td>
        <td class="b-khac font-bold" style="color: #16A34A; white-space:nowrap;"></td>

        <td><input type="number" class="kpi-input kpi-vuot" value="${saved.ThuongVuot || ''}"></td>
        <td><input type="number" class="kpi-input kpi-hotro" value="${saved.HoTroKhac || ''}"></td>
        
        <td class="total-kpi font-bold" style="color: #DC2626; font-size: 1.1rem; white-space:nowrap;">0</td>
      </tr>
    `;
  });

  document.querySelectorAll('.row-kpi').forEach(tr => recalcKpiRow(tr));
}

// ------------------------------------------
// MODULE: CHẤM CÔNG
// ------------------------------------------
function getDaysInMonth(monthStr) {
  const parts = monthStr.split('-');
  return new Date(parts[0], parts[1], 0).getDate();
}

function renderTimekeeping() {
  document.getElementById('lblTimekeepingMonth').innerText = getFormattedMonth();
  const thead = document.getElementById('tkTableHead');
  const tbody = document.getElementById('tkTableBody');

  if (!thead || !tbody) return;

  const daysInMonth = getDaysInMonth(state.currentMonth);

  let theadHtml = `
    <tr>
      <th rowspan="2" style="position: sticky; left:0; background:#E2E8F0; z-index:2; border-right:1px solid #CBD5E1;">STT</th>
      <th rowspan="2" style="position: sticky; left:40px; background:#E2E8F0; z-index:2; border-right:1px solid #CBD5E1;">Mã NV</th>
      <th rowspan="2" style="position: sticky; left:110px; background:#E2E8F0; z-index:2; border-right:1px solid #CBD5E1;">Họ Tên</th>
      <th rowspan="2" style="position: sticky; left:260px; background:#E2E8F0; z-index:2; border-right:2px solid #94A3B8;">Chức vụ/Row</th>
  `;
  for (let i = 1; i <= daysInMonth; i++) {
    theadHtml += `<th style="text-align:center; border-right:1px solid #CBD5E1; min-width:36px; width:36px;">${String(i).padStart(2, '0')}</th>`;
  }
  theadHtml += `
      <th rowspan="2" style="text-align:center; background:#EFF6FF; border-left:2px solid #94A3B8; color:#1E40AF" class="sum-column">GC</th>
      <th rowspan="2" style="text-align:center; background:#F0FDF4; color:#166534" class="sum-column">P</th>
      <th rowspan="2" style="text-align:center; background:#FEF2F2; color:#991B1B" class="sum-column">K</th>
      <th rowspan="2" style="text-align:center; background:#FEF2F2; color:#991B1B" class="sum-column">Trễ</th>
      <th rowspan="2" style="text-align:center; background:#FEF3C7; color:#92400E" class="sum-column">TCNT</th>
      <th rowspan="2" style="text-align:center; background:#FEF3C7; color:#92400E" class="sum-column">TCNN</th>
      <th rowspan="2" style="text-align:center; background:#FEF3C7; color:#92400E; border-right:2px solid #94A3B8" class="sum-column">TCNL</th>
      <th rowspan="2" style="text-align:center; background:#F8FAFC; border-right:1px solid #CBD5E1; min-width:60px;">ĐÀO TẠ</th>
      <th rowspan="2" style="text-align:center; background:#F0FDF4; min-width:100px;">MỨC THƯỞNG CC</th>
    </tr><tr>
  `;

  const getWeekday = (year, month, day) => {
    const d = new Date(year, month - 1, day).getDay();
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return days[d];
  };
  const parts = state.currentMonth.split('-');
  for (let i = 1; i <= daysInMonth; i++) {
    let wd = getWeekday(parts[0], parts[1], i);
    let color = (wd === 'CN') ? '#EF4444' : '#475569';
    theadHtml += `<th style="text-align:center; font-size:0.75rem; color:${color}; border-right:1px solid #CBD5E1; padding:0.2rem;">${wd}</th>`;
  }
  theadHtml += `</tr>`;
  thead.innerHTML = theadHtml;

  tbody.innerHTML = '';

  const filtered = state.employees.filter(e => {
    const matchSearch = e.MaNV.toLowerCase().includes(state.searchQuery) || e.HoTen.toLowerCase().includes(state.searchQuery);
    const matchStore = state.currentStore === 'all' || e.CuaHang === state.currentStore;
    return matchSearch && matchStore;
  });

  filtered.forEach((e, idx) => {
    let existing = null;
    if (state.timekeepingData && state.timekeepingData.length > 0) {
      existing = state.timekeepingData.find(x => x.MaNV === e.MaNV);
    }
    let dataObj = {};
    if (existing && existing.DailyDataJSON) {
      try { dataObj = JSON.parse(existing.DailyDataJSON); } catch (err) { }
    }

    let htmlPlan = '';
    let htmlActual = '';
    let htmlTC = '';

    for (let i = 1; i <= daysInMonth; i++) {
      let d = String(i).padStart(2, '0');
      let cell = dataObj[d] || { p: '', a: '', tc: '' };

      let selHtml = `
        <select class="tk-select plan-in" data-day="${d}" onchange="recalcTimekeeping(this.closest('.row-tk-group'))" ondblclick="fillPlanRemainder(this)">
          <option value="" ${cell.p === '' ? 'selected' : ''}></option>
          <option value="CG" ${cell.p === 'CG' ? 'selected' : ''}>CG</option>
          <option value="CF" ${cell.p === 'CF' ? 'selected' : ''}>CF</option>
          <option value="NN" ${cell.p === 'NN' ? 'selected' : ''}>NN</option>
          <option value="NL" ${cell.p === 'NL' ? 'selected' : ''}>NL</option>
          <option value="P" ${cell.p === 'P' ? 'selected' : ''}>P</option>
        </select>
      `;
      htmlPlan += `<td class="tk-cell tk-row-plan">${selHtml}</td>`;
      htmlActual += `<td class="tk-cell tk-row-actual"><input type="text" class="tk-input act-in" data-day="${d}" value="${cell.a || ''}" onchange="recalcTimekeeping(this.closest('.row-tk-group').previousElementSibling)"></td>`;
      htmlTC += `<td class="tk-cell tk-row-tc"><input type="text" class="tk-input tc-in" data-day="${d}" value="${cell.tc || ''}" onchange="recalcTimekeeping(this.closest('.row-tk-group').previousElementSibling.previousElementSibling)"></td>`;
    }

    tbody.innerHTML += `
      <tr class="row-tk-group" data-manv="${e.MaNV}">
        <td rowspan="3" style="position: sticky; left:0; background:#fff; z-index:1; border-bottom:2px solid #94A3B8; text-align:center; border-right:1px solid #CBD5E1;">${idx + 1}</td>
        <td rowspan="3" style="position: sticky; left:40px; background:#fff; z-index:1; font-weight:600; border-bottom:2px solid #94A3B8; border-right:1px solid #CBD5E1;">${e.MaNV}</td>
        <td rowspan="3" style="position: sticky; left:110px; background:#fff; z-index:1; font-weight:600; border-bottom:2px solid #94A3B8; border-right:1px solid #CBD5E1; min-width:150px;">${e.HoTen}</td>
        <td style="position: sticky; left:260px; background:#F1F5F9; z-index:1; font-size:0.8rem; font-weight:600; border-right:2px solid #94A3B8; text-align:center;">Kế hoạch</td>
        ${htmlPlan}
        <td rowspan="3" class="sum-gc sum-column" style="text-align:center; font-weight:bold; background:#EFF6FF; border-left:2px solid #94A3B8; border-bottom:2px solid #94A3B8;">0</td>
        <td rowspan="3" class="sum-p sum-column" style="text-align:center; font-weight:bold; background:#F0FDF4; border-bottom:2px solid #94A3B8;">0</td>
        <td rowspan="3" class="sum-k sum-column" style="text-align:center; font-weight:bold; background:#FEF2F2; border-bottom:2px solid #94A3B8;">0</td>
        <td rowspan="3" class="sum-tre sum-column" style="text-align:center; background:#FEF2F2; border-bottom:2px solid #94A3B8;"><input type="number" class="tk-input inp-tre" placeholder="0" value="${existing ? existing.KhauTruTre : ''}" onchange="recalcTimekeeping(this.closest('.row-tk-group'))"></td>
        <td rowspan="3" class="sum-tcnt sum-column" style="text-align:center; font-weight:bold; background:#FEF3C7; border-bottom:2px solid #94A3B8;">0</td>
        <td rowspan="3" class="sum-tcnn sum-column" style="text-align:center; font-weight:bold; background:#FEF3C7; border-bottom:2px solid #94A3B8;">0</td>
        <td rowspan="3" class="sum-tcnl sum-column" style="text-align:center; font-weight:bold; background:#FEF3C7; border-bottom:2px solid #94A3B8; border-right:2px solid #94A3B8;">0</td>
        <td rowspan="3" style="text-align:center; background:#F8FAFC; border-right:1px solid #CBD5E1; border-bottom:2px solid #94A3B8;">
          <select class="tk-select inp-daotao" onchange="recalcTimekeeping(this.closest('.row-tk-group'))">
            <option value="A" ${existing && existing.DaoTao === 'A' ? 'selected' : ''}>A</option>
            <option value="B" ${existing && existing.DaoTao === 'B' ? 'selected' : ''}>B</option>
          </select>
        </td>
        <td rowspan="3" style="text-align:center; background:#F0FDF4; border-bottom:2px solid #94A3B8; font-weight:bold; color:#166534">
          <div class="txt-muc-cc">Mức 3</div>
          <div class="val-muc-cc" style="font-size:0.75rem; color:#64748B;">0 ₫</div>
        </td>
      </tr>
      <tr>
        <td style="position: sticky; left:260px; background:#FFFFFF; z-index:1; font-size:0.8rem; font-weight:600; border-right:2px solid #94A3B8; text-align:center; color:#166534">Thực tế</td>
        ${htmlActual}
      </tr>
      <tr style="border-bottom:2px solid #94A3B8;">
        <td style="position: sticky; left:260px; background:#FFFBEB; z-index:1; font-size:0.8rem; font-weight:600; border-right:2px solid #94A3B8; text-align:center; color:#9A3412">Tăng ca</td>
        ${htmlTC}
      </tr>
    `;
  });

  document.querySelectorAll('.row-tk-group').forEach(tr => recalcTimekeeping(tr));
}

window.fillPlanRemainder = function (selectEl) {
  const val = selectEl.value;
  if (!val) return;

  const tr = selectEl.closest('.row-tk-group');
  const day = parseInt(selectEl.getAttribute('data-day'));
  const allPlan = tr.querySelectorAll('.plan-in');

  allPlan.forEach(sel => {
    const d = parseInt(sel.getAttribute('data-day'));
    if (d > day) {
      sel.value = val;
      sel.style.backgroundColor = "#DBEAFE"; // Flash effect color
      setTimeout(() => sel.style.backgroundColor = "", 500);
    }
  });
  recalcTimekeeping(tr);
  alert("Đã tự động điền giá trị \"" + val + "\" cho các ngày còn lại.");
}


function recalcTimekeeping(trGroup) {
  const trPlan = trGroup;
  const trAct = trGroup.nextElementSibling;
  const trTc = trAct.nextElementSibling;

  const planInputs = trPlan.querySelectorAll('.plan-in');
  const actInputs = trAct.querySelectorAll('.act-in');
  const tcInputs = trTc.querySelectorAll('.tc-in');

  let tongGio = 0;
  let p = 0;
  let k = 0;
  let tcnt = 0;
  let tcnn = 0;
  let tcnl = 0;

  for (let i = 0; i < planInputs.length; i++) {
    let plan = planInputs[i].value.trim().toUpperCase();
    let act = actInputs[i].value.trim();
    let tc = parseFloat(tcInputs[i].value) || 0;

    if (plan === 'P') p++;
    if (plan === 'K') k++;

    // Mặc định điền theo Kế hoach nếu Thực tế sửa trống
    if (plan === 'NL' && act === '') act = '0'; // Sẽ cộng 8 giờ tổng cho Lễ thì tuỳ rules cty. Theo đề bài "Kế hoạch là ngày Lễ mặc định hàng 2 là 8h". Giả sử user gõ tay hoặc mình sẽ gán luôn.

    // Auto fill
    if (plan === 'NL' && actInputs[i].value === '') { actInputs[i].value = 8; act = '8'; }
    if (plan === 'NN' && actInputs[i].value === '') { actInputs[i].value = ''; act = '0'; }

    // Giờ công (chia 8 để ra Ngày công) -> Thường hiển thị Tổng số giờ công
    let gioDay = parseFloat(act) || 0;
    tongGio += gioDay;

    if (tc > 0) {
      if (plan === 'NN') tcnn += tc;
      else if (plan === 'NL') tcnl += tc;
      else tcnt += tc;
    }
  }

  trGroup.querySelector('.sum-gc').innerText = tongGio;
  trGroup.querySelector('.sum-p').innerText = p;
  trGroup.querySelector('.sum-k').innerText = k;
  trGroup.querySelector('.sum-tcnt').innerText = tcnt;
  trGroup.querySelector('.sum-tcnn').innerText = tcnn;
  trGroup.querySelector('.sum-tcnl').innerText = tcnl;

  // Logic Thưởng Chuyên Cần 3 Mức
  const daoTao = trGroup.querySelector('.inp-daotao').value;
  const tre = parseFloat(trGroup.querySelector('.inp-tre').value) || 0;
  let muc = "Mức 3";
  let tien = 0;

  if (k >= 1 || p >= 2) {
    muc = "Mức 3";
    tien = 0;
  } else if ((daoTao === 'A' && p === 1 && k === 0 && tre === 0) || (daoTao === 'B' && p === 0 && k === 0 && tre === 0)) {
    muc = "Mức 2";
    tien = 150000;
  } else if (daoTao === 'A' && p === 0 && k === 0 && tre === 0) {
    muc = "Mức 1";
    tien = 350000;
  }

  trGroup.querySelector('.txt-muc-cc').innerText = muc;
  trGroup.querySelector('.val-muc-cc').innerText = formatCurrency(tien);
  trGroup.dataset.mucCcValue = tien;
  trGroup.dataset.daoTao = daoTao;
}

function setupTimekeepingEvents() {
  document.getElementById('tkTableBody')?.addEventListener('input', (e) => {
    if (e.target.classList.contains('tk-input')) {
      let tr = e.target.closest('tr');
      while (tr && !tr.classList.contains('row-tk-group') && tr.previousElementSibling) {
        tr = tr.previousElementSibling;
      }
      if (tr && tr.classList.contains('row-tk-group')) {
        recalcTimekeeping(tr);
      }
    }
  });

  document.getElementById('btnSaveTimekeeping')?.addEventListener('click', async () => {
    if (!API_URL) return alert("Chỉ hoạt động khi có API_URL (kết nối Google Sheet)");

    const ngayChuan = parseFloat(document.getElementById('inpNgayCongChuan').value) || 24;

    let timekeepingArray = [];
    document.querySelectorAll('.row-tk-group').forEach(tr => {
      const maNV = tr.getAttribute('data-manv');
      const trPlan = tr;
      const trAct = tr.nextElementSibling;
      const trTc = trAct.nextElementSibling;

      let dailyData = {};
      const popData = (inputs, type) => {
        inputs.forEach(inp => {
          let d = inp.getAttribute('data-day');
          if (!dailyData[d]) dailyData[d] = {};
          dailyData[d][type] = inp.value;
        });
      };

      popData(trPlan.querySelectorAll('.plan-in'), 'p');
      popData(trAct.querySelectorAll('.act-in'), 'a');
      popData(trTc.querySelectorAll('.tc-in'), 'tc');

      timekeepingArray.push({
        MaNV: maNV,
        DailyDataJSON: JSON.stringify(dailyData),
        TongGioCong: parseFloat(tr.querySelector('.sum-gc').innerText) || 0,
        TongP: parseFloat(tr.querySelector('.sum-p').innerText) || 0,
        TongK: parseFloat(tr.querySelector('.sum-k').innerText) || 0,
        TongTCNT: parseFloat(tr.querySelector('.sum-tcnt').innerText) || 0,
        TongTCNN: parseFloat(tr.querySelector('.sum-tcnn').innerText) || 0,
        TongTCNL: parseFloat(tr.querySelector('.sum-tcnl').innerText) || 0,
        KhauTruTre: parseFloat(tr.querySelector('.inp-tre').value) || 0,
        DaoTao: tr.dataset.daoTao || 'A',
        MucChuyenCanCalc: parseFloat(tr.dataset.mucCcValue) || 0
      });
    });

    showLoader(true);
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "saveTimekeeping",
        data: {
          month: getFormattedMonth(),
          ngayChuan: ngayChuan,
          records: timekeepingArray
        }
      })
    });
    showLoader(false);
    alert("Đã lưu dữ liệu chấm công tháng " + getFormattedMonth());
  });
}

// ------------------------------------------
// MODULE: BẢNG LƯONG (Chi Tiết)
// ------------------------------------------

function buildPayrollRow(e) {
  let cc = (state.timekeepingData || []).find(x => x.MaNV === e.MaNV) || {};
  let kpi = (state.kpiData || []).find(x => x.MaNV === e.MaNV) || {};

  let ngayChuan = parseFloat(cc.NgayCongChuan) || parseFloat(document.getElementById('inpNgayCongChuan')?.value) || 24;
  let tongGio = parseFloat(cc.TongGioCong) || 0;
  let ngayCongTT = +(tongGio / 8).toFixed(2);
  let pCount = parseFloat(cc.TongP) || 0;
  let kCount = parseFloat(cc.TongK) || 0;
  let diTreVeSom = parseFloat(cc.KhauTruTre) || 0;
  let tcnt = parseFloat(cc.TongTCNT) || 0;
  let tcnn = parseFloat(cc.TongTCNN) || 0;
  let tcnl = parseFloat(cc.TongTCNL) || 0;

  let lcb = parseFloat(e.LuongCoBan) || 0;
  let luongGio = lcb / ngayChuan / 8;

  let luongNgayCong = luongGio * tongGio;
  let luongTCNT = luongGio * 1.5 * tcnt;
  let luongTCNN = luongGio * 2.0 * tcnn;
  let luongTCNL = luongGio * 3.0 * tcnl;

  // Ưu tiên lấy thưởng CC đã tính toán từ Bảng Công
  let thuongChuyenCan = cc.hasOwnProperty('MucChuyenCanCalc') ? parseFloat(cc.MucChuyenCanCalc) : (parseFloat(e.ThuongChuyenCan) || 0);

  let thuongTrachNhiem = parseFloat(e.ThuongTrachNhiem) || 0;
  let thuongKPI = parseFloat(kpi.TongThuongKPI) || 0;

  return {
    MaNV: e.MaNV,
    HoTen: e.HoTen,
    CuaHang: e.CuaHang || '',
    ChucVu: e.ChucVu || '',
    NgayCongTT: ngayCongTT,
    P: pCount,
    K: kCount,
    DiTre: diTreVeSom,
    TCNT: tcnt,
    TCNN: tcnn,
    TCNL: tcnl,
    CC: '',
    LuongCoBan: lcb,
    LuongNgayCong: Math.round(luongNgayCong),
    LuongTCNT: Math.round(luongTCNT),
    LuongTCNN: Math.round(luongTCNN),
    LuongTCNL: Math.round(luongTCNL),
    ThuongCC: thuongChuyenCan,
    TroCap: 0,
    ThuongKPI: thuongKPI,
    ThuongQuy: 0,
    ThuongNam: 0,
    ThuongThamNien: 0,
    ThuongTrachNhiem: thuongTrachNhiem,
    ThuongThang13: 0,
    TruyThu: 0,
    BHXH: Math.round(lcb * (state.config.bhRate / 100)),
    ThueTNCN: 0,
    TongGross: 0,
    TongKhauTru: 0,
    ThucNhan: 0
  };
}

function calcPayrollNet(r) {
  r.TongGross = r.LuongNgayCong + r.LuongTCNT + r.LuongTCNN + r.LuongTCNL
    + r.ThuongCC + r.TroCap + r.ThuongKPI + r.ThuongQuy
    + r.ThuongNam + r.ThuongThamNien + r.ThuongTrachNhiem + r.ThuongThang13;
  r.TongKhauTru = r.TruyThu + r.BHXH + r.ThueTNCN;
  r.ThucNhan = r.TongGross - r.TongKhauTru;
  return r;
}

function renderPayroll() {
  document.getElementById('lblPayrollMonth').innerText = getFormattedMonth();
  const thead = document.getElementById('payrollTableHead');
  const tbody = document.getElementById('payrollTableBody');
  if (!thead || !tbody) return;

  thead.innerHTML = '<tr>'
    + '<th rowspan="2" style="position:sticky;left:0;background:#E2E8F0;z-index:2;border-right:1px solid #CBD5E1">STT</th>'
    + '<th rowspan="2" style="position:sticky;left:40px;background:#E2E8F0;z-index:2;border-right:1px solid #CBD5E1">Mã NV</th>'
    + '<th rowspan="2" style="position:sticky;left:110px;background:#E2E8F0;z-index:2;border-right:1px solid #CBD5E1;min-width:150px">Họ Tên</th>'
    + '<th colspan="7" style="text-align:center;background:#F0FDF4;color:#166534;border-right:2px solid #94A3B8">KHU LƯƠNG THỰC</th>'
    + '<th rowspan="2" style="background:#EFF6FF;color:#1E40AF;border-right:1px solid #CBD5E1">Lương<br>Cơ bản</th>'
    + '<th rowspan="2" style="background:#EFF6FF;color:#1E40AF;border-right:1px solid #CBD5E1">Lương<br>Ngày công</th>'
    + '<th rowspan="2" style="background:#EFF6FF;color:#1E40AF;border-right:1px solid #CBD5E1">TC ngày<br>thường</th>'
    + '<th rowspan="2" style="background:#EFF6FF;color:#1E40AF;border-right:1px solid #CBD5E1">TC ngày<br>nghỉ</th>'
    + '<th rowspan="2" style="background:#EFF6FF;color:#1E40AF;border-right:2px solid #94A3B8">TC ngày<br>lễ</th>'
    + '<th colspan="8" style="text-align:center;background:#FEF3C7;color:#92400E;border-right:2px solid #94A3B8">KHU ANH/CHỊ TỰ NHẬP SỐ</th>'
    + '<th colspan="3" style="text-align:center;background:#FEE2E2;color:#991B1B;border-right:2px solid #94A3B8">KHẤU TRỪ</th>'
    + '<th rowspan="2" style="background:#DC2626;color:white;font-weight:bold;text-align:center;font-size:0.9rem">LƯƠNG<br>THỰC NHẬN</th>'
    + '<th rowspan="2" style="text-align:center;background:#E2E8F0">Thao tác</th>'
    + '</tr><tr>'
    + '<th style="background:#DCFCE7;color:#166534;border-right:1px solid #BBF7D0">Ngày<br>công TT</th>'
    + '<th style="background:#DCFCE7;color:#166534;border-right:1px solid #BBF7D0">P</th>'
    + '<th style="background:#DCFCE7;color:#166534;border-right:1px solid #BBF7D0">K</th>'
    + '<th style="background:#DCFCE7;color:#166534;border-right:1px solid #BBF7D0">Đi trễ</th>'
    + '<th style="background:#DCFCE7;color:#166534;border-right:1px solid #BBF7D0">TCNT</th>'
    + '<th style="background:#DCFCE7;color:#166534;border-right:1px solid #BBF7D0">TCNN</th>'
    + '<th style="background:#DCFCE7;color:#166534;border-right:2px solid #94A3B8">TCNL</th>'
    + '<th style="background:#FFFBEB;color:#92400E;border-right:1px solid #FDE68A">Th.Chuyên<br>cần</th>'
    + '<th style="background:#FFFBEB;color:#92400E;border-right:1px solid #FDE68A">Trợ cấp<br>ĐC/CT</th>'
    + '<th style="background:#FFFBEB;color:#92400E;border-right:1px solid #FDE68A">Thưởng<br>KPI</th>'
    + '<th style="background:#FFFBEB;color:#92400E;border-right:1px solid #FDE68A">Thưởng<br>Quý</th>'
    + '<th style="background:#FFFBEB;color:#92400E;border-right:1px solid #FDE68A">Thưởng<br>Năm</th>'
    + '<th style="background:#FFFBEB;color:#92400E;border-right:1px solid #FDE68A">Thưởng<br>Thâm niên</th>'
    + '<th style="background:#FFFBEB;color:#92400E;border-right:1px solid #FDE68A">Thưởng<br>Trách nhiệm</th>'
    + '<th style="background:#FFFBEB;color:#92400E;border-right:2px solid #94A3B8">Thưởng<br>Tháng 13</th>'
    + '<th style="background:#FECACA;color:#991B1B;border-right:1px solid #FCA5A5">Truy thu</th>'
    + '<th style="background:#FECACA;color:#991B1B;border-right:1px solid #FCA5A5">BHXH<br>' + state.config.bhRate + '%</th>'
    + '<th style="background:#FECACA;color:#991B1B;border-right:2px solid #94A3B8">Thuế<br>TNCN</th>'
    + '</tr>';

  tbody.innerHTML = '';

  const filtered = state.employees.filter(e =>
    e.MaNV.toLowerCase().includes(state.searchQuery) ||
    e.HoTen.toLowerCase().includes(state.searchQuery)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="28" style="text-align:center; color:#888; padding:2rem;">Không tìm thấy kết quả phù hợp.</td></tr>';
    return;
  }

  filtered.forEach(function (e, idx) {
    var r = buildPayrollRow(e);
    r = calcPayrollNet(r);

    const lockedAttr = state.config.isLocked ? 'readonly style="background:#f1f5f9; cursor:not-allowed"' : '';

    tbody.innerHTML += '<tr class="row-payroll" data-manv="' + e.MaNV + '">'
      + '<td style="position:sticky;left:0;background:#fff;z-index:1;text-align:center;border-right:1px solid #CBD5E1">' + (idx + 1) + '</td>'
      + '<td style="position:sticky;left:40px;background:#fff;z-index:1;font-weight:600;border-right:1px solid #CBD5E1">' + e.MaNV + '</td>'
      + '<td style="position:sticky;left:110px;background:#fff;z-index:1;font-weight:600;border-right:1px solid #CBD5E1;min-width:150px">' + e.HoTen + '</td>'
      + '<td style="text-align:center">' + r.NgayCongTT + '</td>'
      + '<td style="text-align:center">' + r.P + '</td>'
      + '<td style="text-align:center">' + r.K + '</td>'
      + '<td style="text-align:center">' + r.DiTre + '</td>'
      + '<td style="text-align:center">' + r.TCNT + '</td>'
      + '<td style="text-align:center">' + r.TCNN + '</td>'
      + '<td style="text-align:center;border-right:2px solid #94A3B8">' + r.TCNL + '</td>'
      + '<td style="text-align:right">' + formatCurrency(r.LuongCoBan) + '</td>'
      + '<td style="text-align:right">' + formatCurrency(r.LuongNgayCong) + '</td>'
      + '<td style="text-align:right">' + formatCurrency(r.LuongTCNT) + '</td>'
      + '<td style="text-align:right">' + formatCurrency(r.LuongTCNN) + '</td>'
      + '<td style="text-align:right;border-right:2px solid #94A3B8">' + formatCurrency(r.LuongTCNL) + '</td>'
      + '<td style="text-align:right"><input class="pr-input inp-tcc" value="' + r.ThuongCC + '" ' + lockedAttr + '></td>'
      + '<td style="text-align:right"><input class="pr-input inp-trocap" value="' + r.TroCap + '" ' + lockedAttr + '></td>'
      + '<td style="text-align:right">' + formatCurrency(r.ThuongKPI) + '</td>'
      + '<td style="text-align:right"><input class="pr-input inp-tquy" value="' + r.ThuongQuy + '" ' + lockedAttr + '></td>'
      + '<td style="text-align:right"><input class="pr-input inp-tnam" value="' + r.ThuongNam + '" ' + lockedAttr + '></td>'
      + '<td style="text-align:right"><input class="pr-input inp-tthamn" value="' + r.ThuongThamNien + '" ' + lockedAttr + '></td>'
      + '<td style="text-align:right"><input class="pr-input inp-ttn" value="' + r.ThuongTrachNhiem + '" ' + lockedAttr + '></td>'
      + '<td style="text-align:right;border-right:2px solid #94A3B8"><input class="pr-input inp-t13" value="' + r.ThuongThang13 + '" ' + lockedAttr + '></td>'
      + '<td style="text-align:right"><input class="pr-input inp-truy" value="' + r.TruyThu + '" ' + lockedAttr + '></td>'
      + '<td style="text-align:right">' + formatCurrency(r.BHXH) + '</td>'
      + '<td style="text-align:right;border-right:2px solid #94A3B8"><input class="pr-input inp-thue" value="' + r.ThueTNCN + '" ' + lockedAttr + '></td>'
      + '<td class="td-net" style="text-align:right;font-weight:bold;color:#DC2626;font-size:1rem">' + formatCurrency(r.ThucNhan) + '</td>'
      + '<td style="text-align:center"><button class="btn btn-outline btn-print-slip" style="padding:0.3rem 0.5rem;font-size:0.75rem" data-manv="' + e.MaNV + '">🖨️ In</button></td>'
      + '</tr>';
  });
}

function getPayrollRowData(tr) {
  var maNV = tr.getAttribute('data-manv');
  var emp = state.employees.find(function (x) { return x.MaNV === maNV; });
  if (!emp) return null;
  var r = buildPayrollRow(emp);
  r.ThuongCC = parseFloat(tr.querySelector('.inp-tcc')?.value) || 0;
  r.TroCap = parseFloat(tr.querySelector('.inp-trocap')?.value) || 0;
  r.ThuongQuy = parseFloat(tr.querySelector('.inp-tquy')?.value) || 0;
  r.ThuongNam = parseFloat(tr.querySelector('.inp-tnam')?.value) || 0;
  r.ThuongThamNien = parseFloat(tr.querySelector('.inp-tthamn')?.value) || 0;
  r.ThuongTrachNhiem = parseFloat(tr.querySelector('.inp-ttn')?.value) || 0;
  r.ThuongThang13 = parseFloat(tr.querySelector('.inp-t13')?.value) || 0;
  r.TruyThu = parseFloat(tr.querySelector('.inp-truy')?.value) || 0;
  r.ThueTNCN = parseFloat(tr.querySelector('.inp-thue')?.value) || 0;
  return calcPayrollNet(r);
}

function printFullPayroll() {
  const curMonth = getFormattedMonth();
  const companyName = state.config.companyName || "Bi's Mart - Hệ thống Cửa hàng";
  const rows = document.querySelectorAll('.row-payroll');

  if (rows.length === 0) return alert("Không có dữ liệu để in.");

  let tableHtml = `
    <div class="print-header">
      <p><strong>${companyName}</strong></p>
      <h1>BẢNG LƯƠNG NHÂN VIÊN</h1>
      <p>Tháng ${curMonth}</p>
    </div>
    <table class="payroll-print-table">
      <thead>
        <tr>
          <th>STT</th>
          <th>Mã NV</th>
          <th>Họ Tên</th>
          <th>Lương CB</th>
          <th>NC TT</th>
          <th>Lương NC</th>
          <th>TC Thường</th>
          <th>TC Nghỉ</th>
          <th>TC Lễ</th>
          <th>Th.CC</th>
          <th>KPI</th>
          <th>Trách nhiệm</th>
          <th>Th.Khác</th>
          <th>BHXH</th>
          <th>Thực Nhận</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((tr, idx) => {
    const r = getPayrollRowData(tr);
    if (!r) return;

    const tKhac = (r.ThuongQuy || 0) + (r.ThuongNam || 0) + (r.ThuongThamNien || 0) + (r.ThuongThang13 || 0) + (r.TroCap || 0);

    tableHtml += `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.MaNV}</td>
        <td style="text-align:left; padding-left:5px;">${r.HoTen}</td>
        <td>${formatCurrency(r.LuongCoBan).replace('₫', '')}</td>
        <td>${r.NgayCongTT}</td>
        <td>${formatCurrency(r.LuongNgayCong).replace('₫', '')}</td>
        <td>${formatCurrency(r.LuongTCNT).replace('₫', '')}</td>
        <td>${formatCurrency(r.LuongTCNN).replace('₫', '')}</td>
        <td>${formatCurrency(r.LuongTCNL).replace('₫', '')}</td>
        <td>${formatCurrency(r.ThuongCC).replace('₫', '')}</td>
        <td>${formatCurrency(r.ThuongKPI).replace('₫', '')}</td>
        <td>${formatCurrency(r.ThuongTrachNhiem).replace('₫', '')}</td>
        <td>${formatCurrency(tKhac).replace('₫', '')}</td>
        <td>${formatCurrency(r.BHXH).replace('₫', '')}</td>
        <td style="font-weight:bold;">${formatCurrency(r.ThucNhan)}</td>
      </tr>
    `;
  });

  tableHtml += `
      </tbody>
    </table>
    <div class="print-footer-signature">
      <div>
        <div class="signature-title">Người lập biểu</div>
        <div class="signature-box"></div>
        <div class="signature-name">(Ký, họ tên)</div>
      </div>
      <div>
        <div class="signature-title">Kế toán trưởng</div>
        <div class="signature-box"></div>
        <div class="signature-name">(Ký, họ tên)</div>
      </div>
      <div>
        <div class="signature-title">Giám đốc</div>
        <div class="signature-box"></div>
        <div class="signature-name">(Ký, họ tên)</div>
      </div>
    </div>
  `;

  const printTemplate = document.getElementById('printTemplate');
  printTemplate.innerHTML = tableHtml;
  window.print();
}

function recalcPayrollRow(tr) {
  var r = getPayrollRowData(tr);
  if (!r) return;
  tr.querySelector('.td-net').innerText = formatCurrency(r.ThucNhan);
}

function exportPayrollCSV() {
  var headers = ['STT', 'Mã NV', 'Họ Tên', 'Ngày công TT', 'P', 'K', 'Đi trễ', 'TCNT', 'TCNN', 'TCNL', 'Lương CB', 'Lương NC', 'TC Thường', 'TC Nghỉ', 'TC Lễ', 'Th.CC', 'Trợ cấp', 'Thưởng KPI', 'Th.Quý', 'Th.Năm', 'Th.Thâm niên', 'Th.Trách nhiệm', 'Th.Tháng 13', 'Truy thu', 'BHXH 10.5%', 'Thuế TNCN', 'THỰC NHẬN'];
  var rows = [];
  document.querySelectorAll('.row-payroll').forEach(function (tr, idx) {
    var r = getPayrollRowData(tr);
    if (!r) return;
    rows.push([idx + 1, r.MaNV, r.HoTen, r.NgayCongTT, r.P, r.K, r.DiTre, r.TCNT, r.TCNN, r.TCNL, r.LuongCoBan, r.LuongNgayCong, r.LuongTCNT, r.LuongTCNN, r.LuongTCNL, r.ThuongCC, r.TroCap, r.ThuongKPI, r.ThuongQuy, r.ThuongNam, r.ThuongThamNien, r.ThuongTrachNhiem, r.ThuongThang13, r.TruyThu, r.BHXH, r.ThueTNCN, r.ThucNhan]);
  });
  var csv = '\uFEFF' + headers.join(',') + '\n';
  rows.forEach(function (r) { csv += r.join(',') + '\n'; });
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'BangLuong_' + getFormattedMonth() + '.csv';
  link.click();
}

function printPayslip(maNV) {
  var tr = document.querySelector('.row-payroll[data-manv="' + maNV + '"]');
  if (!tr) return alert("Không tìm thấy dữ liệu nhân viên này.");
  var r = getPayrollRowData(tr);
  if (!r) return;

  var month = getFormattedMonth();
  var today = new Date();
  var dateStr = 'Ngày ' + today.getDate() + ' tháng ' + (today.getMonth() + 1) + ' năm ' + today.getFullYear();

  var tpl = document.getElementById('printTemplate');
  tpl.innerHTML = '<div style="max-width:700px; margin:0 auto; font-family: Inter, Segoe UI, sans-serif; font-size:13px; color:#000;">'
    + '<h2 style="text-align:center; color:#DC2626; margin-bottom:5px;">' + state.config.companyName.toUpperCase() + '</h2>'
    + '<h3 style="text-align:center; margin-bottom:20px;">PHIẾU LƯƠNG CHI TIẾT CÔNG - THÁNG ' + month + '</h3>'
    + '<table class="pl-table">'
    + '<tr><td style="width:20%"><b>Họ &amp; Tên:</b></td><td style="width:30%">' + r.HoTen + '</td><td style="width:20%"><b>Mã NV:</b></td><td style="width:30%; font-weight:bold; color:#DC2626">' + r.MaNV + '</td></tr>'
    + '<tr><td><b>Lương CB:</b></td><td>' + formatCurrency(r.LuongCoBan) + '</td><td><b>Chức vụ:</b></td><td>' + (r.ChucVu || '-') + '</td></tr>'
    + '</table>'
    + '<table class="pl-table" style="margin-top:15px;">'
    + '<tr class="pl-header" style="background:#5DADE2;color:white"><td style="width:8%">STT</td><td style="width:52%">KHOẢN MỤC / DIỄN GIẢI</td><td style="width:20%; text-align:center">SỐ LIỆU</td><td style="width:20%; text-align:right">SỐ TIỀN (VNĐ)</td></tr>'
    + '<tr style="background:#A8E6CF"><td colspan="2"><b>(II) NGÀY CÔNG THỰC TẾ</b></td><td style="text-align:center;font-weight:bold">' + r.NgayCongTT + '</td><td></td></tr>'
    + '<tr><td>1</td><td>Phép năm (P)</td><td style="text-align:center">' + r.P + '</td><td></td></tr>'
    + '<tr><td>2</td><td>Nghỉ không lương (K)</td><td style="text-align:center">' + r.K + '</td><td></td></tr>'
    + '<tr><td>3</td><td>Đi trễ / Về sớm</td><td style="text-align:center">' + r.DiTre + '</td><td></td></tr>'
    + '<tr style="background:#A8E6CF"><td colspan="2"><b>(III) CHI TIẾT THU NHẬP (GROSS)</b></td><td></td><td></td></tr>'
    + '<tr><td>1</td><td>Lương ngày công thực tế</td><td></td><td style="text-align:right">' + formatCurrency(r.LuongNgayCong) + '</td></tr>'
    + '<tr><td>2</td><td>Tăng ca ngày thường (TCNT)</td><td style="text-align:center">' + r.TCNT + ' giờ</td><td style="text-align:right">' + formatCurrency(r.LuongTCNT) + '</td></tr>'
    + '<tr><td>3</td><td>Tăng ca ngày nghỉ (TCNN)</td><td style="text-align:center">' + r.TCNN + ' giờ</td><td style="text-align:right">' + formatCurrency(r.LuongTCNN) + '</td></tr>'
    + '<tr><td>4</td><td>Tăng ca ngày Lễ (TCNL)</td><td style="text-align:center">' + r.TCNL + ' giờ</td><td style="text-align:right">' + formatCurrency(r.LuongTCNL) + '</td></tr>'
    + '<tr><td>5</td><td>Thưởng chuyên cần</td><td></td><td style="text-align:right">' + formatCurrency(r.ThuongCC) + '</td></tr>'
    + '<tr><td>6</td><td>Trợ cấp đi chuyển / Công tác</td><td></td><td style="text-align:right">' + formatCurrency(r.TroCap) + '</td></tr>'
    + '<tr><td>7</td><td>Thưởng hiệu quả (KPI)</td><td></td><td style="text-align:right">' + formatCurrency(r.ThuongKPI) + '</td></tr>'
    + '<tr><td>8</td><td>Thưởng Quý</td><td></td><td style="text-align:right">' + formatCurrency(r.ThuongQuy) + '</td></tr>'
    + '<tr><td>9</td><td>Thưởng Năm</td><td></td><td style="text-align:right">' + formatCurrency(r.ThuongNam) + '</td></tr>'
    + '<tr><td>10</td><td>Thưởng Thâm niên</td><td></td><td style="text-align:right">' + formatCurrency(r.ThuongThamNien) + '</td></tr>'
    + '<tr><td>11</td><td>Thưởng Trách nhiệm</td><td></td><td style="text-align:right">' + formatCurrency(r.ThuongTrachNhiem) + '</td></tr>'
    + '<tr><td>12</td><td>Thưởng Tháng 13</td><td></td><td style="text-align:right">' + formatCurrency(r.ThuongThang13) + '</td></tr>'
    + '<tr style="font-weight:bold;background:#A8E6CF"><td></td><td>TỔNG THU NHẬP (GROSS)</td><td></td><td style="text-align:right;color:#DC2626">' + formatCurrency(r.TongGross) + '</td></tr>'
    + '<tr style="background:#A8E6CF"><td colspan="2"><b>(IV) CÁC KHOẢN KHẤU TRỪ</b></td><td></td><td></td></tr>'
    + '<tr><td>1</td><td>Truy thu (nếu có)</td><td></td><td style="text-align:right">' + formatCurrency(r.TruyThu) + '</td></tr>'
    + '<tr><td>2</td><td>BHXH - BHYT - BHTN (I) x 10.5%</td><td></td><td style="text-align:right">' + formatCurrency(r.BHXH) + '</td></tr>'
    + '<tr><td>3</td><td>Thuế TNCN</td><td></td><td style="text-align:right">' + formatCurrency(r.ThueTNCN) + '</td></tr>'
    + '<tr style="background:#DC2626;color:white;font-weight:bold;font-size:1.1rem"><td>(V)</td><td>LƯƠNG THỰC NHẬN (NET)</td><td>((III)-(IV))</td><td style="text-align:right">' + formatCurrency(r.ThucNhan) + '</td></tr>'
    + '</table>'
    + '<p style="text-align:center; margin-top:10px; font-style:italic;">' + dateStr + '</p>'
    + '<div style="display:flex; justify-content:space-around; margin-top:40px; text-align:center;">'
    + '<div><b>NGƯỜI LAO ĐỘNG</b><br><br><br><br><i>(Ký, ghi rõ họ tên)</i></div>'
    + '<div><b>KẾ TOÁN</b><br><br><br><br><i>(Ký, ghi rõ họ tên)</i></div>'
    + '<div><b>GIÁM ĐỐC</b><br><br><br><br><i>(Ký, đóng dấu)</i></div>'
    + '</div></div>';

  tpl.style.display = 'block';
  setTimeout(function () { window.print(); tpl.style.display = 'none'; }, 300);
}

function setupPayrollEvents() {
  document.getElementById('payrollTableBody')?.addEventListener('input', function (e) {
    if (e.target.classList.contains('pr-input')) {
      var tr = e.target.closest('.row-payroll');
      if (tr) recalcPayrollRow(tr);
    }
  });

  document.getElementById('btnCalculatePayroll')?.addEventListener('click', async function () {
    if (!API_URL) return alert("Chỉ hoạt động khi có API_URL.");
    var payrollArray = [];
    document.querySelectorAll('.row-payroll').forEach(function (tr) {
      var r = getPayrollRowData(tr);
      if (r) payrollArray.push(r);
    });
    showLoader(true);
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "savePayroll", data: { month: getFormattedMonth(), records: payrollArray } })
    });
    showLoader(false);
    alert("Đã chốt & lưu Bảng Lương tháng " + getFormattedMonth() + " thành công!");
  });

  // SỬA LỖI: Lắng nghe ID chính xác của nút In Bảng Lương
  document.getElementById('btnPrintPayroll')?.addEventListener('click', function () {
    printFullPayroll();
  });

  document.getElementById('btnOpenBulkPrint')?.addEventListener('click', function () {
    document.getElementById('bulkPrintModal').classList.add('active');
  });

  document.getElementById('payrollTableBody')?.addEventListener('click', function (e) {
    if (e.target.classList.contains('btn-print-slip')) {
      var maNV = e.target.getAttribute('data-manv');
      printPayslip(maNV);
    }
  });
}

function setupBulkPrintEvents() {
  document.getElementById('btnCloseBulkModal')?.addEventListener('click', () => {
    document.getElementById('bulkPrintModal').classList.remove('active');
  });

  document.getElementById('btnStartBulkPrint')?.addEventListener('click', startBulkPrint);
}

async function startBulkPrint() {
  const rows = document.querySelectorAll('.row-payroll');
  if (!rows || rows.length === 0) {
    return alert("Chưa có dữ liệu bảng lương để in. Vui lòng kiểm tra lại.");
  }

  const startIdx = parseInt(document.getElementById('bulkStart').value) || 1;
  const endIdx = parseInt(document.getElementById('bulkEnd').value) || 1;

  if (startIdx < 1 || endIdx > rows.length || startIdx > endIdx) {
    return alert(`Dải STT không hợp lệ. Hiện có ${rows.length} nhân viên trong danh sách.`);
  }

  const progressDiv = document.getElementById('bulkProgress');
  const progressBar = document.getElementById('bulkProgressBar');
  const statusSpan = document.getElementById('bulkStatus');
  const btnStart = document.getElementById('btnStartBulkPrint');

  if (!progressDiv || !progressBar || !statusSpan || !btnStart) {
    console.error("Thiếu các phần tử UI của Modal In hàng loạt.");
    return;
  }

  progressDiv.style.display = 'block';
  btnStart.disabled = true;
  btnStart.innerText = "⏳ Đang kết xuất PDF...";

  const total = endIdx - startIdx + 1;
  let count = 0;

  for (let i = startIdx - 1; i < endIdx; i++) {
    try {
      const tr = rows[i];
      const r = getPayrollRowData(tr);
      if (!r) continue;

      const container = document.getElementById('bulkRefContainer');
      if (!container) throw new Error("Không tìm thấy container render PDF.");

      const payslipHtml = buildPayslipHtml(r);
      container.innerHTML = payslipHtml;

      const opt = {
        margin: 10,
        filename: `PhieuLuong_${r.MaNV}_${r.HoTen.replace(/\s+/g, '_')}_${state.currentMonth}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(container).save();

      count++;
      const percent = Math.round((count / total) * 100);
      progressBar.style.width = percent + '%';
      statusSpan.innerText = `${count}/${total}`;

      // Chờ nhẹ để tránh trình duyệt chặn download hàng loạt
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (err) {
      console.error("Lỗi khi in nhân viên thứ", i + 1, err);
    }
  }

  alert(`Hoàn tất! Đã kết xuất ${count} phiếu lương.`);
  progressDiv.style.display = 'none';
  btnStart.disabled = false;
  btnStart.innerText = "🚀 Bắt đầu Kết Xuất PDF";
  progressBar.style.width = '0%';
}

// Bổ sung hàm buildPayslipHtml tách biệt để dùng chung
function buildPayslipHtml(r) {
  const companyName = state.config.companyName || "Bi's Mart - Hệ thống Cửa hàng";
  const dateStr = "Tháng " + getFormattedMonth();

  return `
    <div style="font-family: 'Inter', sans-serif; padding: 20px; border: 1px solid #ddd; background: white;">
      <div style="text-align:center; border-bottom: 2px solid #333; padding-bottom:10px; margin-bottom:20px;">
        <h2 style="margin:0">${companyName}</h2>
        <h1 style="margin:5px 0; color: #1e293b;">PHIẾU LƯƠNG NHÂN VIÊN</h1>
        <p style="margin:0; font-weight:bold;">${dateStr}</p>
      </div>
      
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <tr><td style="padding:5px"><b>Mã NV:</b> ${r.MaNV}</td><td style="padding:5px"><b>Họ Tên:</b> ${r.HoTen}</td></tr>
        <tr><td style="padding:5px"><b>Chức vụ:</b> ${r.ChucVu}</td><td style="padding:5px"><b>Ngày công TT:</b> ${r.NgayCongTT}</td></tr>
      </table>

      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <tr style="background:#f1f5f9"><th style="border:1px solid #ddd; padding:8px; text-align:left;">Dòng mục</th><th style="border:1px solid #ddd; padding:8px; text-align:right;">Số tiền (VNĐ)</th></tr>
        <tr><td style="border:1px solid #ddd; padding:8px">Lương cơ bản</td><td style="border:1px solid #ddd; padding:8px; text-align:right">${formatCurrency(r.LuongCoBan)}</td></tr>
        <tr><td style="border:1px solid #ddd; padding:8px">Lương theo ngày công thực tế</td><td style="border:1px solid #ddd; padding:8px; text-align:right">${formatCurrency(r.LuongNgayCong)}</td></tr>
        <tr><td style="border:1px solid #ddd; padding:8px">Tăng ca thường (150%)</td><td style="border:1px solid #ddd; padding:8px; text-align:right">${formatCurrency(r.LuongTCNT)}</td></tr>
        <tr><td style="border:1px solid #ddd; padding:8px">Tăng ca nghỉ (200%)</td><td style="border:1px solid #ddd; padding:8px; text-align:right">${formatCurrency(r.LuongTCNN)}</td></tr>
        <tr><td style="border:1px solid #ddd; padding:8px">Tăng ca lễ (300%)</td><td style="border:1px solid #ddd; padding:8px; text-align:right">${formatCurrency(r.LuongTCNL)}</td></tr>
        <tr><td style="border:1px solid #ddd; padding:8px">Thưởng chuyên cần</td><td style="border:1px solid #ddd; padding:8px; text-align:right">${formatCurrency(r.ThuongCC)}</td></tr>
        <tr><td style="border:1px solid #ddd; padding:8px">Thưởng KPI</td><td style="border:1px solid #ddd; padding:8px; text-align:right">${formatCurrency(r.ThuongKPI)}</td></tr>
        <tr><td style="border:1px solid #ddd; padding:8px">Thưởng trách nhiệm</td><td style="border:1px solid #ddd; padding:8px; text-align:right">${formatCurrency(r.ThuongTrachNhiem)}</td></tr>
        ${r.TroCap > 0 ? `<tr><td style="border:1px solid #ddd; padding:8px">Trợ cấp/Thưởng khác</td><td style="border:1px solid #ddd; padding:8px; text-align:right">${formatCurrency(r.TroCap)}</td></tr>` : ''}
        <tr style="color:red">
          <td style="border:1px solid #ddd; padding:8px">Khấu trừ Bảo hiểm (10.5%)</td>
          <td style="border:1px solid #ddd; padding:8px; text-align:right">-${formatCurrency(r.BHXH)}</td>
        </tr>
        <tr style="background:#f1f5f9; font-size:1.2rem">
          <td style="border:1px solid #ddd; padding:8px; font-weight:bold">TỔNG THỰC NHẬN</td>
          <td style="border:1px solid #ddd; padding:8px; text-align:right; font-weight:bold; color:#DC2626">${formatCurrency(r.ThucNhan)}</td>
        </tr>
      </table>

      <div style="display:flex; justify-content:space-around; margin-top:40px; text-align:center;">
        <div><b>NGƯỜI NHẬN</b><br><br><br><br><i>(Ký tên)</i></div>
        <div><b>KẾ TOÁN</b><br><br><br><br><i>(Ký tên)</i></div>
        <div><b>GIÁM ĐỐC</b><br><br><br><br><i>(Ký tên)</i></div>
      </div>
    </div>
  `;
}

// ==========================================
// MODULE: ZOOM & VIEW OPTIMIZATION
// ==========================================

function setupZoomEvents() {
  const zoomWrapper = document.getElementById('zoomWrapper');
  const zoomSelect = document.getElementById('zoomSelect');
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomReset = document.getElementById('btnZoomReset');

  const scales = [50, 75, 90, 100, 110, 125, 150];

  const applyZoom = (level) => {
    state.zoomLevel = level;
    zoomSelect.value = level;

    const scale = level / 100;
    zoomWrapper.style.transform = `scale(${scale})`;

    // Khi scale nhỏ lại, ta cần mở rộng chiều rộng của wrapper 
    // để tránh khoảng trắng khổng lồ bên phải (giống Google Sheet)
    zoomWrapper.style.width = `${(100 / scale)}%`;

    // Lưu vào session để giữ state khi reload nhẹ (tùy chọn)
    localStorage.setItem('payroll_zoom', level);
  };

  // Khôi phục từ localStorage nếu có
  const savedZoom = localStorage.getItem('payroll_zoom');
  if (savedZoom) applyZoom(parseInt(savedZoom));

  btnZoomIn.addEventListener('click', () => {
    let currIdx = scales.indexOf(state.zoomLevel);
    if (currIdx < scales.length - 1) applyZoom(scales[currIdx + 1]);
  });

  btnZoomOut.addEventListener('click', () => {
    let currIdx = scales.indexOf(state.zoomLevel);
    if (currIdx > 0) applyZoom(scales[currIdx - 1]);
  });

  btnZoomReset.addEventListener('click', () => applyZoom(100));

  zoomSelect.addEventListener('change', (e) => applyZoom(parseInt(e.target.value)));

  // Keyboard Shortcuts (Google Sheets style)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        btnZoomIn.click();
      } else if (e.key === '-') {
        e.preventDefault();
        btnZoomOut.click();
      } else if (e.key === '0') {
        e.preventDefault();
        btnZoomReset.click();
      }
    }
  });
}

// DỮ LIỆU MẪU ĐỂ UI HIỂN THỊ ĐẸP NGAY LÚC ĐẦU
function injectMockData() {
  state.employees = [
    { MaNV: "NV001", HoTen: "Evan Phương Nam", CuaHang: "Trụ sở", PhongBan: "Giám Đốc", ChucVu: "Giám Đốc", LuongCoBan: 30000000, ThuongChuyenCan: 2000000, ThuongTrachNhiem: 1000000, NgayVaoLam: "2024-01-01" },
    { MaNV: "NV002", HoTen: "Nguyễn Văn A", CuaHang: "CH Quận 1", PhongBan: "Kỹ Thuật", ChucVu: "Nhân viên Tư Vấn", LuongCoBan: 15000000, ThuongChuyenCan: 500000, ThuongTrachNhiem: 0, NgayVaoLam: state.currentMonth + "-05" },
    { MaNV: "NV003", HoTen: "Trần Thị B", CuaHang: "CH Quận 3", PhongBan: "Kế Toán", ChucVu: "Kế Toán", LuongCoBan: 12000000, ThuongChuyenCan: 300000, ThuongTrachNhiem: 200000, NgayVaoLam: "2024-02-15" },
    { MaNV: "NV004", HoTen: "Lê Văn C", CuaHang: "CH Quận 1", PhongBan: "Bán Hàng", ChucVu: "Nhân viên", LuongCoBan: 8000000, ThuongChuyenCan: 350000, ThuongTrachNhiem: 0, NgayVaoLam: "2023-11-20", DaNghiViec: true, NgayNghiViec: state.currentMonth + "-10" }
  ];
  state.kpiData = [
    { MaNV: "NV001", Target_NU: 100, Actual_NU: 105, Target_DST: 50, Actual_DST: 60, TongThuongKPI: 3000000 },
    { MaNV: "NV002", Target_NU: 100, Actual_NU: 85, Target_DST: 50, Actual_DST: 40, TongThuongKPI: 500000 },
    { MaNV: "NV003", Target_NU: 100, Actual_NU: 92, Target_DST: 50, Actual_DST: 48, TongThuongKPI: 1200000 }
  ];
  state.timekeepingData = [
    { MaNV: "NV001", NgayCongChuan: 24, TongGioCong: 192, TongP: 0, TongK: 0, TongTCNT: 8, TongTCNN: 0, TongTCNL: 0, KhauTruTre: 0 },
    { MaNV: "NV002", NgayCongChuan: 24, TongGioCong: 184, TongP: 3, TongK: 1, TongTCNT: 4, TongTCNN: 0, TongTCNL: 0, KhauTruTre: 0 },
    { MaNV: "NV003", NgayCongChuan: 24, TongGioCong: 192, TongP: 1, TongK: 0, TongTCNT: 0, TongTCNN: 0, TongTCNL: 0, KhauTruTre: 100000 }
  ];

  // Tổng hợp payroll mẫu để dashboard có dữ liệu
  state.payroll = state.employees.map(e => {
    const kpi = state.kpiData.find(k => k.MaNV === e.MaNV);
    const tk = state.timekeepingData.find(t => t.MaNV === e.MaNV);
    const tThuong = (kpi ? kpi.TongThuongKPI : 0) + (e.ThuongChuyenCan || 0) + (e.ThuongTrachNhiem || 0);
    return {
      MaNV: e.MaNV,
      HoTen: e.HoTen,
      TongGross: e.LuongCoBan + tThuong,
      TongThuong: tThuong,
      ThucLanh: e.LuongCoBan + tThuong - (e.LuongCoBan * 0.105)
    };
  });
  renderCurrentView('dashboardView');
}


// Ghi chú: Module Authentication đã được chuyển sang auth/auth.js

function setupAccountEvents() {
  document.getElementById('btnUpdateProfile')?.addEventListener('click', async () => {
    const name = document.getElementById('accFullName').value;
    const pass = document.getElementById('accNewPass').value;
    const avatar = document.getElementById('accAvatarURL').value;

    const data = {
      Username: state.currentUser.Username,
      FullName: name,
      AvatarURL: avatar
    };
    if (pass) data.Password = pass;

    if (!API_URL) {
      state.currentUser.FullName = name;
      state.currentUser.AvatarURL = avatar;
      applyLogin(state.currentUser);
      return alert("Đã cập nhật giả lập.");
    }

    showLoader(true);
    const resp = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "updateProfile", data: data })
    });
    const json = await resp.json();
    if (json.status === 'success') {
      state.currentUser.FullName = name;
      state.currentUser.AvatarURL = avatar;
      applyLogin(state.currentUser);
      logToServer("Update Profile", "Thay đổi thông tin cá nhân");
      alert("Cập nhật thành công!");
    }
    showLoader(false);
  });

  document.getElementById('btnRefreshLogs').addEventListener('click', () => {
    renderLogsView();
  });
}

async function logToServer(action, details) {
  if (!API_URL || !state.currentUser) return;
  fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "logActivity",
      data: { Username: state.currentUser.Username, Action: action, Details: details }
    })
  });
}

function renderAccountView() {
  const u = state.currentUser;
  if (!u) return;
  document.getElementById('accUsername').value = u.Username;
  document.getElementById('accFullName').value = u.FullName;
  document.getElementById('accRole').value = u.Role;
  document.getElementById('accAvatar').src = u.AvatarURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.FullName)}&background=random`;
  document.getElementById('accAvatarURL').value = u.AvatarURL || '';
}

async function renderLogsView() {
  if (!API_URL) return alert("Tính năng này cần API_URL để hoạt động.");
  showLoader(true);
  try {
    const resp = await fetch(API_URL + "?action=getLogs");
    const logs = await resp.json();
    const tbody = document.getElementById('logsTableBody');
    tbody.innerHTML = '';
    logs.forEach(l => {
      const row = `<tr>
        <td>${new Date(l.Timestamp).toLocaleString()}</td>
        <td><b>${l.Username}</b></td>
        <td><span class="badge" style="background:#E0F2FE; color:#0369A1">${l.Action}</span></td>
        <td>${l.Details || ''}</td>
      </tr>`;
      tbody.innerHTML += row;
    });
  } catch (e) { alert("Lỗi tải nhật ký."); }
  showLoader(false);
}
