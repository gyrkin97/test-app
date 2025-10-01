// --- ФАЙЛ: dev-panel/modules/instruments-renderer.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль отвечает исключительно за рендеринг (создание HTML) таблицы оборудования.
// Он читает данные из instruments-state.js и преобразует их в DOM-элементы.

import { allInstruments } from './instruments-state.js';
import { escapeHTML } from '../../common/shared_modules/utils.js';
import { openModal } from '../../common/shared_modules/modals.js';

/**
 * Вспомогательная функция для форматирования даты в читаемый формат ДД.ММ.ГГГГ.
 * @param {string | number | null | undefined} dateInput - Входящие данные.
 * @returns {string} - Отформатированная дата или прочерк.
 */
function formatDate(dateInput) {
    // 1. Отсекаем все пустые значения
    if (dateInput === null || dateInput === undefined || dateInput === '') {
        return '—';
    }

    let date;
    // 2. Обрабатываем разные типы данных
    if (typeof dateInput === 'number') {
        // Если пришло число (timestamp)
        date = new Date(dateInput);
    } else if (typeof dateInput === 'string') {
        // Если пришла строка, пытаемся ее распарсить
        date = new Date(dateInput);
    } else {
        // Если пришло что-то иное, возвращаем как есть
        return String(dateInput);
    }

    // 3. Проверяем, удалось ли создать валидную дату
    if (isNaN(date.getTime())) {
        return String(dateInput); // Если дата невалидна, возвращаем исходное значение
    }

    // 4. Форматируем валидную дату
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}


/**
 * Главная функция рендеринга таблицы оборудования.
 */
export function renderTable() {
    const container = document.getElementById('instruments-table-container');
    if (!container) {
        console.error('Render Error: Container #instruments-table-container not found.');
        return;
    }

    // 1. Обработка случая, когда данных нет
    if (!allInstruments || allInstruments.length === 0) {
        container.innerHTML = `
            <div class="empty-state-message">
                <span>Данные об оборудовании отсутствуют.</span>
                <button id="addInstrumentBtnEmpty" class="btn" style="margin-top: var(--space-4);">Добавить первую запись</button>
            </div>`;
        // Навешиваем событие на новую кнопку
        document.getElementById('addInstrumentBtnEmpty').onclick = () => openModal(document.getElementById('addChoiceModal'));
        return;
    }

    // 2. Сортировка данных перед отображением: сначала просроченные, потом по возрастанию даты
    allInstruments.sort((a, b) => {
        const dateA = a.next_verification_date ? new Date(Number(a.next_verification_date)).getTime() : Infinity;
        const dateB = b.next_verification_date ? new Date(Number(b.next_verification_date)).getTime() : Infinity;
        if (dateA === dateB) {
            return a.name.localeCompare(b.name);
        }
        return dateA - dateB;
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Устанавливаем время на начало дня для корректного сравнения
    const typeLabels = { 
        instrument: 'СИ', 
        standard: 'Эталон', 
        auxiliary: 'Вспом.' 
    };

    // 3. Создание HTML-строк для каждой записи
    const tableRows = allInstruments.map(item => {
        const nextDate = item.next_verification_date ? new Date(Number(item.next_verification_date)) : null;
        let rowClass = 'is-editable'; // Все строки по умолчанию кликабельны для редактирования
        if (nextDate && nextDate < today) {
            rowClass += ' is-overdue'; // Добавляем класс для просроченных записей
        }

        // Условный рендеринг кнопки-ссылки на ФГИС "АРШИН"
        const arshinButtonHTML = (item.arshin_link && item.arshin_link.trim() !== '') 
            ? `<a href="${escapeHTML(item.arshin_link)}" target="_blank" rel="noopener noreferrer" class="btn-icon link" title="Открыть во ФГИС АРШИН"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`
            : '';
        
        return `
            <tr data-id="${item.id}" class="${rowClass}" title="Нажмите для редактирования">
                <td data-label="Наименование">${escapeHTML(item.name)}</td>
                <td data-label="Тип">${typeLabels[item.type] || 'СИ'}</td>
                <td data-label="Зав.№">${escapeHTML(item.serial_number || '—')}</td>
                <td data-label="След. поверка">${formatDate(item.next_verification_date)}</td>
                <td data-label="Ответственный">${escapeHTML(item.responsible_person || '—')}</td>
                <td data-label="№ документа">${escapeHTML(item.verification_doc_number || '—')}</td>
                <td data-label="Год выпуска">${escapeHTML(item.manufacture_year || '—')}</td>
                <td class="actions-cell">
                    ${arshinButtonHTML}
                    <button type="button" class="btn-icon delete" title="Удалить">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </td>
            </tr>`;
    }).join('');

    // 4. Формирование и вставка полной таблицы в DOM
    container.innerHTML = `
        <table class="admin-table instruments-table">
            <thead>
                <tr>
                    <th>Наименование</th>
                    <th>Тип</th>
                    <th>Зав.№</th>
                    <th>След. поверка</th>
                    <th>Ответственный</th>
                    <th>№ документа</th>
                    <th>Год выпуска</th>
                    <th class="actions-header">Действия</th>
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>`;
}