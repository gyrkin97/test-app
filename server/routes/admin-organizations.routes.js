// --- ФАЙЛ: server/routes/admin-organizations.routes.js ---

const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
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
 * Фабричная функция, которая создает и настраивает маршрутизатор для организаций.
 * @param {object} db - Экземпляр базы данных sqlite3.
 * @returns {object} - Настроенный экземпляр Express Router.
 */
module.exports = (db) => {
    const organizationService = require('../services/organizationService')(db);

    // Применяем middleware `isDev` ко всем маршрутам, начинающимся с /organizations.
    // Это гарантирует, что только разработчики могут получить доступ к этим эндпоинтам.
    router.use('/organizations', isDev);

    /**
     * @route GET /api/admin/organizations
     * @desc Получает список всех организаций.
     * @access Private (Developer Only)
     */
    router.get('/organizations', async (req, res, next) => {
        try {
            const organizations = await organizationService.getAll();
            res.json(organizations);
        } catch (err) {
            next(err); // Передаем ошибку в центральный обработчик
        }
    });

    /**
     * @route POST /api/admin/organizations
     * @desc Создает новую организацию.
     * @access Private (Developer Only)
     */
    router.post('/organizations', 
        // Цепочка валидации: проверяем, что 'name' не пустое после удаления пробелов.
        body('name').trim().notEmpty().withMessage('Название организации не может быть пустым.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                const newOrganization = await organizationService.create(req.body.name);
                res.status(201).json(newOrganization);
            } catch (err) {
                // Обрабатываем ошибку уникальности (если такая организация уже есть)
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Организация с таким названием уже существует.' });
                }
                next(err); // Другие ошибки передаем дальше
            }
    });

    /**
     * @route DELETE /api/admin/organizations/:id
     * @desc Удаляет организацию по ID.
     * @access Private (Developer Only)
     */
    router.delete('/organizations/:id', 
        // Валидация параметра URL: ID должен быть целым числом.
        param('id').isInt().withMessage('Некорректный ID организации.'),
        handleValidationErrors,
        async (req, res, next) => {
            try {
                await organizationService.delete(req.params.id);
                res.status(204).send(); // Успешное удаление без тела ответа
            } catch (err) {
                // Обрабатываем случай, когда организация для удаления не найдена
                if (err.message === 'NOT_FOUND') {
                    return res.status(404).json({ error: 'Организация не найдена.' });
                }
                next(err); // Другие ошибки передаем дальше
            }
    });
    
    return router;
};