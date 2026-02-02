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

const app = express();

app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:5173', 'http://localhost:3000'],
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

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

