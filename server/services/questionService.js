// --- ФАЙЛ: server/services/questionService.js (ПОСЛЕ РЕФАКТОРИНГА) ---
// Этот сервис содержит всю бизнес-логику для управления вопросами.

const util = require('util'); // Оставляем для работы с prepared statements
const { v4: uuidv4 } = require('uuid');
// УЛУЧШЕНИЕ: Импортируем централизованные утилиты для работы с БД.
const { run, all } = require('../utils/dbUtils');

/**
 * Получает все вопросы для указанного теста, агрегируя их варианты ответов.
 * @param {string} testId - UUID теста.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<Array<object>>} Массив объектов вопросов.
 */
async function getAllQuestionsForTest(testId, db) {
    // УЛУЧШЕНИЕ: Локальная промисификация удалена.
    
    const sql = `
        SELECT 
            q.id, q.text, q.explain, q.type,
            q.correct_option_key, q.match_prompts, q.match_answers,
            -- Агрегируем все опции для каждого вопроса в одну строку для парсинга
            GROUP_CONCAT(o.id || '::' || o.text, '||') as options_agg
        FROM questions q
        LEFT JOIN options o ON q.id = o.question_id
        WHERE q.test_id = ?
        GROUP BY q.id
        ORDER BY q.text`;

    const rows = await all(db, sql, [testId]);
    
    // Преобразуем плоский результат из БД в структурированные объекты
    const questions = rows.map(row => {
        let options = [];
        if (row.options_agg) {
            options = row.options_agg.split('||').map(optStr => {
                const [id, ...textParts] = optStr.split('::');
                return { id, text: textParts.join('::') };
            });
        }

        return {
            id: row.id,
            text: row.text,
            explain: row.explain,
            type: row.type || 'checkbox',
            correct: JSON.parse(row.correct_option_key || '[]'),
            match_prompts: JSON.parse(row.match_prompts || '[]'),
            match_answers: JSON.parse(row.match_answers || '[]'),
            options: options,
        };
    });

    return questions;
}

/**
 * Сохраняет (создает или обновляет) вопрос в базе данных.
 * Управляет транзакцией для обеспечения целостности данных.
 * @param {string|null} testId - ID теста (только для новых вопросов).
 * @param {object} questionData - Объект вопроса.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<object>} Сохраненный объект вопроса.
 * @throws {Error} В случае ошибки базы данных.
 */
async function saveQuestion(testId, questionData, db) {
    // УЛУЧШЕНИЕ: Локальная промисификация run удалена.
    
    // Если это новый вопрос, генерируем для него UUID
    const questionId = questionData.id || uuidv4();
    const isNewQuestion = !questionData.id;

    const question = { ...questionData, id: questionId };

    await run(db, 'BEGIN TRANSACTION');
    try {
        const commonFields = [question.text, question.explain];
        let sql, params;

        // Определяем SQL-запрос в зависимости от типа вопроса и от того, новый он или нет
        if (question.type === 'match') {
            const promptsJSON = JSON.stringify(question.match_prompts || []);
            const answersJSON = JSON.stringify(question.match_answers || []);
            if (isNewQuestion) {
                sql = `INSERT INTO questions (id, test_id, text, explain, type, match_prompts, match_answers, correct_option_key) VALUES (?, ?, ?, ?, 'match', ?, ?, '[]')`;
                params = [question.id, testId, ...commonFields, promptsJSON, answersJSON];
            } else {
                sql = `UPDATE questions SET text = ?, explain = ?, type = 'match', match_prompts = ?, match_answers = ?, correct_option_key = '[]' WHERE id = ?`;
                params = [...commonFields, promptsJSON, answersJSON, question.id];
            }
        } else if (question.type === 'text_input') {
             if (isNewQuestion) {
                sql = `INSERT INTO questions (id, test_id, text, explain, type, correct_option_key) VALUES (?, ?, ?, ?, 'text_input', '[]')`;
                params = [question.id, testId, ...commonFields];
            } else {
                sql = `UPDATE questions SET text = ?, explain = ?, type = 'text_input', correct_option_key = '[]' WHERE id = ?`;
                params = [...commonFields, question.id];
            }
        } else { // checkbox
            const correctOptionKeyJSON = JSON.stringify(question.correct || []);
            if (isNewQuestion) {
                sql = `INSERT INTO questions (id, test_id, text, explain, type, correct_option_key) VALUES (?, ?, ?, ?, 'checkbox', ?)`;
                params = [question.id, testId, ...commonFields, correctOptionKeyJSON];
            } else {
                sql = `UPDATE questions SET text = ?, explain = ?, type = 'checkbox', correct_option_key = ? WHERE id = ?`;
                params = [...commonFields, correctOptionKeyJSON, question.id];
            }
        }
        
        await run(db, sql, params);

        // Перед вставкой новых вариантов ответов, удаляем все старые для этого вопроса
        await run(db, `DELETE FROM options WHERE question_id = ?`, [question.id]);

        if (question.type === 'checkbox' && question.options && question.options.length > 0) {
            // Эта часть остается без изменений, т.к. работает с объектом 'statement', а не напрямую с 'db'
            const insertOptionStmt = db.prepare(`INSERT INTO options (id, question_id, text) VALUES (?, ?, ?)`);
            
            for (const opt of question.options) {
                if (opt.text.trim()) { // Вставляем только непустые варианты
                    const shortKey = opt.id.split('-').pop() || uuidv4();
                    await util.promisify(insertOptionStmt.run.bind(insertOptionStmt))([`${question.id}-${shortKey}`, question.id, opt.text.trim()]);
                }
            }
            await util.promisify(insertOptionStmt.finalize.bind(insertOptionStmt))();
        }
        
        await run(db, 'COMMIT');
        return question;
    } catch (err) {
        await run(db, 'ROLLBACK');
        // Пробрасываем ошибку выше, чтобы роутер мог ее поймать
        throw err;
    }
}

/**
 * Удаляет вопросы по их ID.
 * @param {Array<string>} ids - Массив UUID вопросов для удаления.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<void>}
 */
async function deleteQuestionsByIds(ids, db) {
    // УЛУЧШЕНИЕ: Локальная промисификация run удалена.
    
    // Используем плейсхолдеры для безопасного удаления множества записей
    const placeholders = ids.map(() => '?').join(',');
    await run(db, `DELETE FROM questions WHERE id IN (${placeholders})`, ids);
}


/**
 * Фабричная функция для создания сервиса вопросов.
 * @param {object} db - Экземпляр базы данных.
 * @returns {{
 *  getAllForTest: function(string): Promise<Array<object>>,
 *  create: function(string, object): Promise<object>,
 *  update: function(object): Promise<object>,
 *  deleteByIds: function(Array<string>): Promise<void>
 * }} - Объект с методами сервиса.
 */
module.exports = (db) => {
    return {
        getAllForTest: (testId) => getAllQuestionsForTest(testId, db),
        create: (testId, questionData) => saveQuestion(testId, questionData, db),
        update: (questionData) => saveQuestion(null, questionData, db),
        deleteByIds: (ids) => deleteQuestionsByIds(ids, db)
    };
};