require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);


// SendGrid setup
console.log('SendGrid API Key configured: ' + (process.env.SENDGRID_API_KEY ? 'Yes' : 'No'));
console.log('SendGrid from email: ' + process.env.SENDGRID_FROM_EMAIL);


// Хранилище кодов верификации (в памяти, очищается при перезапуске)
const verificationCodes = new Map();


function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}


async function sendVerificationEmail(email, code) {
  const msg = {
    to: email,
    from: process.env.SENDGRID_FROM_EMAIL,
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
  };

  try {
    await sgMail.send(msg);
    console.log(`Verification email sent to ${email}`);
  } catch (err) {
    console.error('Email send error:', err.message);
    throw err;
  }
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
console.log('Email config:', {
  user: process.env.EMAIL_USER ? 'SET' : 'NOT SET',
  pass: process.env.EMAIL_PASS ? 'SET' : 'NOT SET'
});


pool.query(`CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(30) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
)`).then(async () => {
  try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance INTEGER DEFAULT 0`); } catch(e) {}
  try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false`); } catch(e) {}
  try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(255)`); } catch(e) {}
  
  // Принудительно проверяем и создаём колонки если их нет
  const check = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name='users' AND column_name='is_banned'
  `);
  if (check.rows.length === 0) {
    await pool.query(`ALTER TABLE users ADD COLUMN is_banned BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN ban_reason VARCHAR(255)`);
    console.log('Added missing columns');
  }
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


// Проверка незакрытых заказов пользователя
app.get('/my-orders', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, item_name, price, status, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


app.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, username, email, created_at, balance FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    
    const ordersResult = await pool.query(
      'SELECT COUNT(*) as total, COALESCE(SUM(price),0) as spent FROM orders WHERE user_id = $1',
      [req.user.id]
    );
    
    const user = userResult.rows[0];
    res.json({
      ...user,
      totalOrders: parseInt(ordersResult.rows[0].total),
      totalSpent: parseInt(ordersResult.rows[0].spent)
    });
  } catch (err) {
    console.error('Profile error:', err.message);
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
    const result = await pool.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING id, username, balance',
      [amount, parseInt(userId)]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: `Пользователь #${userId} не найден` });
    
    // Логируем транзакцию
    await pool.query(
      `CREATE TABLE IF NOT EXISTS balance_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        comment VARCHAR(255),
        admin_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`
    );
    await pool.query(
      'INSERT INTO balance_logs (user_id, amount, comment, admin_id) VALUES ($1, $2, $3, $4)',
      [parseInt(userId), amount, comment || 'Без комментария', req.user.id]
    );
    
    console.log(`Balance change: user #${userId} ${amount > 0 ? '+' : ''}${amount} ₴ by admin #${req.user.id} (${comment})`);
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Balance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


app.get('/admin/balance-logs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT bl.*, u.username 
      FROM balance_logs bl 
      JOIN users u ON bl.user_id = u.id 
      ORDER BY bl.created_at DESC 
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


app.post('/admin/ban', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId, reason } = req.body;
  if (!userId) return res.status(400).json({ error: 'Укажите userId' });
  if (parseInt(userId) === 1) return res.status(403).json({ error: 'Нельзя заблокировать администратора' });
  try {
    const result = await pool.query(
      'UPDATE users SET is_banned = true, ban_reason = $1 WHERE id = $2 RETURNING id, username, is_banned',
      [reason || 'Без причины', parseInt(userId)]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Пользователь с ID ${userId} не найден` });
    }
    console.log('Banned user:', result.rows[0]);
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Ban error:', err.message);
    res.status(500).json({ error: err.message });
  }
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
    let updated = false;
    if (username && username.trim()) {
      await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username.trim(), parseInt(userId)]);
      updated = true;
    }
    if (email && email.trim()) {
      await pool.query('UPDATE users SET email = LOWER($1) WHERE id = $2', [email.trim(), parseInt(userId)]);
      updated = true;
    }
    if (password && password.length >= 6) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, parseInt(userId)]);
      updated = true;
    }
    if (!updated) return res.status(400).json({ error: 'Нечего обновлять — заполните хотя бы одно поле' });
    const result = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [parseInt(userId)]);
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Никнейм или email уже занят' });
    console.error('Edit user error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// Таблица заказов
pool.query(`CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  item_name VARCHAR(100) NOT NULL,
  price INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(err => console.error('Orders table error:', err));


// Покупка товара
app.post('/shop/buy', authMiddleware, async (req, res) => {
  const { item, price } = req.body;
  if (!item || !price) return res.status(400).json({ error: 'Укажите товар и цену' });
  if (price <= 0) return res.status(400).json({ error: 'Неверная цена' });
  try {
    // Проверяем баланс
    const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.balance < price) return res.status(400).json({ error: `Недостаточно средств. Ваш баланс: ${user.balance} ₴` });
    
    // Списываем баланс и создаём заказ
    const newBalance = user.balance - price;
    await pool.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, req.user.id]);
    const orderResult = await pool.query(
      'INSERT INTO orders (user_id, item_name, price) VALUES ($1, $2, $3) RETURNING id',
      [req.user.id, item, price]
    );
    const orderId = orderResult.rows[0].id;
    
    res.json({ 
      success: true, 
      orderId: `ER-${String(orderId).padStart(6, '0')}`,
      newBalance 
    });
  } catch (err) {
    console.error('Buy error:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// Список заказов для админа
app.get('/admin/orders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.id, o.item_name, o.price, o.status, o.created_at,
             u.username, u.id as user_id
      FROM orders o 
      JOIN users u ON o.user_id = u.id 
      ORDER BY o.created_at DESC 
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// Обновить статус заказа
app.post('/admin/order-status', authMiddleware, adminMiddleware, async (req, res) => {
  const { orderId, status } = req.body;
  if (!orderId || !status) return res.status(400).json({ error: 'Укажите orderId и status' });
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
