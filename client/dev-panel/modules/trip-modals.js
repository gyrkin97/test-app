// --- ФАЙЛ: client/dev-panel/modules/trip-modals.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
import { state } from './trip-state.js';
import { openModal } from '../../common/shared_modules/modals.js';
import { escapeHTML, formatDisplayDate } from '../../common/shared_modules/utils.js';
import { transportIcons, badgeIcons } from '../../common/assets/icons.js';
import { initMultiSelect } from '../components/multi-select.js';
import { 
    handleSaveTrip, 
    handleAddEmployee, 
    handleAddOrganization,
    handleDeleteEmployee,
    handleDeleteOrganization
} from './trip-handlers.js';

let employeeModalController = new AbortController();
let organizationModalController = new AbortController();

// --- Кэш для восстановления по tripId (заполняем из trips-schedule.js)
let tripsCache = [];
export function setTripsCache(list) { 
    tripsCache = Array.isArray(list) ? list : []; 
    console.log(`[trip-modals] Кэш командировок обновлен: ${tripsCache.length} записей`);
}

// Сохраняем полноценный объект состояния модалки
function saveModalState(state) {
    sessionStorage.setItem('trips.activeModal', JSON.stringify(state));
}

function getSavedModalState() {
    const raw = sessionStorage.getItem('trips.activeModal');
    try { 
        return raw ? JSON.parse(raw) : null; 
    } catch { 
        return null; 
    }
}

/**
 * Очищает состояние модального окна
 */
function clearModalState() {
    sessionStorage.removeItem('trips.activeModal');
}

/**
 * Восстанавливает состояние модального окна при загрузке
 */
export function restoreModalState() {
    const st = getSavedModalState();
    if (!st || !st.type) return;
    
    console.log(`[trip-modals] Восстановление модального окна:`, st);
    
    if (st.type === 'employees') return showEmployeeModal();
    if (st.type === 'organizations') return showOrganizationModal();
    if (st.type === 'trip') {
        if (st.mode === 'edit' && st.tripId) {
            const trip = tripsCache.find(t => String(t.id) === String(st.tripId));
            if (trip) {
                console.log(`[trip-modals] Восстановление редактирования командировки ID: ${st.tripId}`);
                return showTripModal(trip);
            } else {
                console.warn(`[trip-modals] Командировка ID: ${st.tripId} не найдена в кэше, открываем создание`);
            }
        }
        console.log(`[trip-modals] Восстановление создания новой командировки`);
        return showTripModal();
    }
}

function initSearchableSelect(inputId, hiddenInputId, optionsContainerId) {
    const input = document.getElementById(inputId);
    const hiddenInput = document.getElementById(hiddenInputId);
    const optionsContainer = document.getElementById(optionsContainerId);
    const wrapper = input.closest('.input-wrap');

    if (!input || !hiddenInput || !optionsContainer || !wrapper) {
        console.error(`[trip-modals] SearchableSelect Error: One of the elements was not found for '${inputId}'.`);
        return;
    }

    const allOptions = Array.from(optionsContainer.querySelectorAll('.custom-option'));

    const openOptions = () => {
        optionsContainer.style.visibility = 'visible';
        optionsContainer.style.opacity = '1';
        optionsContainer.style.pointerEvents = 'auto';
        wrapper.style.zIndex = '10';
    };

    const closeOptions = () => {
        optionsContainer.style.visibility = 'hidden';
        optionsContainer.style.opacity = '0';
        optionsContainer.style.pointerEvents = 'none';
        wrapper.style.zIndex = '';
    };

    // Сбрасываем выделение опций при открытии
    const resetOptionsSelection = () => {
        allOptions.forEach(option => option.classList.remove('selected'));
    };

    input.addEventListener('focus', () => {
        openOptions();
        filterOptions();
        resetOptionsSelection();
    });

    const filterOptions = () => {
        const filter = input.value.toLowerCase();
        let hasVisibleOptions = false;
        
        allOptions.forEach(option => {
            const text = option.textContent.toLowerCase();
            const isVisible = text.includes(filter);
            option.style.display = isVisible ? '' : 'none';
            if (isVisible) hasVisibleOptions = true;
        });
        
        // Показываем/скрываем контейнер в зависимости от наличия видимых опций
        optionsContainer.style.display = hasVisibleOptions ? 'block' : 'none';
    };

    input.addEventListener('input', filterOptions);

    optionsContainer.addEventListener('mousedown', (e) => {
        const option = e.target.closest('.custom-option');
        if (option) {
            e.preventDefault();
            input.value = option.textContent.trim();
            hiddenInput.value = option.dataset.value;
            
            // Подсвечиваем выбранную опцию
            resetOptionsSelection();
            option.classList.add('selected');
            
            closeOptions();
        }
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            closeOptions();
        }
    });

    // Валидация - убедимся, что выбрана существующая должность
    input.addEventListener('blur', () => {
        const currentValue = input.value.trim();
        const isValidOption = allOptions.some(option => 
            option.textContent.trim() === currentValue
        );
        
        if (currentValue && !isValidOption) {
            // Сбрасываем невалидное значение
            input.value = '';
            hiddenInput.value = '';
        }
    });
}

