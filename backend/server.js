require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


const app = express();


// Разрешаем только наш сайт
app.use(cors({
  origin: ['https://kikios20.github.io', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


app.use(express.json({ limit: '10kb' })); // защита от огромных запросов


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10 // максимум соединений
});


const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET не задан!');
  process.exit(1);
}


// Минимальная таблица — только то что реально нужно
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(30) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    agreed_to_terms BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => console.log('Database ready'))
  .catch(err => console.error('DB init error:', err));


// Простая защита от брутфорса (не более 10 запросов в минуту с одного IP)
const loginAttempts = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];
  const recent = attempts.filter(t => now - t < 60000);
  if (recent.length >= 10) {
    return res.status(429).json({ error: 'Слишком много попыток. Подождите минуту.' });
  }
  recent.push(now);
  loginAttempts.set(ip, recent);
  next();
}


// Валидация входных данных
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


function validateUsername(username) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}


app.get('/', (req, res) => {
  res.json({ status: 'Element Rust API is running' });
});


app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});


// Регистрация
app.post('/register', rateLimit, async (req, res) => {
  const { username, email, password, agreedToTerms } = req.body;


  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }


  if (!validateUsername(username)) {
    return res.status(400).json({ error: 'Никнейм: 3-30 символов, только буквы, цифры и _' });
  }


  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Неверный формат email' });
  }


  if (password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: 'Пароль: от 6 до 72 символов' });
  }


  if (!agreedToTerms) {
    return res.status(400).json({ error: 'Необходимо принять условия использования' });
  }


  try {
    const password_hash = await bcrypt.hash(password, 12); // 12 раундов — хорошая защита
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, agreed_to_terms) VALUES ($1, $2, $3, $4) RETURNING id, username',
      [username.trim(), email.toLowerCase().trim(), password_hash, true]
    );
    const user = result.rows[0];
    // В токене только id и username — минимум данных
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    // Не возвращаем email и другие лишние данные
    res.json({ token, username: user.username });
  } catch (err) {
    if (err.code === '23505') {
      if (err.detail.includes('username')) {
        return res.status(400).json({ error: 'Это имя пользователя уже занято' });
      }
      if (err.detail.includes('email')) {
        return res.status(400).json({ error: 'Этот email уже зарегистрирован' });
      }
    }
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// Вход
app.post('/login', rateLimit, async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  const isEmail = validateEmail(login);
  const email = login;

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE email = LOWER($1) OR LOWER(username) = LOWER($1)',
      [login.trim()]
    );


    // Одинаковое сообщение об ошибке для безопасности
    // (чтобы нельзя было угадать, существует ли email)
    if (result.rows.length === 0) {
      await bcrypt.hash('dummy', 12); // имитируем задержку
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }


    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }


    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, username: user.username });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});