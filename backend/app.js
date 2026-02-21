const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const onboardingRoutes = require('./routes/onboarding');
const questionRoutes = require('./routes/questions');
const attemptRoutes = require('./routes/attempts');
const dashboardRoutes = require('./routes/dashboard');
const sessionRoutes = require('./routes/sessions');
const adminRoutes = require('./routes/admin');
const pdfRoutes = require('./routes/pdf');
const extractionRoutes = require('./routes/extractions');
const scheduleRoutes = require('./routes/schedule');
const voiceRoutes = require('./routes/voice');
const analyticsRoutes = require('./routes/analytics');

const app = express();

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      process.env.FRONTEND_URL || 'https://reviseliketeacher-frontend.onrender.com',
      'https://reviseliketeacher-frontend.onrender.com'
    ]
  : ['http://localhost:3001', 'http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/extractions', extractionRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.json({ 
    message: 'ReviseLikeTeacher API Server',
    status: 'running',
    frontend: 'http://localhost:3001',
    docs: '/api endpoints available'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/db', async (req, res) => {
  try {
    const { db } = require('./db');
    const result = await db.query('SELECT datetime("now") as time, "SQLite" as database');
    res.json({ 
      status: 'ok', 
      database: result.rows[0].database,
      time: result.rows[0].time,
      message: 'Database connection successful'
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message || 'Connection failed',
      details: 'Database connection failed. Please check:',
      checklist: [
        'Database file is accessible',
        'Database schema is initialized',
        'See README.md for setup instructions'
      ]
    });
  }
});

app.post('/api/make-admin', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const { db } = require('./db');
    
    const checkUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found. Please sign up first.' });
    }
    
    await db.query('UPDATE users SET role = $1 WHERE email = $2', ['admin', email]);
    
    res.json({ 
      message: `User ${email} is now an admin! Please log out and log back in to access the admin panel.`,
      success: true 
    });
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

