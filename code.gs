// ============================================================
//  GOOGLE APPS SCRIPT — Enterprise Attendance API Backend V5 (Production)
//  ฟังก์ชัน: ระบบ PIN พนักงาน, Admin Gate, สแกนออโต้, คำนวณ OT, รายงาน Excel
// ============================================================

// 1. ฟังก์ชันทดสอบและสร้างหัวตารางทั้งหมดใน Google Sheets อัตโนมัติ
// (สามารถเลือกฟังก์ชันนี้แล้วกดปุ่ม "เรียกใช้ / Run" ได้เลยโดยไม่ติด Error)
function setupAndCreateSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // สร้างแผ่นงาน Users
  let usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('Users');
  }
  usersSheet.getRange(1, 1, 1, 7).setValues([[
    'Emp ID', 'Name', 'Department', 'Role', 'PIN', 'Face Descriptor', 'Registered At'
  ]]).setFontWeight('bold').setBackground('#e0e7ff');
  usersSheet.setFrozenRows(1);

  // สร้างแผ่นงาน Attendance
  let attSheet = ss.getSheetByName('Attendance');
  if (!attSheet) {
    attSheet = ss.insertSheet('Attendance');
  }
  attSheet.getRange(1, 1, 1, 12).setValues([[
    'Emp ID', 'Name', 'Department', 'Type', 'Time', 'Date', 'Status', 'OT Hours', 'Latitude', 'Longitude', 'Google Map Link', 'Photo Link'
  ]]).setFontWeight('bold').setBackground('#dcfce7');
  attSheet.setFrozenRows(1);

  // สร้างแผ่นงาน Config
  let configSheet = ss.getSheetByName('Config');
  if (!configSheet) {
    configSheet = ss.insertSheet('Config');
  }
  configSheet.getRange('A1:B1').setValues([['Parameter', 'Value']]).setFontWeight('bold').setBackground('#f1f5f9');
  configSheet.getRange('A2:A7').setValues([
    ['Target Latitude'],
    ['Target Longitude'],
    ['Allowed Radius (KM)'],
    ['Work Start Time'],
    ['OT Start Time'],
    ['Admin PIN']
  ]);
  if (configSheet.getRange('B2').getValue() === '') configSheet.getRange('B2').setValue(13.7563);
  if (configSheet.getRange('B3').getValue() === '') configSheet.getRange('B3').setValue(100.5018);
  if (configSheet.getRange('B4').getValue() === '') configSheet.getRange('B4').setValue(0.5);
  if (configSheet.getRange('B5').getValue() === '') configSheet.getRange('B5').setValue("'08:30");
  if (configSheet.getRange('B6').getValue() === '') configSheet.getRange('B6').setValue("'17:00");
  if (configSheet.getRange('B7').getValue() === '') configSheet.getRange('B7').setValue("'1234");
  configSheet.setColumnWidth(1, 180);

  Logger.log('✅ ตรวจสอบและสร้างชีต Users, Attendance, Config เรียบร้อย 100%');
}

// ฟังก์ชันล้างข้อมูล Mockup/ข้อมูลทดสอบ ให้พร้อมใช้งานจริงทันที
function cleanMockupData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ล้างข้อมูลทดสอบใน Attendance (คงเหลือเฉพาะหัวตาราง)
  const attSheet = ss.getSheetByName('Attendance');
  if (attSheet && attSheet.getLastRow() > 1) {
    attSheet.deleteRows(2, attSheet.getLastRow() - 1);
  }
  
  Logger.log('🧹 ล้างข้อมูล Mockup/ทดสอบเรียบร้อย ฐานข้อมูลสะอาดพร้อมใช้งานจริง 100%');
}

