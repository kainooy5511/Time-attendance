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
        radius: 0.1 // 100 meters, or set to 0 to disable GPS check
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
    return { config: { lat: 0, lng: 0, radius: 0 }, users: [], attendance: [] };
  }
}

function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------------------------------------------------------
// Emulate Google Apps Script (GAS) API Endpoints
// Supporting both GET (?action=...) and POST ({ action: ... })
// ---------------------------------------------------------------------

// GET Handler
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

// POST Handler
app.post('/api/gas', (req, res) => {
  const data = req.body;
  const action = data.action;
  const db = readDb();

  if (action === 'registerUser') {
    // data.name, data.faceDescriptor
    const name = data.name;
    const faceDescriptor = data.faceDescriptor;

    if (!db.users) db.users = [];
    db.users.push({
      label: name,
      descriptor: faceDescriptor,
      registeredAt: new Date().toISOString()
    });
    saveDb(db);
    return res.json({ success: true, message: 'บันทึกข้อมูลใบหน้าเรียบร้อย (Local Mode)' });
  } else if (action === 'logAttendance') {
    // data.name, data.lat, data.lng
    const name = data.name;
    const lat = data.lat;
    const lng = data.lng;

    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH');
    const timeStr = now.toLocaleTimeString('th-TH');
    const mapLink = (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : '';

    if (!db.attendance) db.attendance = [];
    const record = {
      name,
      time: timeStr,
      date: dateStr,
      lat: lat || '-',
      lng: lng || '-',
      mapLink,
      timestamp: now.toISOString()
    };
    db.attendance.unshift(record);
    saveDb(db);
    return res.json({ success: true, message: 'บันทึกเวลาสำเร็จ (Local Mode)', record });
  } else if (action === 'saveConfig') {
    // data.lat, data.lng, data.radius
    db.config = {
      lat: parseFloat(data.lat) || 0,
      lng: parseFloat(data.lng) || 0,
      radius: parseFloat(data.radius) || 0
    };
    saveDb(db);
    return res.json({ success: true, message: 'บันทึกการตั้งค่าเรียบร้อย (Local Mode)' });
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
