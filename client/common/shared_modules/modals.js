// --- ФАЙЛ: client/common/shared_modules/modals.js (ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ) ---
// Этот модуль содержит универсальный и централизованный код для управления
// всеми модальными окнами в приложении, обеспечивая консистентное поведение и доступность (a11y).

// Хранит элемент, который был в фокусе до открытия модального окна, для восстановления фокуса после закрытия.
let previouslyFocusedElement;

/**
 * Показывает универсальное модальное окно для подтверждения, информирования или ввода данных.
 * @param {object} options - Опции для настройки модального окна.
 * @param {string} options.title - Заголовок окна.
 * @param {string} options.text - Основной текст сообщения.
 * @param {function} [options.onConfirm] - Функция, вызываемая при нажатии на кнопку подтверждения.
 * @param {function} [options.onCancel] - Функция, вызываемая при отмене/закрытии окна.
 * @param {string} [options.confirmText='Да, уверен'] - Текст на кнопке подтверждения.
 * @param {string} [options.cancelText='Нет, отмена'] - Текст на кнопке отмены.
 * @param {boolean} [options.isInput=false] - Если true, показывает поле для ввода текста.
 * @param {string} [options.inputPlaceholder=''] - Плейсхолдер для поля ввода.
 */
export function showConfirmModal({ title, text, onConfirm, onCancel, confirmText = 'Да, уверен', cancelText = 'Нет, отмена', isInput = false, inputPlaceholder = '' }) {
    const confirmModal = document.getElementById('confirmModal');
    if (!confirmModal) {
        console.error('Критическая ошибка: Модальное окно #confirmModal не найдено в DOM!');
        if (confirm(`${title}\n\n${text}`)) {
            if (onConfirm) onConfirm(isInput ? prompt(text, inputPlaceholder) : undefined);
        } else {
            if (onCancel) onCancel();
        }
        return;
    }

    // Заполнение контента
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalText').textContent = text;
    
    const inputWrapper = document.getElementById('confirmModalInputWrapper');
    const textInput = document.getElementById('confirmModalInput');
    
    if (isInput) {
        inputWrapper.classList.remove('hidden');
        textInput.value = '';
        textInput.placeholder = inputPlaceholder;
        setTimeout(() => textInput.focus(), 100);
    } else {
        inputWrapper.classList.add('hidden');
    }

    // Упрощенная логика без клонирования элементов
    const okBtn = document.getElementById('confirmModalOkBtn');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');
    
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    
    openModal(confirmModal);
    
    if (onConfirm) {
        okBtn.classList.add('btn-danger');
        cancelBtn.style.display = '';

        const confirmAction = () => {
            if (isInput) {
                const inputValue = textInput.value.trim();
                if (!inputValue) {
                    textInput.focus(); 
                    return; 
                }
                onConfirm(inputValue);
            } else {
                onConfirm();
            }
            closeModal(confirmModal);
        };
        
        okBtn.onclick = confirmAction;
        textInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmAction();
            }
        };

        cancelBtn.onclick = () => {
            closeModal(confirmModal);
            if (onCancel) {
                onCancel();
            }
        };
        
        if (isInput) {
            okBtn.classList.remove('btn-danger');
        }

    } else {
        okBtn.classList.remove('btn-danger');
        okBtn.textContent = 'OK';
        cancelBtn.style.display = 'none';
        okBtn.onclick = () => closeModal(confirmModal);
    }
}

/**
 * Обработчик событий клавиатуры для модальных окон (ловушка фокуса и Escape).
 * @param {KeyboardEvent} event 
 */
function handleModalKeyDown(event) {
    const activeModal = document.querySelector('.modal-overlay.visible');
    if (!activeModal) return;

    if (event.key === 'Escape' && activeModal.id !== 'passwordModal' && activeModal.id !== 'devPasswordModal') {
        const closeButton = activeModal.querySelector('[data-modal-close], #confirmModalCancelBtn');
        if (closeButton) {
            closeButton.click(); 
        } else {
            closeModal(activeModal);
        }
        return;
    }

    if (event.key === 'Tab') {
        const focusableElements = Array.from(
            activeModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter(el => !el.disabled && el.offsetParent !== null);

        if (focusableElements.length === 0) {
            event.preventDefault();
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (event.shiftKey) { 
            if (document.activeElement === firstElement) {
                lastElement.focus();
                event.preventDefault();
            }
        } else { 
            if (document.activeElement === lastElement) {
                firstElement.focus();
                event.preventDefault();
            }
        }
    }
}

/**
 * Открывает указанное модальное окно с учетом доступности.
 * @param {HTMLElement} modal - Элемент модального окна для открытия.
 */
export function openModal(modal) {
    if (!modal) return;
    previouslyFocusedElement = document.activeElement;
    modal.classList.add('visible');
    
    const firstFocusable = modal.querySelector('input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) {
        setTimeout(() => firstFocusable.focus(), 50);
    }

    document.addEventListener('keydown', handleModalKeyDown);
}

/**
 * Закрывает указанное модальное окно с учетом доступности.
 * @param {HTMLElement} modal - Элемент модального окна для закрытия.
 */
export function closeModal(modal) {
    if (!modal || !modal.classList.contains('visible')) return;
    modal.classList.remove('visible');

    if (previouslyFocusedElement) {
        previouslyFocusedElement.focus();
    }
    
    document.removeEventListener('keydown', handleModalKeyDown);
}

/**
 * Инициализирует все модальные окна на странице, управляемые через data-атрибуты.
 */
function initializeDeclarativeModals() {
    document.body.addEventListener('click', (event) => {
        const openTrigger = event.target.closest('[data-modal-open]');
        if (openTrigger) {
            const modalId = openTrigger.dataset.modalOpen;
            const modal = document.getElementById(modalId);
            if (modal) openModal(modal);
            return;
        }

        const closeTrigger = event.target.closest('[data-modal-close]');
        if (closeTrigger) {
            const modal = closeTrigger.closest('.modal-overlay');
            if (modal) closeModal(modal);
            return;
        }
        
        if (event.target.matches('.modal-overlay')) {
            const modal = event.target;
            if (modal.id === 'passwordModal' || modal.id === 'devPasswordModal') {
                const modalContent = modal.querySelector('.modal-content');
                if (modalContent) {
                    modalContent.classList.add('shake');
                    setTimeout(() => modalContent.classList.remove('shake'), 500);
                }
                return;
            }
            closeModal(modal);
        }
    });
}

// Запускаем инициализацию после полной загрузки DOM
document.addEventListener('DOMContentLoaded', initializeDeclarativeModals);