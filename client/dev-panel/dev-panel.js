// --- ФАЙЛ: client/dev-panel/dev-panel.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль является главным "оркестратором" для всей панели метрологии.
// Его основные задачи:
// 1. Управлять процессом аутентификации (через дочерний модуль auth.js).
// 2. Управлять переключением между основными разделами (вкладками).
// 3. Вызывать функции инициализации для каждого раздела при первом открытии.
// 4. Настраивать глобальные элементы, такие как SSE-слушатель и кнопка выхода.

// --- Импорты общих модулей ---
import { logout } from '../common/shared_modules/api/auth.js';
import { registerGlobalErrorCallback } from '../common/shared_modules/api/api-core.js';
import { closeModal } from '../common/shared_modules/modals.js';
import { showToast } from '../common/shared_modules/ui.js';
import { manageEmployees, manageOrganizations } from '../common/assets/icons.js';

// --- Импорты модулей, специфичных для dev-panel ---
import { initAuthFlow } from './modules/auth.js';
import { initTripsSchedule } from './trips-schedule.js';
import { initInstrumentsDashboard } from './instruments-dashboard.js';
import { restoreModalState as restoreTripsModalState } from './modules/trip-modals.js';
import { restoreInstrumentModalState } from './modules/instruments-modals.js';

// --- Глобальное состояние и константы для этого модуля ---
let sseSource = null;
const SSE_RECONNECT_DELAY = 5000; // 5 секунд

/**
 * Сохраняет текущее состояние в sessionStorage
 */
function saveAppState(sectionOverride = null) {
    const section = sectionOverride || getCurrentSection();
    const state = {
        currentSection: section,
        timestamp: Date.now()
    };
    sessionStorage.setItem('devPanelState', JSON.stringify(state));
}

/**
 * Восстанавливает состояние из sessionStorage
 */
function restoreAppState() {
    try {
        const saved = sessionStorage.getItem('devPanelState');
        if (saved) {
            const state = JSON.parse(saved);
            // Проверяем, не устарели ли данные (больше 1 часа)
            if (Date.now() - state.timestamp < 60 * 60 * 1000) {
                return state.currentSection;
            }
        }
    } catch (error) {
        console.warn('Не удалось восстановить состояние приложения:', error);
    }
    return 'instruments'; // значение по умолчанию
}

/**
 * Получает текущую активную секцию
 */
function getCurrentSection() {
    const activeNavItem = document.querySelector('.nav-item.static-nav-item.active');
    return activeNavItem ? activeNavItem.dataset.section : 'instruments';
}

/**
 * Инициализирует и (пере)подключает Server-Sent Events слушатель с логикой
 * автоматического восстановления соединения.
 */
function initSseListener() {
    const connect = () => {
        // Закрываем существующее соединение, если оно активно
        if (sseSource && sseSource.readyState !== EventSource.CLOSED) {
            sseSource.close();
        }
        sseSource = new EventSource('/api/events');

        sseSource.onopen = () => {
            console.log('SSE-слушатель для панели метрологии успешно установлен.');
        };

        // Подписываемся на события, релевантные для этой панели
        sseSource.addEventListener('employees-updated', () => {
            showToast('Список сотрудников был обновлен', 'info');
        });

        sseSource.addEventListener('trips-updated', () => {
            showToast('График командировок был обновлен', 'info');
        });

        sseSource.addEventListener('organizations-updated', () => {
            showToast('Список организаций был обновлен', 'info');
        });

        // Обработчик ошибок, который инициирует переподключение
        sseSource.onerror = () => {
            console.error(`Ошибка SSE-соединения. Попытка переподключения через ${SSE_RECONNECT_DELAY / 1000} секунд...`);
            sseSource.close();
            setTimeout(connect, SSE_RECONNECT_DELAY);
        };
    };
    
    connect();
}

/**
 * Центральная функция для отображения нужной секции (вкладки).
 * Инициализирует модуль вкладки только при первом ее открытии.
 * @param {string} sectionName - Имя секции ('instruments' или 'trips').
 */
