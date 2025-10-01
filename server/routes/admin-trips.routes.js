// --- ФАЙЛ: server/routes/admin-trips.routes.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { isDev } = require('../middleware/auth.middleware');
const { sendEvent } = require('../utils/event-emitter');

/**
 * Middleware для централизованной обработки ошибок валидации от express-validator.
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Возвращаем только первое сообщение об ошибке для простоты на клиенте
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
};

/**
 * Фабричная функция, которая создает и настраивает маршрутизатор для командировок.
 * @param {object} db - Экземпляр базы данных sqlite3.
 * @returns {object} - Настроенный экземпляр Express Router.
 */
module.exports = (db) => {
    const tripService = require('../services/businessTripService')(db);

    // Применяем middleware `isDev` ко всем роутам в этом файле.
    router.use(isDev);

    // =================================================================
    // --- API для управления сотрудниками ---
    // =================================================================

    router.get('/employees', async (req, res, next) => {
        try {
            const employees = await tripService.getEmployees();
            res.json(employees);
        } catch (err) {
            next(err);
        }
    });

    router.post('/employees', 
        body('name').trim().notEmpty().withMessage('Имя сотрудника не может быть пустым.'),
        body('position').trim().notEmpty().withMessage('Должность не может быть пустой.'),
        body('phone').optional({ checkFalsy: true }).trim(),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const { name, position, phone } = req.body;
                const newEmployee = await tripService.createEmployee({ name, position, phone });
                
                // Отправляем событие об обновлении сотрудников
                sendEvent({}, 'employees-updated');
                
                res.status(201).json(newEmployee);
            } catch (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Сотрудник с таким именем уже существует.' });
                }
                next(err);
            }
    });

    router.delete('/employees/:id', 
        param('id').isInt().withMessage('Некорректный ID сотрудника.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                await tripService.deleteEmployee(req.params.id);
                
                // Отправляем событие об обновлении сотрудников
                sendEvent({}, 'employees-updated');
                
                res.status(200).json({ success: true });
            } catch (err) {
                if (err.message === 'NOT_FOUND') {
                    return res.status(404).json({ error: 'Сотрудник не найден.' });
                }
                next(err);
            }
    });
    
    router.get('/employees/:id/details', 
        param('id').isInt().withMessage('Некорректный ID сотрудника.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const details = await tripService.getEmployeeDetails(req.params.id);
                res.json(details);
            } catch (err) {
                if (err.message === 'NOT_FOUND') {
                    return res.status(404).json({ error: 'Сотрудник не найден.' });
                }
                next(err);
            }
        }
    );

    // =================================================================
    // --- Маршрут для получения списка должностей (справочник) ---
    // =================================================================

    router.get('/positions', (req, res) => {
        const positions = [
            "Инженер по метрологии",
            "Техник по метрологии", 
            "Начальник лаборатории"
        ];
        res.json(positions);
    });

    // =================================================================
    // --- API для управления командировками ---
    // =================================================================

    router.get('/trips', 
        [
            query('year').isInt().withMessage('Год должен быть числом.'),
            query('month').isInt({ min: 1, max: 12 }).withMessage('Месяц должен быть числом от 1 до 12.')
        ],
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const trips = await tripService.getTrips(req.query.year, req.query.month);
                res.json(trips);
            } catch (err) {
                next(err);
            }
    });
    
    // Общий набор правил валидации для создания и обновления командировки
    const tripValidationRules = [
        body('destination').trim().notEmpty().withMessage('Пункт назначения не может быть пустым.'),
        body('transport_type').isIn(['car', 'train', 'plane']).withMessage('Некорректный тип транспорта.'),
        body('start_date').isISO8601().withMessage('Некорректный формат даты начала.'),
        body('end_date').isISO8601().withMessage('Некорректный формат даты окончания.')
            .custom((value, { req }) => {
                if (new Date(value) < new Date(req.body.start_date)) {
                    throw new Error('Дата окончания не может быть раньше даты начала.');
                }
                return true;
            }),
        body('organization_id').notEmpty().withMessage('Организация обязательна.').isInt()
    ];

    router.post('/trips',
        [
            body('employee_ids').isArray({ min: 1 }).withMessage('Нужно выбрать хотя бы одного сотрудника.'),
            body('employee_ids.*').isInt().withMessage('Некорректный ID сотрудника в массиве.'),
            ...tripValidationRules
        ],
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const result = await tripService.createTripsBatch(req.body);
                
                // Отправляем событие об обновлении командировок
                sendEvent({}, 'trips-updated');
                
                res.status(201).json({ success: true, ...result });
            } catch (err) {
                next(err);
            }
        }
    );
    
    // МАРШРУТ ДЛЯ РЕДАКТИРОВАНИЯ КОМАНДИРОВКИ
    router.put('/trips/:id',
        [
            param('id').isInt().withMessage('Некорректный ID командировки.'),
            ...tripValidationRules // Используем тот же набор правил валидации
        ],
        handleValidationErrors,
        async (req, res, next) => {
            try {
                // employee_ids из тела запроса здесь не используется, 
                // так как мы обновляем одну конкретную запись о командировке, а не меняем сотрудника.
                const result = await tripService.updateTrip(req.params.id, req.body);
                
                // Отправляем событие об обновлении командировок
                sendEvent({}, 'trips-updated'); 
                
                res.status(200).json({ success: true, updatedTrip: result });
            } catch (err) {
                if (err.message === 'NOT_FOUND') {
                    return res.status(404).json({ error: 'Командировка для обновления не найдена.' });
                }
                next(err);
            }
        }
    );

    router.delete('/trips/:id',
        param('id').isInt().withMessage('Некорректный ID командировки.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                await tripService.deleteTrip(req.params.id);
                
                // Отправляем событие об обновлении командировок
                sendEvent({}, 'trips-updated');
                
                res.status(204).send(); // 204 No Content
            } catch (err) {
                if (err.message === 'NOT_FOUND') {
                    return res.status(404).json({ error: 'Командировка не найдена.' });
                }
                next(err);
            }
        }
    );

    return router;
};