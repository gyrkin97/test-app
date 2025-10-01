// --- ФАЙЛ: client/dev-panel/trips-schedule.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
import { state, fetchData, invalidateCache } from './modules/trip-state.js';
import { render } from './modules/trip-renderer.js';
import { openModal, closeModal } from '../common/shared_modules/modals.js';
import { showToast } from '../common/shared_modules/ui.js';

// Импортируем модули с UI (модальные окна)
import { showTripModal, showEmployeeModal, showOrganizationModal, restoreModalState, setTripsCache } from './modules/trip-modals.js';
// Импортируем ТОЛЬКО обработчики, не связанные с отправкой форм или кликами в модалках
import { handleDeleteTrip, handleShowEmployeeCard } from './modules/trip-handlers.js';

// Синглтон SSE для всей панели (на случай повторных инициализаций раздела)
let _sseSource = null;
let _sseBound = false;

// Защита от дублирования тостов
let _lastToastKey = '';
let _lastToastAt = 0;

function safeToast(msg, type = 'info') {
    const key = msg + type;
    const now = Date.now();
    // Игнорируем дубли в течение 600 мс
    if (_lastToastKey === key && now - _lastToastAt < 600) return;
    _lastToastKey = key;
    _lastToastAt = now;
    showToast(msg, type);
}

/**
 * Функция-обертка, которая обновляет UI и вызывает рендеринг сетки.
 */
