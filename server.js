const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;
const JWT_SECRET = process.env.JWT_SECRET || 'todo-organizer-secret-key-change-in-production';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'todo.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '',
    color TEXT DEFAULT '#4a5568',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    list_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    due_date TEXT,
    repeat TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
  );
`);

// Auth middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Auth Routes ──

app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (existing) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }
  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(username, email, hashed);
  const userId = result.lastInsertRowid;

  // Create default lists for new user
  const defaultLists = [
    { name: 'Work', emoji: '💼', color: '#5b6abf' },
    { name: 'House', emoji: '🏠', color: '#2d9c6f' },
    { name: 'Personal Growth', emoji: '🌱', color: '#4a8fa8' },
    { name: 'Errands', emoji: '🛒', color: '#5b6abf' },
    { name: 'Meals', emoji: '🍳', color: '#c0533a' },
    { name: 'Little Goals', emoji: '✨', color: '#8fa4ae' },
  ];
  const insertList = db.prepare('INSERT INTO lists (user_id, name, emoji, color) VALUES (?, ?, ?, ?)');
  for (const list of defaultLists) {
    insertList.run(userId, list.name, list.emoji, list.color);
  }

  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: userId, username, email } });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
});

// ── List Routes ──

app.get('/api/lists', authenticate, (req, res) => {
  const lists = db.prepare('SELECT * FROM lists WHERE user_id = ? ORDER BY created_at').all(req.userId);
  res.json(lists);
});

app.post('/api/lists', authenticate, (req, res) => {
  const { name, emoji, color } = req.body;
  if (!name) return res.status(400).json({ error: 'List name is required' });
  const result = db.prepare('INSERT INTO lists (user_id, name, emoji, color) VALUES (?, ?, ?, ?)').run(req.userId, name, emoji || '', color || '#4a5568');
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(result.lastInsertRowid);
  res.json(list);
});

app.put('/api/lists/:id', authenticate, (req, res) => {
  const { name, emoji, color } = req.body;
  const list = db.prepare('SELECT * FROM lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!list) return res.status(404).json({ error: 'List not found' });
  db.prepare('UPDATE lists SET name = COALESCE(?, name), emoji = COALESCE(?, emoji), color = COALESCE(?, color) WHERE id = ?').run(name, emoji, color, req.params.id);
  const updated = db.prepare('SELECT * FROM lists WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.delete('/api/lists/:id', authenticate, (req, res) => {
  const list = db.prepare('SELECT * FROM lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!list) return res.status(404).json({ error: 'List not found' });
  db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Todo Routes ──

app.get('/api/todos', authenticate, (req, res) => {
  const todos = db.prepare(`
    SELECT todos.*, lists.name as list_name, lists.emoji as list_emoji, lists.color as list_color
    FROM todos
    JOIN lists ON todos.list_id = lists.id
    WHERE todos.user_id = ?
    ORDER BY todos.completed ASC, todos.due_date ASC, todos.created_at DESC
  `).all(req.userId);
  res.json(todos);
});

app.post('/api/todos', authenticate, (req, res) => {
  const { title, list_id, due_date, repeat } = req.body;
  if (!title || !list_id) return res.status(400).json({ error: 'Title and list are required' });
  const list = db.prepare('SELECT * FROM lists WHERE id = ? AND user_id = ?').get(list_id, req.userId);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const result = db.prepare('INSERT INTO todos (user_id, list_id, title, due_date, repeat) VALUES (?, ?, ?, ?, ?)').run(req.userId, list_id, title, due_date || null, repeat || null);
  const todo = db.prepare(`
    SELECT todos.*, lists.name as list_name, lists.emoji as list_emoji, lists.color as list_color
    FROM todos JOIN lists ON todos.list_id = lists.id WHERE todos.id = ?
  `).get(result.lastInsertRowid);
  res.json(todo);
});

app.put('/api/todos/:id', authenticate, (req, res) => {
  const { title, list_id, due_date, completed, repeat } = req.body;
  const todo = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  db.prepare(`UPDATE todos SET
    title = COALESCE(?, title),
    list_id = COALESCE(?, list_id),
    due_date = COALESCE(?, due_date),
    completed = COALESCE(?, completed),
    repeat = COALESCE(?, repeat)
    WHERE id = ?`
  ).run(title, list_id, due_date, completed, repeat, req.params.id);
  const updated = db.prepare(`
    SELECT todos.*, lists.name as list_name, lists.emoji as list_emoji, lists.color as list_color
    FROM todos JOIN lists ON todos.list_id = lists.id WHERE todos.id = ?
  `).get(req.params.id);
  res.json(updated);
});

app.delete('/api/todos/:id', authenticate, (req, res) => {
  const todo = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve index.html for all non-API routes
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
