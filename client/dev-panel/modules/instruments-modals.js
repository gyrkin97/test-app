// --- ФАЙЛ: client/dev-panel/modules/instruments-modals.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль управляет отображением, предзаполнением и поведением
// модальных окон, используемых в разделе "Реестр оборудования".

import { openModal } from '../../common/shared_modules/modals.js';
import { formatDateForInput } from '../../common/shared_modules/utils.js';
import { setupDateCalculation } from './instruments-handlers.js';

/**
 * Сохраняет состояние открытого модального окна для реестра оборудования
 */
function saveInstrumentModalState(modalType, context = {}) {
    sessionStorage.setItem('instruments.activeModal', modalType);
    sessionStorage.setItem('instruments.modalContext', JSON.stringify(context));
}

/**
 * Очищает состояние модального окна
 */
function clearInstrumentModalState() {
    sessionStorage.removeItem('instruments.activeModal');
    sessionStorage.removeItem('instruments.modalContext');
}

/**
 * Получает сохраненное состояние модального окна оборудования
 */
function getInstrumentModalState() {
    const modalType = sessionStorage.getItem('instruments.activeModal');
    const contextStr = sessionStorage.getItem('instruments.modalContext');
    let context = {};
    
    try {
        context = contextStr ? JSON.parse(contextStr) : {};
    } catch (e) {
        console.warn('Ошибка парсинга контекста модалки оборудования:', e);
    }
    
    return { modalType, context };
}

/**
 * Восстанавливает состояние модального окна при загрузке
 */
export function restoreInstrumentModalState() {
    const { modalType, context } = getInstrumentModalState();
    if (!modalType) return;

    console.log(`[instruments-modals] Восстановление модального окна:`, { modalType, context });

    if (modalType === 'addChoice') {
        const modal = document.getElementById('addChoiceModal');
        if (modal) {
            openModal(modal);
        }
    } else if (modalType === 'instrument') {
        // Восстанавливаем конкретную форму создания/редактирования
        if (context.type && context.instrumentId) {
            // Здесь нужно найти инструмент по ID и показать модалку редактирования
            // Это потребует доступа к allInstruments, что может быть сложно
            // Пока просто показываем пустую модалку для указанного типа
            showEntryModal(context.type);
        } else if (context.type) {
            showEntryModal(context.type);
        }
    }
}

/**
 * Переключает видимость полей в форме в зависимости от выбранного типа оборудования.
 * Эта функция скрывает все группы полей, а затем показывает только те,
 * которые релевантны для выбранного типа (СИ, Эталон, Вспомогательное).
 * @param {'instrument' | 'standard' | 'auxiliary'} type - Тип оборудования.
 */
function toggleFormFields(type) {
    const form = document.getElementById('instrumentForm');
    if (!form) return;

    // Сначала скрываем все элементы с атрибутом data-group
    form.querySelectorAll('[data-group]').forEach(el => {
        el.style.display = 'none';
    });

    // Затем показываем нужные группы
    switch (type) {
        case 'instrument':
            // Для СИ показываем поля поверки, специфичные для СИ и общие поля
            form.querySelectorAll('[data-group="verification"], [data-group="instrument-only"], [data-group="common"]')
                .forEach(el => el.style.display = 'block');
            break;
        case 'standard':
            // Для эталонов показываем поля поверки, специфичные для эталонов и общие поля
            form.querySelectorAll('[data-group="verification"], [data-group="standard-only"], [data-group="common"]')
                .forEach(el => el.style.display = 'block');
            break;
        case 'auxiliary':
            // Для вспомогательного оборудования показываем только его уникальные поля и общие
            form.querySelectorAll('[data-group="auxiliary-only"], [data-group="common"]')
                .forEach(el => el.style.display = 'block');
            break;
    }
}

/**
 * Отображает модальное окно для добавления или редактирования записи об оборудовании.
 * @param {'instrument' | 'standard' | 'auxiliary'} type - Тип оборудования.
 * @param {object | null} instrument - Объект оборудования для редактирования или null для создания новой записи.
 */
