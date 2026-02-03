// server.js
require("dotenv").config();

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const port = 5001;

// Middleware setup
app.use(cors()); // Allow cross-origin requests from React frontend
app.use(express.json()); // Enable reading JSON data from request body

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-z0-9-_]/gi, '_')
      .slice(0, 40);
    cb(null, `${Date.now()}_${safeBase}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Profile image must be an image file.'));
    }
    cb(null, true);
  },
});

const verifyHCaptcha = async (token, remoteip) => {
  if (!HCAPTCHA_SECRET) {
    throw new Error('HCAPTCHA_SECRET is not set');
  }

  const params = new URLSearchParams();
  params.append('secret', HCAPTCHA_SECRET);
  params.append('response', token);
  if (remoteip) params.append('remoteip', remoteip);

  const response = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  return response.json();
};

// --- MySQL Connection Setup ---
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER, // CHANGE THIS to your MySQL username
  password: process.env.DB_PASSWORD, // CHANGE THIS to your MySQL password
  database: process.env.DB_NAME, // Ensure this matches your database name
});

db.connect(err => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL Database.');
});

// ------------------------------------
// API: Authentication (Username Only)
// ------------------------------------
app.post('/api/login', (req, res) => {
  const { username, password, hcaptcha_token } = req.body;
  if (!username || !password || !hcaptcha_token) {
    return res.status(400).send({ message: 'Username, password, and CAPTCHA are required' });
  }

  const sql = 'SELECT id, username, full_name, password_hash, profile_image_path FROM users WHERE username = ?';
  db.query(sql, [username], async (err, results) => {
    if (err) return res.status(500).send(err);
    if (results.length === 0) {
      return res.status(401).send({ message: 'Invalid username or password' });
    }

    try {
      const captcha = await verifyHCaptcha(hcaptcha_token, req.ip);
      if (!captcha.success) {
        return res.status(401).send({ message: 'CAPTCHA verification failed' });
      }
    } catch (captchaError) {
      return res.status(500).send({ message: 'CAPTCHA verification error' });
    }

    const user = results[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).send({ message: 'Invalid username or password' });
    }

    res.send({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        profile_image_path: user.profile_image_path,
      },
    });
  });
});

// ------------------------------------
// API: Google Login
// ------------------------------------
app.post('/api/google-login', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).send({ message: 'Google credential is required' });
  }
  if (!googleClient) {
    return res.status(500).send({ message: 'Google login is not configured' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).send({ message: 'Invalid Google credential' });
    }

    const googleSub = payload.sub;
    const email = payload.email || null;
    const fullName = payload.name || 'Google User';
    const picture = payload.picture || '';
    const username = email || `google_${googleSub}`;

    const findSql = 'SELECT id, username FROM users WHERE google_sub = ? OR username = ? LIMIT 1';
    db.query(findSql, [googleSub, username], async (findErr, results) => {
      if (findErr) return res.status(500).send(findErr);

      if (results.length > 0) {
        const userId = results[0].id;
        const existingUsername = results[0].username;
        const updateSql = `
          UPDATE users
          SET full_name = ?, profile_image_path = ?, google_sub = ?, email = ?
          WHERE id = ?
        `;
        db.query(updateSql, [fullName, picture, googleSub, email, userId], (updateErr) => {
          if (updateErr) return res.status(500).send(updateErr);
          return res.send({
            success: true,
            message: 'Login successful',
            user: {
              id: userId,
              username: existingUsername,
              full_name: fullName,
              profile_image_path: picture,
              email,
            },
          });
        });
        return;
      }

      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      const insertSql = `
        INSERT INTO users (full_name, username, password_hash, profile_image_path, google_sub, email)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.query(insertSql, [fullName, username, passwordHash, picture, googleSub, email], (insertErr, result) => {
        if (insertErr) return res.status(500).send(insertErr);
        res.status(201).send({
          success: true,
          message: 'Login successful',
          user: {
            id: result.insertId,
            username,
            full_name: fullName,
            profile_image_path: picture,
            email,
          },
        });
      });
    });
  } catch (error) {
    res.status(401).send({ message: 'Invalid Google credential' });
  }
});

// ------------------------------------
// API: Registration (with profile image)
// ------------------------------------
app.post('/api/register', upload.single('profile_image'), async (req, res) => {
  try {
    const { full_name, username, password } = req.body;

    if (!full_name || !username || !password) {
      return res.status(400).send({ message: 'Full name, username, and password are required' });
    }
    if (!req.file) {
      return res.status(400).send({ message: 'Profile image is required' });
    }

    const checkSql = 'SELECT id FROM users WHERE username = ?';
    db.query(checkSql, [username], async (err, results) => {
      if (err) return res.status(500).send(err);
      if (results.length > 0) {
        return res.status(409).send({ message: 'Username already exists' });
      }

      const password_hash = await bcrypt.hash(password, 12);
      const profile_image_path = `/uploads/${req.file.filename}`;
      const insertSql = `
        INSERT INTO users (full_name, username, password_hash, profile_image_path)
        VALUES (?, ?, ?, ?)
      `;

      db.query(insertSql, [full_name, username, password_hash, profile_image_path], (insertErr, result) => {
        if (insertErr) return res.status(500).send(insertErr);
        res.status(201).send({
          id: result.insertId,
          full_name,
          username,
          profile_image_path,
        });
      });
    });
  } catch (error) {
    res.status(500).send({ message: 'Registration failed', error: error.message });
  }
});

// ------------------------------------
// API: Todo List (CRUD Operations)
// ------------------------------------

// 1. READ: Get all todos for a specific user
app.get('/api/todos/:username', (req, res) => {
  const { username } = req.params;
  // Select status and target_datetime; order by target_datetime descending
  const sql = 'SELECT id, task, status, target_datetime, updated FROM todo WHERE username = ? ORDER BY target_datetime DESC';
  db.query(sql, [username], (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});

// 2. CREATE: Add a new todo item
app.post('/api/todos', (req, res) => {
  const { username, task, status, target_datetime } = req.body; // Accept new fields
  if (!username || !task) {
    return res.status(400).send({ message: 'Username and task are required' });
  }

  // Insert status and target_datetime. Default status to 'Todo' if not provided.
  const sql = 'INSERT INTO todo (username, task, status, target_datetime) VALUES (?, ?, ?, ?)';
  const values = [username, task, status || 'Todo', target_datetime || null];

  db.query(sql, values, (err, result) => {
    if (err) return res.status(500).send(err);
    res.status(201).send({ 
      id: result.insertId, 
      username, 
      task, 
      status: status || 'Todo', 
      target_datetime: target_datetime || null,
      updated: new Date() 
    });
  });
});

// 3. UPDATE: Change the status
app.put('/api/todos/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Expect 'status' instead of 'done'

  const sql = 'UPDATE todo SET status = ? WHERE id = ?';
  db.query(sql, [status, id], (err, result) => {
    if (err) return res.status(500).send(err);
    if (result.affectedRows === 0) {
      return res.status(404).send({ message: 'Todo not found' });
    }
    res.send({ message: 'Todo updated successfully' });
  });
});

// 4. DELETE: Remove a todo item
app.delete('/api/todos/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM todo WHERE id = ?';
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).send(err);
    if (result.affectedRows === 0) {
      return res.status(404).send({ message: 'Todo not found' });
    }
    res.send({ message: 'Todo deleted successfully' });
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
