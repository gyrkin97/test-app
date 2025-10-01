// --- ФАЙЛ: server/__tests__/admin-tests.test.js ---
// Этот файл содержит интеграционные тесты для всех административных API эндпоинтов.

const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3');
const request = require('supertest'); // Библиотека для совершения HTTP-запросов в тестах

// --- Импортируем все роутеры, которые будем тестировать ---
const adminAuthRoutes = require('../routes/admin-auth.routes');
const adminTestsRoutes = require('../routes/admin-tests.routes');
const adminInstrumentsRoutes = require('../routes/admin-instruments.routes'); // Для теста прав доступа
const publicRoutes = require('../routes/public.routes'); // ИСПРАВЛЕНО: Используем единый публичный роутер

// --- Создаем тестовую базу данных в памяти ---
const db = new sqlite3.Database(':memory:');

// --- Создаем "мини-приложение" Express для тестов ---
const app = express();
app.use(express.json());
app.use(session({
    secret: 'test-secret-key-for-jest',
    resave: false,
    saveUninitialized: true,
}));

// Подключаем наши роуты к тестовому приложению
app.use('/api/admin', adminAuthRoutes(db));
app.use('/api/admin', adminTestsRoutes(db));
app.use('/api/admin', adminInstrumentsRoutes(db)); // Подключаем роутер для СИ
app.use('/api', publicRoutes(db)); // ИСПРАВЛЕНО: Подключаем единый публичный роутер

// --- Глобальная подготовка и очистка для всех тестов в файле ---
beforeAll((done) => {
    // Создаем ВСЮ необходимую структуру таблиц перед запуском первого теста
    db.serialize(() => {
        db.run('PRAGMA foreign_keys = ON');
        db.run(`CREATE TABLE tests (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0)`);
        db.run(`CREATE TABLE test_settings (test_id TEXT PRIMARY KEY, duration_minutes INTEGER NOT NULL DEFAULT 10, passing_score INTEGER NOT NULL DEFAULT 5, questions_per_test INTEGER NOT NULL DEFAULT 10, FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE)`);
        db.run(`CREATE TABLE questions (id TEXT PRIMARY KEY, test_id TEXT NOT NULL, text TEXT NOT NULL, explain TEXT, correct_option_key TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'checkbox', match_prompts TEXT, match_answers TEXT, FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE)`);
        db.run(`CREATE TABLE options (id TEXT PRIMARY KEY, question_id TEXT NOT NULL, text TEXT NOT NULL, FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE)`);
        db.run(`CREATE TABLE test_results (id INTEGER PRIMARY KEY AUTOINCREMENT, test_id TEXT NOT NULL, fio TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, percentage REAL NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed', passed INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE)`);
        db.run(`CREATE TABLE test_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, result_id INTEGER NOT NULL, question_id TEXT, user_answer TEXT, is_correct INTEGER NOT NULL, review_status TEXT NOT NULL DEFAULT 'auto', FOREIGN KEY(result_id) REFERENCES test_results(id) ON DELETE CASCADE, FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE SET NULL)`);
        db.run(`CREATE TABLE measuring_instruments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, modification TEXT, serial_number TEXT NOT NULL UNIQUE, inventory_number TEXT, last_verification_date TEXT NOT NULL, next_verification_date TEXT NOT NULL, notes TEXT)`);
        done(); // Сообщаем Jest, что подготовка завершена
    });
});

afterAll((done) => {
    db.close(done); // Закрываем соединение с базой после всех тестов
});


