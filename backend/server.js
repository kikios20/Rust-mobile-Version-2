require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


const app = express();
app.use(cors());
app.use(express.json());


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


const JWT_SECRET = process.env.JWT_SECRET || 'element-rust-secret-key';


// Создаём таблицу пользователей при старте
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    agreed_to_terms BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => console.log('Database ready'))
  .catch(err => console.error('DB init error:', err));


// Проверка здоровья
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});


// Регистрация
app.post('/register', async (req, res) => {
  const { username, email, password, agreedToTerms } = req.body;


  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }


  if (!agreedToTerms) {
    return res.status(400).json({ error: 'Необходимо принять условия использования' });
  }


  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
  }


  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, agreed_to_terms) VALUES ($1, $2, $3, $4) RETURNING id, username, email',
      [username, email, password_hash, agreedToTerms]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// Вход
app.post('/login', async (req, res) => {
  const { email, password } = req.body;


  if (!email || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }


  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


app.get('/', (req, res) => {
  res.json({ status: 'Element Rust API is running' });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});