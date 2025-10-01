// --- ФАЙЛ: server/routes/public.routes.js (ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ) ---
// Этот файл содержит все публичные маршруты для взаимодействия с тестами.

const express = require('express');
const router = express.Router();
const { sendEvent } = require('../utils/event-emitter');
const protocolServiceFactory = require('../services/protocolService');
const testTakingServiceFactory = require('../services/testTakingService');

// ИСПРАВЛЕНИЕ: Импортируем централизованные утилиты для работы с БД
const { get, all, run } = require('../utils/dbUtils');

module.exports = (db) => {
    // --- Инициализация сервисов ---
    const protocolService = protocolServiceFactory(db);
    const testTakingService = testTakingServiceFactory(db);

    /**
     * @route GET /api/public/tests
     * @desc Получает список всех активных тестов с указанием, сдан ли он уже пользователем.
     * @access Public
     */
    router.get('/public/tests', async (req, res, next) => {
        const { fio } = req.query;
        
        const sql = `
            SELECT 
                t.id, t.name, s.duration_minutes, s.passing_score, s.questions_per_test,
                COALESCE(MAX(r.passed), 0) as passedStatus
            FROM tests t
            JOIN test_settings s ON t.id = s.test_id
            LEFT JOIN test_results r ON t.id = r.test_id AND r.fio = ? COLLATE NOCASE AND r.passed = 1
            WHERE t.is_active = 1 
            GROUP BY t.id
            ORDER BY t.name ASC
        `;
        
        try {
            // ИСПРАВЛЕНИЕ: Используем dbUtils.all вместо старой промисификации
            const rows = await all(db, sql, [fio ? fio.trim() : null]);
            // Преобразуем 0/1 в boolean для удобства на клиенте
            rows.forEach(row => { row.passedStatus = !!row.passedStatus; });
            res.json(rows);
        } catch (err) {
            next(err);
        }
    });

    /**
     * @route GET /api/public/results/last
     * @desc Получает протокол последнего успешно сданного теста для конкретного пользователя.
     * @access Public
     */
    router.get('/public/results/last', async (req, res, next) => {
        const { testId, fio } = req.query;

        if (!testId || !fio) {
            return res.status(400).json({ error: 'Необходимы ID теста и ФИО.' });
        }

        try {
            const sql = `
                SELECT id FROM test_results 
                WHERE test_id = ? AND fio = ? COLLATE NOCASE AND passed = 1
                ORDER BY date DESC 
                LIMIT 1
            `;
            // ИСПРАВЛЕНИЕ: Используем dbUtils.get вместо старой промисификации
            const lastResult = await get(db, sql, [testId, fio.trim()]);

            if (!lastResult) {
                return res.status(404).json({ error: 'Успешно сданный результат для этого пользователя не найден.' });
            }

            const { summary, protocol } = await protocolService.getProtocolForUser(lastResult.id);
            // Возвращаем полный объект с данными для отображения результатов
            res.json({ ...summary, protocolData: protocol });

        } catch (err) {
            next(err);
        }
    });

    /**
     * @route POST /api/public/tests/:testId/start
     * @desc Начинает сессию теста, записывая время старта в сессию пользователя.
     * @access Public
     */
    router.post('/public/tests/:testId/start', (req, res) => {
        req.session.testStartTime = Date.now();
        res.json({ success: true, startTime: req.session.testStartTime });
    });

    /**
     * @route GET /api/public/tests/:testId/questions
     * @desc Получает случайный набор вопросов и настройки для теста.
     * @access Public
     */
    router.get('/public/tests/:testId/questions', async (req, res, next) => {
        try {
            const { testId } = req.params;

            // ИСПРАВЛЕНИЕ: Используем dbUtils.get вместо старой промисификации
            const test = await get(db, 'SELECT is_active FROM tests WHERE id = ?', [testId]);
            if (!test || !test.is_active) {
                return res.status(404).json({ error: 'Тест не найден или неактивен.' });
            }

            const data = await testTakingService.getTestQuestions(testId);
            const endTime = req.session.testStartTime + (data.duration * 1000);
            res.json({ ...data, endTime });
            
        } catch (err) {
            next(err);
        }
    });

    /**
     * @route POST /api/public/tests/:testId/submit
     * @desc Принимает ответы, проверяет время, обрабатывает и сохраняет результат.
     * @access Public
     */
    router.post('/public/tests/:testId/submit', async (req, res, next) => {
        try {
            const { testId } = req.params;
            const { fio, userAnswers } = req.body;
            
            // ИСПРАВЛЕНИЕ: Используем dbUtils.get вместо старой промисификации
            const settings = await get(db, `SELECT duration_minutes FROM test_settings WHERE test_id = ?`, [testId]);
            if (!settings) {
                return res.status(404).json({ error: 'Тест не найден.' });
            }

            const testStartTime = req.session.testStartTime;
            if (!testStartTime) {
                return res.status(400).json({ error: 'Тест не был начат корректно.' });
            }
            
            const timeTaken = Date.now() - testStartTime;
            const maxTimeAllowed = (settings.duration_minutes * 60 * 1000) + 5000; // 5 секунд запаса
            if (timeTaken > maxTimeAllowed) {
                delete req.session.testStartTime;
                return res.status(400).json({ error: 'Время на прохождение теста истекло.' });
            }
            delete req.session.testStartTime;

            const result = await testTakingService.submitTest(testId, fio, userAnswers);
            
            // ИСПРАВЛЕНИЕ: Используем dbUtils.get вместо старой промисификации
            const testRow = await get(db, `SELECT name FROM tests WHERE id = ?`, [testId]);
            const testName = testRow ? testRow.name : 'Неизвестный тест';
            
            // Отправляем событие в админ-панель
            const newResultForSSE = { 
                id: result.resultId, 
                fio, 
                score: result.score, 
                total: result.total, 
                percentage: result.percentage, 
                date: new Date().toISOString(), 
                testId, 
                testName, 
                status: result.status, 
                passed: result.passed 
            };
            sendEvent(newResultForSSE, 'new-result');
            
            if (result.status === 'pending_review') {
                res.json({ status: 'pending_review', resultId: result.resultId });
            } else {
                res.json({ ...result, testName });
            }

        } catch (err) {
            if (req.session) {
                delete req.session.testStartTime;
            }
            next(err);
        }
    });

    return router;
};