// === ГРУППА ТЕСТОВ 1: Основные операции (CRUD) для тестов ===
describe('Admin Tests API - Lifecycle (CRUD)', () => {
    let testId;
    const agent = request.agent(app);

    beforeAll((done) => {
        app.get('/_test_login_crud', (req, res) => { req.session.isAdmin = true; res.status(200).send('Logged in'); });
        agent.get('/_test_login_crud').end(done);
    });
    
    it('should return an empty list of tests initially', async () => {
        const res = await agent.get('/api/admin/tests');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([]);
    });
    
    it('should create a new test successfully', async () => {
        const res = await agent.post('/api/admin/tests').send({ name: 'Новый тестовый тест' });
        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.newTest.name).toBe('Новый тестовый тест');
        testId = res.body.newTest.id;
    });

    it('should rename the created test', async () => {
        const res = await agent.put(`/api/admin/tests/${testId}/rename`).send({ name: 'Переименованный тест' });
        expect(res.statusCode).toBe(200);
    });

    it('should update the status of the test to active', async () => {
        const res = await agent.put(`/api/admin/tests/${testId}/status`).send({ isActive: true });
        expect(res.statusCode).toBe(200);
    });

    it('should get the updated test in the list', async () => {
        const res = await agent.get('/api/admin/tests');
        const test = res.body.find(t => t.id === testId);
        expect(test.name).toBe('Переименованный тест');
        expect(test.is_active).toBe(1);
    });

    it('should delete the test', async () => {
        const res = await agent.delete(`/api/admin/tests/${testId}`);
        expect(res.statusCode).toBe(200);
    });
    
    it('should return an empty list of tests after deletion', async () => {
        const res = await agent.get('/api/admin/tests');
        const testExists = res.body.some(t => t.id === testId);
        expect(testExists).toBe(false);
    });

    it('should not allow creating a test if not authenticated', async () => {
        const unauthorizedAgent = request(app);
        const res = await unauthorizedAgent.post('/api/admin/tests').send({ name: 'Попытка без логина' });
        expect(res.statusCode).toBe(401);
    });
});


// === ГРУППА ТЕСТОВ 2: Управление настройками теста ===
describe('Admin Test Settings API', () => {
    let testId;
    const agent = request.agent(app);

    beforeAll((done) => {
        app.get('/_test_login_settings', (req, res) => { req.session.isAdmin = true; res.status(200).send('Logged in'); });
        agent.get('/_test_login_settings').end(done);
    });

    beforeEach(async () => {
        const res = await agent.post('/api/admin/tests').send({ name: 'Тест для настроек' });
        testId = res.body.newTest.id;
    });

    afterEach(async () => {
        await agent.delete(`/api/admin/tests/${testId}`);
    });

    it('should get default settings for a new test', async () => {
        const res = await agent.get(`/api/admin/tests/${testId}/settings`);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({
            duration_minutes: 10,
            passing_score: 5,
            questions_per_test: 10,
        }));
    });
    
    it('should save new valid settings and verify them', async () => {
        const newSettings = { duration_minutes: 30, passing_score: 15, questions_per_test: 20 };
        const res = await agent.post(`/api/admin/tests/${testId}/settings`).send(newSettings);
        expect(res.statusCode).toBe(200);

        const verifyRes = await agent.get(`/api/admin/tests/${testId}/settings`);
        expect(verifyRes.body).toEqual(expect.objectContaining(newSettings));
    });
    
    it('should fail to save settings with invalid data (zero)', async () => {
        const res = await agent.post(`/api/admin/tests/${testId}/settings`).send({ duration_minutes: 0, passing_score: 15, questions_per_test: 20 });
        expect(res.statusCode).toBe(400);
    });
});


// === ГРУППА ТЕСТОВ 3: Управление вопросами ===
describe('Admin Questions API', () => {
    let testId, q1_id, q2_id;
    const agent = request.agent(app);

    beforeAll(async () => {
        app.get('/_test_login_questions', (req, res) => { req.session.isAdmin = true; res.status(200).send('Logged in'); });
        await agent.get('/_test_login_questions');
        const res = await agent.post('/api/admin/tests').send({ name: 'Тест для вопросов' });
        testId = res.body.newTest.id;
    });

    it('should create a checkbox and a text_input question', async () => {
        const q1 = { text: 'Checkbox Q', type: 'checkbox', options: [{ id: 'q1-1', text: 'A' }, { id: 'q1-2', text: 'B' }], correct: ['1'] };
        const res1 = await agent.post(`/api/admin/tests/${testId}/questions/add`).send(q1);
        expect(res1.statusCode).toBe(201);
        q1_id = res1.body.newQuestion.id;

        const q2 = { text: 'Text Q', type: 'text_input' };
        const res2 = await agent.post(`/api/admin/tests/${testId}/questions/add`).send(q2);
        expect(res2.statusCode).toBe(201);
        q2_id = res2.body.newQuestion.id;
    });

    it('should get a list of all created questions', async () => {
        const res = await agent.get(`/api/admin/tests/${testId}/questions`);
        expect(res.statusCode).toBe(200);
        expect(res.body.length).toBe(2);
    });

    it('should delete all questions in bulk', async () => {
        const res = await agent.post('/api/admin/questions/delete-bulk').send({ ids: [q1_id, q2_id] });
        expect(res.statusCode).toBe(200);

        const verifyRes = await agent.get(`/api/admin/tests/${testId}/questions`);
        expect(verifyRes.body.length).toBe(0);
    });
});