export function showTripModal(tripToEdit = null) {
    const modal = document.getElementById('tripModal');
    if (!modal) {
        console.error('Модальное окно tripModal не найдено в DOM');
        return;
    }
    const isEditMode = tripToEdit !== null;

    // СОХРАНЯЕМ РЕЖИМ И ID ДЛЯ ВОССТАНОВЛЕНИЯ
    saveModalState({ 
        type: 'trip', 
        mode: isEditMode ? 'edit' : 'create', 
        tripId: isEditMode ? tripToEdit.id : null 
    });

    modal.innerHTML = `
    <div class="modal-content modal-large">
        <div class="modal-header">
            <h3 class="modal-title-left">${isEditMode ? 'Редактировать командировку' : 'Добавить командировку'}</h3>
        </div>
        <form id="add-trip-form" novalidate>
            <div class="form-body-scrollable">
                <div class="form-section">
                    <div class="input-wrap">
                        <label for="employee-search-input">Сотрудник(и)*</label>
                        <div id="employee-multi-select" style="position: relative;">
                            <input type="text" id="employee-search-input" placeholder="Начните вводить ФИО..." autocomplete="off">
                            <div id="employee-options" class="custom-select-options">
                                 ${state.employees.map(e => `<div class="custom-option" data-value="${e.id}">${escapeHTML(e.name)}</div>`).join('')}
                            </div>
                        </div>
                        <div class="selected-employees-container"></div>
                        <input type="hidden" id="trip-employee-ids" name="employee_ids" value="[]">
                    </div>
                    <div class="input-wrap" style="position: relative;">
                        <label for="organization-search-input">Организация*</label>
                        <input type="text" id="organization-search-input" placeholder="Начните вводить название..." autocomplete="off" required>
                        <div id="organization-options" class="custom-select-options">
                             ${state.organizations.map(o => `<div class="custom-option" data-value="${o.id}">${escapeHTML(o.name)}</div>`).join('')}
                        </div>
                        <input type="hidden" id="trip-organization-id" name="organization_id">
                    </div>
                </div>
                <div class="form-section">
                    <div class="input-wrap">
                        <label>Тип транспорта*</label>
                        <div class="transport-selector-v2">
                            <label class="transport-option"><input type="radio" name="transport_type" value="car" checked>${transportIcons.car}<span>Авто</span></label>
                            <label class="transport-option"><input type="radio" name="transport_type" value="train">${transportIcons.train}<span>Поезд</span></label>
                            <label class="transport-option"><input type="radio" name="transport_type" value="plane">${transportIcons.plane}<span>Самолет</span></label>
                        </div>
                    </div>
                    <div class="input-wrap">
                        <label for="trip-destination">Пункт назначения*</label>
                        <input type="text" id="trip-destination" placeholder="Город" required>
                    </div>
                </div>
                <div class="form-section">
                    <div class="form-grid-col-2">
                        <div class="input-wrap">
                            <label for="trip-start-date">Дата начала*</label>
                            <input type="date" id="trip-start-date" required>
                        </div>
                        <div class="input-wrap">
                            <label for="trip-end-date">Дата окончания*</label>
                            <input type="date" id="trip-end-date" required>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-actions modal-actions-right">
                <button type="button" class="btn back-btn" data-modal-close>Отмена</button>
                <button type="submit" class="btn">${isEditMode ? 'Сохранить' : 'Добавить'}</button>
            </div>
        </form>
    </div>`;

    if (isEditMode) {
        document.getElementById('trip-destination').value = tripToEdit.destination || '';
        document.getElementById('trip-start-date').value = tripToEdit.start_date || '';
        document.getElementById('trip-end-date').value = tripToEdit.end_date || '';
        const transportRadio = document.querySelector(`input[name="transport_type"][value="${tripToEdit.transport_type}"]`);
        if (transportRadio) transportRadio.checked = true;
        const organization = state.organizations.find(o => o.id == tripToEdit.organization_id);
        if (organization) {
            document.getElementById('organization-search-input').value = organization.name;
            document.getElementById('trip-organization-id').value = organization.id;
        }
        const initialEmployeeIds = tripToEdit.employee_id ? [tripToEdit.employee_id] : [];
        document.getElementById('trip-employee-ids').value = JSON.stringify(initialEmployeeIds);
        const employeeMultiSelect = document.getElementById('employee-multi-select');
        if (employeeMultiSelect) {
            employeeMultiSelect.style.pointerEvents = 'none';
            employeeMultiSelect.style.opacity = '0.6';
            const employeeSearchInput = document.getElementById('employee-search-input');
            if (employeeSearchInput) {
                employeeSearchInput.disabled = true;
                employeeSearchInput.placeholder = 'Сотрудник не может быть изменен';
            }
        }
    }

    openModal(modal);
    
    // Когда окно закрывают — сбрасываем "trips.activeModal"
    modal.addEventListener('click', (e) => {
        if (e.target.matches('[data-modal-close], [data-modal-close] *')) {
            clearModalState();
        }
    }, { once: true });
    
    // Закрытие по клику на подложку
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) clearModalState();
    }, { once: true });
    
    const form = modal.querySelector('#add-trip-form');
    if (form) {
        const idToEdit = isEditMode ? tripToEdit.id : null;
        const submitHandler = (e) => handleSaveTrip(e, idToEdit);
        form.addEventListener('submit', submitHandler, { once: true });
    }

    initMultiSelect(state);
    initSearchableSelect('organization-search-input', 'trip-organization-id', 'organization-options');
}