function showSection(sectionName) {
    if (!sectionName) {
        console.warn('Попытка переключения на неопределенную секцию');
        return;
    }

    // Сохраняем ТУ секцию, на которую переходим
    saveAppState(sectionName);

    // Обновляем активное состояние кнопок в сайдбаре
    document.querySelectorAll('.nav-item.static-nav-item').forEach(item => {
        const isActive = item.dataset.section === sectionName;
        item.classList.toggle('active', isActive);
    });

    // Скрываем все секции контента
    document.querySelectorAll('.content-section').forEach(area => {
        area.classList.add('hidden');
    });

    const activeArea = document.getElementById(`${sectionName}-content-area`);
    if (!activeArea) {
        console.error(`Контейнер для секции "${sectionName}" не найден.`);
        return;
    }
    activeArea.classList.remove('hidden');

    // Очищаем состояние модалок НЕактивного раздела
    if (sectionName !== 'trips') {
        sessionStorage.removeItem('trips.activeModal');
    }
    if (sectionName !== 'instruments') {
        sessionStorage.removeItem('instruments.activeModal');
    }

    // "Ленивая" инициализация: запускаем код модуля только при первом открытии вкладки
    if (!activeArea.dataset.initialized) {
        console.log(`Инициализация секции: ${sectionName}`);
        if (sectionName === 'instruments') {
            initInstrumentsDashboard();
        } else if (sectionName === 'trips') {
            initTripsSchedule();
        }
        activeArea.dataset.initialized = 'true';
    }
}

/**
 * Обрабатывает выход пользователя из системы.
 */
async function handleLogout() {
    try {
        await logout();
        showToast('Выход из системы выполнен успешно', 'success');
    } catch (error) {
        console.error('Ошибка при выходе из системы:', error);
        showToast('Ошибка при выходе из системы', 'error');
    } finally {
        // В любом случае перезагружаем страницу, чтобы завершить сессию
        window.location.reload();
    }
}

/**
 * Главная функция инициализации приложения ПОСЛЕ проверки авторизации.
 */
function initializeDevPanel() {
    const devContent = document.getElementById('devContent');
    if (!devContent) {
        console.error('Основной контейнер приложения devContent не найден');
        return;
    }
    
    devContent.classList.remove('hidden');
    
    // Восстанавливаем предыдущее состояние или используем значение по умолчанию
    const savedSection = restoreAppState();
    console.log(`Восстановлена секция: ${savedSection}`);
    showSection(savedSection);
    
    // Инициализируем SSE слушатель для real-time обновлений
    initSseListener();
    
    // Настраиваем обработчики событий
    setupEventListeners();

    // Восстанавливаем модальные окна ТОЛЬКО для активной секции
    if (savedSection === 'trips') {
        console.log('Восстановление модальных окон для секции командировок');
        try { 
            restoreTripsModalState?.(); 
        } catch(e) { 
            console.warn('Ошибка восстановления модалки командировок:', e); 
        }
        // Очищаем состояние модалок оборудования
        sessionStorage.removeItem('instruments.activeModal');
    } else if (savedSection === 'instruments') {
        console.log('Восстановление модальных окон для секции оборудования');
        try {
            restoreInstrumentModalState?.();
        } catch(e) {
            console.warn('Ошибка восстановления модалки оборудования:', e);
        }
        // Очищаем состояние модалок командировок
        sessionStorage.removeItem('trips.activeModal');
    }

    // Сохраняем секцию также при F5/закрытии
    window.addEventListener('beforeunload', () => saveAppState(getCurrentSection()));

    // Вставляем SVG-иконки в кнопки модального окна
    const employeeIconContainer = document.querySelector('button[data-choice="employees"] .manage-card-icon');
    if (employeeIconContainer) {
        employeeIconContainer.innerHTML = manageEmployees;
    } else {
        console.warn('Контейнер для иконки сотрудников не найден');
    }
    
    const organizationIconContainer = document.querySelector('button[data-choice="organizations"] .manage-card-icon');
    if (organizationIconContainer) {
        organizationIconContainer.innerHTML = manageOrganizations;
    } else {
        console.warn('Контейнер для иконки организаций не найден');
    }
}

/**
 * Настраивает глобальные обработчики событий для страницы.
 */
function setupEventListeners() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    } else {
        console.warn('Кнопка выхода logoutBtn не найдена');
    }

    // Делегирование кликов для навигации по вкладкам в сайдбаре
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) {
        sidebarNav.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item[data-section]');
            if (navItem) {
                e.preventDefault();
                const sectionName = navItem.dataset.section;
                console.log(`Переключение на секцию: ${sectionName}`);
                showSection(sectionName);
            }
        });
    } else {
        console.warn('Навигационная панель sidebar-nav не найдена');
    }

    // Обработчик для закрытия модального окна подтверждения
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.addEventListener('click', e => {
            if (e.target.matches('#confirmModalCancelBtn') || e.target.matches('#confirmModalOkBtn')) {
                closeModal(confirmModal);
            }
        });
    }
}

/**
 * Точка входа в приложение.
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Инициализация панели метрологии...');
    
    // Регистрируем глобальный обработчик ошибок API, который будет показывать "тосты"
    registerGlobalErrorCallback(message => {
        console.error('Глобальная ошибка API:', message);
        showToast(message, 'error');
    });
    
    // Запускаем процесс аутентификации, передавая `initializeDevPanel` в качестве
    // коллбэка, который будет выполнен после успешного входа.
    initAuthFlow(initializeDevPanel);
});