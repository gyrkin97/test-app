// --- ФАЙЛ: server/services/testTakingService.js (ПОСЛЕ РЕФАКТОРИНГА) ---
// Этот сервис инкапсулирует всю бизнес-логику, связанную с процессом прохождения теста.

// УЛУЧШЕНИЕ: Импортируем централизованные утилиты для работы с БД.
const { get, all, run } = require('../utils/dbUtils');

/**
 * Фабричная функция, которая создает экземпляр сервиса.
 * @param {object} db - Экземпляр базы данных sqlite3.
 * @returns {object} - Объект с методами сервиса.
 */
module.exports = (db) => {
    // УЛУЧШЕНИЕ: Локальные промисификации и функция 'run' удалены.

    /**
     * Формирует детальный протокол для теста, который был полностью проверен автоматически.
     * @param {object} db - Экземпляр базы данных.
     * @param {Array} answerDetails - Массив с деталями ответов пользователя.
     * @param {Map} correctQuestionsMap - Map с полной информацией о вопросах.
     * @returns {Promise<Array>} - Массив объектов протокола.
     */
    async function buildProtocol(db, answerDetails, correctQuestionsMap) {
        const protocolData = [];
        const checkboxQuestionIds = [];

        answerDetails.forEach(detail => {
            const questionInfo = correctQuestionsMap.get(detail.questionId);
            if (!questionInfo) return;

            const questionType = questionInfo.type || 'checkbox';
            if (questionType === 'checkbox') {
                checkboxQuestionIds.push(questionInfo.id);
            }
            
            protocolData.push({
                questionId: questionInfo.id,
                questionText: questionInfo.text,
                chosenAnswerIds: JSON.parse(detail.userAnswer || '[]'),
                isCorrect: detail.isCorrect,
                explanation: questionInfo.explain,
                type: questionType,
                match_prompts: JSON.parse(questionInfo.match_prompts || '[]'),
                correct_answers_match: JSON.parse(questionInfo.match_answers || '[]'),
                chosen_answers_match: JSON.parse(detail.userAnswer || '[]')
            });
        });

        if (checkboxQuestionIds.length > 0) {
            const placeholders = checkboxQuestionIds.map(() => '?').join(',');
            const optionsSql = `SELECT id, text FROM options WHERE question_id IN (${placeholders})`;
            const optionsRows = await all(db, optionsSql, checkboxQuestionIds);
            
            const optionsTextMap = new Map(optionsRows.map(o => [o.id, o.text]));

            protocolData.forEach(item => {
                if (item.type === 'checkbox') {
                    item.chosenAnswerText = (item.chosenAnswerIds || []).map(id => optionsTextMap.get(id) || '[ответ удален]').join(', ') || '— ответ не выбран —';
                    
                    const qInfo = correctQuestionsMap.get(item.questionId);
                    const correctKeys = JSON.parse(qInfo.correct_option_key || '[]' );
                    
                    item.correctAnswerText = correctKeys
                        .map(key => optionsTextMap.get(`${item.questionId}-${key}`) || '[ответ удален]')
                        .join(', ');
                }
            });
        }
        
        return protocolData.map(({ chosenAnswerIds, ...rest }) => ({ ...rest }));
    }

    /**
     * Получает случайный набор вопросов и настройки для указанного теста.
     * @param {string} testId - ID теста.
     * @returns {Promise<{questions: Array, duration: number}>} Объект с вопросами и длительностью.
     * @throws {Error} Если настройки для теста не найдены.
     */
    async function getTestQuestions(testId) {
        const settingsSql = `SELECT duration_minutes, questions_per_test FROM test_settings WHERE test_id = ?`;
        const settings = await get(db, settingsSql, [testId]);
        
        if (!settings) {
            throw new Error('Настройки для данного теста не найдены.');
        }

        const questionsCount = settings.questions_per_test;
        const sqlIds = `SELECT id FROM questions WHERE test_id = ? ORDER BY RANDOM() LIMIT ?`;
        const questionRows = await all(db, sqlIds, [testId, questionsCount]);
        
        if (questionRows.length === 0) {
            return { questions: [], duration: settings.duration_minutes * 60 };
        }

        const questionIds = questionRows.map(q => q.id);
        const placeholders = questionIds.map(() => '?').join(',');

        const sqlQuestionsWithOptions = `
            SELECT q.id, q.text, q.type, q.match_prompts, q.match_answers,
                   o.id as option_id, o.text as option_text
            FROM questions q
            LEFT JOIN options o ON q.id = o.question_id
            WHERE q.id IN (${placeholders})
        `;

        const rows = await all(db, sqlQuestionsWithOptions, questionIds);
        
        const questionsMap = new Map();
        rows.forEach(row => {
            if (!questionsMap.has(row.id)) {
                questionsMap.set(row.id, {
                    id: row.id,
                    text: row.text,
                    type: row.type,
                    match_prompts: JSON.parse(row.match_prompts || '[]'),
                    match_answers: JSON.parse(row.match_answers || '[]'),
                    options: []
                });
            }
            if(row.option_id) {
                questionsMap.get(row.id).options.push({ id: row.option_id, text: row.option_text });
            }
        });
        
        const fullQuestions = questionIds.map(id => questionsMap.get(id)).filter(Boolean);
        return { questions: fullQuestions, duration: settings.duration_minutes * 60 };
    }

    /**
     * Обрабатывает отправку ответов, проверяет их, сохраняет результат в БД и возвращает итог.
     * @param {string} testId - ID теста.
     * @param {string} fio - ФИО пользователя.
     * @param {Array} userAnswers - Массив ответов пользователя.
     * @returns {Promise<object>} Объект с полным результатом теста.
     * @throws {Error} В случае различных ошибок.
     */
    async function submitTest(testId, fio, userAnswers) {
        const settings = await get(db, `SELECT * FROM test_settings WHERE test_id = ?`, [testId]);
        if (!settings) {
            throw new Error('Тест не найден.');
        }

        if (!fio || !userAnswers) {
            throw new Error('ФИО и ответы обязательны.');
        }
        
        // ИСПРАВЛЕНИЕ: Проверка на повторное прохождение теста
        // Проверяем, не сдал ли пользователь уже этот тест успешно
        const existingResult = await get(db, 
            `SELECT id, passed FROM test_results 
             WHERE test_id = ? AND fio = ? COLLATE NOCASE AND passed = 1
             ORDER BY date DESC LIMIT 1`,
            [testId, fio.trim()]
        );

        if (existingResult) {
            throw new Error('Вы уже успешно сдали этот тест. Повторное прохождение не требуется.');
        }
        
        const questionIds = userAnswers.map(a => a.questionId).filter(id => id);
        if (questionIds.length === 0) { 
            return {
                fio, score: 0, total: 0, percentage: 0,
                protocolData: [], passed: false, status: 'completed'
            };
        }

        // Ключевое исправление безопасности: загружаем вопросы, строго проверяя их принадлежность к testId.
        const placeholders = questionIds.map(() => '?').join(',');
        const questionsSql = `SELECT id, text, explain, type, correct_option_key, match_prompts, match_answers FROM questions WHERE test_id = ? AND id IN (${placeholders})`;
        const questionsFromDb = await all(db, questionsSql, [testId, ...questionIds]);
        
        let score = 0;
        let hasPendingAnswers = false;
        const correctQuestionsMap = new Map(questionsFromDb.map(q => [q.id, q]));
        
        const answerDetailsToSave = userAnswers.map(userAnswer => {
            const questionInfo = correctQuestionsMap.get(userAnswer.questionId);
            if (!questionInfo) return null;

            let isCorrect = false;
            let reviewStatus = 'auto';
            const questionType = questionInfo.type || 'checkbox';

            if (questionType === 'text_input') {
                hasPendingAnswers = true;
                reviewStatus = 'pending';
                isCorrect = false;
            } else if (questionType === 'match') {
                const correctOrder = JSON.parse(questionInfo.match_answers || '[]' );
                const userOrder = userAnswer.answerIds || [];
                isCorrect = correctOrder.length === userOrder.length && 
                            correctOrder.every((text, i) => text.trim().toLowerCase() === (userOrder[i] || '').trim().toLowerCase());
            } else { // checkbox
                const correctLogicalKeys = JSON.parse(questionInfo.correct_option_key || '[]');
                const userLogicalKeys = (userAnswer.answerIds || []).map(fullId => fullId.substring(userAnswer.questionId.length + 1));
                isCorrect = correctLogicalKeys.length === userLogicalKeys.length && correctLogicalKeys.every(key => userLogicalKeys.includes(key));
            }
            
            if (isCorrect && reviewStatus === 'auto') {
                score++;
            }
            
            return {
                questionId: questionInfo.id,
                userAnswer: JSON.stringify(userAnswer.answerIds),
                isCorrect: isCorrect,
                reviewStatus: reviewStatus
            };
        }).filter(Boolean);
        
        const total = answerDetailsToSave.length;
        const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
        const date = new Date().toISOString();
        const overallStatus = hasPendingAnswers ? 'pending_review' : 'completed';
        const isPassed = !hasPendingAnswers && (score >= settings.passing_score);
        
        await run(db, 'BEGIN TRANSACTION');
        try {
            const resultInsert = await run(db,
                `INSERT INTO test_results (test_id, fio, score, total, percentage, date, status, passed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [testId, fio, score, total, percentage, date, overallStatus, isPassed ? 1 : 0]
            );
            const resultId = resultInsert.lastID;

            const insertAnswerSql = `INSERT INTO test_answers (result_id, question_id, user_answer, is_correct, review_status) VALUES (?, ?, ?, ?, ?)`;
            const insertPromises = answerDetailsToSave.map(detail => 
                run(db, insertAnswerSql, [resultId, detail.questionId, detail.userAnswer, detail.isCorrect ? 1 : 0, detail.reviewStatus])
            );
            await Promise.all(insertPromises);

            await run(db, 'COMMIT');

            let protocolData = [];
            if (overallStatus === 'completed') {
                // УЛУЧШЕНИЕ: Передаем 'db' в buildProtocol
                protocolData = await buildProtocol(db, answerDetailsToSave, correctQuestionsMap);
            }

            return {
                status: overallStatus, resultId, fio, score, total, percentage, passed: isPassed, protocolData
            };

        } catch (err) {
            await run(db, 'ROLLBACK');
            throw err;
        }
    }

    // Возвращаем объект с публичными методами сервиса
    return {
        getTestQuestions,
        submitTest
    };
};