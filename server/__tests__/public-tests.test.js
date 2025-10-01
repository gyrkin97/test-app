// --- ФАЙЛ: server/__tests__/public-tests.test.js ---
// Этот файл содержит интеграционные тесты для публичных API эндпоинтов,
// с которыми взаимодействует обычный пользователь.

const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3');
const request = require('supertest');

// --- Импортируем роутеры для тестирования ---
const publicRoutes = require('../routes/public.routes'); // ИСПРАВЛЕНО: Используем единый публичный роутер
const adminTestsRoutes = require('../routes/admin-tests.routes'); // Нужен для получения протокола

// --- Создаем тестовую базу данных в памяти ---
const db = new sqlite3.Database(':memory:');

// --- Создаем "мини-приложение" Express для тестов ---
const app = express();
app.use(express.json());
app.use(session({
    secret: 'public-test-secret-key-for-jest',
    resave: false,
    saveUninitialized: true,
}));

// Подключаем роутеры, которые мы тестируем в этом файле
app.use('/api', publicRoutes(db)); // ИСПРАВЛЕНО: Подключаем единый роутер
app.use('/api/admin', adminTestsRoutes(db));

// --- Глобальная подготовка и очистка для всех тестов в файле ---
let activeTestId, inactiveTestId, q1Id, q2Id, q3Id, anotherTestId, anotherQuestionId, testWithNoQuestionsId;
let passedResultId;

beforeAll((done) => {
    db.serialize(() => {
        db.run('PRAGMA foreign_keys = ON');
        db.run(`CREATE TABLE tests (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0)`);
        db.run(`CREATE TABLE test_settings (test_id TEXT PRIMARY KEY, duration_minutes INTEGER NOT NULL DEFAULT 1, passing_score INTEGER NOT NULL DEFAULT 2, questions_per_test INTEGER NOT NULL DEFAULT 2, FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE)`);
        db.run(`CREATE TABLE questions (id TEXT PRIMARY KEY, test_id TEXT NOT NULL, text TEXT NOT NULL, explain TEXT, correct_option_key TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'checkbox', match_prompts TEXT, match_answers TEXT, FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE)`);
        db.run(`CREATE TABLE options (id TEXT PRIMARY KEY, question_id TEXT NOT NULL, text TEXT NOT NULL, FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE)`);
        db.run(`CREATE TABLE test_results (id INTEGER PRIMARY KEY AUTOINCREMENT, test_id TEXT NOT NULL, fio TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, percentage REAL NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed', passed INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE)`);
        db.run(`CREATE TABLE test_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, result_id INTEGER NOT NULL, question_id TEXT, user_answer TEXT, is_correct INTEGER NOT NULL, review_status TEXT NOT NULL DEFAULT 'auto', FOREIGN KEY(result_id) REFERENCES test_results(id) ON DELETE CASCADE, FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE SET NULL)`);
        
        activeTestId = 'active-test-uuid';
        inactiveTestId = 'inactive-test-uuid';
        testWithNoQuestionsId = 'no-questions-uuid';
        q1Id = 'q-uuid-1'; q2Id = 'q-uuid-2'; q3Id = 'q-uuid-3';
        
        db.run("INSERT INTO tests (id, name, created_at, is_active) VALUES (?, ?, ?, ?)", [activeTestId, 'Активный тест', new Date().toISOString(), 1]);
        db.run("INSERT INTO test_settings (test_id, passing_score, questions_per_test) VALUES (?, ?, ?)", [activeTestId, 2, 2]);
        db.run("INSERT INTO questions (id, test_id, text, correct_option_key) VALUES (?, ?, ?, ?)", [q1Id, activeTestId, 'Вопрос 1', '["1"]']);
        db.run("INSERT INTO options (id, question_id, text) VALUES (?, ?, ?)", [`${q1Id}-1`, q1Id, "Опция A"]);
        db.run("INSERT INTO questions (id, test_id, text, correct_option_key) VALUES (?, ?, ?, ?)", [q2Id, activeTestId, 'Вопрос 2', '["2"]']);
        db.run("INSERT INTO options (id, question_id, text) VALUES (?, ?, ?)", [`${q2Id}-2`, q2Id, "Опция B"]);
        db.run("INSERT INTO questions (id, test_id, text, correct_option_key) VALUES (?, ?, ?, ?)", [q3Id, activeTestId, 'Вопрос 3 (лишний)', '["3"]']);

        db.run("INSERT INTO tests (id, name, created_at, is_active) VALUES (?, ?, ?, ?)", [inactiveTestId, 'Тест-черновик', new Date().toISOString(), 0]);
        db.run("INSERT INTO test_settings (test_id) VALUES (?)", [inactiveTestId]);

        db.run("INSERT INTO tests (id, name, created_at, is_active) VALUES (?, ?, ?, ?)", [testWithNoQuestionsId, 'Тест без вопросов', new Date().toISOString(), 1]);
        db.run("INSERT INTO test_settings (test_id) VALUES (?)", [testWithNoQuestionsId]);
        
        anotherTestId = 'another-test-uuid';
        anotherQuestionId = 'another-q-uuid';
        db.run("INSERT INTO tests (id, name, created_at, is_active) VALUES (?, ?, ?, ?)", [anotherTestId, 'Другой активный тест', new Date().toISOString(), 1]);
        db.run("INSERT INTO test_settings (test_id) VALUES (?)", [anotherTestId]);
        db.run("INSERT INTO questions (id, test_id, text, correct_option_key) VALUES (?, ?, ?, ?)", [anotherQuestionId, anotherTestId, 'Чужой вопрос', '["4"]']);
        
        done();
    });
});

afterAll(async () => {
    await new Promise(resolve => db.close(resolve));
});


