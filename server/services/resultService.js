// --- ФАЙЛ: server/services/resultService.js (ПОСЛЕ РЕФАКТОРИНГА И С ИСПРАВЛЕНИЕМ БЕЗОПАСНОСТИ) ---
// Этот сервис инкапсулирует всю логику для получения и управления результатами тестов.

// УЛУЧШЕНИЕ: Импортируем централизованные утилиты для работы с БД.
const { get, all, run } = require('../utils/dbUtils');

module.exports = (db) => {
    return {
        /**
         * Получает отфильтрованные, отсортированные и пагинированные результаты.
         * @param {string} testId - ID теста.
         * @param {object} options - Опции { search, sort, order, page, limit }.
         * @returns {Promise<object>} - Объект с результатами и информацией о пагинации.
         */
        async getPaginatedResults(testId, options = {}) {
            const { search = '', sort = 'date', order = 'desc', page = 1, limit = 10 } = options;

            // --- ИСПРАВЛЕНИЕ БЕЗОПАСНОСТИ: Защита от SQL-инъекций в ORDER BY ---
            // Создаем "белый список" колонок, по которым разрешена сортировка.
            const allowedSortColumns = {
                id: 'id',
                fio: 'fio',
                score: 'score',
                percentage: 'percentage',
                date: 'date',
                status: 'status'
            };
            const sortColumn = allowedSortColumns[sort] || 'date'; // Используем 'date' по умолчанию, если пришло невалидное значение.
            const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC'; // Разрешаем только ASC или DESC.
            // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

            const offset = (page - 1) * limit;

            const params = [testId];
            let whereClause = 'WHERE test_id = ?';
            if (search) {
                whereClause += ` AND fio LIKE ? COLLATE NOCASE`;
                params.push(`%${search}%`);
            }
            
            // Запрос для получения общего количества результатов (для пагинации)
            const countSql = `SELECT COUNT(*) as total FROM test_results ${whereClause}`;
            const countRow = await get(db, countSql, params);
            const totalResults = countRow?.total || 0;
            const totalPages = Math.ceil(totalResults / limit);

            // Запрос для получения самих результатов
            const resultsSql = `
                SELECT id, fio, score, total, percentage, date, status, passed 
                FROM test_results 
                ${whereClause} 
                ORDER BY ${sortColumn} ${sortOrder} 
                LIMIT ? OFFSET ?`;
            
            const rows = await all(db, resultsSql, [...params, limit, offset]);

            return {
                results: rows,
                totalPages: Math.max(1, totalPages),
                currentPage: parseInt(page, 10)
            };
        },

        /**
         * НОВЫЙ МЕТОД: Удаляет результаты тестов по массиву их ID.
         * Логика перенесена из файла роутов для соблюдения архитектуры.
         * @param {Array<number>} ids - Массив ID результатов для удаления.
         * @returns {Promise<{changes: number}>} - Количество удаленных строк.
         */
        async deleteByIds(ids) {
            if (!ids || ids.length === 0) {
                return { changes: 0 };
            }
            const placeholders = ids.map(() => '?').join(',');
            const result = await run(db, `DELETE FROM test_results WHERE id IN (${placeholders})`, ids);
            return { changes: result.changes };
        }
    };
};