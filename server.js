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
    // التأكد من أن البيانات تحتوي على جميع الحقول المطلوبة
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

// دالة للتحقق من صحة كلمة المرور
function validatePassword(user, password) {
  if (!user) return false;
  return user.password === password;
}

// ==================== INITIALIZATION ====================

// التحقق من وجود قاعدة البيانات عند بدء الخادم
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
  console.log('✅ تم إنشاء قاعدة البيانات بنجاح');
} else {
  console.log('✅ تم تحميل قاعدة البيانات الموجودة');
  const db = readDB();
  if (db) {
    console.log(`📊 البيانات الموجودة: ${db.students?.length || 0} طالب، ${db.rings?.length || 0} حلقة`);
  }
}

// ==================== STATIC FILES ====================

// عرض الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== API ENDPOINTS ====================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username);

  if (!user || !validatePassword(user, password)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  res.json({ success: true, user });
});

// الحصول على قاعدة البيانات كاملة
app.get('/api/db', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  res.json(db);
});

// تحديث السجل اليومي
app.post('/api/teacher/log', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { studentId, attendance, surah, pageFrom, pageTo, behavior, participation, homework, notes } = req.body;
  const student = db.students.find(s => s.id === studentId);

  if (!student) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  // حساب النقاط
  const attendancePoints = db.settings[attendance] || 0;
  const totalPoints = attendancePoints + behavior + participation;
  
  student.points += totalPoints;

  const newLog = {
    id: 'log-' + Math.random().toString(36).substr(2, 9),
    studentId,
    date: new Date().toISOString().split('T')[0],
    attendance,
    surah,
    pageFrom,
    pageTo,
    behavior,
    participation,
    homework,
    notes
  };

  db.logs.push(newLog);

  if (writeDB(db)) {
    // إرسال إشعار للأهل
    if (student.parentId) {
      sendNotificationToParent(
        student.parentId,
        `تحديث جديد لـ ${student.name}`,
        `تم تسجيل حضور وبيانات جديدة من المعلم. اضغط لعرض التفاصيل.`
      );
    }
    
    res.json({ success: true, message: 'تم حفظ السجل بنجاح' });
  } else {
    res.status(500).json({ error: 'فشل حفظ السجل' });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// إضافة حلقة جديدة
app.post('/api/admin/add-ring', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { ringName } = req.body;

  const newRing = {
    id: 'ring-' + Math.random().toString(36).substr(2, 9),
    name: ringName,
    teacherId: null,
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

  // التحقق من عدم تكرار اسم المستخدم
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
  }

  // إنشاء حساب الطالب
  const studentUser = {
    id: 'su-' + Math.random().toString(36).substr(2, 9),
    username,
    password,
    role: 'student',
    displayName: studentName
  };
  db.users.push(studentUser);

  // تسجيل الطالب
  const newStudent = {
    id: 's-' + Math.random().toString(36).substr(2, 9),
    name: studentName,
    ringId,
    userId: studentUser.id,
    points: 0
  };
  db.students.push(newStudent);

  if (writeDB(db)) {
    res.json({ 
      success: true, 
      student: newStudent,
      message: `تم تسجيل الطالب ${studentName} بنجاح`
    });
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

  // التحقق من عدم تكرار اسم المستخدم
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
  }

  // إنشاء حساب المعلم
  const teacherUser = {
    id: 't-' + Math.random().toString(36).substr(2, 9),
    username,
    password,
    role: 'teacher',
    displayName: teacherName
  };
  db.users.push(teacherUser);

  if (writeDB(db)) {
    res.json({ 
      success: true, 
      teacher: teacherUser,
      message: `تم تسجيل المعلم ${teacherName} بنجاح`
    });
  } else {
    res.status(500).json({ error: 'فشل إضافة المعلم' });
  }
});

// نقل الطالب إلى حلقة أخرى مع نقل النقاط
app.post('/api/admin/transfer-student', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { studentId, newRingId } = req.body;

  const student = db.students.find(s => s.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  const newRing = db.rings.find(r => r.id === newRingId);
  if (!newRing) {
    return res.status(404).json({ error: 'الحلقة غير موجودة' });
  }

  student.ringId = newRingId;

  if (writeDB(db)) {
    res.json({ 
      success: true, 
      message: `تم نقل الطالب إلى ${newRing.name} مع الاحتفاظ بـ ${student.points} نقطة`,
      student
    });
  } else {
    res.status(500).json({ error: 'فشل نقل الطالب' });
  }
});

// حذف طالب
app.delete('/api/admin/student/:studentId', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const student = db.students.find(s => s.id === req.params.studentId);
  if (!student) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  // حذف حساب الطالب
  db.users = db.users.filter(u => u.id !== student.userId);
  
  // حذف الطالب
  db.students = db.students.filter(s => s.id !== req.params.studentId);
  
  // حذف السجلات
  db.logs = db.logs.filter(l => l.studentId !== req.params.studentId);

  if (writeDB(db)) {
    res.json({ success: true, message: 'تم حذف الطالب بنجاح' });
  } else {
    res.status(500).json({ error: 'فشل حذف الطالب' });
  }
});

