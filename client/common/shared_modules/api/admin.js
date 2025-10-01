// --- ФАЙЛ: client/common/shared_modules/api/admin.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Модуль API для всех эндпоинтов панели администрирования тестов.

import { apiFetch } from './api-core.js';

// =================================================================
// === УПРАВЛЕНИЕ ТЕСТАМИ (КОНТЕЙНЕРАМИ) ===
// =================================================================

/**
 * Получает список всех тестов с сервера.
 * @returns {Promise<Array<object>>} Массив объектов тестов.
 */
export const fetchTests = () => apiFetch('/api/admin/tests');

/**
 * Создает новый тест с указанным названием.
 * @param {string} name - Название нового теста.
 * @returns {Promise<object>} Объект с данными созданного теста.
 */
export const createTest = (name) => apiFetch('/api/admin/tests', { 
    method: 'POST', 
    body: JSON.stringify({ name }) 
});

/**
 * Переименовывает существующий тест.
 * @param {string} testId - UUID теста.
 * @param {string} name - Новое название теста.
 * @returns {Promise<object>} Ответ сервера.
 */
export const renameTest = (testId, name) => apiFetch(`/api/admin/tests/${testId}/rename`, { 
    method: 'PUT', 
    body: JSON.stringify({ name }) 
});

/**
 * Удаляет тест и все связанные с ним данные (вопросы, результаты).
 * @param {string} testId - UUID теста для удаления.
 * @returns {Promise<object>} Ответ сервера.
 */
export const deleteTest = (testId) => apiFetch(`/api/admin/tests/${testId}`, { method: 'DELETE' });

/**
 * Обновляет статус публикации теста (активен/неактивен).
 * @param {string} testId - UUID теста.
 * @param {boolean} isActive - Новый статус (true - активен, false - черновик).
 * @returns {Promise<object>} Ответ сервера.
 */
export const updateTestStatus = (testId, isActive) => apiFetch(`/api/admin/tests/${testId}/status`, { 
    method: 'PUT', 
    body: JSON.stringify({ isActive }) 
});

// =================================================================
// === УПРАВЛЕНИЕ НАСТРОЙКАМИ ТЕСТА ===
// =================================================================

/**
 * Получает настройки для конкретного теста.
 * @param {string} testId - UUID теста.
 * @returns {Promise<object>} Объект с настройками (длительность, проходной балл и т.д.).
 */
export const fetchTestSettings = (testId) => apiFetch(`/api/admin/tests/${testId}/settings`);

/**
 * Сохраняет новые настройки для теста.
 * @param {string} testId - UUID теста.
 * @param {object} settingsData - Объект с новыми настройками.
 * @returns {Promise<object>} Ответ сервера.
 */
export const saveTestSettings = (testId, settingsData) => apiFetch(`/api/admin/tests/${testId}/settings`, {
    method: 'POST', 
    body: JSON.stringify(settingsData)
});

// =================================================================
// === УПРАВЛЕНИЕ ВОПРОСАМИ ===
// =================================================================

/**
 * Получает все вопросы для указанного теста.
 * @param {string} testId - UUID теста.
 * @returns {Promise<Array<object>>} Массив объектов вопросов.
 */
export const fetchAllQuestions = (testId) => apiFetch(`/api/admin/tests/${testId}/questions`);

/**
 * Добавляет новый вопрос в тест.
 * @param {string} testId - UUID теста, к которому добавляется вопрос.
 * @param {object} questionData - Объект с данными нового вопроса.
 * @returns {Promise<object>} Объект с данными созданного вопроса.
 */
export const addQuestion = (testId, questionData) => apiFetch(`/api/admin/tests/${testId}/questions/add`, {
    method: 'POST', 
    body: JSON.stringify(questionData)
});

/**
 * Обновляет существующий вопрос.
 * @param {object} questionData - Объект с обновленными данными вопроса (должен содержать ID вопроса).
 * @returns {Promise<object>} Ответ сервера.
 */
export const updateQuestion = (questionData) => apiFetch('/api/admin/questions/update', {
    method: 'POST', 
    body: JSON.stringify(questionData)
});

/**
 * Удаляет несколько вопросов по их ID.
 * @param {Array<string>} ids - Массив UUID вопросов для удаления.
 * @returns {Promise<object>} Ответ сервера.
 */
export const deleteQuestions = (ids) => apiFetch('/api/admin/questions/delete-bulk', {
    method: 'POST', 
    body: JSON.stringify({ ids })
});

// =================================================================
// === УПРАВЛЕНИЕ РЕЗУЛЬТАТАМИ И РУЧНОЙ ПРОВЕРКОЙ ===
// =================================================================

/**
 * Получает пагинированный и отфильтрованный список результатов для теста.
 * @param {string} testId - UUID теста.
 * @param {object} options - Опции для запроса { search, sort, order, page, limit }.
 * @returns {Promise<object>} Объект с результатами и информацией о пагинации.
 */
export const fetchResults = (testId, { search, sort, order, page, limit }) => 
    apiFetch(`/api/admin/tests/${testId}/results?search=${search}&sort=${sort}&order=${order}&page=${page}&limit=${limit}`);
    
/**
 * Удаляет несколько результатов тестов по их ID.
 * @param {Array<number>} ids - Массив ID результатов для удаления.
 * @returns {Promise<object>} Ответ сервера.
 */
export const deleteResults = (ids) => apiFetch('/api/admin/results/delete-bulk', {
    method: 'POST', 
    body: JSON.stringify({ ids })
});

/**
 * Получает детальный протокол для конкретного результата теста.
 * @param {number} resultId - ID результата.
 * @returns {Promise<object>} Объект с протоколом.
 */
export const fetchProtocol = (resultId) => apiFetch(`/api/admin/results/${resultId}/protocol`);

/**
 * Получает список вопросов с открытыми ответами, ожидающих ручной проверки.
 * @param {number} resultId - ID результата теста.
 * @returns {Promise<Array<object>>} Массив вопросов для проверки.
 */
export const fetchQuestionsForReview = (resultId) => apiFetch(`/api/admin/results/${resultId}/review`);

/**
 * Отправляет на сервер вердикты ручной проверки для группы ответов.
 * @param {Array<object>} verdicts - Массив объектов вердиктов.
 * @returns {Promise<object>} Ответ сервера с результатом обработки.
 */
export const submitBatchReview = (verdicts) => apiFetch('/api/admin/review/submit-batch', {
    method: 'POST', 
    body: JSON.stringify({ verdicts })
});