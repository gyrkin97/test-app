// --- ФАЙЛ: client/common/shared_modules/api/public.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Модуль API для публичных эндпоинтов, используемых в test-runner.

import { apiFetch } from './api-core.js';

/**
 * Получает список всех активных тестов для отображения пользователю.
 * Если передано ФИО, для каждого теста будет добавлен флаг, сдан ли он уже этим пользователем.
 * @param {string} [fio] - ФИО пользователя для проверки статуса сдачи тестов.
 * @returns {Promise<Array<object>>} - Массив объектов с данными тестов.
 */
export const fetchPublicTests = (fio) => apiFetch(`/api/public/tests?fio=${encodeURIComponent(fio || '')}`);

/**
 * Начинает сессию тестирования на сервере.
 * Записывает время старта в сессию для контроля длительности.
 * @param {string} testId - UUID теста, который начинается.
 * @returns {Promise<object>} - Ответ сервера с подтверждением старта.
 */
export const startTestSession = (testId) => apiFetch(`/api/public/tests/${testId}/start`, { method: 'POST' });

/**
 * Запрашивает у сервера набор вопросов для указанного теста.
 * Количество вопросов и длительность определяются настройками теста на сервере.
 * @param {string} testId - UUID теста.
 * @returns {Promise<{questions: Array, duration: number}>} - Объект с массивом вопросов и длительностью теста в секундах.
 */
export const fetchQuestions = (testId) => apiFetch(`/api/public/tests/${testId}/questions`);

/**
 * Отправляет ответы пользователя на сервер для проверки и сохранения результата.
 * @param {string} testId - UUID теста.
 * @param {string} fio - ФИО пользователя.
 * @param {Array<object>} userAnswers - Массив ответов пользователя.
 * @returns {Promise<object>} - Объект с итоговым результатом теста.
 */
export const submitAnswers = (testId, fio, userAnswers) => apiFetch(`/api/public/tests/${testId}/submit`, {
    method: 'POST', 
    body: JSON.stringify({ fio, userAnswers })
});

/**
 * Получает протокол последнего успешно сданного теста для конкретного пользователя.
 * @param {string} testId - UUID теста.
 * @param {string} fio - ФИО пользователя.
 * @returns {Promise<object>} - Объект с детальным протоколом теста.
 */
export const fetchLastResultProtocol = (testId, fio) => apiFetch(`/api/public/results/last?testId=${testId}&fio=${encodeURIComponent(fio || '')}`);