// 2. HTTP GET Handler
function doGet(e) {
  if (!e || !e.parameter) {
    setupAndCreateSheets();
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'OK',
        message: 'Google Apps Script ทำงานปกติ และสร้างชีตตารางเริ่มต้นให้เรียบร้อยแล้ว'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = e.parameter.action || '';
  let result;

  if (action === 'getConfig') {
    result = getConfig();
  } else if (action === 'getKnownFaces') {
    result = getKnownFaces();
  } else if (action === 'getAttendance') {
    result = getAttendance();
  } else {
    result = { error: 'Unknown action: ' + action };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// 3. HTTP POST Handler
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'No POST data received' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Invalid JSON body' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = data.action;
  let result;

  if (action === 'registerUser') {
    result = registerUser(
      data.employeeId,
      data.name,
      data.department,
      data.role,
      data.pin,
      data.faceDescriptor
    );
  } else if (action === 'logAttendance') {
    result = logAttendance(
      data.name,
      data.lat,
      data.lng,
      data.employeeId,
      data.department,
      data.type,
      data.status,
      data.otHours,
      data.photoBase64
    );
  } else if (action === 'saveConfig') {
    result = saveConfig(
      data.lat,
      data.lng,
      data.radius,
      data.workStartTime,
      data.otStartTime,
      data.adminPin
    );
  } else {
    result = { error: 'Unknown action: ' + action };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- ส่วนจัดการใบหน้า, สิทธิ์, และรหัส PIN พนักงาน (Users) ---
function registerUser(employeeId, name, department, role, pin, faceDescriptor) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  if (!sheet) {
    setupAndCreateSheets();
    sheet = ss.getSheetByName('Users');
  }

  sheet.appendRow([
    employeeId || 'EMP' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss'),
    name,
    department || 'ทั่วไป',
    role || 'พนักงานทั่วไป',
    "'" + (pin || '1234'),
    JSON.stringify(faceDescriptor),
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
  ]);

  return { success: true, message: 'ลงทะเบียนพนักงานและรหัส PIN เรียบร้อย' };
}

function getKnownFaces() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  let users = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let empId = '', name = '', dept = '', role = 'พนักงานทั่วไป', pin = '1234', jsonStr = '';

    if (row.length >= 6) {
      empId = row[0];
      name = row[1];
      dept = row[2];
      role = row[3] || 'พนักงานทั่วไป';
      pin = String(row[4] || '1234').replace(/'/g, '');
      jsonStr = row[5];
    } else if (row.length === 5) {
      empId = row[0];
      name = row[1];
      dept = row[2];
      role = row[3] || 'พนักงานทั่วไป';
      jsonStr = row[4];
    } else if (row.length === 4) {
      empId = row[0];
      name = row[1];
      dept = row[2];
      jsonStr = row[3];
    } else {
      name = row[0];
      jsonStr = row[1];
    }

    if (name && jsonStr) {
      try {
        users.push({
          label: name,
          name: name,
          employeeId: empId,
          department: dept,
          role: role,
          pin: pin,
          descriptor: JSON.parse(jsonStr)
        });
      } catch (e) {}
    }
  }
  return users;
}

// --- ส่วนบันทึกเวลาเข้า-ออกงาน (Attendance) ---
function logAttendance(name, lat, lng, employeeId, department, type, status, otHours, photoBase64) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Attendance');
  if (!sheet) {
    setupAndCreateSheets();
    sheet = ss.getSheetByName('Attendance');
  }

  const now = new Date();
  const mapLink = (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : '';
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'd/M/yyyy');
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');

  let photoLink = '-';
  if (photoBase64 && photoBase64.length > 100) {
    try {
      let folders = DriveApp.getFoldersByName('Attendance_Snapshots');
      let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('Attendance_Snapshots');
      const cleanBase64 = photoBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
      const blob = Utilities.newBlob(
        Utilities.base64Decode(cleanBase64),
        'image/jpeg',
        `${employeeId || 'EMP'}_${dateStr.replace(/\//g, '-')}_${timeStr.replace(/:/g, '-')}.jpg`
      );
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      photoLink = file.getUrl();
    } catch(err) {
      photoLink = 'Local Snapshot';
    }
  }

  sheet.appendRow([
    employeeId || '-',
    name,
    department || '-',
    type || 'เข้างาน (Check-In)',
    "'" + timeStr,
    "'" + dateStr,
    status || 'ปกติ',
    otHours || 0,
    lat || '-',
    lng || '-',
    mapLink,
    photoLink
  ]);

  return {
    success: true,
    message: (type || 'ลงเวลา') + ' สำเร็จแล้ว',
    type: type,
    time: timeStr,
    status: status
  };
}

function getAttendance() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Attendance');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  let list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // แปลงเวลาและวันที่ให้เป็นข้อความที่ถูกต้อง ไม่เป็น Object 1899 Date
    let timeVal = row[4];
    if (timeVal instanceof Date) {
      timeVal = Utilities.formatDate(timeVal, Session.getScriptTimeZone(), 'HH:mm:ss');
    } else {
      timeVal = String(timeVal || '-').replace(/'/g, '');
    }

    let dateVal = row[5];
    if (dateVal instanceof Date) {
      dateVal = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'd/M/yyyy');
    } else {
      dateVal = String(dateVal || '-').replace(/'/g, '');
    }

    if (row.length >= 11) {
      list.push({
        employeeId: row[0],
        name: row[1],
        department: row[2],
        type: row[3],
        time: timeVal,
        date: dateVal,
        status: row[6],
        otHours: row[7],
        lat: row[8],
        lng: row[9],
        mapLink: row[10],
        photoLink: row[11] || '-'
      });
    } else {
      list.push({
        employeeId: row[0] || '-',
        name: row[1] || row[0],
        department: row[2] || '-',
        type: row[3] || 'เข้างาน',
        time: timeVal,
        date: dateVal,
        status: row[6] || 'ปกติ',
        otHours: 0,
        lat: row[7] || row[3] || '-',
        lng: row[8] || row[4] || '-',
        mapLink: row[9] || row[5] || '',
        photoLink: '-'
      });
    }
  }
  return list.reverse();
}

