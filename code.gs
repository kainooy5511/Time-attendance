// ============================================================
//  GOOGLE APPS SCRIPT — Enterprise Attendance API Backend V2
//  รองรับ: รหัสพนักงาน, เข้า/ออกงาน, แผนก, สถานะตรงเวลา/สาย, และรูปถ่าย
//  วิธีใช้: Deploy > Manage deployments > Edit > New version > Deploy
// ============================================================

function doGet(e) {
  const action = e.parameter ? e.parameter.action : '';
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

function doPost(e) {
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
    result = registerUser(data.employeeId, data.name, data.department, data.faceDescriptor);
  } else if (action === 'logAttendance') {
    result = logAttendance(
      data.name,
      data.lat,
      data.lng,
      data.employeeId,
      data.department,
      data.type,
      data.status,
      data.photoBase64
    );
  } else if (action === 'saveConfig') {
    result = saveConfig(data.lat, data.lng, data.radius, data.workStartTime);
  } else {
    result = { error: 'Unknown action: ' + action };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- 1. ส่วนจัดการใบหน้าพนักงาน (Users) ---
function registerUser(employeeId, name, department, faceDescriptor) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    sheet.appendRow(['Emp ID', 'Name', 'Department', 'Face Descriptor', 'Registered At']);
  }

  sheet.appendRow([
    employeeId || 'EMP' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss'),
    name,
    department || 'ทั่วไป',
    JSON.stringify(faceDescriptor),
    new Date()
  ]);

  return { success: true, message: 'ลงทะเบียนพนักงานและบันทึกใบหน้าเรียบร้อย' };
}

function getKnownFaces() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  let users = [];
  for (let i = 1; i < data.length; i++) {
    let empId = '', name = '', dept = '', jsonStr = '';
    if (data[i].length >= 4) {
      empId = data[i][0];
      name = data[i][1];
      dept = data[i][2];
      jsonStr = data[i][3];
    } else {
      name = data[i][0];
      jsonStr = data[i][1];
    }

    if (name && jsonStr) {
      try {
        users.push({
          label: name,
          name: name,
          employeeId: empId,
          department: dept,
          descriptor: JSON.parse(jsonStr)
        });
      } catch (e) {}
    }
  }
  return users;
}

// --- 2. ส่วนบันทึกเวลาเข้า-ออกงาน (Attendance) ---
function logAttendance(name, lat, lng, employeeId, department, type, status, photoBase64) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Attendance');
  if (!sheet) {
    sheet = ss.insertSheet('Attendance');
    sheet.appendRow([
      'Emp ID',
      'Name',
      'Department',
      'Type',
      'Time',
      'Date',
      'Status',
      'Latitude',
      'Longitude',
      'Google Map Link',
      'Photo Link'
    ]);
  }

  const now = new Date();
  const mapLink = (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : '';
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'd/M/yyyy');
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');

  // ตรวจสอบรูปถ่ายหลักฐาน
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
    timeStr,
    "'" + dateStr,
    status || 'ปกติ',
    lat || '-',
    lng || '-',
    mapLink,
    photoLink
  ]);

  return { success: true, message: 'บันทึกเวลาสำเร็จ' };
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
    if (row.length >= 10) {
      list.push({
        employeeId: row[0],
        name: row[1],
        department: row[2],
        type: row[3],
        time: row[4],
        date: row[5],
        status: row[6],
        lat: row[7],
        lng: row[8],
        mapLink: row[9],
        photoLink: row[10] || '-'
      });
    } else {
      // Old 6-column format
      list.push({
        employeeId: '-',
        name: row[0],
        department: '-',
        type: 'เข้างาน (Check-In)',
        time: row[1],
        date: row[2],
        status: 'ปกติ',
        lat: row[3],
        lng: row[4],
        mapLink: row[5],
        photoLink: '-'
      });
    }
  }
  return list.reverse();
}

// --- 3. ส่วนจัดการ Config (GPS & กะเวลา) ---
function saveConfig(lat, lng, radius, workStartTime) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Config');

  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.getRange('A1:B1').setValues([['Parameter', 'Value']]);
    sheet.getRange('A2').setValue('Target Latitude');
    sheet.getRange('A3').setValue('Target Longitude');
    sheet.getRange('A4').setValue('Allowed Radius (KM)');
    sheet.getRange('A5').setValue('Work Start Time');
    sheet.setColumnWidth(1, 160);
  }

  if (lat !== undefined) sheet.getRange('B2').setValue(lat);
  if (lng !== undefined) sheet.getRange('B3').setValue(lng);
  if (radius !== undefined) sheet.getRange('B4').setValue(radius);
  if (workStartTime !== undefined) sheet.getRange('B5').setValue(workStartTime);

  return { success: true, message: 'บันทึกการตั้งค่าลง Google Sheets เรียบร้อย' };
}

function getConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');

  let config = { lat: 0, lng: 0, radius: 0.5, workStartTime: '08:30' };

  if (sheet) {
    const latVal = sheet.getRange('B2').getValue();
    const lngVal = sheet.getRange('B3').getValue();
    const radiusVal = sheet.getRange('B4').getValue();
    const workTimeVal = sheet.getRange('B5').getValue();

    if (latVal !== '') config.lat = parseFloat(latVal);
    if (lngVal !== '') config.lng = parseFloat(lngVal);
    if (radiusVal !== '') config.radius = parseFloat(radiusVal);
    if (workTimeVal !== '') config.workStartTime = String(workTimeVal);
  }

  return config;
}
