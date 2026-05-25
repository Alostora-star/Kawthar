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
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('خطأ في حفظ قاعدة البيانات:', error);
    return false;
  }
}

// ==================== STATIC FILES ====================

// عرض الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== API ENDPOINTS ====================

// الحصول على قاعدة البيانات كاملة
app.get('/api/db', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }
  res.json(db);
});

// حفظ قاعدة البيانات
app.post('/api/db', (req, res) => {
  const success = writeDB(req.body);
  if (!success) {
    return res.status(500).json({ error: 'فشل حفظ قاعدة البيانات' });
  }
  res.json({ success: true, message: 'تم حفظ البيانات بنجاح' });
});

// تسجيل دخول
app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body;
  const db = readDB();

  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  // البحث عن المستخدم
  let user = db.users.find(u => 
    (u.username === identifier || u.phone === identifier) && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'بيانات دخول غير صحيحة' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    }
  });
});

// تصدير النسخة الاحتياطية
app.get('/api/backup', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="alkauthar_backup.json"');
  res.send(JSON.stringify(db, null, 2));
});

// ==================== STUDENT ENDPOINTS ====================

// الحصول على بيانات الطالب
app.get('/api/student/:studentId', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const student = db.students.find(s => s.id === req.params.studentId);
  if (!student) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  const logs = db.logs.filter(l => l.studentId === student.id);
  const ring = db.rings.find(r => r.id === student.ringId);

  res.json({
    student,
    logs,
    ring
  });
});

// ==================== TEACHER ENDPOINTS ====================

// الحصول على الحلقة المخصصة للمعلم
app.get('/api/teacher/:teacherId/ring', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const ring = db.rings.find(r => r.teacherId === req.params.teacherId);
  if (!ring) {
    return res.status(404).json({ error: 'لا توجد حلقة مخصصة' });
  }

  const students = db.students.filter(s => s.ringId === ring.id);
  const logs = db.logs;

  res.json({
    ring,
    students,
    logs
  });
});

// حفظ السجل اليومي
app.post('/api/teacher/save-daily-log', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const { studentId, date, attendance, surah, pageFrom, pageTo, behavior, participation, homework, notes } = req.body;
  
  // البحث عن الطالب
  const student = db.students.find(s => s.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  // حساب النقاط
  let attPoints = db.settings.regular;
  if (attendance === 'early') attPoints = db.settings.early;
  else if (attendance === 'late') attPoints = db.settings.late;
  else if (attendance === 'absent') attPoints = db.settings.absent;

  const pagesPoints = (pageTo >= pageFrom && pageFrom > 0) ? (pageTo - pageFrom + 1) * 3 : 0;
  const totalCalculated = attPoints + pagesPoints + behavior + participation;

  // البحث عن السجل الموجود
  const existingLogIndex = db.logs.findIndex(l => l.studentId === studentId && l.date === date);
  
  if (existingLogIndex > -1) {
    // تحديث السجل الموجود
    const oldLog = db.logs[existingLogIndex];
    let oldAttPoints = db.settings.regular;
    if (oldLog.attendance === 'early') oldAttPoints = db.settings.early;
    else if (oldLog.attendance === 'late') oldAttPoints = db.settings.late;
    else if (oldLog.attendance === 'absent') oldAttPoints = db.settings.absent;

    const oldPagesPoints = (oldLog.pageTo >= oldLog.pageFrom && oldLog.pageFrom > 0) ? (oldLog.pageTo - oldLog.pageFrom + 1) * 3 : 0;
    const oldTotal = oldAttPoints + oldPagesPoints + (oldLog.behavior || 0) + (oldLog.participation || 0);

    // إعادة توازن النقاط
    student.points = Math.max(0, student.points - oldTotal + totalCalculated);

    db.logs[existingLogIndex] = {
      id: oldLog.id,
      studentId,
      date,
      attendance,
      surah,
      pageFrom,
      pageTo,
      behavior,
      participation,
      homework,
      notes
    };
  } else {
    // إنشاء سجل جديد
    student.points += totalCalculated;
    db.logs.push({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      studentId,
      date,
      attendance,
      surah,
      pageFrom,
      pageTo,
      behavior,
      participation,
      homework,
      notes
    });
  }

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

  const { name, teacherId, level } = req.body;
  
  const newRing = {
    id: 'ring-' + Math.random().toString(36).substr(2, 9),
    name,
    teacherId,
    level
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
    // إرسال إشعار للأهل بتسجيل الطالب
    if (newStudent.parentId) {
      sendNotificationToParent(
        newStudent.parentId,
        `تم تسجيل ${studentName}`,
        `تم تسجيل ابنك في منظومة الكوثر بنجاح. يمكنك الآن متابعة أدائه.`
      );
    }
    
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

  const oldRingId = student.ringId;
  student.ringId = newRingId;

  if (writeDB(db)) {
    res.json({ 
      success: true, 
      message: `تم نقل الطالب من الحلقة القديمة إلى ${newRing.name} مع الاحتفاظ بـ ${student.points} نقطة`,
      student
    });
  } else {
    res.status(500).json({ error: 'فشل نقل الطالب' });
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

// إرسال إشعار للأهل
function sendNotificationToParent(parentId, title, body) {
  const db = readDB();
  if (!db || !db.subscriptions) return;

  const parentSubscriptions = db.subscriptions.filter(s => s.userId === parentId);
  
  // في الإنتاج، يمكن استخدام web-push library
  // هنا نحفظ الإشعار في قاعدة البيانات
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

// الحصول على الإشعارات
app.get('/api/notifications/:userId', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const notifications = (db.notifications || []).filter(n => n.userId === req.params.userId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json({ notifications });
});

// تعليم الإشعار كمقروء
app.post('/api/notifications/:notificationId/read', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  const notification = (db.notifications || []).find(n => n.id === req.params.notificationId);
  if (notification) {
    notification.read = true;
    writeDB(db);
  }

  res.json({ success: true });
});

// ==================== LEADERBOARD ENDPOINTS ====================

// الحصول على لوحة الشرف
app.get('/api/leaderboard', (req, res) => {
  const db = readDB();
  if (!db) {
    return res.status(500).json({ error: 'فشل تحميل قاعدة البيانات' });
  }

  // ترتيب الطلاب حسب النقاط
  const leaderboard = db.students
    .map(student => {
      const ring = db.rings.find(r => r.id === student.ringId);
      return {
        ...student,
        ringName: ring?.name || 'غير محدد'
      };
    })
    .sort((a, b) => b.points - a.points);

  // حساب متوسطات الحلقات
  const ringAverages = db.rings.map(ring => {
    const ringStudents = db.students.filter(s => s.ringId === ring.id);
    const totalPoints = ringStudents.reduce((sum, s) => sum + s.points, 0);
    const average = ringStudents.length > 0 ? (totalPoints / ringStudents.length).toFixed(2) : 0;
    
    return {
      ringId: ring.id,
      ringName: ring.name,
      studentCount: ringStudents.length,
      totalPoints,
      average
    };
  });

  res.json({
    leaderboard,
    ringAverages
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

// ==================== START SERVER ====================

const server = app.listen(PORT, () => {
  console.log(`🕌 منظومة الكوثر تعمل على http://localhost:${PORT}`);
  console.log(`📊 قاعدة البيانات: ${DB_PATH}`);
  keepAlive();
});

// منع إغلاق الخادم
server.keepAliveTimeout = 65000;