// --- ส่วนจัดการ Config (GPS, เวลางาน, OT, และ Admin PIN) ---
function saveConfig(lat, lng, radius, workStartTime, otStartTime, adminPin) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Config');
  if (!sheet) {
    setupAndCreateSheets();
    sheet = ss.getSheetByName('Config');
  }

  if (lat !== undefined) sheet.getRange('B2').setValue(lat);
  if (lng !== undefined) sheet.getRange('B3').setValue(lng);
  if (radius !== undefined) sheet.getRange('B4').setValue(radius);
  if (workStartTime !== undefined) sheet.getRange('B5').setValue("'" + workStartTime);
  if (otStartTime !== undefined) sheet.getRange('B6').setValue("'" + otStartTime);
  if (adminPin !== undefined) sheet.getRange('B7').setValue("'" + adminPin);

  return { success: true, message: 'บันทึกการตั้งค่าลง Google Sheets เรียบร้อย' };
}

function getConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');

  let config = {
    lat: 13.7563,
    lng: 100.5018,
    radius: 0.5,
    workStartTime: '08:30',
    otStartTime: '17:00',
    adminPin: '1234'
  };

  if (sheet) {
    const latVal = sheet.getRange('B2').getValue();
    const lngVal = sheet.getRange('B3').getValue();
    const radiusVal = sheet.getRange('B4').getValue();
    let workTimeVal = sheet.getRange('B5').getValue();
    let otTimeVal = sheet.getRange('B6').getValue();
    let pinVal = sheet.getRange('B7').getValue();

    if (latVal !== '') config.lat = parseFloat(latVal);
    if (lngVal !== '') config.lng = parseFloat(lngVal);
    if (radiusVal !== '') config.radius = parseFloat(radiusVal);
    
    if (workTimeVal instanceof Date) {
      config.workStartTime = Utilities.formatDate(workTimeVal, Session.getScriptTimeZone(), 'HH:mm');
    } else if (workTimeVal !== '') {
      config.workStartTime = String(workTimeVal).replace(/'/g, '');
    }

    if (otTimeVal instanceof Date) {
      config.otStartTime = Utilities.formatDate(otTimeVal, Session.getScriptTimeZone(), 'HH:mm');
    } else if (otTimeVal !== '') {
      config.otStartTime = String(otTimeVal).replace(/'/g, '');
    }

    if (pinVal !== '') config.adminPin = String(pinVal).replace(/'/g, '');
  }

  return config;
}
