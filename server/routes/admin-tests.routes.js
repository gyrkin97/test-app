// --- ФАЙЛ: server/routes/admin-tests.routes.js (ПОСЛЕ РЕФАКТОРИНГА) ---
// Этот файл отвечает только за маршрутизацию. Вся бизнес-логика вынесена в сервисы.

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { sendEvent } = require('../utils/event-emitter'); // ИСПРАВЛЕН ПУТЬ

// --- Middleware ---

const { isAdmin } = require('../middleware/auth.middleware');

/**
 * Middleware для обработки ошибок валидации от express-validator.
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
};


// --- Главный экспорт модуля ---

module.exports = (db) => {
    // --- Подключение сервисного слоя ---
    const testService = require('../services/testService')(db);
    const questionService = require('../services/questionService')(db);
    const reviewService = require('../services/reviewService')(db);
    const resultService = require('../services/resultService')(db);
    const protocolService = require('../services/protocolService')(db);

    // Все роуты в этом файле требуют прав администратора
    router.use(isAdmin);

    // =================================================================
    // API: УПРАВЛЕНИЕ ТЕСТАМИ (КОНТЕЙНЕРАМИ)
    // =================================================================

    router.get('/tests', async (req, res, next) => {
        try {
            const tests = await testService.getAll();
            res.json(tests);
        } catch (err) { next(err); }
    });

    router.post('/tests',
        body('name').trim().notEmpty().withMessage('Название теста не может быть пустым.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const newTest = await testService.create(req.body.name);
                res.status(201).json({ success: true, newTest });
            } catch (err) { next(err); }
        }
    );
    
    router.put('/tests/:testId/rename',
        param('testId').isUUID(4).withMessage('Некорректный ID теста.'),
        body('name').trim().notEmpty().withMessage('Название теста не может быть пустым.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                await testService.rename(req.params.testId, req.body.name);
                res.json({ success: true });
            } catch (err) {
                if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Тест не найден.' });
                next(err);
            }
        }
    );
    
    router.put('/tests/:testId/status',
        param('testId').isUUID(4).withMessage('Некорректный ID теста.'),
        body('isActive').isBoolean().withMessage('Статус должен быть true или false.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                await testService.updateStatus(req.params.testId, req.body.isActive);
                res.json({ success: true });
            } catch (err) { next(err); }
        }
    );
    
    router.delete('/tests/:testId',
        param('testId').isUUID(4).withMessage('Некорректный ID теста.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                await testService.delete(req.params.testId);
                res.json({ success: true, message: 'Тест успешно удален.' });
            } catch (err) { next(err); }
        }
    );

    // =================================================================
    // API: УПРАВЛЕНИЕ НАСТРОЙКАМИ
    // =================================================================

    router.get('/tests/:testId/settings',
        param('testId').isUUID(4).withMessage('Некорректный ID теста.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const settings = await testService.getSettings(req.params.testId);
                res.json(settings);
            } catch (err) {
                if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Настройки для теста не найдены.' });
                next(err);
            }
        }
    );
    
    router.post('/tests/:testId/settings',
        param('testId').isUUID(4).withMessage('Некорректный ID теста.'),
        body('duration_minutes').isInt({ min: 1, max: 180 }),
        body('passing_score').isInt({ min: 1, max: 100 }),
        body('questions_per_test').isInt({ min: 1, max: 100 }),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                await testService.saveSettings(req.params.testId, req.body);
                res.json({ success: true });
            } catch (err) { next(err); }
        }
    );

    // =================================================================
    // API: УПРАВЛЕНИЕ РЕЗУЛЬТАТАМИ
    // =================================================================
    
    router.get('/tests/:testId/results',
        param('testId').isUUID(4).withMessage('Некорректный ID теста.'),
        query('sort').optional().isIn(['id', 'fio', 'score', 'percentage', 'date', 'status']),
        query('order').optional().isIn(['asc', 'desc']).withMessage('Некорректный порядок сортировки.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const data = await resultService.getPaginatedResults(req.params.testId, req.query);
                res.json(data);
            } catch (err) { next(err); }
        }
    );

    router.post('/results/delete-bulk',
        body('ids').isArray({ min: 1 }).withMessage('Требуется массив ID.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                await resultService.deleteByIds(req.body.ids);
                
                sendEvent({}, 'tests-updated');
                
                res.json({ success: true });
            } catch (err) { next(err); }
        }
    );
    
    router.get('/results/:resultId/protocol',
        param('resultId').isInt().withMessage('Некорректный ID результата.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const protocol = await protocolService.getProtocolForUser(req.params.resultId);
                res.json(protocol);
            } catch (err) {
                if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Результат не найден.' });
                next(err);
            }
        }
    );

    // =================================================================
    // API: РУЧНАЯ ПРОВЕРКА
    // =================================================================

    router.get('/results/:resultId/review',
        param('resultId').isInt().withMessage('Некорректный ID результата.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const reviews = await reviewService.getPending(req.params.resultId);
                res.json(reviews);
            } catch (err) { next(err); }
        }
    );

    router.post('/review/submit-batch',
        body('verdicts').isArray({ min: 1 }).withMessage('Требуется массив вердиктов.'),
        body('verdicts.*.answerId').isInt(),
        body('verdicts.*.isCorrect').isBoolean(),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const result = await reviewService.submitBatchVerdict(req.body.verdicts);
                res.json(result);
            } catch (err) { next(err); }
        }
    );

    // =================================================================
    // API: УПРАВЛЕНИЕ ВОПРОСАМИ
    // =================================================================
    
    const questionValidationChain = [
        body('text').trim().notEmpty(), body('type').isIn(['checkbox', 'match', 'text_input']),
    ];

    router.get('/tests/:testId/questions',
        param('testId').isUUID(4).withMessage('Некорректный ID теста.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const questions = await questionService.getAllForTest(req.params.testId);
                res.json(questions);
            } catch(err) { next(err); }
        }
    );
    
    router.post('/tests/:testId/questions/add',
        param('testId').isUUID(4).withMessage('Некорректный ID теста.'),
        ...questionValidationChain, handleValidationErrors,
        async (req, res, next) => {
            try {
                const newQuestion = await questionService.create(req.params.testId, req.body);
                res.status(201).json({ success: true, newQuestion });
            } catch(err) { next(err); }
        }
    );

    router.post('/questions/update',
        body('id').isString().notEmpty(), ...questionValidationChain, handleValidationErrors,
        async (req, res, next) => {
            try {
                await questionService.update(req.body);
                res.json({ success: true });
            } catch(err) { next(err); }
        }
    );

    router.post('/questions/delete-bulk',
        body('ids').isArray({ min: 1 }), handleValidationErrors,
        async (req, res, next) => {
            try {
                await questionService.deleteByIds(req.body.ids);
                res.json({ success: true });
            } catch (err) { next(err); }
        }
    );

    return router;
};