// === ГРУППА ТЕСТОВ 4: Ручная проверка ответов ===
describe('Admin Review API', () => {
    let testId, questionId, resultId, answerId;
    const adminAgent = request.agent(app);
    const userAgent = request.agent(app);

    beforeAll(async () => {
        app.get('/_test_login_review', (req, res) => { req.session.isAdmin = true; res.status(200).send('Logged in'); });
        await adminAgent.get('/_test_login_review');
        
        const testRes = await adminAgent.post('/api/admin/tests').send({ name: 'Тест для проверки' });
        testId = testRes.body.newTest.id;
        await adminAgent.put(`/api/admin/tests/${testId}/status`).send({ isActive: true });
        
        const qRes = await adminAgent.post(`/api/admin/tests/${testId}/questions/add`).send({ text: 'Что такое REST?', type: 'text_input' });
        questionId = qRes.body.newQuestion.id;
    });

    it('should correctly process a user submission requiring review', async () => {
        await userAgent.post(`/api/public/tests/${testId}/start`);
        
        const userAnswers = [{ questionId, answerIds: ['Это архитектурный стиль...'] }];
        const submitRes = await userAgent.post(`/api/public/tests/${testId}/submit`).send({ fio: 'Тестовый Студент', userAnswers });
        expect(submitRes.statusCode).toBe(200);
        expect(submitRes.body.status).toBe('pending_review');
        resultId = submitRes.body.resultId;
        
        const reviewRes = await adminAgent.get(`/api/admin/results/${resultId}/review`);
        expect(reviewRes.statusCode).toBe(200);
        expect(reviewRes.body.length).toBe(1);
        answerId = reviewRes.body[0].answerId;

        // ИСПРАВЛЕНО: Используем новый пакетный эндпоинт
        const verdicts = [{ answerId, isCorrect: true }];
        const verdictRes = await adminAgent.post('/api/admin/review/submit-batch').send({ verdicts });
        expect(verdictRes.statusCode).toBe(200);
        expect(verdictRes.body.isFinalized).toBe(true);

        const finalReviewRes = await adminAgent.get(`/api/admin/results/${resultId}/review`);
        expect(finalReviewRes.statusCode).toBe(200);
        expect(finalReviewRes.body.length).toBe(0);

        const finalResult = await new Promise((resolve) => {
            db.get('SELECT * FROM test_results WHERE id = ?', [resultId], (_, row) => resolve(row));
        });
        expect(finalResult.status).toBe('completed');
        expect(finalResult.score).toBe(1);
    });
});

