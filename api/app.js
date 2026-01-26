const express = require('express');
const cors = require('cors');
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

const app = express();

app.use(cors());
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
app.use('/uploads', express.static('uploads'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