export function showEmployeeModal() {
    saveModalState({ type: 'employees' });
    const modal = document.getElementById('manageEmployeeModal');
    if (!modal) {
        console.error('Модальное окно manageEmployeeModal не найдено в DOM');
        return;
    }
    const positions = state.positions || [];

    modal.innerHTML = `
    <div class="modal-content modal-large manage-modal-content">
        <div class="manage-modal-header">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            <h3>Управление сотрудниками</h3>
        </div>
        <ul class="manage-list">
            ${state.employees.length > 0 ? state.employees.map((e, index) => `
                <li class="manage-list-item">
                    <span class="manage-item-number">${index + 1}.</span>
                    <div class="manage-item-details">
                        <div class="manage-item-name">${escapeHTML(e.name)}</div>
                        <div class="manage-item-position">${escapeHTML(e.position || 'Должность не указана')}</div>
                    </div>
                    <button class="btn-icon delete delete-employee" data-id="${e.id}" data-name="${escapeHTML(e.name)}" title="Удалить">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </li>`).join('') : '<li class="empty-state-message" style="margin: 0; padding: var(--space-5) 0;"><span>Список сотрудников пуст.</span></li>'}
        </ul>
        <form id="add-employee-form" class="manage-add-form" novalidate>
            <h4>Добавить нового сотрудника</h4>
            <div class="form-grid-col-3" style="gap: var(--space-4);">
                <div class="input-wrap">
                    <label for="new-employee-name">ФИО*</label>
                    <input type="text" id="new-employee-name" name="employee-name" placeholder="Введите ФИО" required>
                </div>
                <div class="input-wrap" style="position: relative;">
                    <label for="position-search-input">Должность*</label>
                    <input type="text" id="position-search-input" placeholder="Выберите должность..." autocomplete="off" required>
                    <div id="position-options" class="custom-select-options">
                        ${positions.map(p => `<div class="custom-option" data-value="${escapeHTML(p)}">${escapeHTML(p)}</div>`).join('')}
                    </div>
                    <input type="hidden" id="new-employee-position-value" name="employee-position" required>
                </div>
                <div class="input-wrap">
                    <label for="new-employee-phone">Телефон</label>
                    <input type="tel" id="new-employee-phone" name="employee-phone" placeholder="Номер телефона">
                </div>
            </div>
            <div class="manage-modal-actions">
                <button type="button" class="btn back-btn" data-modal-close>Закрыть</button>
                <button type="submit" class="btn">Добавить</button>
            </div>
        </form>
    </div>`;

    openModal(modal);
    
    // Когда окно закрывают — сбрасываем "trips.activeModal"
    modal.addEventListener('click', (e) => {
        if (e.target.matches('[data-modal-close], [data-modal-close] *')) {
            clearModalState();
        }
    }, { once: true });
    
    // Закрытие по клику на подложку
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) clearModalState();
    }, { once: true });
    
    employeeModalController.abort();
    employeeModalController = new AbortController();
    
    modal.addEventListener('click', (e) => {
        if (e.target.closest('.delete-employee')) {
            handleDeleteEmployee(e);
        }
    }, { signal: employeeModalController.signal });

    modal.querySelector('#add-employee-form')?.addEventListener('submit', handleAddEmployee, { once: true });
    
    initSearchableSelect('position-search-input', 'new-employee-position-value', 'position-options');
}

