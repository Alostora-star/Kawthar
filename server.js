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
// تأكد من استبدال كلمة <db_password> بكلمة المرور الحقيقية التي أنشأتها للمستخدم Shadow
const mongoURI = "mongodb+srv://Shadow:<db_password>@kawthar.2iuwqn6.mongodb.net/KawtharDB?retryWrites=true&w=majority&appName=Kawthar";

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ تم الاتصال بنجاح بقاعدة بيانات MongoDB السحابية!"))
.catch(err => console.error("❌ فشل الاتصال بقاعدة البيانات السحابية:", err));

// ==================== بناء هيكل قاعدة البيانات (SCHEMA) ====================
const AppDataSchema = new mongoose.Schema({
  docId: { type: String, default: "main_database", unique: true },
  users: { type: Array, default: [
    { id: "u-admin", username: "admin", password: "admin123", role: "admin", displayName: "فضيلة الشيخ محمد عبد الفتاح حجازي" }
  ]},
  rings: { type: Array, default: [] },
  students: { type: Array, default: [] },
  logs: { type: Array, default: [] },
  settings: { type: Object, default: { early: 30, regular: 15, late: 5, absent: 0, pointsPerPage: 5 } },
  subscriptions: { type: Array, default: [] },
  notifications: { type: Array, default: [] },
  stories: { type: Array, default: [] },
  activities: { type: Array, default: [] },
  mosqueLogo: { type: String, default: null }
}, { timestamps: true });

const AppData = mongoose.model('AppData', AppDataSchema);

// دالة لتهيئة المستند الأساسي للمنظومة
async function initializeDB() {
  try {
    let data = await AppData.findOne({ docId: "main_database" });
    if (!data) {
      data = new AppData();
      await data.save();
      console.log("ℹ️ تم إنشاء مستند البيانات الافتراضي بنجاح في السحاب.");
    }
  } catch (error) {
    console.error("❌ خطأ أثناء تهيئة قاعدة البيانات:", error);
  }
}
initializeDB();

// ==================== الـ API ENDPOINTS (مسارات التزامن) ====================

// 1. جلب كامل بيانات المنظومة للواجهة (اللابتوب والموبايل معاً)
app.get('/api/db', async (req, res) => {
  try {
    const db = await AppData.findOne({ docId: "main_database" });
    res.json(db);
  } catch (error) {
    res.status(500).json({ error: "فشل جلب البيانات من السحاب" });
  }
});

// 2. تحديث وحفظ البيانات القادمة من لوحة تحكم أي جهاز
app.post('/api/db', async (req, res) => {
  try {
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
          notifications: req.body.notifications,
          stories: req.body.stories,
          activities: req.body.activities,
          mosqueLogo: req.body.mosqueLogo
        }
      },
      { new: true, upsert: true }
    );
    res.json({ success: true, message: "تم حفظ البيانات في السحاب بنجاح" });
  } catch (error) {
    console.error("❌ خطأ حفظ البيانات:", error);
    res.status(500).json({ error: "فشل حفظ البيانات في السحاب" });
  }
});

// 3. جلب الإحصائيات والمتصدرين
app.get('/api/stats', async (req, res) => {
  try {
    const db = await AppData.findOne({ docId: "main_database" });
    if (!db) return res.status(500).json({ error: "قاعدة البيانات فارغة" });

    const leaderboard = [...db.students]
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .slice(0, 10);

    res.json({
      leaderboard,
      totalStudents: db.students.length
    });
  } catch (error) {
    res.status(500).json({ error: "فشل جلب الإحصائيات" });
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
    }, 14 * 60 * 1000); 
  }
}

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
  keepAlive();
});