// === ГРУППА ТЕСТОВ 5: Валидация и целостность данных ===
describe('Validation and Database Integrity', () => {
    const agent = request.agent(app);

    beforeAll(async () => {
        app.get('/_test_login_validation', (req, res) => { req.session.isAdmin = true; res.status(200).send('Logged in'); });
        await agent.get('/_test_login_validation');
    });

    it('should NOT create a test with an empty name', async () => {
        const res = await agent.post('/api/admin/tests').send({ name: '   ' });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Название теста не может быть пустым');
    });

    it('should NOT rename a test with an invalid UUID', async () => {
        const res = await agent.put('/api/admin/tests/this-is-not-a-uuid/rename').send({ name: 'Новое имя' });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Некорректный ID теста');
    });

    it('should cascade delete all related data when a test is deleted', async () => {
        const testRes = await agent.post('/api/admin/tests').send({ name: 'Тест на удаление' });
        const cascadeTestId = testRes.body.newTest.id;
        await agent.put(`/api/admin/tests/${cascadeTestId}/status`).send({ isActive: true });
        
        const qRes = await agent.post(`/api/admin/tests/${cascadeTestId}/questions/add`).send({ text: 'Q', type: 'checkbox', options: [{id: 't-1', text: 'A'}], correct: ['1'] });
        const questionId = qRes.body.newQuestion.id;

        const userAgent = request.agent(app);
        await userAgent.post(`/api/public/tests/${cascadeTestId}/start`);
        const submitRes = await userAgent.post(`/api/public/tests/${cascadeTestId}/submit`).send({ fio: 'Temp User', userAnswers: [{ questionId, answerIds: [] }] });
        const resultId = submitRes.body.resultId;

        await agent.delete(`/api/admin/tests/${cascadeTestId}`);

        const counts = await new Promise(resolve => {
            db.get(`
                SELECT (SELECT COUNT(*) FROM test_settings WHERE test_id = ?) as settings, (SELECT COUNT(*) FROM questions WHERE test_id = ?) as questions,
                       (SELECT COUNT(*) FROM test_results WHERE test_id = ?) as results
            `, [cascadeTestId, cascadeTestId, cascadeTestId], (_, row) => resolve(row));
        });
        
        expect(counts).toEqual({ settings: 0, questions: 0, results: 0 });
    });
});

// === ГРУППА ТЕСТОВ 6: Пагинация, Поиск и Безопасность ===
describe('Pagination, Search, and Security', () => {
    const agent = request.agent(app);
    let testId;

    beforeAll(async () => {
        app.get('/_test_login_pagination', (req, res) => { req.session.isAdmin = true; res.status(200).send('Logged in'); });
        await agent.get('/_test_login_pagination');
        
        const testRes = await agent.post('/api/admin/tests').send({ name: 'Тест для пагинации' });
        testId = testRes.body.newTest.id;

        const promises = Array.from({ length: 15 }, (_, i) => i + 1).map(i => {
            const fio = i % 3 === 0 ? `Иванов ${i}` : `Петров ${i}`;
            return new Promise(resolve => db.run("INSERT INTO test_results (test_id, fio, score, total, percentage, date, passed) VALUES (?, ?, 0, 0, 0, ?, 0)", [testId, fio, new Date(2025, 0, i).toISOString()], resolve));
        });
        await Promise.all(promises);
    });

    it('should return paginated results correctly', async () => {
        const res1 = await agent.get(`/api/admin/tests/${testId}/results?limit=10&page=1`);
        expect(res1.statusCode).toBe(200);
        expect(res1.body.results.length).toBe(10);
        expect(res1.body.totalPages).toBe(2);

        const res2 = await agent.get(`/api/admin/tests/${testId}/results?limit=10&page=2`);
        expect(res2.statusCode).toBe(200);
        expect(res2.body.results.length).toBe(5);
    });

    it('should find results by FIO search', async () => {
        const res = await agent.get(`/api/admin/tests/${testId}/results?search=Иванов`);
        expect(res.statusCode).toBe(200);
        expect(res.body.results.length).toBe(5);
    });

    it('should deny access to all admin routes for unauthorized users', async () => {
        const unauthorizedAgent = request(app);
        const adminRoutes = [
            { method: 'get', path: '/api/admin/tests' },
            { method: 'put', path: `/api/admin/tests/${testId}/rename`, body: { name: 'test' }},
            { method: 'get', path: `/api/admin/tests/${testId}/settings` },
        ];
        
        const promises = adminRoutes.map(route => unauthorizedAgent[route.method](route.path).send(route.body || {}));
        const responses = await Promise.all(promises);
        responses.forEach(res => expect(res.statusCode).toBe(401));
    });

    // НОВЫЙ ТЕСТ: Проверка прав доступа к API разработчика
    it('should deny access to instruments API for a regular admin', async () => {
        const regularAdminAgent = request.agent(app);
        // Логинимся как обычный админ (isDev = false)
        app.get('/_test_login_regular_admin', (req, res) => { 
            req.session.isAdmin = true; 
            req.session.isDev = false; 
            res.status(200).send('Logged in as Admin'); 
        });
        await regularAdminAgent.get('/_test_login_regular_admin');

        const res = await regularAdminAgent.get('/api/admin/instruments');
        expect(res.statusCode).toBe(403); // 403 Forbidden - доступ запрещен
    });
});