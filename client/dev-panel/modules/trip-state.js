// --- ФАЙЛ: dev-panel/modules/trip-state.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль управляет состоянием, кэшированием и загрузкой данных
// для графика командировок. Он не зависит от DOM и рендеринга.

import { fetchEmployees, fetchTrips, fetchOrganizations, fetchPositions } from '../api/trip-api.js';
import { showToast } from '../../common/shared_modules/ui.js';

// --- Состояние и Кэш ---
export const state = {
    employees: [],
    organizations: [],
    positions: [],
    trips: [],
    currentDate: new Date()
};

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 минут
let cache = { 
    employees: null, 
    organizations: null, 
    positions: null,
    trips: null, 
    monthKey: null, 
    timestamp: null 
};

/**
 * Инвалидирует (сбрасывает) кэш для указанного типа данных.
 * @param {'all' | 'trips' | 'employees' | 'organizations' | 'positions'} type - Тип данных для сброса.
 */
export function invalidateCache(type = 'all') {
    if (type === 'all' || type === 'trips') {
        cache.trips = null;
    }
    if (type === 'all' || type === 'employees' || type === 'organizations') {
        cache.employees = null;
        cache.organizations = null;
        cache.positions = null;
    }
    // console.log(`[trip-state] INFO: Кэш для '${type}' был инвалидирован.`); // Убрано
}

/**
 * Загружает все необходимые данные для графика командировок (из кэша или с сервера)
 * и вызывает колбэк для рендеринга.
 * @param {function} renderCallback - Функция для рендеринга UI после загрузки данных.
 */
export async function fetchData(renderCallback) {
    const container = document.getElementById('trips-timeline-container');
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth() + 1;
    const currentMonthKey = `${year}-${month}`;
    const isCacheValid = Date.now() - (cache.timestamp || 0) < CACHE_DURATION_MS;

    try {
        // Проверяем, можно ли использовать полный кэш
        if (cache.trips && cache.employees && cache.organizations && cache.positions && cache.monthKey === currentMonthKey && isCacheValid) {
            state.employees = cache.employees;
            state.organizations = cache.organizations;
            state.positions = cache.positions;
            state.trips = cache.trips;
            if (typeof renderCallback === 'function') renderCallback(state.currentDate);
            return;
        }

        if (container) {
            container.innerHTML = '<div class="spinner"></div>';
        }
        
        const [employeesData, organizationsData, positionsData, tripsData] = await Promise.all([
            (cache.employees && isCacheValid) ? Promise.resolve(cache.employees) : fetchEmployees(),
            (cache.organizations && isCacheValid) ? Promise.resolve(cache.organizations) : fetchOrganizations(),
            (cache.positions && isCacheValid) ? Promise.resolve(cache.positions) : fetchPositions().catch(err => {
                console.warn('[trip-state] Предупреждение: Не удалось загрузить должности:', err);
                // Fallback список должностей на случай ошибки
                return ["Инженер по метрологии", "Техник по метрологии", "Начальник лаборатории"];
            }),
            fetchTrips(year, month)
        ]);
        
        state.employees = employeesData;
        state.organizations = organizationsData;
        state.positions = positionsData;
        state.trips = tripsData;
        
        cache = { 
            employees: employeesData, 
            organizations: organizationsData, 
            positions: positionsData, 
            trips: tripsData, 
            monthKey: currentMonthKey, 
            timestamp: Date.now() 
        };

        if (typeof renderCallback === 'function') {
            renderCallback(state.currentDate);
        }

    } catch (error) {
        console.error('[trip-state] CRITICAL: Критическая ошибка при загрузке данных для графика командировок:', error);
        
        if (error.message.toLowerCase().includes('failed to fetch')) {
            showToast('Ошибка сети. Проверьте соединение с сервером.', 'error');
        } else if (error.status === 401) {
            showToast('Ошибка авторизации. Требуется повторный вход.', 'error');
        } else {
            showToast(`Не удалось загрузить данные: ${error.message || 'Неизвестная ошибка'}.`, 'error');
        }
        
        if (container) {
             if (cache.employees && cache.organizations) {
                showToast('Показана последняя загруженная версия.', 'info');
                state.employees = cache.employees;
                state.organizations = cache.organizations;
                state.positions = cache.positions || ["Инженер по метрологии", "Техник по метрологии", "Начальник лаборатории"];
                state.trips = cache.trips || [];
                if (typeof renderCallback === 'function') renderCallback(state.currentDate);
            } else {
                container.innerHTML = '<div class="empty-state-message"><span>Не удалось загрузить данные. Пожалуйста, попробуйте обновить страницу.</span></div>';
            }
        }
    }
}