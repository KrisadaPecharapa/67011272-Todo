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

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

const getTeamMembership = async (teamId, userId) => {
  const rows = await query(
    'SELECT team_id, user_id, is_admin FROM team_members WHERE team_id = ? AND user_id = ?',
    [teamId, userId]
  );
  return rows[0] || null;
};

const isTeamAdmin = async (teamId, userId) => {
  const membership = await getTeamMembership(teamId, userId);
  return Boolean(membership && membership.is_admin);
};

const ensureSingleAdminRule = async (teamId) => {
  const rows = await query(
    'SELECT COUNT(*) AS admin_count FROM team_members WHERE team_id = ? AND is_admin = 1',
    [teamId]
  );
  return Number(rows[0]?.admin_count || 0);
};

const toUsernameBase = (name, email, googleSub) => {
  const source = (email && email.includes('@'))
    ? email.split('@')[0]
    : (name || `google_${googleSub}`);
  const sanitized = source
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (sanitized || `google_${String(googleSub).slice(0, 8)}`).slice(0, 30);
};

const generateUniqueUsername = async (base) => {
  let candidate = base;
  let suffix = 1;
  while (true) {
    const rows = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [candidate]);
    if (rows.length === 0) return candidate;
    suffix += 1;
    const maxBaseLength = 30 - String(suffix).length - 1;
    candidate = `${base.slice(0, maxBaseLength)}_${suffix}`;
  }
};

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

    const existingByGoogle = await query(
      'SELECT id, username FROM users WHERE google_sub = ? LIMIT 1',
      [googleSub]
    );

    if (existingByGoogle.length > 0) {
      const userId = existingByGoogle[0].id;
      const existingUsername = existingByGoogle[0].username;
      await query(
        `
        UPDATE users
        SET full_name = ?, profile_image_path = ?, email = ?
        WHERE id = ?
        `,
        [fullName, picture, email, userId]
      );
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
    }

    const existingByEmail = email
      ? await query('SELECT id, username FROM users WHERE email = ? LIMIT 1', [email])
      : [];
    if (existingByEmail.length > 0) {
      const userId = existingByEmail[0].id;
      const existingUsername = existingByEmail[0].username;
      await query(
        `
        UPDATE users
        SET full_name = ?, profile_image_path = ?, google_sub = ?, email = ?
        WHERE id = ?
        `,
        [fullName, picture, googleSub, email, userId]
      );
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
    }

    const usernameBase = toUsernameBase(fullName, email, googleSub);
    const username = await generateUniqueUsername(usernameBase);
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    const result = await query(
      `
      INSERT INTO users (full_name, username, password_hash, profile_image_path, google_sub, email)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [fullName, username, passwordHash, picture, googleSub, email]
    );

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

app.get('/api/users/search', async (req, res) => {
  const { query: searchQuery = '' } = req.query;

  try {
    const term = String(searchQuery).trim();
    const sql = term
      ? `
        SELECT id, username, email, full_name
        FROM users
        WHERE username LIKE ? OR email LIKE ? OR full_name LIKE ?
        ORDER BY username ASC
        LIMIT 25
      `
      : `
        SELECT id, username, email, full_name
        FROM users
        ORDER BY username ASC
        LIMIT 25
      `;
    const params = term ? [`%${term}%`, `%${term}%`, `%${term}%`] : [];
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const term = String(searchQuery).trim();
        const sql = term
          ? `
            SELECT id, username, NULL AS email, full_name
            FROM users
            WHERE username LIKE ? OR full_name LIKE ?
            ORDER BY username ASC
            LIMIT 25
          `
          : `
            SELECT id, username, NULL AS email, full_name
            FROM users
            ORDER BY username ASC
            LIMIT 25
          `;
        const params = term ? [`%${term}%`, `%${term}%`] : [];
        const rows = await query(sql, params);
        return res.json(rows);
      } catch (fallbackErr) {
        return res.status(500).send(fallbackErr);
      }
    }
    res.status(500).send(err);
  }
});

// ------------------------------------
// API: Teams & Team Tasks
// ------------------------------------
app.post('/api/teams', async (req, res) => {
  const { name, admin_user_id } = req.body;
  if (!name || !admin_user_id) {
    return res.status(400).send({ message: 'Team name and admin_user_id are required' });
  }

  try {
    const teamResult = await query('INSERT INTO teams (name) VALUES (?)', [name.trim()]);
    const teamId = teamResult.insertId;
    await query(
      'INSERT INTO team_members (team_id, user_id, is_admin) VALUES (?, ?, 1)',
      [teamId, admin_user_id]
    );
    res.status(201).send({ id: teamId, name: name.trim(), admin_user_id });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/teams', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).send({ message: 'user_id is required' });
  }

  try {
    const rows = await query(
      `
      SELECT t.id, t.name, tm.is_admin
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ?
      ORDER BY t.created_at DESC
      `,
      [user_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/teams/:teamId/members', async (req, res) => {
  const { teamId } = req.params;
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).send({ message: 'user_id is required' });
  }

  try {
    const requesterMembership = await getTeamMembership(teamId, user_id);
    if (!requesterMembership) {
      return res.status(403).send({ message: 'Only team members can view members' });
    }

    const rows = await query(
      `
      SELECT u.id, u.username, u.full_name, u.profile_image_path, tm.is_admin
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
      ORDER BY tm.is_admin DESC, u.full_name ASC
      `,
      [teamId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.post('/api/teams/:teamId/members', async (req, res) => {
  const { teamId } = req.params;
  const { actor_user_id, user_id, user_identifier } = req.body;

  if (!actor_user_id || (!user_id && !user_identifier)) {
    return res.status(400).send({ message: 'actor_user_id and one of user_id or user_identifier are required' });
  }

  try {
    const admin = await isTeamAdmin(teamId, actor_user_id);
    if (!admin) {
      return res.status(403).send({ message: 'Only team admin can add members' });
    }

    let targetUserId = user_id ? Number(user_id) : null;
    if (!targetUserId && user_identifier) {
      let userRows = [];
      try {
        userRows = await query(
          'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
          [user_identifier, user_identifier]
        );
      } catch (lookupErr) {
        // Backward compatibility if `users.email` hasn't been added yet.
        if (lookupErr && lookupErr.code === 'ER_BAD_FIELD_ERROR') {
          userRows = await query(
            'SELECT id FROM users WHERE username = ? LIMIT 1',
            [user_identifier]
          );
        } else {
          throw lookupErr;
        }
      }
      if (userRows.length === 0) {
        return res.status(404).send({ message: 'User not found by username/email' });
      }
      targetUserId = Number(userRows[0].id);
    }

    const existing = await getTeamMembership(teamId, targetUserId);
    if (existing) {
      return res.status(409).send({ message: 'User is already in this team' });
    }

    await query(
      'INSERT INTO team_members (team_id, user_id, is_admin) VALUES (?, ?, 0)',
      [teamId, targetUserId]
    );

    res.status(201).send({ message: 'Member added successfully' });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.put('/api/teams/:teamId/admin', async (req, res) => {
  const { teamId } = req.params;
  const { actor_user_id, new_admin_user_id } = req.body;

  if (!actor_user_id || !new_admin_user_id) {
    return res.status(400).send({ message: 'actor_user_id and new_admin_user_id are required' });
  }

  try {
    const admin = await isTeamAdmin(teamId, actor_user_id);
    if (!admin) {
      return res.status(403).send({ message: 'Only team admin can transfer admin role' });
    }

    const targetMembership = await getTeamMembership(teamId, new_admin_user_id);
    if (!targetMembership) {
      return res.status(400).send({ message: 'New admin must be a team member' });
    }

    await query('UPDATE team_members SET is_admin = 0 WHERE team_id = ?', [teamId]);
    await query('UPDATE team_members SET is_admin = 1 WHERE team_id = ? AND user_id = ?', [teamId, new_admin_user_id]);

    res.send({ message: 'Team admin updated successfully' });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.delete('/api/teams/:teamId/members/:memberUserId', async (req, res) => {
  const { teamId, memberUserId } = req.params;
  const { actor_user_id } = req.body;

  if (!actor_user_id) {
    return res.status(400).send({ message: 'actor_user_id is required' });
  }

  try {
    const admin = await isTeamAdmin(teamId, actor_user_id);
    if (!admin) {
      return res.status(403).send({ message: 'Only team admin can remove members' });
    }

    const targetMembership = await getTeamMembership(teamId, memberUserId);
    if (!targetMembership) {
      return res.status(404).send({ message: 'Team member not found' });
    }

    if (Number(memberUserId) === Number(actor_user_id)) {
      return res.status(400).send({ message: 'Admin cannot remove themselves. Transfer admin first.' });
    }

    await query('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, memberUserId]);

    const adminCount = await ensureSingleAdminRule(teamId);
    if (adminCount !== 1) {
      return res.status(409).send({ message: 'Each team must have exactly one admin' });
    }

    res.send({ message: 'Member removed successfully' });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.delete('/api/teams/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const { actor_user_id } = req.body;

  if (!actor_user_id) {
    return res.status(400).send({ message: 'actor_user_id is required' });
  }

  try {
    const admin = await isTeamAdmin(teamId, actor_user_id);
    if (!admin) {
      return res.status(403).send({ message: 'Only team admin can delete team' });
    }

    const result = await query('DELETE FROM teams WHERE id = ?', [teamId]);
    if (result.affectedRows === 0) {
      return res.status(404).send({ message: 'Team not found' });
    }

    res.send({ message: 'Team deleted successfully' });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.post('/api/teams/:teamId/tasks', async (req, res) => {
  const { teamId } = req.params;
  const { actor_user_id, title, assigned_user_id, status } = req.body;

  if (!actor_user_id || !title || !assigned_user_id) {
    return res.status(400).send({ message: 'actor_user_id, title, and assigned_user_id are required' });
  }

  try {
    const admin = await isTeamAdmin(teamId, actor_user_id);
    if (!admin) {
      return res.status(403).send({ message: 'Only team admin can create team tasks' });
    }

    const assigneeMembership = await getTeamMembership(teamId, assigned_user_id);
    if (!assigneeMembership) {
      return res.status(400).send({ message: 'Assigned user must be in the same team' });
    }

    const result = await query(
      `
      INSERT INTO team_tasks (team_id, title, status, assigned_user_id, created_by)
      VALUES (?, ?, ?, ?, ?)
      `,
      [teamId, title.trim(), status || 'Todo', assigned_user_id, actor_user_id]
    );

    res.status(201).send({
      id: result.insertId,
      team_id: Number(teamId),
      title: title.trim(),
      status: status || 'Todo',
      assigned_user_id,
      created_by: actor_user_id,
    });
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/api/teams/:teamId/tasks', async (req, res) => {
  const { teamId } = req.params;
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).send({ message: 'user_id is required' });
  }

  try {
    const membership = await getTeamMembership(teamId, user_id);
    if (!membership) {
      return res.status(403).send({ message: 'Only team members can view team tasks' });
    }

    const rows = await query(
      `
      SELECT
        tt.id,
        tt.team_id,
        tt.title,
        tt.status,
        tt.assigned_user_id,
        au.full_name AS assigned_user_name,
        tt.created_by,
        cu.full_name AS created_by_name,
        tt.updated_at
      FROM team_tasks tt
      JOIN users au ON au.id = tt.assigned_user_id
      JOIN users cu ON cu.id = tt.created_by
      WHERE tt.team_id = ?
      ORDER BY tt.updated_at DESC
      `,
      [teamId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.put('/api/teams/:teamId/tasks/:taskId/status', async (req, res) => {
  const { teamId, taskId } = req.params;
  const { actor_user_id, status } = req.body;

  if (!actor_user_id || !status) {
    return res.status(400).send({ message: 'actor_user_id and status are required' });
  }
  if (!['Todo', 'Doing', 'Done'].includes(status)) {
    return res.status(400).send({ message: 'Invalid status value' });
  }

  try {
    const taskRows = await query(
      'SELECT assigned_user_id FROM team_tasks WHERE id = ? AND team_id = ? LIMIT 1',
      [taskId, teamId]
    );
    if (taskRows.length === 0) {
      return res.status(404).send({ message: 'Task not found' });
    }

    const admin = await isTeamAdmin(teamId, actor_user_id);
    const isAssignedUser = Number(taskRows[0].assigned_user_id) === Number(actor_user_id);
    if (!admin && !isAssignedUser) {
      return res.status(403).send({ message: 'Only admin or assigned user can update task status' });
    }

    await query('UPDATE team_tasks SET status = ? WHERE id = ? AND team_id = ?', [status, taskId, teamId]);
    res.send({ message: 'Task status updated successfully' });
  } catch (err) {
    res.status(500).send(err);
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
