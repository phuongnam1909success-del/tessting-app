/**
 * BACKEND MODULE: AUTHENTICATION
 * Dành cho Google Apps Script (GAS)
 * Copy nội dung này vào Script Editor của bạn để quản lý Đăng nhập.
 */

/**
 * Xử lý yêu cầu đăng nhập từ Frontend
 * @param {GoogleAppsScript.Events.DoGet} e 
 */
function handleLoginAction(e) {
  var user = e.parameter.username;
  var pass = e.parameter.password;
  
  // Xác thực (Ở bản này đang dùng so khớp thô, khuyến khích dùng bcrypt trong tương lai)
  var accounts = getSheetData('Accounts');
  var found = accounts.find(function(acc) {
    return acc.Username == user && acc.Password == pass;
  });

  if (found) {
    // Trả về thông tin User (không bao gồm Password)
    delete found.Password;
    return respondJSON({
      status: 'success',
      user: found
    });
  } else {
    return respondJSON({
      status: 'error',
      message: 'Tên đăng nhập hoặc mật khẩu không chính xác.'
    });
  }
}

/**
 * Cập nhật thông tin tài khoản cá nhân
 * @param {Object} data - Dữ liệu từ POST
 */
function updateProfile(data) {
  var sheet = getSheet('Accounts');
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  
  var userIdx = headers.indexOf('Username');
  var nameIdx = headers.indexOf('FullName');
  var passIdx = headers.indexOf('Password');
  var avatarIdx = headers.indexOf('AvatarURL');

  for (var i = 1; i < rows.length; i++) {
    if (rows[i][userIdx] == data.Username) {
      if (data.FullName) sheet.getRange(i + 1, nameIdx + 1).setValue(data.FullName);
      if (data.Password) sheet.getRange(i + 1, passIdx + 1).setValue(data.Password);
      if (data.AvatarURL) sheet.getRange(i + 1, avatarIdx + 1).setValue(data.AvatarURL);
      return true;
    }
  }
  return false;
}