// حذف معلم
app.delete('/api/admin/teacher/:teacherId', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const teacher = db.users.find(u => u.id === req.params.teacherId && u.role === 'teacher');
  if (!teacher) {
    return res.status(404).json({ error: 'المعلم غير موجود' });
  }

  // حذف حساب المعلم
  db.users = db.users.filter(u => u.id !== req.params.teacherId);
  
  // إزالة المعلم من الحلقات
  db.rings = db.rings.map(ring => {
    if (ring.teacherId === req.params.teacherId) {
      ring.teacherId = null;
    }
    return ring;
  });

  if (writeDB(db)) {
    res.json({ success: true, message: 'تم حذف المعلم بنجاح' });
  } else {
    res.status(500).json({ error: 'فشل حذف المعلم' });
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
    res.status(500).json({ error: 'فشل حفظ الإعدادات' });
  }
});

// ==================== NOTIFICATIONS ENDPOINTS ====================

// تسجيل جهاز للإشعارات
app.post('/api/notifications/subscribe', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { userId, subscription } = req.body;
  
  if (!db.subscriptions) {
    db.subscriptions = [];
  }

  // التحقق من عدم تكرار الاشتراك
  const exists = db.subscriptions.find(s => s.userId === userId && s.endpoint === subscription.endpoint);
  if (!exists) {
    db.subscriptions.push({
      userId,
      subscription,
      timestamp: new Date().toISOString()
    });
  }

  if (writeDB(db)) {
    res.json({ success: true, message: 'تم تفعيل الإشعارات بنجاح' });
  } else {
    res.status(500).json({ error: 'فشل تفعيل الإشعارات' });
  }
});

// الحصول على الإشعارات
app.get('/api/notifications/:userId', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const notifications = (db.notifications || []).filter(n => n.userId === req.params.userId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json({ notifications });
});

// ==================== LEADERBOARD ENDPOINTS ====================

// لوحة الشرف
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

  // حساب مجموع نقاط الحلقات (ترتيب حسب المجموع)
  const ringAverages = db.rings.map(ring => {
    const ringStudents = db.students.filter(s => s.ringId === ring.id);
    const totalPoints = ringStudents.reduce((sum, s) => sum + s.points, 0);
    const average = ringStudents.length > 0 ? (totalPoints / ringStudents.length).toFixed(2) : 0;
    
    return {
      ringId: ring.id,
      ringName: ring.name,
      studentCount: ringStudents.length,
      total: totalPoints,
      average
    };
  }).sort((a, b) => b.total - a.total);

  res.json({
    leaderboard,
    ringAverages: ringAverages.slice(0, 10) // أفضل 10 حلقات
  });
});

// ==================== KEEP-ALIVE FUNCTION ====================

// دالة للحفاظ على الخادم مستيقظاً
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
    }, 14 * 60 * 1000); // كل 14 دقيقة
  }
}

// ==================== HELPER FUNCTIONS ====================

// دالة لإرسال إشعار للأهل
function sendNotificationToParent(parentId, title, body) {
  const db = readDB();
  if (!db || !db.subscriptions) return;

  if (!db.notifications) {
    db.notifications = [];
  }

  db.notifications.push({
    id: 'notif-' + Math.random().toString(36).substr(2, 9),
    userId: parentId,
    title,
    body,
    timestamp: new Date().toISOString(),
    read: false
  });

  writeDB(db);
}

// ==================== START SERVER ====================

const server = app.listen(PORT, () => {
  console.log(`🔔 منظومة الكوثر تعمل على http://localhost:${PORT}`);
  console.log(`📝 قاعدة البيانات: ${DB_PATH}`);
  keepAlive();
});

// منع إغلاق الخادم
server.keepAliveTimeout = 65000;
