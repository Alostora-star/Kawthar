const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(__dirname));

// ==================== الاتصال بـ MONGODB ATLAS ====================
// استبدل <db_password> بكلمة المرور الخاصة بقاعدة بياناتك
const mongoURI = "mongodb+srv://Shadow:<db_password>@kawthar.2iuwqn6.mongodb.net/KawtharDB?retryWrites=true&w=majority&appName=Kawthar";

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ تم الاتصال بنجاح بقاعدة بيانات MongoDB السحابية!"))
.catch(err => console.error("❌ فشل الاتصال بقاعدة البيانات السحابية:", err));

// ==================== بناء هيكل قاعدة البيانات (SCHEMA) ====================
// نقوم بإنشاء مستند واحد يحتوي على كل البيانات ليتوافق تماماً مع منطق الـ JSON القديم
const AppDataSchema = new mongoose.Schema({
  docId: { type: String, default: "main_database", unique: true },
  users: { type: Array, default: [
    { id: "admin-1", username: "admin", password: "admin123", role: "admin", displayName: "المدير العام" }
  ]},
  rings: { type: Array, default: [] },
  students: { type: Array, default: [] },
  logs: { type: Array, default: [] },
  settings: { type: Object, default: { early: 5, regular: 3, late: 1, absent: 0 } },
  subscriptions: { type: Array, default: [] },
  notifications: { type: Array, default: [] }
}, { timestamps: true });

const AppData = mongoose.model('AppData', AppDataSchema);

// دالة مساعدة لضمان وجود مستند قاعدة البيانات الأساسي عند بدء التشغيل
async function initializeDB() {
  try {
    let data = await AppData.findOne({ docId: "main_database" });
    if (!data) {
      data = new AppData();
      await data.save();
      console.log("ℹ️ تم إنشاء مستند البيانات الافتراضي في السحاب بنجاح.");
    }
  } catch (error) {
    console.error("❌ خطأ أثناء فحص تهيئة قاعدة البيانات:", error);
  }
}
initializeDB();

// ==================== الـ API ENDPOINTS (تحديثات السحاب) ====================

// 1. جلب كامل البيانات للموقع (لوحة التحكم)
app.get('/api/db', async (req, res) => {
  try {
    const db = await AppData.findOne({ docId: "main_database" });
    res.json(db);
  } catch (error) {
    res.status(500).json({ error: "فشل جلب البيانات من السحاب" });
  }
});

// 2. تحديث وحفظ كامل البيانات القادمة من لوحة التحكم
app.post('/api/db', async (req, res) => {
  try {
    // نقوم بتحديث المستند الرئيسي في السحاب ببيانات الجسم القادمة من المتصفح
    const updatedData = await AppData.findOneAndUpdate(
      { docId: "main_database" },
      { 
        $set: {
          users: req.body.users,
          rings: req.body.rings,
          students: req.body.students,
          logs: req.body.logs,
          settings: req.body.settings,
          subscriptions: req.body.subscriptions,
          notifications: req.body.notifications
        }
      },
      { new: true, upsert: true }
    );
    res.json({ success: true, message: "تم حفظ البيانات في السحاب بنجاح" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "فشل حفظ البيانات في السحاب" });
  }
});

// 3. جلب الإحصائيات المخصصة لواجهة الطلاب وأولياء الأمور
app.get('/api/stats', async (req, res) => {
  try {
    const db = await AppData.findOne({ docId: "main_database" });
    if (!db) return res.status(500).json({ error: "قاعدة البيانات فارغة" });

    // حساب أفضل الطلاب بناء على النقاط
    const leaderboard = [...db.students]
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .slice(0, 10)
      .map(s => ({ name: s.name, points: s.points, ring: s.ring }));

    // حساب معدلات الحلقات
    const ringStats = {};
    db.rings.forEach(r => { ringStats[r.name] = { totalPoints: 0, studentCount: 0 }; });

    db.students.forEach(s => {
      if (ringStats[s.ring]) {
        ringStats[s.ring].totalPoints += (s.points || 0);
        ringStats[s.ring].studentCount += 1;
      }
    });

    const ringAverages = Object.keys(ringStats).map(name => {
      const { totalPoints, studentCount } = ringStats[name];
      return {
        name,
        average: studentCount > 0 ? parseFloat((totalPoints / studentCount).toFixed(1)) : 0
      };
    }).sort((a, b) => b.average - a.average);

    res.json({
      totalStudents: db.students.length,
      totalRings: db.rings.length,
      leaderboard,
      ringAverages: ringAverages.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ error: "فشل جلب الإحصائيات من السحاب" });
  }
});

// 4. إرسال وتلقي إشعارات أولياء الأمور وحفظ الاشتراكات في السحاب
app.post('/api/notifications/subscribe', async (req, res) => {
  const { parentId, subscription } = req.body;
  try {
    const db = await AppData.findOne({ docId: "main_database" });
    if (!db) return res.status(500).json({ error: "فشل الاتصال بقاعدة البيانات" });

    const exists = db.subscriptions.find(sub => sub.parentId === parentId);
    if (!exists) {
      await AppData.updateOne(
        { docId: "main_database" },
        { $push: { subscriptions: { parentId, subscription } } }
      );
    }
    res.json({ success: true, message: "تم الاشتراك في الإشعارات بنجاح" });
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ أثناء حفظ الاشتراك" });
  }
});

// ==================== KEEP-ALIVE FUNCTION ====================
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
    }, 5 * 60 * 1000); // كل 5 دقائق
  }
}

// تشغيل السيرفر والاستماع للطلبات
app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل الآن على المنفذ: ${PORT}`);
  keepAlive();
});
