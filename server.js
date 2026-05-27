```javascript
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
app.use(express.json({ limit: '10mb' })); // زيادة الحد الأقصى للمرفقات ليدعم الاستيراد
app.use(express.static(__dirname));

// دالة لقراءة قاعدة البيانات
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.warn('⚠️ ملف قاعدة البيانات غير موجود');
      return null;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('خطأ في قراءة قاعدة البيانات:', error);
    return null;
  }
}

// دالة لحفظ قاعدة البيانات
function writeDB(data) {
  try {
    if (!data.users) data.users = [];
    if (!data.rings) data.rings = [];
    if (!data.students) data.students = [];
    if (!data.logs) data.logs = [];
    if (!data.settings) data.settings = { early: 5, regular: 3, late: 1, absent: 0 };
    if (!data.subscriptions) data.subscriptions = [];
    if (!data.notifications) data.notifications = [];
    
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('خطأ في حفظ قاعدة البيانات:', error);
    return false;
  }
}

// ==================== INITIALIZATION ====================

// التحقق من وجود قاعدة البيانات وضمان وجود حساب الأدمن السليم دائماً
if (!fs.existsSync(DB_PATH)) {
  console.log('📝 إنشاء قاعدة بيانات جديدة...');
  const initialDB = {
    users: [
      {
        id: 'admin-1',
        username: 'admin',
        password: 'admin123',
        role: 'admin',
        displayName: 'المدير العام'
      }
    ],
    rings: [],
    students: [],
    logs: [],
    settings: {
      early: 5,
      regular: 3,
      late: 1,
      absent: 0
    },
    subscriptions: [],
    notifications: []
  };
  writeDB(initialDB);
  console.log('✅ تم إنشاء قاعدة البيانات بنجاح مع حساب الأدمن الافتراضي');
} else {
  // للتأكد من وجود مستخدم أدمن على الأقل حال فقدانه
  const db = readDB();
  if (db && (!db.users || db.users.length === 0)) {
    db.users = [
      {
        id: 'admin-1',
        username: 'admin',
        password: 'admin123',
        role: 'admin',
        displayName: 'المدير العام'
      }
    ];
    writeDB(db);
  }
  console.log('✅ تم تحميل قاعدة البيانات القائمة بنجاح.');
}

// ==================== API ENDPOINTS ====================

// مسار تسجيل الدخول المصحح لحل مشكلة قراءة حساب الأدمن وحساسية حالة الحروف والمسافات
app.post('/api/login', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'الرجاء إدخال اسم المستخدم وكلمة المرور' });
  }

  // البحث عن المستخدم مع تجاهل المسافات الزائدة
  const user = db.users.find(u => u.username.trim() === username.trim());

  if (!user || user.password.trim() !== password.trim()) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  res.json({ success: true, user });
});

// الحصول على قاعدة البيانات كاملة للواجهة
app.get('/api/db', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }
  res.json(db);
});

// تحديث ورصد السجل اليومي للطلاب والحساب التراكمي للنقاط
app.post('/api/teacher/log', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { studentId, date, attendance, surah, pageFrom, pageTo, behavior, participation, homework, notes } = req.body;
  const student = db.students.find(s => s.id === studentId);

  if (!student) {
    return res.status(404).json({ error: 'الطالب غير موجود بالنظام' });
  }

  // حساب النقاط الإضافية لليوم
  const attendancePoints = db.settings[attendance] !== undefined ? db.settings[attendance] : 0;
  const behaviorPoints = parseInt(behavior) || 0;
  const participationPoints = parseInt(participation) || 0;
  const totalDailyPoints = attendancePoints + behaviorPoints + participationPoints;

  // التحقق مما إذا كان هناك سجل سابق لنفس الطالب في نفس اليوم لتجنب تكرار النقاط الكلية
  const existingLogIndex = db.logs.findIndex(l => l.studentId === studentId && l.date === date);
  
  if (existingLogIndex !== -1) {
    // خصم النقاط القديمة قبل إضافة الجديدة لتحديث رصيده بشكل سليم
    const oldLog = db.logs[existingLogIndex];
    const oldAttendancePoints = db.settings[oldLog.attendance] !== undefined ? db.settings[oldLog.attendance] : 0;
    const oldDailyPoints = oldAttendancePoints + (parseInt(oldLog.behavior) || 0) + (parseInt(oldLog.participation) || 0);
    
    student.points = Math.max(0, student.points - oldDailyPoints);
    
    // تحديث السجل القائم
    db.logs[existingLogIndex] = {
      ...db.logs[existingLogIndex],
      attendance,
      surah,
      pageFrom,
      pageTo,
      behavior: behaviorPoints,
      participation: participationPoints,
      homework,
      notes
    };
  } else {
    // إضافة سجل جديد كلياً
    const newLog = {
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      studentId,
      date,
      attendance,
      surah,
      pageFrom,
      pageTo,
      behavior: behaviorPoints,
      participation: participationPoints,
      homework,
      notes
    };
    db.logs.push(newLog);
  }

  // إضافة النقاط الجديدة المحسوبة لرصيد الطالب التراكمي
  student.points += totalDailyPoints;

  if (writeDB(db)) {
    res.json({ success: true, message: 'تم رصد التقييم اليومي بنجاح' });
  } else {
    res.status(500).json({ error: 'فشل حفظ التقييم' });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// إضافة حلقة جديدة
app.post('/api/admin/add-ring', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { ringName, teacherId } = req.body;

  const newRing = {
    id: 'ring-' + Math.random().toString(36).substr(2, 9),
    name: ringName,
    teacherId: teacherId || null,
    createdAt: new Date().toISOString()
  };

  db.rings.push(newRing);

  if (writeDB(db)) {
    res.json({ success: true, ring: newRing });
  } else {
    res.status(500).json({ error: 'فشل إضافة الحلقة' });
  }
});

// إضافة طالب جديد
app.post('/api/admin/add-student', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { studentName, username, password, ringId } = req.body;

  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'اسم المستخدم موجود ومستعمل بالفعل' });
  }

  const studentUser = {
    id: 'su-' + Math.random().toString(36).substr(2, 9),
    username,
    password,
    role: 'student',
    displayName: studentName
  };
  db.users.push(studentUser);

  const newStudent = {
    id: 's-' + Math.random().toString(36).substr(2, 9),
    name: studentName,
    ringId,
    userId: studentUser.id,
    points: 0
  };
  db.students.push(newStudent);

  if (writeDB(db)) {
    res.json({ success: true, student: newStudent, message: "تم تسجيل الطالب ${studentName} بنجاح" });
  } else {
    res.status(500).json({ error: 'فشل إضافة الطالب' });
  }
});

// إضافة معلم جديد
app.post('/api/admin/add-teacher', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { teacherName, username, password } = req.body;

  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل للمعلم' });
  }

  const teacherUser = {
    id: 't-' + Math.random().toString(36).substr(2, 9),
    username,
    password,
    role: 'teacher',
    displayName: teacherName
  };
  db.users.push(teacherUser);

  if (writeDB(db)) {
    res.json({ success: true, teacher: teacherUser, message: "تم تسجيل المعلم ${teacherName} بنجاح" });
  } else {
    res.status(500).json({ error: 'فشل تسجيل المعلم' });
  }
});

// حذف حلقة قرآنية
app.delete('/api/admin/ring/:ringId', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'قاعدة البيانات غير متوفرة' });
  }

  db.rings = db.rings.filter(r => r.id !== req.params.ringId);
  
  // فك ارتباط الطلاب بها
  db.students = db.students.map(s => {
    if (s.ringId === req.params.ringId) {
      s.ringId = null;
    }
    return s;
  });

  if (writeDB(db)) {
    res.json({ success: true, message: 'تم حذف الحلقة فك ارتباط الطلاب بها' });
  } else {
    res.status(500).json({ error: 'فشل حذف الحلقة' });
  }
});

// حذف طالب بالكامل وتفريغ حسابه وسجلاته
app.delete('/api/admin/student/:studentId', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const student = db.students.find(s => s.id === req.params.studentId);
  if (!student) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  db.users = db.users.filter(u => u.id !== student.userId);
  db.students = db.students.filter(s => s.id !== req.params.studentId);
  db.logs = db.logs.filter(l => l.studentId !== req.params.studentId);

  if (writeDB(db)) {
    res.json({ success: true, message: 'تم حذف الطالب وكافة سجلاته نهائياً من المنظومة' });
  } else {
    res.status(500).json({ error: 'فشل حذف الطالب' });
  }
});

// تحديث إعدادات النقاط
app.post('/api/admin/settings', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { early, regular, late, absent } = req.body;
  
  db.settings = {
    early: parseInt(early),
    regular: parseInt(regular),
    late: parseInt(late),
    absent: parseInt(absent)
  };

  if (writeDB(db)) {
    res.json({ success: true, settings: db.settings });
  } else {
    res.status(500).json({ error: 'فشل حفظ الإعدادات بالخادم' });
  }
});

// استيراد قاعدة البيانات بالكامل واستبدالها بنجاح (المزامنة والاستعادة الآمنة)
app.post('/api/admin/import-db', (req, res) => {
  const importedData = req.body;
  
  if (!importedData || !importedData.users) {
    return res.status(400).json({ error: 'بيانات الاستيراد غير صالحة' });
  }

  const success = writeDB(importedData);
  if (success) {
    res.json({ success: true, message: 'تم استعادة واستيراد قاعدة البيانات بنجاح تام' });
  } else {
    res.status(500).json({ error: 'فشل استيراد قاعدة البيانات' });
  }
});

// ==================== LEADERBOARD & STATS ====================

// لوحة الشرف ونسب تنافس وتكامل الحلقات
app.get('/api/leaderboard', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const leaderboard = db.students
    .map(s => ({
      ...s,
      ringName: db.rings.find(r => r.id === s.ringId)?.name || 'بدون حلقة'
    }))
    .sort((a, b) => b.points - a.points);

  // حساب مجموع نقاط الحلقات وترتيبها
  const ringAverages = db.rings.map(ring => {
    const ringStudents = db.students.filter(s => s.ringId === ring.id);
    const totalPoints = ringStudents.reduce((sum, s) => sum + s.points, 0);
    const average = ringStudents.length > 0 ? (totalPoints / ringStudents.length).toFixed(1) : 0;
    
    return {
      ringId: ring.id,
      ringName: ring.name,
      studentCount: ringStudents.length,
      total: totalPoints,
      average: parseFloat(average)
    };
  }).sort((a, b) => b.total - a.total);

  res.json({
    leaderboard,
    ringAverages
  });
});

// ==================== START SERVER ====================

const server = app.listen(PORT, () => {
  console.log("🔔 منظومة الكوثر تعمل على http://localhost:${PORT}");
  console.log("📝 قاعدة البيانات النشطة: ${DB_PATH}");
});

// منع إغلاق الخادم المفاجئ
server.keepAliveTimeout = 65000;

```
