const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../db');

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = db.generateUUID();

    await db.query(
      'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
      [userId, email, passwordHash]
    );

    const userResult = await db.query('SELECT id, email, role, created_at FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const result = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(200).json({ message: 'If email exists, reset link sent' });
    }

    const resetToken = jwt.sign(
      { userId: result.rows[0].id, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({ message: 'If email exists, reset link sent' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/register-admin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existingUser = await db.query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      const passwordHash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET role = $1, password_hash = $2 WHERE email = $3', ['admin', passwordHash, email]);
      
      const userResult = await db.query('SELECT id, email, role, created_at FROM users WHERE email = $1', [email]);
      const user = userResult.rows[0];

      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        },
        message: 'Your account is now an admin account!'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = db.generateUUID();

    await db.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [userId, email, passwordHash, 'admin']
    );

    const userResult = await db.query('SELECT id, email, role, created_at FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      message: 'Admin account created successfully!'
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

