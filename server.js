const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      // Create default structure if file missing
      const initialData = {
        users: [{ id: "u-admin", username: "admin", password: "admin123", role: "admin", displayName: "المدير العام" }],
        rings: [],
        students: [],
        logs: [],
        settings: { early: 5, regular: 3, late: 1, absent: 0 },
        subscriptions: [],
        notifications: []
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), 'utf8');
      return initialData;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('خطأ في قراءة قاعدة البيانات:', error);
    return { users: [], students: [], logs: [], settings: {} };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('خطأ في حفظ قاعدة البيانات:', error);
    return false;
  }
}


// 1. Get all data (useful for initial load)
app.get('/api/data', (req, res) => {
  res.json(readDB());
});

// 2. Register new student
app.post('/api/students', (req, res) => {
  const { studentName, teacherId, parentPhone } = req.body;
  const db = readDB();
  
  const newStudent = {
    id: 'std-' + Date.now(),
    name: studentName,
    teacherId,
    parentPhone,
    points: 0
  };
  
  db.students.push(newStudent);
  writeDB(db);
  
  res.json({ success: true, student: newStudent });
});

// 3. Register new teacher
app.post('/api/teachers', (req, res) => {
  const { teacherName, username, password } = req.body;
  const db = readDB();
  
  const teacherUser = {
    id: 'tch-' + Date.now(),
    displayName: teacherName,
    username,
    password,
    role: 'teacher'
  };
  
  db.users.push(teacherUser);
  writeDB(db);
  
  res.json({ success: true, teacher: teacherUser });
});

// 4. Update log/attendance
app.post('/api/logs', (req, res) => {
  const newLog = req.body;
  const db = readDB();
  
  db.logs.push(newLog);
  writeDB(db);
  
  res.json({ success: true });
});

function keepAlive() {
  if (process.env.RENDER_EXTERNAL_URL) {
    const url = process.env.RENDER_EXTERNAL_URL;
    setInterval(() => {
      const protocol = url.startsWith('https') ? https : http;
      protocol.get(url, (res) => {
        console.log(`✅ Keep-Alive ping: ${res.statusCode}`);
      }).on('error', (err) => {
        console.log(`⚠️ Keep-Alive error: ${err.message}`);
      });
    }, 10 * 60 * 1000); // 10 minutes
  }
}

app.listen(PORT, () => {
  console.log(`منظومة الكوثر تعمل على http://localhost:${PORT}`);
  keepAlive();
});