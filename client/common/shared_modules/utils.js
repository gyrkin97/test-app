// --- ФАЙЛ: client/common/shared_modules/utils.js (ИСПРАВЛЕННАЯ ВЕРСИЯ) ---

/**
 * Возвращает правильную форму слова в зависимости от числа для русского языка.
 * @param {number} number - Число.
 * @param {string} key - Ключ для выбора набора слов ('question', 'score', 'minute').
 * @returns {string} - Правильная форма слова.
 */
export function pluralize(number, key) {
    const words = {
        question: ['вопрос', 'вопроса', 'вопросов'],
        score: ['балл', 'балла', 'баллов'],
        minute: ['минута', 'минуты', 'минут']
    };

    const forms = words[key];
    if (!forms) return '';

    const n = Math.abs(number) % 100;
    const n1 = n % 10;

    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
}

export function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, function(match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[match];
    });
}

export function formatDateForInput(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

/**
 * ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ: Функция сделана более устойчивой к разным форматам дат.
 * Безопасно форматирует дату в формат ДД.ММ.ГГГГ для отображения.
 * @param {string | number | null} dateInput - Входящие данные даты.
 * @returns {string} - Отформатированная дата или осмысленный заменитель.
 */
export function formatDisplayDate(dateInput) {
    if (!dateInput) return '—';

    const numericDate = Number(dateInput);
    const date = numericDate ? new Date(numericDate) : new Date(dateInput);

    if (isNaN(date.getTime())) {
        return 'Некорр. дата';
    }

    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}