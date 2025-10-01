// --- ФАЙЛ: client/dev-panel/modules/instruments-handlers.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль содержит функции-обработчики для вкладки "Реестр оборудования".
// Он инкапсулирует логику взаимодействия с API, обработки форм и управления DOM.

import { createInstrument, updateInstrument, deleteInstrument, fetchInstruments } from '../api/instruments-api.js';
import { closeModal, showConfirmModal } from '../../common/shared_modules/modals.js';
import { showToast } from '../../common/shared_modules/ui.js';
import { allInstruments, setInstruments } from './instruments-state.js';
import { renderTable } from './instruments-renderer.js';
import { formatDateForInput, addMonths } from '../../common/shared_modules/utils.js';

/**
 * Загружает список оборудования с сервера, обновляет состояние и отрисовывает таблицу.
 */
export async function loadInstruments() {
    const container = document.getElementById('instruments-table-container');
    container.innerHTML = '<div class="spinner"></div>'; // Показываем спиннер перед загрузкой
    try {
        const instruments = await fetchInstruments();
        setInstruments(instruments);
        renderTable();
    } catch (error) {
        console.error('Ошибка при загрузке оборудования:', error);
        container.innerHTML = '<p class="error-message">Не удалось загрузить данные. Попробуйте обновить страницу.</p>';
    }
}

/**
 * Обрабатывает сохранение (создание или обновление) записи об оборудовании.
 * @param {Event} e - Событие отправки формы.
 */
export async function handleSave(e) {
    e.preventDefault();
    const form = e.target;
    const modal = form.closest('.modal-overlay');
    const id = form.dataset.id;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Преобразуем пустые строки в null для корректной записи в БД
    for (const key in data) {
        if (data[key] === '') {
            data[key] = null;
        }
    }

    try {
        if (id) {
            await updateInstrument(id, data);
            showToast('Запись успешно обновлена', 'success');
        } else {
            await createInstrument(data);
            showToast('Запись успешно создана', 'success');
        }
        closeModal(modal);
        await loadInstruments(); // Перезагружаем данные после сохранения
    } catch (error) {
        console.error('Ошибка при сохранении записи:', error);
        // Глобальный обработчик покажет тост
    }
}

/**
 * Обрабатывает удаление записи.
 * @param {HTMLElement} deleteButton - Кнопка удаления, на которую кликнули.
 */
export async function handleDelete(deleteButton) {
    const id = deleteButton.closest('tr').dataset.id;
    const instrument = allInstruments.find(i => i.id == id);
    if (!instrument) return;

    showConfirmModal({
        title: 'Подтвердите удаление',
        text: `Вы уверены, что хотите удалить запись: "${instrument.name}" (Зав. №: ${instrument.serial_number || 'б/н'})?`,
        onConfirm: async () => {
            try {
                await deleteInstrument(id);
                showToast('Запись успешно удалена', 'success');
                await loadInstruments(); // Перезагружаем данные
            } catch (error) {
                console.error('Ошибка при удалении:', error);
            }
        }
    });
}

/**
 * Настраивает автоматический расчет следующей даты поверки при изменении даты или интервала.
 * Эта функция теперь вызывается из `instruments-modals.js` в нужный момент.
 */
export function setupDateCalculation() {
    const modal = document.getElementById('instrumentModal');
    if (!modal) return;
    
    const lastDateInput = modal.querySelector('#instrumentLastDate');
    const intervalInput = modal.querySelector('#instrumentInterval');
    const nextDateInput = modal.querySelector('#instrumentNextDate');

    if (!lastDateInput || !intervalInput || !nextDateInput) {
        // Эта проверка теперь служит дополнительной защитой, но не должна срабатывать
        console.warn('Поля для расчета даты не найдены в модальном окне.');
        return;
    }

    const calculate = () => {
        const lastDate = lastDateInput.value;
        const interval = parseInt(intervalInput.value, 10);
        if (lastDate && !isNaN(interval) && interval > 0) {
            const nextDate = addMonths(new Date(lastDate), interval);
            nextDateInput.value = formatDateForInput(nextDate);
        }
    };

    lastDateInput.addEventListener('input', calculate);
    intervalInput.addEventListener('input', calculate);
}

/**
 * Настраивает все обработчики событий для модальных окон (выбор типа, сохранение).
 * @param {Function} showEntryModal - Коллбэк для показа модального окна создания/редактирования.
 */
export function setupModalHandlers(showEntryModal) {
    // 1. Обработка выбора типа оборудования
    document.getElementById('addChoiceModal').addEventListener('click', (e) => {
        const choiceButton = e.target.closest('button[data-type]');
        if (choiceButton) {
            const type = choiceButton.dataset.type;
            closeModal(document.getElementById('addChoiceModal'));
            showEntryModal(type, null);
        }
    });

    // 2. Настройка обработчика отправки основной формы
    const instrumentModal = document.getElementById('instrumentModal');
    instrumentModal.addEventListener('submit', (e) => {
        if (e.target.matches('#instrumentForm')) {
            handleSave(e);
        }
    });
    
    // ИСПРАВЛЕНИЕ: Вызов setupDateCalculation() был удален отсюда, 
    // так как он вызывался слишком рано. Теперь он вызывается из `instruments-modals.js`.
}