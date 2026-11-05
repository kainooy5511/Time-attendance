const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3008;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// Local database file to emulate Google Sheets
const DB_FILE = path.join(__dirname, 'local_db.json');

function initDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      config: {
        lat: 13.7563,
        lng: 100.5018,
        radius: 0.1,
        workStartTime: '08:30',
        otStartTime: '17:00',
        adminPin: '1234'
      },
      users: [],
      attendance: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

function readDb() {
  initDb();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    return { config: { lat: 0, lng: 0, radius: 0, workStartTime: '08:30' }, users: [], attendance: [] };
  }
}

function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Emulate Google Apps Script API Endpoints
app.get('/api/gas', (req, res) => {
  const action = req.query.action;
  const db = readDb();

  if (action === 'getConfig') {
    return res.json(db.config);
  } else if (action === 'getKnownFaces') {
    return res.json(db.users || []);
  } else if (action === 'getAttendance') {
    return res.json(db.attendance || []);
  } else {
    return res.json({ error: 'Unknown action: ' + action });
  }
});

app.post('/api/gas', (req, res) => {
  const data = req.body;
  const action = data.action;
  const db = readDb();

  if (action === 'registerUser') {
    const employeeId = data.employeeId || 'EMP' + Date.now();
    const name = data.name;
    const department = data.department || 'ทั่วไป';
    const faceDescriptor = data.faceDescriptor;

    if (!db.users) db.users = [];
    db.users.push({
      employeeId,
      name,
      label: name,
      department,
      descriptor: faceDescriptor,
      registeredAt: new Date().toISOString()
    });
    saveDb(db);
    return res.json({ success: true, message: 'ลงทะเบียนพนักงานและบันทึกใบหน้าเรียบร้อย' });
  } else if (action === 'logAttendance') {
    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH');
    const timeStr = now.toLocaleTimeString('th-TH');
    const mapLink = (data.lat && data.lng) ? `https://www.google.com/maps?q=${data.lat},${data.lng}` : '';

    if (!db.attendance) db.attendance = [];
    const record = {
      employeeId: data.employeeId || 'EMP',
      name: data.name,
      department: data.department || 'ทั่วไป',
      role: data.role || 'พนักงานทั่วไป',
      type: data.type || 'เข้างาน (Check-In)',
      otHours: data.otHours || 0,
      status: data.status || 'ปกติ',
      time: timeStr,
      date: dateStr,
      lat: data.lat || '-',
      lng: data.lng || '-',
      mapLink,
      photoLink: data.photoBase64 || '-',
      timestamp: now.toISOString()
    };
    db.attendance.unshift(record);
    saveDb(db);
    return res.json({ success: true, message: 'บันทึกเวลาสำเร็จ', record });
  } else if (action === 'saveConfig') {
    db.config = {
      lat: parseFloat(data.lat) || 0,
      lng: parseFloat(data.lng) || 0,
      radius: parseFloat(data.radius) || 0,
      workStartTime: data.workStartTime || '08:30'
    };
    saveDb(db);
    return res.json({ success: true, message: 'บันทึกการตั้งค่าเรียบร้อย' });
  } else {
    return res.json({ error: 'Unknown action: ' + action });
  }
});

// Root redirects to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDb();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Face Scan Attendance server running on http://localhost:${PORT}`);
});
