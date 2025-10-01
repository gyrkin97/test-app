// --- ФАЙЛ: client/common/shared_modules/api/auth.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Модуль API для всех эндпоинтов, связанных с аутентификацией и сессиями.

import { apiFetch } from './api-core.js';

/**
 * Отправляет пароль для входа в качестве администратора тестов.
 * @param {string} password - Пароль администратора.
 * @returns {Promise<{success: boolean, isDev: boolean}>} Объект с результатом входа.
 */
export const login = (password) => apiFetch('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
});

/**
 * Отправляет пароль для входа в качестве разработчика (панель метрологии).
 * @param {string} password - Пароль разработчика.
 * @returns {Promise<{success: boolean, isDev: boolean}>} Объект с результатом входа.
 */
export const devLogin = (password) => apiFetch('/api/admin/dev-login', {
    method: 'POST',
    body: JSON.stringify({ password }),
});

/**
 * Завершает текущую сессию пользователя на сервере.
 * @returns {Promise<{success: boolean}>} Ответ сервера о завершении сессии.
 */
export const logout = () => apiFetch('/api/admin/logout', { method: 'POST' });

/**
 * Проверяет статус аутентификации текущей сессии по cookie.
 * @returns {Promise<{authenticated: boolean, isDev: boolean}>} Объект со статусом аутентификации и уровнем доступа.
 */
export const checkAuth = () => apiFetch('/api/admin/check-auth');