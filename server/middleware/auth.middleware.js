/**
 * Middleware для проверки, аутентифицирован ли пользователь как администратор.
 */
exports.isAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

/**
 * Middleware для проверки, аутентифицирован ли пользователь как разработчик.
 */
exports.isDev = (req, res, next) => {
    if (req.session.isAdmin && req.session.isDev) {
        return next();
    }
    // Если авторизован, но не разработчик - 403 Forbidden.
    // Если не авторизован вовсе - 401 Unauthorized.
    res.status(req.session.isAdmin ? 403 : 401).json({ error: 'Доступ запрещен' });
};