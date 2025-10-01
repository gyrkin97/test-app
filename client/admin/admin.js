// --- ФАЙЛ: client/admin/admin.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ ПОСЛЕ РЕФАКТОРИНГА) ---
// Этот файл является главной точкой входа и "оркестратором" для приложения панели администратора.
// Он инициализирует все основные модули, управляет глобальным состоянием (например, какой тест выбран),
// а также обрабатывает Server-Sent Events для обновлений в реальном времени.

// --- Импорты модулей админ-панели ---
import { initAuth } from './admin_modules/auth.js';
import { initSidebar, refreshSidebar } from './admin_modules/sidebar.js';
import { showWelcomeMessage, showTestDashboard } from './admin_modules/main-content.js';
import { prependNewResultRow, registerNewResultId } from './admin_modules/results.js';

// --- Импорты общих модулей ---
import { logout } from '../common/shared_modules/api/auth.js';
import { registerGlobalErrorCallback } from '../common/shared_modules/api/api-core.js';
import { showToast } from '../common/shared_modules/ui.js';
import { escapeHTML } from '../common/shared_modules/utils.js';
import { eventBus } from '../common/shared_modules/event-bus.js';

// --- Глобальное состояние и константы для этого модуля ---
let activeTestContext = { id: null, name: null };
const pendingHighlights = new Map(); // Хранит ID новых результатов для неактивных тестов
let sseSource = null;
const SSE_RECONNECT_DELAY = 5000; // 5 секунд

/**
 * Обработчик события 'test-selected' с шины событий.
 * Вызывается, когда пользователь выбирает тест в сайдбаре.
 * @param {CustomEvent} event - Событие, содержащее detail: { testId, testName }.
 */
function onTestSelected(event) {
    const { testId, testName } = event.detail;
    if (activeTestContext.id === testId) {
        return; // Не делаем ничего, если выбран тот же самый тест
    }

    console.log(`Выбран тест: ${testName} (ID: ${testId})`);
    activeTestContext = { id: testId, name: testName };
    
    // Проверяем, есть ли для этого теста "отложенные" ID для подсветки
    const highlights = pendingHighlights.get(testId) || [];
    
    const mainContentArea = document.getElementById('main-content-area');
    if (!mainContentArea) return;
    
    // Добавляем класс для плавной анимации смены контента
    mainContentArea.classList.add('is-changing');
    setTimeout(() => {
        // Передаем ID для подсветки в функцию отрисовки дашборда
        showTestDashboard(activeTestContext, highlights); 
        mainContentArea.classList.remove('is-changing');
        // Очищаем "отложенные" ID после их использования
        pendingHighlights.delete(testId);
    }, 200); // Задержка соответствует CSS-анимации
}

/**
 * Инициализирует все основные модули админ-панели после успешной аутентификации.
 */
function initializeAdminPanel() {
    initSidebar();
    showWelcomeMessage();
    initializeEventSource();

    // Подписываемся на события из шины событий
    eventBus.addEventListener('test-selected', onTestSelected);
    eventBus.addEventListener('context-cleared', () => {
        activeTestContext = { id: null, name: null };
        console.log('Контекст активного теста был очищен.');
    });
}

/**
 * Очищает все индикаторы реального времени (уведомления, подсветку) после взаимодействия пользователя.
 */
function clearAllRealtimeIndicators() {
    hideStickyToasts();
    removeButtonGlow();
}

/**
 * Устанавливает одноразовые слушатели, которые вызовут очистку UI-индикаторов.
 */
function setupInteractionListeners() {
    window.addEventListener('click', clearAllRealtimeIndicators, { once: true });
    window.addEventListener('focus', clearAllRealtimeIndicators, { once: true });
    window.addEventListener('scroll', clearAllRealtimeIndicators, { once: true });
}

/**
 * Настраивает и запускает клиент для Server-Sent Events (SSE) с логикой авто-переподключения.
 */
function initializeEventSource() {
    if (typeof(EventSource) === "undefined") {
        console.warn("Server-Sent Events не поддерживаются этим браузером.");
        showToast('Ваш браузер не поддерживает обновления в реальном времени.', 'info');
        return;
    }

    const connect = () => {
        if (sseSource && sseSource.readyState !== EventSource.CLOSED) sseSource.close();
        
        sseSource = new EventSource('/api/events');
        sseSource.onopen = () => console.log('SSE соединение для админ-панели установлено.');

        // Слушаем событие 'new-result'
        sseSource.addEventListener('new-result', (e) => {
            const newResult = JSON.parse(e.data);
            const safeFio = escapeHTML(newResult.fio);
            const safeTestName = escapeHTML(newResult.testName);
            showToast(`Новый результат от "${safeFio}" в тесте "${safeTestName}"`, 'info', 0);
            setupInteractionListeners();
            
            if (activeTestContext.id === newResult.testId) {
                // Если результат для текущего активного теста
                const resultsTab = document.getElementById('tab-results');
                if (resultsTab && resultsTab.classList.contains('active')) {
                    prependNewResultRow(newResult);
                } else {
                    registerNewResultId(newResult.id);
                    document.querySelector('.tab-button[data-tab="results"]')?.classList.add('has-update');
                }
            } else {
                // Если результат для другого (неактивного) теста
                document.querySelector(`.nav-item[data-id="${newResult.testId}"]`)?.classList.add('has-new-result');
                if (!pendingHighlights.has(newResult.testId)) {
                    pendingHighlights.set(newResult.testId, []);
                }
                pendingHighlights.get(newResult.testId).push(newResult.id);
            }
        });

        // Слушаем событие 'result-reviewed'
        sseSource.addEventListener('result-reviewed', () => {
            showToast('Результат был проверен. Список тестов обновлен.', 'success');
            refreshSidebar();
        });

        sseSource.onerror = () => {
            console.error(`Ошибка EventSource. Попытка переподключения через ${SSE_RECONNECT_DELAY / 1000} сек...`);
            sseSource.close();
            setTimeout(connect, SSE_RECONNECT_DELAY);
        };
    };

    connect();
}

/**
 * Отправляет запрос на выход из системы и перезагружает страницу.
 */
async function handleLogout() {
    try {
        await logout();
    } catch (error) {
        // Ошибка выхода не критична, поэтому просто логируем ее
        console.error('Logout request failed:', error);
    } finally {
        // Перезагружаем страницу в любом случае, чтобы завершить сессию
        window.location.reload();
    }
}

/**
 * Точка входа в приложение.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Настраиваем глобальный обработчик для всех ошибок API
    registerGlobalErrorCallback((message) => {
        showToast(message, 'error');
    });

    // Используем делегирование событий для кнопки выхода
    document.body.addEventListener('click', (event) => {
        if (event.target.closest('#logoutBtn')) {
            handleLogout();
        }
    });
    
    // Запускаем процесс аутентификации, который в случае успеха вызовет initializeAdminPanel
    initAuth(initializeAdminPanel);
});