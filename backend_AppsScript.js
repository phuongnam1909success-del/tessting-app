// ==========================================
// MÃ CHO GOOGLE APPS SCRIPT (FILE: Code.gs)
// Cách sử dụng: 
// 1. Vào Google Sheet -> Tiện ích mở rộng -> Apps Script.
// 2. Xóa hết code cũ, dán toàn bộ nội dung file này vào.
// 3. Nhấn Triển khai (Deploy) -> Tùy chọn triển khai mới -> Ứng dụng Web (Web App), set quyền "Anyone" (Bất kỳ ai).
// ==========================================

const SHEET_NAMES = {
  NHAN_VIEN: 'NhanVien',
  DATA_KPI: 'Bang_KPI',
  CHAM_CONG: 'ChamCong_Thuong',
  BANG_LUONG: 'BangLuong',
  ACCOUNTS: 'Accounts',
  LOGS: 'ActivityLogs'
};

// Hàm GET: Trả về data (Danh sách NV, Các loại thưởng)
function doGet(e) {
  try {
    // Luôn đảm bảo Database đã được khởi tạo
    checkAndInitAllSheets();
    
    let action = e.parameter.action;
    
    if (action === 'login') {
      let user = e.parameter.username;
      let pass = e.parameter.password;
      let accounts = getDataFromSheet(SHEET_NAMES.ACCOUNTS);
      let found = accounts.find(a => a.Username == user && a.Password == pass);
      if (found) {
        delete found.Password; // Không gửi mật khẩu về client
        return respondJSON({status: 'success', user: found});
      }
      return respondJSON({status: 'error', message: 'Sai tài khoản hoặc mật khẩu'});
    }

    if (action === 'getLogs') {
      return respondJSON(getDataFromSheet(SHEET_NAMES.LOGS).reverse().slice(0, 100)); // Lấy 100 log mới nhất
    }
    
    if (action === 'getKpiData') {
      let month = e.parameter.month;
      let all = getDataFromSheet(SHEET_NAMES.DATA_KPI);
      return respondJSON(all.filter(r => r.Thang == month));
    }
    
    if (action === 'getPayroll') {
      let month = e.parameter.month; // hh/yyyy
      return respondJSON(getPayrollData(month));
    }
    
    if (action === 'getTimekeeping') {
      let month = e.parameter.month;
      let all = getDataFromSheet(SHEET_NAMES.CHAM_CONG);
      return respondJSON(all.filter(r => r.Thang == month));
    }
    
    return respondJSON({status: 'success', message: 'API is running'});
  } catch (error) {
    return respondJSON({status: 'error', message: error.toString()});
  }
}

// Hàm POST: Ghi data (Lưu chấm công, cấu hình thưởng)
function doPost(e) {
  try {
    let payload = JSON.parse(e.postData.contents);
    let action = payload.action;
    let data = payload.data;
    
    if (action === 'saveEmployees') {
      saveEmployees(data);
      return respondJSON({status: 'success', message: 'Đã lưu danh sách nhân sự'});
    }
    
    if (action === 'saveKpiData') {
      saveKpiData(data);
      return respondJSON({status: 'success', message: 'Đã lưu dữ liệu KPI'});
    }
    
    if (action === 'saveTimekeeping') {
      saveTimekeeping(data);
      return respondJSON({status: 'success', message: 'Đã lưu chấm công & chấm thưởng'});
    }
    
    if (action === 'calculatePayroll') {
      calculatePayroll(data.month);
      return respondJSON({status: 'success', message: 'Đã chốt bảng lương tháng ' + data.month});
    }
    
    if (action === 'updateProfile') {
      updateAccountProfile(data);
      return respondJSON({status: 'success', message: 'Đã cập nhật hồ sơ'});
    }

    if (action === 'logActivity') {
      logActivity(data);
      return respondJSON({status: 'success'});
    }

    if (action === 'saveAccounts') {
      saveAccounts(data);
      return respondJSON({status: 'success', message: 'Đã cập nhật danh sách tài khoản'});
    }

    if (action === 'savePayroll') {
      savePayrollData(data);
      return respondJSON({status: 'success', message: 'Đã lưu bảng lương tháng ' + data.month});
    }
    
    return respondJSON({status: 'error', message: 'Invalid action: ' + action});
  } catch (error) {
    return respondJSON({status: 'error', message: error.toString()});
  }
}

