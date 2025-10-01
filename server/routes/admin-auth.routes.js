// --- ФАЙЛ: server/routes/admin-auth.routes.js (НОВАЯ ВЕРСИЯ С РАЗДЕЛЕНИЕМ) ---

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');

module.exports = (db) => {

    /**
     * @route POST /api/admin/login
     * @desc Точка входа ТОЛЬКО для администратора тестов.
     * @access Public
     */
    router.post('/login',
        body('password').notEmpty().withMessage('Пароль не может быть пустым.'),
        async (req, res, next) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

            try {
                const { password } = req.body;
                const adminHash = process.env.ADMIN_PASSWORD_HASH;

                if (!adminHash) {
                    console.error("КРИТИЧЕСКАЯ ОШИБКА: Переменная ADMIN_PASSWORD_HASH не установлена.");
                    return res.status(500).json({ error: 'Ошибка конфигурации сервера.' });
                }

                const isAdminMatch = await bcrypt.compare(password, adminHash);
                if (isAdminMatch) {
                    req.session.isAdmin = true;
                    req.session.isDev = false; // Явно указываем, что это не разработчик
                    return res.json({ success: true, isDev: false });
                }

                res.status(401).json({ error: 'Неверный пароль' });
            } catch (error) {
                next(error);
            }
        }
    );
    
    /**
     * @route POST /api/admin/dev-login
     * @desc НОВАЯ точка входа ТОЛЬКО для разработчика (панель метрологии).
     * @access Public
     */
    router.post('/dev-login',
        body('password').notEmpty().withMessage('Пароль не может быть пустым.'),
        async (req, res, next) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
            
            try {
                const { password } = req.body;
                const devHash = process.env.DEV_PASSWORD_HASH;

                if (!devHash) {
                    console.error("КРИТИЧЕСКАЯ ОШИБКА: Переменная DEV_PASSWORD_HASH не установлена.");
                    return res.status(500).json({ error: 'Панель разработчика не настроена.' });
                }
                
                const isDevMatch = await bcrypt.compare(password, devHash);
                if (isDevMatch) {
                    req.session.isAdmin = true; // Разработчик имеет все права
                    req.session.isDev = true;
                    return res.json({ success: true, isDev: true });
                }

                res.status(401).json({ error: 'Неверный пароль' });
            } catch (error) {
                next(error);
            }
        }
    );


    /**
     * @route POST /api/admin/logout
     * @desc Уничтожает сессию пользователя.
     */
    router.post('/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) return res.status(500).json({ error: 'Не удалось выйти из системы.' });
            res.status(200).json({ success: true });
        });
    });

    /**
     * @route GET /api/admin/check-auth
     * @desc Проверяет, активна ли сессия.
     */
    router.get('/check-auth', (req, res) => {
        res.json({ 
            authenticated: !!req.session.isAdmin,
            isDev: !!req.session.isDev
        });
    });

    return router;
};