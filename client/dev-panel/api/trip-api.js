// --- ФАЙЛ: dev-panel/api/trip-api.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль является специализированным API-клиентом для всех эндпоинтов,
// связанных с модулем "График командировок".
// Он использует централизованный apiFetch для выполнения запросов.

import { apiFetch } from '../../common/shared_modules/api/api-core.js';

// УЛУЧШЕНИЕ: Выносим базовый префикс API в константу для легкого изменения в будущем.
const API_PREFIX = '/api/admin';

// --- СОТРУДНИКИ ---

export const fetchEmployees = () => apiFetch(`${API_PREFIX}/employees`);

export const createEmployee = (name, position, phone) => apiFetch(`${API_PREFIX}/employees`, { 
    method: 'POST', 
    body: JSON.stringify({ name, position, phone }) 
});

export const deleteEmployee = (id) => apiFetch(`${API_PREFIX}/employees/${id}`, { method: 'DELETE' });

export const fetchEmployeeDetails = (id) => apiFetch(`${API_PREFIX}/employees/${id}/details`);


// --- КОМАНДИРОВКИ ---

// ИСПРАВЛЕНИЕ: Добавлен параметр `&_=${Date.now()}` для сброса кэша браузера.
export const fetchTrips = (year, month) => apiFetch(`${API_PREFIX}/trips?year=${year}&month=${month}&_=${Date.now()}`);

export const createTrip = (data) => apiFetch(`${API_PREFIX}/trips`, { method: 'POST', body: JSON.stringify(data) });

export const updateTrip = (id, data) => apiFetch(`${API_PREFIX}/trips/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteTrip = (id) => apiFetch(`${API_PREFIX}/trips/${id}`, { method: 'DELETE' });


// --- ОРГАНИЗАЦИИ И ДОЛЖНОСТИ (СПРАВОЧНИКИ) ---

export const fetchOrganizations = () => apiFetch(`${API_PREFIX}/organizations`);

export const createOrganization = (name) => apiFetch(`${API_PREFIX}/organizations`, { method: 'POST', body: JSON.stringify({ name }) });

export const deleteOrganization = (id) => apiFetch(`${API_PREFIX}/organizations/${id}`, { method: 'DELETE' });

export const fetchPositions = () => apiFetch(`${API_PREFIX}/positions`);