// ==========================================
// CÁC HÀM XỬ LÝ DỮ LIỆU
// ==========================================

function getDataFromSheet(sheetName) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  let data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Only header
  
  let headers = data[0];
  let rows = [];
  
  for (let i = 1; i < data.length; i++) {
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    rows.push(obj);
  }
  return rows;
}

function saveEmployees(dataList) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.NHAN_VIEN);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAMES.NHAN_VIEN);
    sheet.appendRow(["MaNV", "HoTen", "CuaHang", "PhongBan", "ChucVu", "NgaySinh", "SDT", "CCCD", "NoiCap", "BangCap", "NguoiPhuThuoc", "BHXH", "NgayThuViec", "NgayKyHD", "STK", "LuongCoBan", "ThuongChuyenCan", "ThuongTrachNhiem", "KPI70_NU", "KPI70_DSTong", "KPI70_DSN1", "KPI80_NU", "KPI80_DSTong", "KPI80_DSN1", "KPI90_NU", "KPI90_DSTong", "KPI90_DSN1", "KPI100_NU", "KPI100_DSTong", "KPI100_DSN1", "DanhSachKPI"]);
  }
  
  if(sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 31).clearContent();
  }
  
  let arrToSave = [];
  for(let i=0; i<dataList.length; i++){
    let e = dataList[i];
    arrToSave.push([
      e.MaNV, e.HoTen, e.CuaHang || "", e.PhongBan || "", e.ChucVu || "", e.NgaySinh || "", e.SDT || "", e.CCCD || "", e.NoiCap || "", e.BangCap || "", e.NguoiPhuThuoc || "", e.BHXH || "", e.NgayThuViec || "", e.NgayKyHD || "", e.STK || "", e.LuongCoBan || 0, e.ThuongChuyenCan || 0, e.ThuongTrachNhiem || 0,
      e.KPI70_NU || 0, e.KPI70_DSTong || 0, e.KPI70_DSN1 || 0,
      e.KPI80_NU || 0, e.KPI80_DSTong || 0, e.KPI80_DSN1 || 0,
      e.KPI90_NU || 0, e.KPI90_DSTong || 0, e.KPI90_DSN1 || 0,
      e.KPI100_NU || 0, e.KPI100_DSTong || 0, e.KPI100_DSN1 || 0,
      e.DanhSachKPI || "[]"
    ]);
  }
  
  if(arrToSave.length > 0) {
    sheet.getRange(2, 1, arrToSave.length, 31).setValues(arrToSave);
  }
}

function saveKpiData(dataRecord) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.DATA_KPI);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAMES.DATA_KPI);
    sheet.appendRow(["MaNV", "Thang", "Target_NU", "Target_DST", "Target_DSN1", "Target_Khac", "Actual_NU", "Actual_DST", "Actual_DSN1", "Actual_Khac", "ThuongVuot", "HoTroKhac", "TongThuongKPI"]);
  }
  
  let allData = sheet.getDataRange().getValues();
  let rowsToDelete = [];
  for(let i = allData.length - 1; i >= 1; i--){
    if(allData[i][1] === dataRecord.month) {
      rowsToDelete.push(i + 1);
    }
  }
  rowsToDelete.forEach(r => sheet.deleteRow(r));
  
  let records = dataRecord.records;
  for(let i=0; i<records.length; i++) {
    let e = records[i];
    sheet.appendRow([e.MaNV, dataRecord.month, e.Target_NU||0, e.Target_DST||0, e.Target_DSN1||0, e.Target_Khac||0, e.Actual_NU||0, e.Actual_DST||0, e.Actual_DSN1||0, e.Actual_Khac||0, e.ThuongVuot||0, e.HoTroKhac||0, e.TongThuongKPI||0]);
  }
}