export function showEntryModal(type, instrument = null) {
    saveInstrumentModalState('instrument', { type, instrumentId: instrument?.id });
    
    const isEdit = instrument !== null;
    const titles = {
        instrument: 'Средство измерения',
        standard: 'Эталон',
        auxiliary: 'Вспомогательное оборудование'
    };
    
    const modal = document.getElementById('instrumentModal');
    if (!modal) {
        console.error('Критическая ошибка: модальное окно #instrumentModal не найдено в DOM.');
        return;
    }

    // Устанавливаем заголовок модального окна
    const modalTitle = document.getElementById('instrumentModalTitle');
    if (modalTitle) {
        modalTitle.textContent = `${isEdit ? 'Редактировать' : 'Добавить'}: ${titles[type] || 'запись'}`;
    }

    const form = document.getElementById('instrumentForm');
    if (!form) {
        console.error('Критическая ошибка: форма #instrumentForm не найдена в DOM.');
        return;
    }
    
    // 1. Сбрасываем форму, чтобы очистить данные от предыдущего открытия
    form.reset();
    form.dataset.id = isEdit ? instrument.id : ''; // Сохраняем ID в data-атрибут для обработчика сохранения

    // 2. Сбрасываем состояние спойлера "Дополнительные параметры"
    const advancedToggle = document.getElementById('advanced-toggle');
    const advancedContent = document.getElementById('advanced-content');
    if (advancedToggle && advancedContent) {
        advancedToggle.classList.remove('is-open');
        advancedContent.classList.remove('is-open');
    }

    // 3. Заполняем поля формы данными (если это режим редактирования)
    // Использование `|| ''` предотвращает запись `null` или `undefined` в поля
    document.getElementById('instrumentType').value = type;
    document.getElementById('instrumentName').value = isEdit ? instrument.name || '' : '';
    document.getElementById('instrumentModification').value = isEdit ? instrument.modification || '' : '';
    document.getElementById('instrumentSerial').value = isEdit ? instrument.serial_number || '' : '';
    document.getElementById('instrumentInventory').value = isEdit ? instrument.inventory_number || '' : '';
    document.getElementById('instrumentManufactureYear').value = isEdit ? instrument.manufacture_year || '' : '';
    document.getElementById('instrumentCommissioningDate').value = isEdit ? formatDateForInput(instrument.commissioning_date) : '';
    document.getElementById('instrumentResponsible').value = isEdit ? instrument.responsible_person || '' : '';
    document.getElementById('instrumentLastDate').value = isEdit ? formatDateForInput(instrument.last_verification_date) : '';
    document.getElementById('instrumentInterval').value = isEdit ? instrument.verification_interval_months || '' : '';
    document.getElementById('instrumentNextDate').value = isEdit ? formatDateForInput(instrument.next_verification_date) : '';
    document.getElementById('instrumentDocNumber').value = isEdit ? instrument.verification_doc_number || '' : '';
    document.getElementById('instrumentArshinLink').value = isEdit ? instrument.arshin_link || '' : '';
    document.getElementById('instrumentSiTypeRegNumber').value = isEdit ? instrument.si_type_reg_number || '' : '';
    document.getElementById('instrumentFifOeiRegNumber').value = isEdit ? instrument.fif_oei_reg_number || '' : '';
    document.getElementById('instrumentNotes').value = isEdit ? instrument.notes || '' : '';

    // 4. Настраиваем видимость полей в зависимости от типа оборудования
    toggleFormFields(type);

    // 5. Открываем модальное окно
    openModal(modal);

    // 6. ИСПРАВЛЕНО: Вызываем настройку расчета дат здесь, ПОСЛЕ того как модальное
    // окно открыто и все его дочерние элементы гарантированно существуют в DOM.
    setupDateCalculation();

    // Когда окно закрывают — сбрасываем "instruments.activeModal"
    modal.addEventListener('click', (e) => {
        if (e.target.matches('[data-modal-close], [data-modal-close] *')) {
            clearInstrumentModalState();
        }
    }, { once: true });
    
    // Закрытие по клику на подложку
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) clearInstrumentModalState();
    }, { once: true });
}

/**
 * Показывает модальное окно выбора типа записи
 */
export function showAddChoiceModal() {
    saveInstrumentModalState('addChoice');
    const modal = document.getElementById('addChoiceModal');
    if (!modal) {
        console.error('Модальное окно addChoiceModal не найдено в DOM');
        return;
    }
    
    openModal(modal);
    
    // Когда окно закрывают — сбрасываем "instruments.activeModal"
    modal.addEventListener('click', (e) => {
        if (e.target.matches('[data-modal-close], [data-modal-close] *')) {
            clearInstrumentModalState();
        }
    }, { once: true });
    
    // Закрытие по клику на подложку
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) clearInstrumentModalState();
    }, { once: true });
}