// --- ФАЙЛ: server/services/reviewService.js (ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ) ---

const { run, get, all } = require('../utils/dbUtils');
const { sendEvent } = require('../utils/event-emitter');

/**
 * Получает список вопросов с открытыми ответами, ожидающих ручной проверки.
 * @param {number} resultId - ID результата теста.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<Array>} Массив объектов для проверки.
 */
async function getPendingReviews(resultId, db) {
    const sql = `SELECT ta.id as answerId, q.text as questionText, q.explain as questionExplanation, ta.user_answer as userAnswer FROM test_answers ta JOIN questions q ON ta.question_id = q.id WHERE ta.result_id = ? AND ta.review_status = 'pending'`;
    const rows = await all(db, sql, [resultId]);
    rows.forEach(row => {
        row.userAnswer = JSON.parse(row.userAnswer || '[""]')[0] || '';
    });
    return rows;
}

/**
 * Принимает массив вердиктов и обрабатывает их в одной транзакции.
 * @param {Array<{answerId: number, isCorrect: boolean}>} verdicts - Массив вердиктов.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<{success: boolean, isFinalized: boolean}>}
 */
async function submitBatchVerdict(verdicts, db) {
    if (!verdicts || verdicts.length === 0) {
        return { success: true, isFinalized: false };
    }
    
    // ИСПРАВЛЕНИЕ: Ленивая загрузка protocolService для избежания циклических зависимостей
    const protocolServiceFactory = require('./protocolService');
    const protocolService = protocolServiceFactory(db);

    await run(db, 'BEGIN TRANSACTION');
    try {
        // Получаем ID результата из первого же ответа. Все ответы в пакете относятся к одному результату.
        const firstAnswerId = verdicts[0].answerId;
        const resultInfo = await get(db, `SELECT result_id FROM test_answers WHERE id = ?`, [firstAnswerId]);
        if (!resultInfo) {
            throw new Error('Результат не найден или уже проверен.');
        }
        const { result_id: resultId } = resultInfo;

        // 1. Обновляем все ответы в цикле
        for (const verdict of verdicts) {
            const { answerId, isCorrect } = verdict;
            const newStatus = isCorrect ? 'manual_correct' : 'manual_incorrect';
            await run(db, `UPDATE test_answers SET review_status = ?, is_correct = ? WHERE id = ? AND review_status = 'pending'`, [newStatus, isCorrect ? 1 : 0, answerId]);
        }

        // 2. Проверяем, остались ли еще ответы на проверке в этом тесте (после всех обновлений)
        const pendingCountRow = await get(db, `SELECT COUNT(*) as count FROM test_answers WHERE result_id = ? AND review_status = 'pending'`, [resultId]);
        
        let isFinalized = false;
        // 3. Если ответов на проверке больше не осталось - финализируем результат
        if (pendingCountRow && pendingCountRow.count === 0) {
            isFinalized = true;
            const resultDetails = await get(db, `SELECT total, test_id FROM test_results WHERE id = ?`, [resultId]);
            const correctAnswersRow = await get(db, `SELECT COUNT(*) as count FROM test_answers WHERE result_id = ? AND is_correct = 1`, [resultId]);
            const settings = await get(db, `SELECT passing_score FROM test_settings WHERE test_id = ?`, [resultDetails.test_id]);
            
            const finalScore = correctAnswersRow.count;
            const finalPercentage = resultDetails.total > 0 ? Math.round((finalScore / resultDetails.total) * 100) : 0;
            const isNowPassed = (finalScore >= (settings?.passing_score || 1)) ? 1 : 0;
            
            await run(db, `UPDATE test_results SET score = ?, percentage = ?, status = 'completed', passed = ? WHERE id = ?`, [finalScore, finalPercentage, isNowPassed, resultId]);
            
            const { summary, protocol } = await protocolService.getProtocolForUser(resultId);
            sendEvent({ resultId, finalResultData: { ...summary, protocolData: protocol } }, 'result-reviewed');
        }

        await run(db, 'COMMIT');
        return { success: true, isFinalized };

    } catch (err) {
        await run(db, 'ROLLBACK');
        throw err;
    }
}

/**
 * Фабричная функция для создания сервиса ручной проверки.
 * @param {object} db - Экземпляр базы данных.
 * @returns {object} - Объект с методами сервиса.
 */
module.exports = (db) => {
    return {
        getPending: (resultId) => getPendingReviews(resultId, db),
        submitBatchVerdict: (verdicts) => submitBatchVerdict(verdicts, db)
    };
};