// === ГРУППА ТЕСТОВ 1: Логика списка публичных тестов ===
describe('Public Test List Logic', () => {
    it('should only return active tests', async () => {
        const res = await request(app).get('/api/public/tests');
        expect(res.statusCode).toBe(200);
        expect(res.body.length).toBe(3); // activeTestId, testWithNoQuestionsId, anotherTestId
        expect(res.body.some(t => t.name === 'Тест-черновик')).toBe(false);
    });

    it('should return passedStatus for a user who passed a test', async () => {
        const fio = 'Успешный Студент';
        const stmt = db.prepare(`INSERT INTO test_results (test_id, fio, score, total, percentage, date, status, passed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run([activeTestId, fio, 5, 5, 100.0, new Date().toISOString(), 'completed', 1], function() {
            passedResultId = this.lastID;
        });
        stmt.finalize();

        const res = await request(app).get(`/api/public/tests?fio=${encodeURIComponent(fio)}`);
        
        expect(res.statusCode).toBe(200);
        const passedTest = res.body.find(t => t.id === activeTestId);
        expect(passedTest).toBeDefined();
        expect(passedTest.passedStatus).toBe(true);
    });

    // НОВЫЙ ТЕСТ: Проверка получения последнего результата
    it('should get the last passed result protocol for a user', async () => {
        const fio = 'Успешный Студент';
        const res = await request(app).get(`/api/public/results/last?testId=${activeTestId}&fio=${encodeURIComponent(fio)}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body.fio).toBe(fio);
        expect(res.body.passed).toBe(true);
        expect(res.body.testName).toBe('Активный тест');
    });
});


// === ГРУППА ТЕСТОВ 2: API прохождения тестов (основной сценарий) ===
describe('Public Test Taking API', () => {
    const agent = request.agent(app);

    it('should start a test and set startTime in session', async () => {
        // ИСПРАВЛЕННЫЙ ПУТЬ
        const res = await agent.post(`/api/public/tests/${activeTestId}/start`);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.headers['set-cookie']).toBeDefined();
    });
    
    it('should get a correct set of questions for the test', async () => {
        // ИСПРАВЛЕННЫЙ ПУТЬ
        const res = await agent.get(`/api/public/tests/${activeTestId}/questions`);
        expect(res.statusCode).toBe(200);
        expect(res.body.questions).toBeInstanceOf(Array);
        expect(res.body.questions.length).toBe(2); // questions_per_test = 2 в настройках
    });

    it('should successfully submit a valid test result', async () => {
        await agent.post(`/api/public/tests/${activeTestId}/start`);
        const answers = [{ questionId: q1Id, answerIds: [`${q1Id}-1`] }, { questionId: q2Id, answerIds: [] }];
        // ИСПРАВЛЕННЫЙ ПУТЬ
        const res = await agent.post(`/api/public/tests/${activeTestId}/submit`).send({ fio: 'Тестер', userAnswers: answers });
        
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('completed');
        expect(res.body.score).toBe(1);
        expect(res.body.total).toBe(2);
        expect(res.body.passed).toBe(false);
    });
});

// === ГРУППА ТЕСТОВ 3: Крайние случаи и логика настроек ===
describe('Edge Cases and Settings Logic', () => {
    const agent = request.agent(app);

    it('should return exactly the number of questions specified in settings', async () => {
        const res = await agent.get(`/api/public/tests/${activeTestId}/questions`);
        expect(res.statusCode).toBe(200);
        expect(res.body.questions.length).toBe(2);
    });

    it('should correctly handle a test with no questions', async () => {
        const res = await agent.get(`/api/public/tests/${testWithNoQuestionsId}/questions`);
        expect(res.statusCode).toBe(200);
        expect(res.body.questions).toEqual([]);
    });

    it('should NOT allow getting questions for an inactive test', async () => {
        const res = await agent.get(`/api/public/tests/${inactiveTestId}/questions`);
        expect(res.statusCode).toBe(404);
    });
    
    it('should mark test as PASSED if score is equal to passing_score', async () => {
        await agent.post(`/api/public/tests/${activeTestId}/start`);
        const answers = [{ questionId: q1Id, answerIds: [`${q1Id}-1`] }, { questionId: q2Id, answerIds: [`${q2Id}-2`] }];
        const res = await agent.post(`/api/public/tests/${activeTestId}/submit`).send({ fio: 'Студент-хорошист', userAnswers: answers });
        
        expect(res.statusCode).toBe(200);
        expect(res.body.score).toBe(2);
        expect(res.body.passed).toBe(true);
    });

    it('should ignore answers from a different test (anti-cheat)', async () => {
        await agent.post(`/api/public/tests/${activeTestId}/start`);
        const maliciousAnswers = [{ questionId: q1Id, answerIds: [`${q1Id}-1`] }, { questionId: anotherQuestionId, answerIds: [`${anotherQuestionId}-d`] }];
        const res = await agent.post(`/api/public/tests/${activeTestId}/submit`).send({ fio: 'Хитрый Тестер', userAnswers: maliciousAnswers });
        
        expect(res.statusCode).toBe(200);
        expect(res.body.total).toBe(1); // Должен быть засчитан только 1 ответ из правильного теста
    });

    it('should fail to submit if the time is up', async () => {
        await agent.post(`/api/public/tests/${activeTestId}/start`);
        // Моделируем, что прошел 1 час, хотя на тест дается 1 минута
        const realDateNow = Date.now.bind(global.Date);
        global.Date.now = jest.fn(() => realDateNow() + (60 * 60 * 1000));

        const res = await agent.post(`/api/public/tests/${activeTestId}/submit`).send({ fio: 'Медленный', userAnswers: [] });
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Время на прохождение теста истекло.');
        
        global.Date.now = realDateNow;
    });
});