const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

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

  const { studentName, phone, password, ringId } = req.body;

  // إنشاء أو إعادة استخدام حساب ولي الأمر
  let parent = db.users.find(u => u.phone === phone && u.role === 'parent');
  if (!parent) {
    parent = {
      id: 'p-' + Math.random().toString(36).substr(2, 9),
      phone,
      password,
      role: 'parent',
      displayName: `ولي أمر: ${studentName.split(' ')[0]}`
    };
    db.users.push(parent);
  }

  // إنشاء حساب الطالب
  const studentUser = {
    id: 'su-' + Math.random().toString(36).substr(2, 9),
    username: studentName,
    password: '123',
    role: 'student',
    displayName: studentName
  };
  db.users.push(studentUser);

  // تسجيل الطالب
  const newStudent = {
    id: 's-' + Math.random().toString(36).substr(2, 9),
    name: studentName,
    ringId,
    parentId: parent.id,
    userId: studentUser.id,
    points: 0
  };
  db.students.push(newStudent);

  if (writeDB(db)) {
    res.json({ 
      success: true, 
      student: newStudent,
      parentAccount: { phone, password },
      studentAccount: { username: studentName, password: '123' }
    });
  } else {
    res.status(500).json({ error: 'فشل إضافة الطالب' });
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

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🕌 منظومة الكوثر تعمل على http://localhost:${PORT}`);
  console.log(`📊 قاعدة البيانات: ${DB_PATH}`);
});
