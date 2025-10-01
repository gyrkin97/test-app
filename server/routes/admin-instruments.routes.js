// --- ФАЙЛ: server/routes/admin-instruments.routes.js (ПОСЛЕ РЕФАКТОРИНГА) ---
// В этом файле добавлена строгая проверка прав доступа только для разработчиков
// и обновлена валидация для поддержки расширенной модели данных оборудования.

const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');

// УЛУЧШЕНИЕ: Middleware импортируется из централизованного файла.
const { isDev } = require('../middleware/auth.middleware');

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

/**
 * Фабричная функция, которая создает и настраивает маршрутизатор.
 * @param {object} db - Экземпляр базы данных sqlite3.
 * @returns {object} - Настроенный экземпляр Express Router.
 */
module.exports = (db) => {
    const instrumentService = require('../services/instrumentService')(db);

    // Применяем middleware `isDev` ко всем маршрутам в этом файле.
    router.use('/instruments', isDev);

    /**
     * @route GET /api/admin/instruments
     * @desc Получает список всего оборудования.
     * @access Private (Developer Only)
     */
    router.get('/instruments', async (req, res, next) => {
        try {
            const instruments = await instrumentService.getAll();
            res.json(instruments);
        } catch (err) {
            next(err);
        }
    });
    
    // Общий массив правил валидации для создания и обновления записей.
    const instrumentValidationRules = [
        body('name').trim().notEmpty().withMessage('Наименование обязательно.'),
        body('serial_number').trim().notEmpty().withMessage('Заводской номер обязателен.'),
        body('type').isIn(['instrument', 'standard', 'auxiliary']).withMessage('Некорректный тип оборудования.'),
        
        // Даты: необязательны, но если переданы, должны быть в формате ISO8601
        body('last_verification_date').optional({ checkFalsy: true }).isISO8601().toDate().withMessage('Некорректный формат даты поверки.'),
        body('next_verification_date').optional({ checkFalsy: true }).isISO8601().toDate().withMessage('Некорректный формат даты следующей поверки.'),
        body('commissioning_date').optional({ checkFalsy: true }).isISO8601().toDate().withMessage('Некорректный формат даты ввода в эксплуатацию.'),
        
        // Числовые поля
        body('manufacture_year').optional({ checkFalsy: true }).isLength({ min: 4, max: 4 }).withMessage('Год выпуска должен состоять из 4 цифр.').isNumeric().withMessage('Год выпуска должен быть числом.'),
        body('verification_interval_months').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Межповерочный интервал должен быть целым положительным числом.'),

        // Текстовые поля: разрешаем, но очищаем от лишних пробелов
        body('modification').optional().trim(),
        body('inventory_number').optional().trim(),
        body('notes').optional().trim(),
        body('si_type_reg_number').optional().trim(),
        body('fif_oei_reg_number').optional().trim(),
        body('arshin_link').optional({ checkFalsy: true }).isURL().withMessage('Ссылка ФГИС АРШИН должна быть корректным URL.'),
        body('verification_doc_number').optional().trim(),
        body('responsible_person').optional().trim()
    ];


    /**
     * @route POST /api/admin/instruments
     * @desc Создает новую запись об оборудовании.
     * @access Private (Developer Only)
     */
    router.post('/instruments',
        instrumentValidationRules,
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const newInstrument = await instrumentService.create(req.body);
                res.status(201).json(newInstrument);
            } catch (err) {
                 if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Оборудование с таким заводским номером уже существует.' });
                }
                next(err);
            }
        }
    );

    /**
     * @route PUT /api/admin/instruments/:id
     * @desc Обновляет существующую запись об оборудовании.
     * @access Private (Developer Only)
     */
    router.put('/instruments/:id',
        param('id').isInt().withMessage('Некорректный ID.'),
        ...instrumentValidationRules, // Используем тот же набор правил
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const updatedInstrument = await instrumentService.update(req.params.id, req.body);
                res.json(updatedInstrument);
            } catch (err) {
                if (err.message === 'NOT_FOUND') {
                    return res.status(404).json({ error: 'Запись не найдена.' });
                }
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Оборудование с таким заводским номером уже существует.' });
                }
                next(err);
            }
        }
    );

    /**
     * @route DELETE /api/admin/instruments/:id
     * @desc Удаляет запись об оборудовании.
     * @access Private (Developer Only)
     */
    router.delete('/instruments/:id',
        param('id').isInt().withMessage('Некорректный ID.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                await instrumentService.delete(req.params.id);
                res.status(204).send();
            } catch (err) {
                if (err.message === 'NOT_FOUND') {
                    return res.status(404).json({ error: 'Запись не найдена.' });
                }
                next(err);
            }
        }
    );
    
    return router;
};