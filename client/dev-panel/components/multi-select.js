// --- ФАЙЛ: dev-panel/components/multi-select.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль инкапсулирует всю логику для работы кастомного
// UI-компонента "мульти-селект" для выбора нескольких сотрудников.

import { escapeHTML } from '../../common/shared_modules/utils.js';

/**
 * Инициализирует компонент мульти-селекта для выбора сотрудников.
 * @param {object} state - Глобальный объект состояния, содержащий state.employees.
 */
export function initMultiSelect(state) {
    const wrapper = document.getElementById('employee-multi-select');
    if (!wrapper) return;

    // Находим все необходимые DOM-элементы
    const hiddenInput = document.getElementById('trip-employee-ids');
    const searchInput = document.getElementById('employee-search-input');
    const optionsContainer = document.getElementById('employee-options');
    const listContainer = document.querySelector('.selected-employees-container');

    if (!searchInput || !optionsContainer || !listContainer || !hiddenInput) {
        console.error('MultiSelect: Не найдены все необходимые элементы для инициализации.');
        return;
    }

    // --- Вспомогательные функции для управления состоянием ---

    const getSelectedIds = () => {
        try {
            return JSON.parse(hiddenInput.value || '[]');
        } catch (e) {
            return [];
        }
    };

    const setSelectedIds = (ids) => {
        hiddenInput.value = JSON.stringify(ids);
    };

    // --- Функции для управления UI ---

    const openOptions = () => {
        if (optionsContainer.style.visibility === 'visible') return;
        optionsContainer.style.visibility = 'visible';
        optionsContainer.style.opacity = '1';
        optionsContainer.style.pointerEvents = 'auto';
        filterOptions();
    };

    const closeOptions = () => {
        optionsContainer.style.visibility = 'hidden';
        optionsContainer.style.opacity = '0';
        optionsContainer.style.pointerEvents = 'none';
    };

    /**
     * Перерисовывает список выбранных сотрудников ("теги").
     */
    const updateView = () => {
        const selectedIds = getSelectedIds();
        
        listContainer.innerHTML = selectedIds.map((id, index) => {
            const employee = state.employees.find(e => e.id == id);
            return employee ? `
                <div class="selected-employee-item" data-id="${id}">
                    <span class="employee-number">${index + 1}.</span>
                    <span class="employee-name">${escapeHTML(employee.name)}</span>
                    <button class="remove-item-btn" type="button" title="Удалить">&times;</button>
                </div>` : '';
        }).join('');
        
        filterOptions(); // Обновляем список доступных опций после ререндера
    };

    /**
     * Фильтрует выпадающий список опций на основе введенного текста и уже выбранных сотрудников.
     */
    const filterOptions = () => {
        const filter = searchInput.value.toLowerCase();
        const selectedIds = getSelectedIds();
        optionsContainer.querySelectorAll('.custom-option').forEach(option => {
            const isSelected = selectedIds.includes(parseInt(option.dataset.value, 10));
            const text = option.textContent.toLowerCase();
            option.style.display = (!isSelected && text.includes(filter)) ? '' : 'none';
        });
    };
    
    // --- Настройка обработчиков событий ---

    searchInput.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // Предотвращаем срабатывание document.mousedown
        openOptions();
    });

    searchInput.addEventListener('input', filterOptions);

    optionsContainer.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Предотвращаем потерю фокуса у поля ввода
        const option = e.target.closest('.custom-option');
        if (option) {
            const selectedIds = getSelectedIds();
            const newId = parseInt(option.dataset.value, 10);
            if (!selectedIds.includes(newId)) {
                selectedIds.push(newId);
                setSelectedIds(selectedIds);
            }
            searchInput.value = '';
            updateView();
            searchInput.focus(); // Возвращаем фокус для выбора следующего сотрудника
        }
    });

    listContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-item-btn');
        if (removeBtn) {
            const item = removeBtn.closest('.selected-employee-item');
            const idToRemove = parseInt(item.dataset.id, 10);
            const selectedIds = getSelectedIds().filter(id => id !== idToRemove);
            setSelectedIds(selectedIds);
            updateView();
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (!wrapper.contains(e.target)) {
            closeOptions();
        }
    });

    // Первоначальный рендер на случай, если компонент инициализируется с уже выбранными сотрудниками (режим редактирования)
    updateView();
}