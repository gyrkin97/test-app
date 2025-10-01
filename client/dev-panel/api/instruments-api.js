// --- ФАЙЛ: dev-panel/api/instruments-api.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль является специализированным API-клиентом
// для всех эндпоинтов, связанных с оборудованием.
// Он использует централизованный apiFetch для выполнения запросов.

import { apiFetch } from '../../common/shared_modules/api/api-core.js';

/**
 * Запрашивает с сервера полный список оборудования.
 * @returns {Promise<Array<object>>} - Промис, который разрешается в массив объектов оборудования.
 */
export const fetchInstruments = () => apiFetch('/api/admin/instruments');

/**
 * Отправляет на сервер данные для создания новой записи об оборудовании.
 * @param {object} data - Объект с данными нового оборудования.
 * @returns {Promise<object>} - Промис, который разрешается в объект созданной записи.
 */
export const createInstrument = (data) => apiFetch('/api/admin/instruments', { 
    method: 'POST', 
    body: JSON.stringify(data) 
});

/**
 * Отправляет на сервер обновленные данные для существующей записи.
 * @param {number|string} id - ID обновляемой записи.
 * @param {object} data - Объект с обновленными данными.
 * @returns {Promise<object>} - Промис, который разрешается в объект обновленной записи.
 */
export const updateInstrument = (id, data) => apiFetch(`/api/admin/instruments/${id}`, { 
    method: 'PUT', 
    body: JSON.stringify(data) 
});

/**
 * Отправляет на сервер запрос на удаление записи по ее ID.
 * @param {number|string} id - ID удаляемой записи.
 * @returns {Promise<null>} - Промис, который разрешается в null при успешном удалении (HTTP 204).
 */
export const deleteInstrument = (id) => apiFetch(`/api/admin/instruments/${id}`, { 
    method: 'DELETE' 
});