function saveTimekeeping(dataRecord) {
  // dataRecord: { month: "04/2026", ngayChuan: 24, records: [{MaNV, DailyDataJSON, TongGioCong, TongP, TongK, TongTCNT, TongTCNN, TongTCNL, KhauTruTre}] }
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHAM_CONG);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAMES.CHAM_CONG);
    sheet.appendRow(["MaNV", "Thang", "NgayCongChuan", "DailyDataJSON", "TongGioCong", "TongP", "TongK", "TongTCNT", "TongTCNN", "TongTCNL", "KhauTruTre"]);
  }
  
  let allData = sheet.getDataRange().getValues();
  let rowsToDelete = [];
  for(let i = allData.length - 1; i >= 1; i--){
    if(allData[i][1] === dataRecord.month) {
      rowsToDelete.push(i + 1);
    }
  }
  rowsToDelete.forEach(r => sheet.deleteRow(r));
  
  let records = dataRecord.records || [];
  let nc = dataRecord.ngayChuan || 24;
  for(let i=0; i<records.length; i++) {
    let e = records[i];
    sheet.appendRow([
      e.MaNV, 
      dataRecord.month, 
      nc, 
      e.DailyDataJSON || "{}", 
      e.TongGioCong || 0, 
      e.TongP || 0, 
      e.TongK || 0, 
      e.TongTCNT || 0, 
      e.TongTCNN || 0, 
      e.TongTCNL || 0, 
      e.KhauTruTre || 0
    ]);
  }
}

function calculatePayroll(month) {
  // Logic siêu đơn giản:
  // LuongTuNgayCong = (LuongCoBan / 26) * SoNgayCong + (LuongCB/26/8 * 1.5 * SoGioTangCa) + PhuCap
  // TongThuong = parse từ chuỗi CacKhoanThuong mapping với CAU_HINH_THUONG
  // ThucLanh = LuongTuNgayCong + TongThuong - PhatDiTre
  
  let nvData = getDataFromSheet(SHEET_NAMES.NHAN_VIEN);
  let kpiData = getDataFromSheet(SHEET_NAMES.DATA_KPI).filter(r => r.Thang == month);
  let ccData = getDataFromSheet(SHEET_NAMES.CHAM_CONG).filter(r => r.Thang == month);
  
  let luongSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.BANG_LUONG);
  if (!luongSheet) {
    luongSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAMES.BANG_LUONG);
    luongSheet.appendRow(["MaNV", "Thang", "LuongTuNgayCong", "TongThuong", "PhatDiTre", "ThucLanh"]);
  }
  let finalPayroll = [];
  
  ccData.forEach(cc => {
    let nv = nvData.find(n => n.MaNV == cc.MaNV);
    if(nv) {
      let lcb = parseFloat(nv.LuongCoBan) || 0;
      let ngayChuan = parseFloat(cc.NgayCongChuan) || 24;
      let t_cc = parseFloat(nv.ThuongChuyenCan) || parseFloat(nv.PhuCap) || 0;
      let t_tn = parseFloat(nv.ThuongTrachNhiem) || 0;
      
      let tongGio = parseFloat(cc.TongGioCong) || 0;
      let tcnt = parseFloat(cc.TongTCNT) || 0;
      let tcnn = parseFloat(cc.TongTCNN) || 0;
      let tcnl = parseFloat(cc.TongTCNL) || 0;
      let phatTre = parseFloat(cc.KhauTruTre) || 0;
      
      let luongCong = (lcb / ngayChuan / 8) * tongGio;
      let luongTCNT = (lcb / ngayChuan / 8) * 1.5 * tcnt;
      let luongTCNN = (lcb / ngayChuan / 8) * 2.0 * tcnn;
      let luongTCNL = (lcb / ngayChuan / 8) * 3.0 * tcnl;
      
      let baseGross = luongCong + luongTCNT + luongTCNN + luongTCNL + t_cc + t_tn;

      let kpiRecord = kpiData.find(x => x.MaNV == cc.MaNV);
      let totalBonus = kpiRecord ? (parseFloat(kpiRecord.TongThuongKPI) || 0) : 0;
      
      let netPay = baseGross + totalBonus - phatTre;
      
      finalPayroll.push([
        cc.MaNV, month, Math.round(baseGross), Math.round(totalBonus), Math.round(phatTre), Math.round(netPay)
      ]);
    }
  });
  
  // Clean old payroll for this month
  let allL = luongSheet.getDataRange().getValues();
  for(let i = allL.length - 1; i >= 1; i--){
    if(allL[i][1] === month) {
      luongSheet.deleteRow(i + 1);
    }
  }
  
  if(finalPayroll.length > 0) {
    luongSheet.getRange(luongSheet.getLastRow() + 1, 1, finalPayroll.length, 6).setValues(finalPayroll);
  }
}