export function showOrganizationModal() {
    saveModalState({ type: 'organizations' });
    const modal = document.getElementById('organizationModal');
    if (!modal) {
        console.error('Модальное окно organizationModal не найдено в DOM');
        return;
    }

    modal.innerHTML = `
    <div class="modal-content modal-large manage-modal-content">
        <div class="manage-modal-header">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"></path><path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"></path><path d="M18 12H6"></path><path d="M18 8H6"></path><path d="m15 22-3-3-3 3"></path><path d="M12 3v2"></path><path d="M12 7v1"></path></svg>
            <h3>Управление организацией</h3>
        </div>
        <ul class="manage-list">
            ${state.organizations.length > 0 ? state.organizations.map((o, index) => `
                <li class="manage-list-item">
                    <span class="manage-item-number">${index + 1}.</span>
                    <div class="manage-item-color-indicator" style="background-color: ${o.color || '#cccccc'};"></div>
                    <div class="manage-item-details">
                        <div class="manage-item-name">${escapeHTML(o.name)}</div>
                    </div>
                    <button class="btn-icon delete delete-organization" data-id="${o.id}" data-name="${escapeHTML(o.name)}" title="Удалить">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </li>`).join('') : '<li class="empty-state-message" style="margin: 0; padding: var(--space-5) 0;"><span>Список организаций пуст.</span></li>'}
        </ul>
        <form id="add-organization-form" class="manage-add-form" novalidate>
            <h4>Добавить новую организацию</h4>
            <div class="input-wrap">
                <label for="new-organization-name">Название*</label>
                <input type="text" id="new-organization-name" placeholder="Введите название" required>
            </div>
            <div class="manage-modal-actions">
                <button type="button" class="btn back-btn" data-modal-close>Закрыть</button>
                <button type="submit" class="btn">Добавить</button>
            </div>
        </form>
    </div>`;

    openModal(modal);

    // Когда окно закрывают — сбрасываем "trips.activeModal"
    modal.addEventListener('click', (e) => {
        if (e.target.matches('[data-modal-close], [data-modal-close] *')) {
            clearModalState();
        }
    }, { once: true });
    
    // Закрытие по клику на подложку
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) clearModalState();
    }, { once: true });

    organizationModalController.abort();
    organizationModalController = new AbortController();

    modal.addEventListener('click', (e) => {
        if (e.target.closest('.delete-organization')) {
            handleDeleteOrganization(e);
        }
    }, { signal: organizationModalController.signal });
    
    modal.querySelector('#add-organization-form')?.addEventListener('submit', handleAddOrganization, { once: true });
}

