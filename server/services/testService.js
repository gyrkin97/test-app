// --- ФАЙЛ: server/services/testService.js (ПОСЛЕ ВСЕХ РЕФАКТОРИНГОВ) ---
// Этот сервис содержит всю бизнес-логику для управления тестами и их настройками.

const { v4: uuidv4 } = require('uuid');
const { sendEvent } = require('../utils/event-emitter'); // ИСПРАВЛЕН ПУТЬ

// Вспомогательные функции для работы с БД импортируются из центрального файла.
const { get, all, run } = require('../utils/dbUtils');

/**
 * Получает список всех тестов, а также флаг наличия результатов, ожидающих проверки.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<Array>} Массив объектов тестов.
 */
async function getAllTests(db) {
    const sql = `
        SELECT
            t.id,
            t.name,
            t.is_active,
            CASE WHEN COUNT(r.id) > 0 THEN 1 ELSE 0 END AS hasPendingReviews
        FROM tests t
        LEFT JOIN test_results r ON t.id = r.test_id AND r.status = 'pending_review'
        GROUP BY t.id
        ORDER BY t.created_at DESC
    `;
    
    const tests = await all(db, sql);
    tests.forEach(test => {
        test.hasPendingReviews = !!test.hasPendingReviews;
    });
    
    return tests;
}

/**
 * Создает новый тест и его настройки по умолчанию.
 * @param {string} name - Название нового теста.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<object>} Объект с данными нового теста.
 */
async function createTest(name, db) {
    const trimmedName = name.trim();
    if (!trimmedName) {
        throw new Error('EMPTY_NAME');
    }

    const newTest = {
        id: uuidv4(),
        name: trimmedName,
        createdAt: new Date().toISOString(),
        is_active: 0
    };
    
    await run(db, 'BEGIN TRANSACTION');
    try {
        await run(db, `INSERT INTO tests (id, name, created_at, is_active) VALUES (?, ?, ?, ?)`, 
            [newTest.id, newTest.name, newTest.createdAt, newTest.is_active]);
        
        await run(db, `INSERT INTO test_settings (test_id) VALUES (?)`, [newTest.id]);
        
        await run(db, 'COMMIT');

    } catch (err) {
        await run(db, 'ROLLBACK');
        throw err;
    }
        
    sendEvent({ action: 'created', payload: newTest }, 'tests-updated');
    return newTest;
}

/**
 * Переименовывает существующий тест.
 * @param {string} testId - UUID теста.
 * @param {string} newName - Новое название теста.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<{id: string, name: string}>}
 */
async function renameTest(testId, newName, db) {
    const trimmedName = newName.trim();
    if (!trimmedName) {
        throw new Error('EMPTY_NAME');
    }
    
    const result = await run(db, `UPDATE tests SET name = ? WHERE id = ?`, [trimmedName, testId]);
    
    if (result.changes === 0) {
        throw new Error('NOT_FOUND');
    }
    
    sendEvent({ action: 'renamed', testId, payload: { newName: trimmedName } }, 'tests-updated');
    return { id: testId, name: trimmedName };
}

/**
 * Изменяет статус публикации теста.
 * @param {string} testId - UUID теста.
 * @param {boolean} isActive - Новый статус.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<{id: string, isActive: boolean}>}
 */
async function updateTestStatus(testId, isActive, db) {
    const result = await run(db, `UPDATE tests SET is_active = ? WHERE id = ?`, [isActive ? 1 : 0, testId]);
    
    if (result.changes === 0) {
        throw new Error('NOT_FOUND');
    }

    sendEvent({ action: 'status_updated', testId, payload: { isActive } }, 'tests-updated');
    return { id: testId, isActive };
}

/**
 * Удаляет тест и все связанные с ним данные.
 * @param {string} testId - UUID теста.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<void>}
 */
async function deleteTest(testId, db) {
    const result = await run(db, `DELETE FROM tests WHERE id = ?`, [testId]);

    if (result.changes === 0) {
        throw new Error('NOT_FOUND');
    }
    sendEvent({ action: 'deleted', testId }, 'tests-updated');
}

/**
 * Получает настройки для конкретного теста.
 * @param {string} testId - UUID теста.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<object>}
 */
async function getTestSettings(testId, db) {
    const settings = await get(db, `SELECT * FROM test_settings WHERE test_id = ?`, [testId]);
    if (!settings) {
        throw new Error('NOT_FOUND');
    }
    return settings;
}

/**
 * Сохраняет настройки для конкретного теста.
 * @param {string} testId - UUID теста.
 * @param {object} settingsData - Данные настроек.
 * @param {object} db - Экземпляр базы данных.
 * @returns {Promise<void>}
 */
async function saveTestSettings(testId, settingsData, db) {
    const { duration_minutes, passing_score, questions_per_test } = settingsData;

    if (!duration_minutes || !passing_score || !questions_per_test || duration_minutes <= 0 || passing_score <= 0 || questions_per_test <= 0) {
        throw new Error('INVALID_SETTINGS');
    }
    
    await run(db, `
        UPDATE test_settings 
        SET duration_minutes = ?, passing_score = ?, questions_per_test = ? 
        WHERE test_id = ?`,
        [duration_minutes, passing_score, questions_per_test, testId]
    );
    sendEvent({}, 'tests-updated');
}


/**
 * Фабричная функция для создания сервиса тестов.
 * @param {object} db - Экземпляр базы данных SQLite3.
 * @returns {object} Объект сервиса.
 */
module.exports = (db) => {
    return {
        getAll: () => getAllTests(db),
        create: (name) => createTest(name, db),
        rename: (testId, newName) => renameTest(testId, newName, db),
        updateStatus: (testId, isActive) => updateTestStatus(testId, isActive, db),
        delete: (testId) => deleteTest(testId, db),
        getSettings: (testId) => getTestSettings(testId, db),
        saveSettings: (testId, settingsData) => saveTestSettings(testId, settingsData, db)
    };
};