function getPayrollData(month) {
  let ls = getDataFromSheet(SHEET_NAMES.BANG_LUONG);
  let nv = getDataFromSheet(SHEET_NAMES.NHAN_VIEN);
  
  let rs = ls.filter(r => r.Thang == month);
  return rs.map(r => {
    let u = nv.find(x => x.MaNV == r.MaNV);
    r.HoTen = u ? u.HoTen : 'Unknown';
    return r;
  });
}

function savePayrollData(dataRecord) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.BANG_LUONG);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAMES.BANG_LUONG);
    sheet.appendRow([
      "MaNV","Thang","NgayCongTT","P","K","DiTre","TCNT","TCNN","TCNL",
      "LuongCoBan","LuongNgayCong","LuongTCNT","LuongTCNN","LuongTCNL",
      "ThuongCC","TroCap","ThuongKPI","ThuongQuy","ThuongNam","ThuongThamNien","ThuongTrachNhiem","ThuongThang13",
      "TruyThu","BHXH","ThueTNCN","TongGross","TongKhauTru","ThucNhan"
    ]);
  }

  // Xóa dữ liệu cũ của tháng này
  let allData = sheet.getDataRange().getValues();
  for(let i = allData.length - 1; i >= 1; i--){
    if(allData[i][1] === dataRecord.month) {
      sheet.deleteRow(i + 1);
    }
  }
  
  let records = dataRecord.records || [];
  for(let i=0; i<records.length; i++) {
    let r = records[i];
    sheet.appendRow([
      r.MaNV, dataRecord.month,
      r.NgayCongTT||0, r.P||0, r.K||0, r.DiTre||0, r.TCNT||0, r.TCNN||0, r.TCNL||0,
      r.LuongCoBan||0, r.LuongNgayCong||0, r.LuongTCNT||0, r.LuongTCNN||0, r.LuongTCNL||0,
      r.ThuongCC||0, r.TroCap||0, r.ThuongKPI||0, r.ThuongQuy||0, r.ThuongNam||0, r.ThuongThamNien||0, r.ThuongTrachNhiem||0, r.ThuongThang13||0,
      r.TruyThu||0, r.BHXH||0, r.ThueTNCN||0, r.TongGross||0, r.TongKhauTru||0, r.ThucNhan||0
    ]);
  }
}

function updateAccountProfile(data) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ACCOUNTS);
  if (!sheet) return;
  let all = sheet.getDataRange().getValues();
  let headers = all[0];
  let userCol = headers.indexOf('Username');
  
  for (let i = 1; i < all.length; i++) {
    if (all[i][userCol] === data.Username) {
      // Cập nhật các trường được gửi lên
      if (data.Password) sheet.getRange(i + 1, headers.indexOf('Password') + 1).setValue(data.Password);
      if (data.FullName) sheet.getRange(i + 1, headers.indexOf('FullName') + 1).setValue(data.FullName);
      if (data.AvatarURL) sheet.getRange(i + 1, headers.indexOf('AvatarURL') + 1).setValue(data.AvatarURL);
      break;
    }
  }
}

function logActivity(data) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.LOGS);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAMES.LOGS);
    sheet.appendRow(["Timestamp", "Username", "Action", "Details"]);
  }
  sheet.appendRow([new Date(), data.Username, data.Action, data.Details || ""]);
}

function saveAccounts(dataList) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ACCOUNTS);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAMES.ACCOUNTS);
    sheet.appendRow(["Username", "Password", "FullName", "Role", "AvatarURL", "Permissions"]);
  }
  
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).clearContent();
  }
  
  let arr = dataList.map(a => [a.Username, a.Password, a.FullName, a.Role, a.AvatarURL || "", a.Permissions || "all"]);
  if (arr.length > 0) {
    sheet.getRange(2, 1, arr.length, 6).setValues(arr);
  }
}

function respondJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doOptions(e) { 
  return respondJSON({status: 'ok'}); 
}

/**
 * Hàm khởi tạo toàn bộ cấu trúc Database (Sheets) nếu chưa tồn tại
 */
function checkAndInitAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Sheet Nhân Viên
  let s_nv = ss.getSheetByName(SHEET_NAMES.NHAN_VIEN);
  if (!s_nv) {
    s_nv = ss.insertSheet(SHEET_NAMES.NHAN_VIEN);
    s_nv.appendRow(["MaNV", "HoTen", "CuaHang", "PhongBan", "ChucVu", "NgaySinh", "SDT", "CCCD", "NoiCap", "BangCap", "NguoiPhuThuoc", "BHXH", "NgayThuViec", "NgayKyHD", "STK", "LuongCoBan", "ThuongChuyenCan", "ThuongTrachNhiem", "KPI70_NU", "KPI70_DSTong", "KPI70_DSN1", "KPI80_NU", "KPI80_DSTong", "KPI80_DSN1", "KPI90_NU", "KPI90_DSTong", "KPI90_DSN1", "KPI100_NU", "KPI100_DSTong", "KPI100_DSN1", "DanhSachKPI"]);
  }

  // 2. Sheet Dữ liệu KPI
  let s_kpi = ss.getSheetByName(SHEET_NAMES.DATA_KPI);
  if (!s_kpi) {
    s_kpi = ss.insertSheet(SHEET_NAMES.DATA_KPI);
    s_kpi.appendRow(["MaNV", "Thang", "Target_NU", "Target_DST", "Target_DSN1", "Target_Khac", "Actual_NU", "Actual_DST", "Actual_DSN1", "Actual_Khac", "ThuongVuot", "HoTroKhac", "TongThuongKPI"]);
  }

  // 3. Sheet Chấm Công
  let s_tk = ss.getSheetByName(SHEET_NAMES.CHAM_CONG);
  if (!s_tk) {
    s_tk = ss.insertSheet(SHEET_NAMES.CHAM_CONG);
    s_tk.appendRow(["MaNV", "Thang", "NgayCongChuan", "DailyDataJSON", "TongGioCong", "TongP", "TongK", "TongTCNT", "TongTCNN", "TongTCNL", "KhauTruTre"]);
  }

  // 4. Sheet Bảng Lương
  let s_pr = ss.getSheetByName(SHEET_NAMES.BANG_LUONG);
  if (!s_pr) {
    s_pr = ss.insertSheet(SHEET_NAMES.BANG_LUONG);
    s_pr.appendRow(["MaNV","Thang","NgayCongTT","P","K","DiTre","TCNT","TCNN","TCNL","LuongCoBan","LuongNgayCong","LuongTCNT","LuongTCNN","LuongTCNL","ThuongCC","TroCap","ThuongKPI","ThuongQuy","ThuongNam","ThuongThamNien","ThuongTrachNhiem","ThuongThang13","TruyThu","BHXH","ThueTNCN","TongGross","TongKhauTru","ThucNhan"]);
  }

  // 5. Sheet Tài khoản & Phân quyền (Tự động tạo tài khoản mẫu)
  let s_acc = ss.getSheetByName(SHEET_NAMES.ACCOUNTS);
  if (!s_acc) {
    s_acc = ss.insertSheet(SHEET_NAMES.ACCOUNTS);
    s_acc.appendRow(["Username", "Password", "FullName", "Role", "AvatarURL", "Permissions"]);
    s_acc.appendRow(["namhr", "123", "Quản trị viên (Nam)", "Admin", "", "all"]);
    s_acc.appendRow(["ketoan", "123", "Kế toán tổng hợp", "User", "", "all"]);
  }

  // 6. Sheet Nhật ký (Logs)
  let s_log = ss.getSheetByName(SHEET_NAMES.LOGS);
  if (!s_log) {
    s_log = ss.insertSheet(SHEET_NAMES.LOGS);
    s_log.appendRow(["Timestamp", "Username", "Action", "Details"]);
  }
}
