require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');


const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


// Хранилище кодов верификации (в памяти, очищается при перезапуске)
const verificationCodes = new Map();


function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}


async function sendVerificationEmail(email, code) {
  await transporter.sendMail({
    from: `"Element Rust" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Подтверждение email — Element Rust',
    html: `
      <div style="background:#05070d; color:#fff; padding:40px; font-family:Inter,sans-serif; max-width:500px; margin:0 auto; border-radius:16px;">
        <h1 style="color:#00e5ff; margin-bottom:8px;">Element Rust</h1>
        <p style="color:rgba(255,255,255,0.6); margin-bottom:30px;">Подтверждение регистрации</p>
        <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:30px; text-align:center; margin-bottom:24px;">
          <p style="color:rgba(255,255,255,0.5); font-size:14px; margin-bottom:12px;">Ваш код подтверждения:</p>
          <div style="font-size:36px; font-weight:800; letter-spacing:8px; color:#00e5ff;">${code}</div>
          <p style="color:rgba(255,255,255,0.3); font-size:12px; margin-top:12px;">Код действителен 10 минут</p>
        </div>
        <p style="color:rgba(255,255,255,0.4); font-size:12px;">Если вы не регистрировались на Element Rust — просто проигнорируйте это письмо.</p>
      </div>
    `
  });
}


const app = express();


app.use(cors({
  origin: ['https://kikios20.github.io', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


app.use(express.json({ limit: '10kb' }));


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10
});


const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('JWT_SECRET не задан!'); process.exit(1); }


pool.query(`CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(30) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
)`).then(async () => {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(255)`);
  console.log('Database ready');
}).catch(err => console.error('DB init error:', err));


const loginAttempts = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < 60000);
  if (attempts.length >= 10) return res.status(429).json({ error: 'Слишком много попыток. Подождите минуту.' });
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  next();
}


function validateEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function validateUsername(username) { return /^[a-zA-Z0-9_]{3,30}$/.test(username); }


function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Необходима авторизация' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Недействительный токен' }); }
}


function adminMiddleware(req, res, next) {
  if (req.user.id !== 1) return res.status(403).json({ error: 'Нет доступа' });
  next();
}


app.get('/', (req, res) => res.json({ status: 'Element Rust API is running' }));


app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch (err) { res.status(500).json({ status: 'error', database: 'disconnected' }); }
});


app.post('/register', rateLimit, async (req, res) => {
  const { username, email, password, agreedToTerms } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Заполните все поля' });
  if (!validateUsername(username)) return res.status(400).json({ error: 'Никнейм: 3-30 символов, только буквы, цифры и _' });
  if (!validateEmail(email)) return res.status(400).json({ error: 'Неверный формат email' });
  if (password.length < 6 || password.length > 72) return res.status(400).json({ error: 'Пароль: от 6 до 72 символов' });
  if (!agreedToTerms) return res.status(400).json({ error: 'Необходимо принять условия использования' });
  try {
    const password_hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, agreed_to_terms) VALUES ($1, $2, $3, $4) RETURNING id, username',
      [username.trim(), email.toLowerCase().trim(), password_hash, true]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (err) {
    if (err.code === '23505') {
      if (err.detail.includes('username')) return res.status(400).json({ error: 'Это имя пользователя уже занято' });
      if (err.detail.includes('email')) return res.status(400).json({ error: 'Этот email уже зарегистрирован' });
    }
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// Отправить код верификации
app.post('/send-verification', rateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: 'Неверный email' });
  }
  try {
    // Проверяем что email ещё не занят
    const existing = await pool.query('SELECT id FROM users WHERE email = LOWER($1)', [email.trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Этот email уже зарегистрирован' });
    }
    const code = generateCode();
    verificationCodes.set(email.toLowerCase(), {
      code,
      expires: Date.now() + 10 * 60 * 1000 // 10 минут
    });
    await sendVerificationEmail(email, code);
    res.json({ success: true, message: 'Код отправлен на вашу почту' });
  } catch (err) {
    console.error('Send verification error:', err.message);
    res.status(500).json({ error: 'Не удалось отправить письмо' });
  }
});


// Проверить код верификации
app.post('/verify-email', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Укажите email и код' });
  const stored = verificationCodes.get(email.toLowerCase());
  if (!stored) return res.status(400).json({ error: 'Код не найден. Запросите новый.' });
  if (Date.now() > stored.expires) {
    verificationCodes.delete(email.toLowerCase());
    return res.status(400).json({ error: 'Код истёк. Запросите новый.' });
  }
  if (stored.code !== code) return res.status(400).json({ error: 'Неверный код' });
  verificationCodes.delete(email.toLowerCase());
  res.json({ success: true, message: 'Email подтверждён' });
});


app.post('/login', rateLimit, async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Заполните все поля' });
  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, is_banned, ban_reason FROM users WHERE email = LOWER($1) OR LOWER(username) = LOWER($1)',
      [login.trim()]
    );
    if (result.rows.length === 0) { await bcrypt.hash('dummy', 12); return res.status(400).json({ error: 'Неверный логин или пароль' }); }
    const user = result.rows[0];
    if (user.is_banned) return res.status(403).json({ error: `Аккаунт заблокирован. Причина: ${user.ban_reason || 'не указана'}` });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Неверный логин или пароль' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


app.get('/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, created_at, balance FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


app.get('/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, created_at, balance, is_banned, ban_reason FROM users ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});


app.post('/admin/balance', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId, amount, comment } = req.body;
  if (!userId || amount === undefined) return res.status(400).json({ error: 'Укажите userId и amount' });
  try {
    const result = await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING id, username, balance', [amount, userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});


app.post('/admin/ban', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId, reason } = req.body;
  if (!userId) return res.status(400).json({ error: 'Укажите userId' });
  if (userId === 1 || userId === '1') return res.status(403).json({ error: 'Нельзя заблокировать аккаунт администратора' });
  try {
    await pool.query('UPDATE users SET is_banned = true, ban_reason = $1 WHERE id = $2', [reason || 'Без причины', userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});


app.post('/admin/unban', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Укажите userId' });
  try {
    await pool.query('UPDATE users SET is_banned = false, ban_reason = null WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});


app.post('/admin/edit-user', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId, username, email, password } = req.body;
  if (!userId) return res.status(400).json({ error: 'Укажите userId' });
  try {
    if (username) await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, userId]);
    if (email) await pool.query('UPDATE users SET email = LOWER($1) WHERE id = $2', [email, userId]);
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
      const hash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Никнейм или email уже занят' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
