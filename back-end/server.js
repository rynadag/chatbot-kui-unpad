require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const routes = require('./routes/routes');
const backupRouter = require('./routes/backupRoutes');

const app = express();

// ========================
// MIDDLEWARE DASAR (DIPERBAIKI)
// ========================
app.use(cors({
  origin: true, 
  credentials: true
}));

// --- PERBAIKAN DI SINI: MENAMBAHKAN LIMIT 50MB ---
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ========================
// KONEKSI MONGODB
// ========================
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ========================
// KONFIGURASI SESSION
// ========================
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    maxAge: 14 * 24 * 60 * 60 * 1000,
    secure: false,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ========================
// ROUTES
// ========================
app.use('/api', routes);
app.use('/api/knowledge', require('./routes/knowledgeRoutes.js'));
app.use('/api/backup', backupRouter);

app.get('/', (req, res) => {
  res.send('Server running...');
});

// ========================
// HEARTBEAT
// ========================
require('./controller/appController');

// ========================
// EXPRESS KE FASTAPI
// ========================
app.get('/get-message', async (req, res) => {
  try {
    const response = await axios.get(process.env.FASTAPI_URL);
    res.json({
      from: 'FastAPI',
      data: response.data
    });
  } catch (error) {
    console.error('Error fetching from FastAPI:', error.message);
    res.status(500).json({ error: 'Failed to fetch data from FastAPI' });
  }
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));