export function updateUIAndRender() {
    const headerElement = document.getElementById('current-month-year');
    if (headerElement) {
        const monthName = state.currentDate.toLocaleString('ru-RU', { month: 'long' });
        const year = state.currentDate.getFullYear();
        headerElement.textContent = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year} г.`;
    }
    render(state.currentDate);
}

/**
 * Инициализирует весь модуль "График командировок".
 */
export async function initTripsSchedule() {
    const contentArea = document.getElementById('trips-content-area');
    
    contentArea.innerHTML = `
        <div class="card">
            <div class="admin-controls" style="align-items: center;">
                <div id="trips-month-navigator">
                    <button id="prev-month-btn" class="btn-icon" title="Предыдущий месяц">«</button>
                    <h2 id="current-month-year"></h2>
                    <button id="next-month-btn" class="btn-icon" title="Следующий месяц">»</button>
                </div>
                <div class="admin-actions">
                    <button id="manage-lists-btn" class="btn back-btn">Список</button>
                    <button id="add-trip-btn" class="btn">Добавить выезд</button>
                </div>
            </div>
            <div class="trips-timeline-grid" id="trips-timeline-container">
                <div class="spinner"></div>
            </div>
        </div>
        <div id="trip-tooltip" class="trip-tooltip"></div>
    `;

    // --- ОБРАБОТЧИКИ СОБЫТИЙ ТОЛЬКО ДЛЯ ОСНОВНОЙ СТРАНИКИ ---
    
    document.getElementById('trips-timeline-container')?.addEventListener('click', (e) => {
        handleDeleteTrip(e);
        handleShowEmployeeCard(e);
    });

    contentArea.addEventListener('click', e => {
        const target = e.target.closest('button');
        if (!target) return;

        if (target.id === 'prev-month-btn') {
            state.currentDate.setMonth(state.currentDate.getMonth() - 1);
            fetchData(updateUIAndRender);
        }
        if (target.id === 'next-month-btn') {
            state.currentDate.setMonth(state.currentDate.getMonth() + 1);
            fetchData(updateUIAndRender);
        }
        if (target.id === 'add-trip-btn') {
            if (!state.employees?.length) {
                safeToast('Сначала добавьте хотя бы одного сотрудника.', 'error');
                return;
            }
            if (!state.organizations?.length) {
                safeToast('Сначала добавьте хотя бы одну организацию.', 'error');
                return;
            }
            showTripModal();
        }
        if (target.id === 'manage-lists-btn') {
            openModal(document.getElementById('listChoiceModal'));
        }
    });

    document.getElementById('listChoiceModal')?.addEventListener('click', (e) => {
        const choiceBtn = e.target.closest('button[data-choice]');
        if (choiceBtn) {
            closeModal(document.getElementById('listChoiceModal'));
            const choice = choiceBtn.dataset.choice;
            if (choice === 'employees') showEmployeeModal();
            if (choice === 'organizations') showOrganizationModal();
        }
    });

    // ВАЖНО: ВСЕ ОБРАБОТЧИКИ ДЛЯ ДИНАМИЧЕСКИХ МОДАЛОК ОТСЮДА ПОЛНОСТЬЮ УДАЛЕНЫ.
    // ЭТО УСТРАНЯЕТ ВСЕ КОНФЛИКТЫ.

    // Подписка на события обновления данных для real-time синхронизации
    window.addEventListener('trips-data-updated', () => {
        console.log('[trips-schedule] Получено событие обновления командировок, перезагружаем данные...');
        invalidateCache('trips');
        fetchData(updateUIAndRender);
    });

    window.addEventListener('employees-data-updated', () => {
        console.log('[trips-schedule] Получено событие обновления сотрудников, перезагружаем данные...');
        invalidateCache('employees');
        fetchData(updateUIAndRender);
    });

    window.addEventListener('organizations-data-updated', () => {
        console.log('[trips-schedule] Получено событие обновления организаций, перезагружаем данные...');
        invalidateCache('organizations');
        fetchData(updateUIAndRender);
    });

    // Также подписываемся на SSE события с сервера для меж-вкладковой синхронизации
    const setupSSEListener = () => {
        // Если уже есть активное соединение и обработчики привязаны — выходим
        if (_sseSource && _sseBound) return;
        
        // Если соединение не создано — создаем
        if (!_sseSource) {
            _sseSource = new EventSource('/api/events');
        }
        
        // Если обработчики уже привязаны — выходим
        if (_sseBound) return;

        // Обработчики событий
        const onTripsUpdated = () => {
            console.log('[trips-schedule] SSE: Получено событие обновления командировок с сервера');
            invalidateCache('trips');
            fetchData(updateUIAndRender);
            safeToast('График командировок был обновлен', 'info');
        };

        const onEmployeesUpdated = () => {
            console.log('[trips-schedule] SSE: Получено событие обновления сотрудников с сервера');
            invalidateCache('employees');
            fetchData(updateUIAndRender);
            safeToast('Список сотрудников был обновлен', 'info');
        };

        const onOrganizationsUpdated = () => {
            console.log('[trips-schedule] SSE: Получено событие обновления организаций с сервера');
            invalidateCache('organizations');
            fetchData(updateUIAndRender);
            safeToast('Список организаций был обновлен', 'info');
        };

        // Подписываем обработчики
        _sseSource.addEventListener('trips-updated', onTripsUpdated);
        _sseSource.addEventListener('employees-updated', onEmployeesUpdated);
        _sseSource.addEventListener('organizations-updated', onOrganizationsUpdated);
        
        _sseBound = true;

        _sseSource.onerror = (error) => {
            console.error('[trips-schedule] Ошибка SSE соединения:', error);
            _sseSource.close();
            _sseSource = null;
            _sseBound = false;
            // Попытка переподключения через 5 секунд
            setTimeout(setupSSEListener, 5000);
        };

        // Чистка при закрытии вкладки
        window.addEventListener('beforeunload', () => {
            try { 
                _sseSource?.close(); 
            } catch (e) {
                console.warn('[trips-schedule] Ошибка при закрытии SSE:', e);
            }
            _sseSource = null;
            _sseBound = false;
        }, { once: true });
    };

    // Инициализируем SSE слушатель
    setupSSEListener();

    // Очистка при размонтировании компонента (если будет реализована)
    const cleanup = () => {
        if (_sseSource) {
            _sseSource.close();
            _sseSource = null;
            _sseBound = false;
        }
        window.removeEventListener('trips-data-updated', () => {});
        window.removeEventListener('employees-data-updated', () => {});
        window.removeEventListener('organizations-data-updated', () => {});
    };

    // ПЕРВИЧНАЯ ЗАГРУЗКА ДАННЫХ + ВОССТАНОВЛЕНИЕ МОДАЛКИ
    await fetchData(updateUIAndRender);
    
    // ПЕРЕДАЕМ АКТУАЛЬНЫЙ СПИСОК КОМАНДИРОВОК В КЭШ
    try { 
        setTripsCache(state.trips); 
    } catch (e) {
        console.warn('[trips-schedule] Не удалось установить кэш командировок:', e);
    }
    
    restoreModalState();

    // Возвращаем функцию очистки для потенциального использования
    return cleanup;
}