export function showEmployeeCardModal(details) {
    const modal = document.getElementById('employeeCardModal');
    if (!modal) {
        console.error('Модальное окно employeeCardModal не найдено в DOM');
        return;
    }

    const { employee, metrics, status, upcomingTrips, gamification } = details;
    
    const statusClass = status.currentTrip ? 'status-busy' : 'status-free';
    const statusText = status.currentTrip 
        ? `В командировке: <em>${escapeHTML(status.currentTrip.destination)}</em>` 
        : 'Свободен';

    // --- ИЗМЕНЕНИЕ: Иконка телефона больше не вставляется в эту строку ---
    const phoneHtml = `<span>${escapeHTML(employee.phone || 'Телефон не указан')}</span>`;
    
    const { levelInfo, badges } = gamification;
    const gamificationHtml = `
        <div class="card-gamification">
            <h4>Прогресс и достижения</h4>
            <div class="level-info">
                <div class="level-header">
                    <span class="level-name">${escapeHTML(levelInfo.name)}</span>
                    <span class="level-progress-text">${levelInfo.progress.currentDays} / ${levelInfo.progress.nextLevelDays} дней</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-bar-fill" style="width: ${levelInfo.progress.percentage}%;"></div>
                </div>
            </div>
            <div class="badges-grid">
                ${badges.map(badge => `
                    <div 
                        class="badge-item ${badge.unlocked ? 'unlocked' : ''}" 
                        data-tooltip-title="${escapeHTML(badge.name)}"
                        data-tooltip-text="${escapeHTML(badge.description)}"
                    >
                        ${badgeIcons[badge.id] || ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    modal.innerHTML = `
    <div class="modal-content modal-large">
        <div class="employee-card">
            <div class="card-header">
                <h2>${escapeHTML(employee.name)}</h2>
                <p class="position">${escapeHTML(employee.position)}</p>
                <div class="phone" id="phone-container">${phoneHtml}</div>
            </div>

            <div class="card-metrics">
                <div class="metric-item">
                    <div class="metric-value">${metrics.totalTrips}</div>
                    <div class="metric-label">Всего выездов</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value">${metrics.totalDays}</div>
                    <div class="metric-label">Всего дней в поездках</div>
                </div>
                 <div class="metric-item status ${statusClass}">
                    <span class="status-dot"></span>
                    <span>${statusText}</span>
                </div>
            </div>

            ${gamificationHtml} 

            <div class="card-upcoming">
                <h4>Предстоящие командировки</h4>
                ${upcomingTrips.length > 0 ? `
                    <ul class="upcoming-list">
                        ${upcomingTrips.map(trip => `
                            <li>
                                <span class="upcoming-dates">${formatDisplayDate(trip.start_date)} - ${formatDisplayDate(trip.end_date)}</span>
                                <span class="upcoming-transport">${transportIcons[trip.transport_type] || ''}</span>
                                <span class="upcoming-destination">
                                    ${escapeHTML(trip.destination)}
                                    <em>(${escapeHTML(trip.customer)})</em>
                                </span>
                            </li>
                        `).join('')}
                    </ul>` : `
                    <div class="empty-state-message" style="margin:0; padding:var(--space-4) 0; border:none; background-color: var(--bg-hover-light); border-radius: var(--radius-md);">
                        <span>Нет запланированных поездок.</span>
                    </div>`}
            </div>
             <div class="modal-actions modal-actions-right" style="margin-top: var(--space-6);">
                <button type="button" class="btn back-btn" data-modal-close>Закрыть</button>
            </div>
        </div>
    </div>`;

    openModal(modal);

    // --- ИЗМЕНЕНИЕ: Безопасная вставка иконки телефона после создания HTML ---
    const phoneContainer = modal.querySelector('#phone-container');
    if (phoneContainer) {
        const phoneIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.5 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
        phoneContainer.insertAdjacentHTML('afterbegin', phoneIconSvg);
    }
}