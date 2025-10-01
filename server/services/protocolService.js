// --- ФАЙЛ: server/services/protocolService.js (ПОСЛЕ РЕФАКТОРИНГА) ---
// Этот сервис отвечает за сбор и формирование детального протокола теста.

// УЛУЧШЕНИЕ: Импортируем централизованные утилиты для работы с БД.
const { get, all } = require('../utils/dbUtils');

/**
 * Собирает полный протокол для указанного результата теста, включая
 * тексты вопросов, ответы пользователя, правильные ответы и пояснения.
 * @param {number} resultId - ID результата теста в базе данных.
 * @param {object} db - Экземпляр базы данных sqlite3.
 * @returns {Promise<{summary: object, protocol: Array}>} Объект, содержащий общие результаты (summary) и детальный протокол по каждому вопросу.
 * @throws {Error} Выбрасывает ошибку с сообщением 'NOT_FOUND', если результат не найден.
 */
async function getProtocolForUser(resultId, db) {
    // УЛУЧШЕНИЕ: Локальные промисификации удалены.

    // 1. Получаем общую информацию о результате теста, включая название теста и проходной балл
    const sqlResult = `
        SELECT r.fio, r.test_id, r.score, r.total, r.percentage, r.passed, r.status, r.date,
               s.passing_score, t.name as test_name
        FROM test_results r
        LEFT JOIN tests t ON r.test_id = t.id
        LEFT JOIN test_settings s ON r.test_id = s.test_id
        WHERE r.id = ?
    `;
    const resultSummaryData = await get(db, sqlResult, [resultId]);
    if (!resultSummaryData) {
        throw new Error('NOT_FOUND');
    }

    // 2. Получаем все ответы пользователя для данного результата, объединяя с данными вопросов
    const sqlProtocol = `
        SELECT
            q.id AS question_id, q.text AS question_text, q.explain AS explanation,
            q.correct_option_key, q.type as question_type, q.match_prompts, q.match_answers,
            ta.user_answer, ta.is_correct, ta.review_status
        FROM test_answers ta
        LEFT JOIN questions q ON q.id = ta.question_id
        WHERE ta.result_id = ?
    `;
    const answerRows = await all(db, sqlProtocol, [resultId]);

    // Собираем уникальные ID вопросов, чтобы одним запросом получить все варианты ответов
    const questionIds = [...new Set(answerRows.map(r => r.question_id).filter(Boolean))];
    
    // Группируем варианты ответов по ID вопроса для быстрого доступа
    const optionsByQuestion = {};
    if (questionIds.length > 0) {
        const placeholders = questionIds.map(() => '?').join(',');
        const optionRows = await all(db, `SELECT id, question_id, text FROM options WHERE question_id IN (${placeholders})`, questionIds);
        
        optionRows.forEach(opt => {
            if (!optionsByQuestion[opt.question_id]) {
                optionsByQuestion[opt.question_id] = [];
            }
            optionsByQuestion[opt.question_id].push(opt);
        });
    }

    // 4. Формируем финальный массив протокола, преобразуя данные в человекочитаемый вид
    const protocolData = answerRows.map(row => {
        let chosenAnswerText = '— ответ не выбран —';
        let correctAnswerText = '';

        const userAnswerParsed = JSON.parse(row.user_answer || '[]');

        if (row.question_type === 'match') {
            correctAnswerText = (JSON.parse(row.match_answers || '[]')).join('; ');
            chosenAnswerText = userAnswerParsed.join('; ');
        } else if (row.question_type === 'text_input') {
            chosenAnswerText = userAnswerParsed[0] || '';
            correctAnswerText = row.review_status !== 'pending' ? '[Проверено вручную]' : '[Ожидает проверки]';
        } else { // checkbox
            const correctKeys = JSON.parse(row.correct_option_key || '[]');
            const allOptions = optionsByQuestion[row.question_id] || [];
            
            const getOptionText = (fullId) => allOptions.find(o => o.id === fullId)?.text || `[опция удалена]`;

            // Находим тексты правильных ответов
            correctAnswerText = allOptions
                .filter(opt => correctKeys.includes(opt.id.substring(row.question_id.length + 1)))
                .map(o => o.text)
                .join(', ');

            // Находим тексты ответов пользователя
            chosenAnswerText = userAnswerParsed.map(getOptionText).join(', ') || '— ответ не выбран —';
        }
        
        return {
            questionText: row.question_text || 'Текст вопроса удален или не найден',
            chosenAnswerText,
            correctAnswerText,
            isCorrect: !!row.is_correct,
            explanation: row.explanation,
            type: row.question_type,
            match_prompts: JSON.parse(row.match_prompts || '[]'),
            chosen_answers_match: userAnswerParsed,
            correct_answers_match: JSON.parse(row.match_answers || '[]')
        };
    });
    
    // 5. Формируем итоговую сводку (summary)
    const summary = {
        testName: resultSummaryData.test_name,
        fio: resultSummaryData.fio,
        score: resultSummaryData.score,
        total: resultSummaryData.total,
        percentage: resultSummaryData.percentage,
        date: resultSummaryData.date,
        status: resultSummaryData.status,
        passed: !!resultSummaryData.passed,
        passingScore: resultSummaryData.passing_score
    };

    return { summary, protocol: protocolData };
}

/**
 * Экспортируем фабричную функцию (паттерн "Фабрика").
 * Она принимает зависимость (db) и возвращает объект с методами сервиса.
 * Это делает сервис независимым от глобального состояния и легко тестируемым.
 * @param {object} db - Экземпляр базы данных sqlite3.
 * @returns {{getProtocolForUser: function}} - Объект с методами сервиса.
 */
module.exports = (db) => {
    return {
        getProtocolForUser: (resultId) => getProtocolForUser(resultId, db)
    };
};