// --- ФАЙЛ: server/server.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Главный файл для запуска, настройки и управления Node.js/Express сервером.

require('dotenv').config();

// --- Валидация обязательных переменных окружения ---
const requiredEnvVars = ['SESSION_SECRET', 'ADMIN_PASSWORD_HASH'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Не установлены обязательные переменные окружения:');
    console.error(missingVars.map(v => `   - ${v}`).join('\n'));
    console.error('Проверьте файл .env и убедитесь, что все переменные заполнены.');
    console.error('Для генерации SESSION_SECRET используйте: openssl rand -base64 32');
    console.error('Для генерации паролей используйте: node utils/hash-password.js ваш_пароль');
    process.exit(1);
}

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const os = require('os');
const eventEmitter = require('./utils/event-emitter');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'data', 'database.sqlite');

// --- Подключение к базе данных SQLite ---
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('КРИТИЧЕСКАЯ ОШИБКА: Не удалось открыть базу данных:', err.message);
        process.exit(1); // Завершаем процесс, так как без БД приложение неработоспособно
    } else {
        console.log('Успешно подключено к базе данных SQLite.');
        // Включаем поддержку внешних ключей для целостности данных
        db.run('PRAGMA foreign_keys = ON');
        // Используем режим WAL для улучшения производительности при одновременных операциях чтения и записи
        db.run('PRAGMA journal_mode = WAL');
        // Устанавливаем таймаут для обработки блокировок БД
        db.run('PRAGMA busy_timeout = 5000');
    }
});

// --- Настройка Middleware (промежуточного ПО) ---

// Разрешаем CORS-запросы с сохранением учетных данных (credentials)
app.use(cors({
    origin: true, 
    credentials: true
}));

// Устанавливаем различные HTTP-заголовки для повышения безопасности
app.use(
    helmet({
        hsts: false, // Отключаем HSTS, так как для локальной разработки HTTPS не используется
        crossOriginOpenerPolicy: false,
        originAgentCluster: false, // Отключаем заголовок для устранения предупреждения в консоли
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                "script-src": ["'self'", "cdn.jsdelivr.net"],
                "font-src": ["'self'", "fonts.gstatic.com"],
                "style-src": ["'self'", "fonts.googleapis.com", "cdn.jsdelivr.net", "'unsafe-inline'"],
                "upgrade-insecure-requests": null,
            },
        },
    })
);

// Включаем парсинг JSON-тела запросов
app.use(express.json());

// --- Настройка раздачи статических файлов ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});
app.use('/test-runner', express.static(path.join(__dirname, '..', 'client', 'test-runner')));
app.use('/admin', express.static(path.join(__dirname, '..', 'client', 'admin')));
app.use('/dev-panel', express.static(path.join(__dirname, '..', 'client', 'dev-panel')));
app.use('/common', express.static(path.join(__dirname, '..', 'client', 'common')));
app.use('/assets', express.static(path.join(__dirname, '..', 'client', 'assets')));

// Настройка сессий
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Для HTTP. В production с HTTPS должно быть true.
        httpOnly: true, // Защита от XSS
        maxAge: 1000 * 60 * 60 * 24 // Срок жизни cookie - 1 день
    } 
}));

// Ограничитель скорости для эндпоинтов входа
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 минут
	max: 15, // Максимум 15 запросов с одного IP за 15 минут
	standardHeaders: true,
	legacyHeaders: false,
    message: 'Слишком много попыток входа. Пожалуйста, попробуйте снова через 15 минут.'
});

// НОВОЕ: Ограничитель скорости для публичных эндпоинтов отправки результатов
const submitLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 минут
    max: 10, // Максимум 10 отправок за 5 минут с одного IP
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Слишком много попыток отправки. Пожалуйста, попробуйте позже.'
});

// НОВОЕ: Ограничитель скорости для загрузки вопросов (защита от DDoS)
const questionsLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 минута
    max: 20, // Максимум 20 запросов за минуту
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Слишком много запросов. Пожалуйста, подождите.'
});

// --- Подключение роутов ---
const publicRoutes = require('./routes/public.routes')(db);
const adminAuthRoutes = require('./routes/admin-auth.routes')(db);
const adminTestsRoutes = require('./routes/admin-tests.routes')(db);
const adminInstrumentsRoutes = require('./routes/admin-instruments.routes')(db);
const adminTripsRoutes = require('./routes/admin-trips.routes')(db);
const adminOrganizationsRoutes = require('./routes/admin-organizations.routes')(db);

// Эндпоинт для Server-Sent Events
app.get('/api/events', eventEmitter.getEventsHandler);

// Монтирование роутеров
// НОВОЕ: Применяем rate limiters к публичным эндпоинтам
app.use('/api/public/tests/:testId/submit', submitLimiter);
app.use('/api/public/tests/:testId/questions', questionsLimiter);
app.use('/api', publicRoutes);
app.use('/api/admin/login', loginLimiter);
app.use('/api/admin/dev-login', loginLimiter);
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin', adminTestsRoutes);
app.use('/api/admin', adminInstrumentsRoutes);
app.use('/api/admin', adminTripsRoutes);
app.use('/api/admin', adminOrganizationsRoutes);

// --- Централизованный обработчик ошибок ---
// Middleware, который будет вызван, если в любом из роутов произойдет необработанная ошибка
app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] Необработанная ошибка на роуте ${req.path}:`, err.stack);
    res.status(500).json({ error: 'Произошла внутренняя ошибка сервера.' });
});

// --- Функция для автоматического определения локального IP-адреса ---
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            const { address, family, internal } = iface;
            // Ищем первый внешний IPv4 адрес
            if (family === 'IPv4' && !internal) {
                return address;
            }
        }
    }
    return '127.0.0.1'; // Fallback на localhost
}

const localIp = getLocalIpAddress();

// --- Запуск сервера ---
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\nСервер запущен и слушает порт ${PORT}!`);
    console.log("Доступные точки входа:");
    console.log(`- Главный портал:                 http://${localIp}:${PORT}/`);
    console.log(`- Пройти тестирование:            http://${localIp}:${PORT}/test-runner/`);
    console.log(`- Управление тестами:             http://${localIp}:${PORT}/admin/`);
    console.log(`- Панель метрологии:              http://${localIp}:${PORT}/dev-panel/`);
    console.log(`\n(Нажмите CTRL+C для остановки сервера)`);
});

// --- Логика для Graceful Shutdown (корректного завершения работы) ---
const connections = new Set();
server.on('connection', (socket) => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
});

const gracefulShutdown = (signal) => {
  console.log(`\nПолучен сигнал ${signal}. Корректно завершаем работу...`);
  // Закрываем все активные HTTP-соединения
  for (const socket of connections) {
    socket.destroy();
  }
  // Закрываем сам сервер
  server.close(() => {
    console.log('✅ HTTP-сервер закрыт.');
    // После закрытия сервера, закрываем соединение с БД
    db.close((err) => {
      if (err) {
        console.error('❌ Ошибка при закрытии соединения с БД:', err.message);
      } else {
        console.log('✅ Соединение с базой данных закрыто.');
      }
      process.exit(0); // Завершаем процесс
    });
  });
};

// Перехватываем системные сигналы для корректного завершения
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Сигнал от `kill`
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Сигнал от CTRL+C