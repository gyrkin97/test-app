// --- ФАЙЛ: client/dev-panel/instruments-dashboard.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Главный модуль-оркестратор для вкладки "Реестр оборудования".
// Его задачи:
// 1. Инициализировать базовую HTML-структуру вкладки.
// 2. Настроить глобальные обработчики событий для этой вкладки.
// 3. Связывать действия пользователя (клики, отправка форм) с функциями из
//    специализированных модулей.
// 4. Запускать начальную загрузку данных.

import { openModal } from '../common/shared_modules/modals.js';
import { allInstruments } from './modules/instruments-state.js';
import { showEntryModal, showAddChoiceModal, restoreInstrumentModalState } from './modules/instruments-modals.js';
import {
    loadInstruments,
    handleDelete,
    setupModalHandlers
} from './modules/instruments-handlers.js';

/**
 * Главная функция инициализации модуля "Реестр оборудования".
 */
export function initInstrumentsDashboard() {
    const contentArea = document.getElementById('instruments-content-area');
    
    // Проверяем существование contentArea
    if (!contentArea) {
        console.error('Контейнер instruments-content-area не найден в DOM');
        return;
    }
    
    contentArea.innerHTML = `
        <div class="card">
            <div class="admin-controls">
                <h2>Реестр Оборудования</h2>
                <div class="admin-actions">
                    <button id="addInstrumentBtn" class="btn">Добавить запись</button>
                </div>
            </div>
            <div id="instruments-table-container">
                <div class="spinner"></div>
            </div>
        </div>`;

    // --- Настройка обработчиков событий ---

    // 1. Кнопка "Добавить запись"
    const addInstrumentBtn = document.getElementById('addInstrumentBtn');
    if (addInstrumentBtn) {
        addInstrumentBtn.addEventListener('click', () => {
            showAddChoiceModal();
        });
    } else {
        console.error('Кнопка addInstrumentBtn не найдена в DOM');
    }

    // 2. Делегирование кликов по таблице (редактирование и удаление)
    contentArea.addEventListener('click', (e) => {
        // Игнорируем клики по внешним ссылкам (например, ФГИС АРШИН)
        if (e.target.closest('a.btn-icon.link')) return;

        // Обработка клика по строке для редактирования
        const editableRow = e.target.closest('tr.is-editable');
        if (editableRow && !e.target.closest('.actions-cell')) {
            const id = editableRow.dataset.id;
            if (!id) {
                console.warn('Строка таблицы не содержит data-id атрибута');
                return;
            }
            
            const instrument = allInstruments.find(i => i.id == id);
            if (instrument) {
                showEntryModal(instrument.type || 'instrument', instrument);
            } else {
                console.warn(`Инструмент с ID ${id} не найден в allInstruments`);
            }
            return;
        }

        // Обработка клика по кнопке удаления
        const deleteBtn = e.target.closest('button.btn-icon.delete');
        if (deleteBtn) {
            handleDelete(deleteBtn);
            return;
        }
    });

    // 3. Настройка всех обработчиков внутри модальных окон.
    // Вызов setupDateCalculation() был удален отсюда, так как он вызывал ошибку,
    // пытаясь найти элементы до того, как модальное окно было создано.
    // Теперь он вызывается внутри setupModalHandlers.
    setupModalHandlers(showEntryModal);

    // 4. Первичная загрузка данных
    loadInstruments();

    // 5. После загрузки таблицы — восстановим модалку, если была открыта
    // Используем optional chaining на случай если функция не определена
    if (typeof restoreInstrumentModalState === 'function') {
        restoreInstrumentModalState();
    } else {
        console.warn('Функция restoreInstrumentModalState не найдена');
    }
}