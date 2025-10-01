// --- ФАЙЛ: dev-panel/modules/trip-renderer.js (ОБНОВЛЕННАЯ ВЕРСИЯ) ---
// Этот модуль отвечает исключительно за рендеринг (создание HTML)
// для компонента "График командировок" и управление его событиями.

import { state } from './trip-state.js';
import { transportIcons } from '../../common/assets/icons.js';
import { escapeHTML, formatDisplayDate } from '../../common/shared_modules/utils.js';

// Глобальный контроллер для отмены "прослушек" событий перед ререндерингом.
let eventAbortController = new AbortController();

/**
 * Главная функция рендеринга, которая строит сетку графика командировок.
 * @param {Date} currentDate - Текущая дата для отображения месяца и года.
 */
export function render(currentDate) {
    eventAbortController.abort();
    eventAbortController = new AbortController();

    const container = document.getElementById('trips-timeline-container');
    const tooltip = document.getElementById('trip-tooltip');

    if (!container || !tooltip) {
        console.error('[renderer] CRITICAL: Не найден контейнер #trips-timeline-container или тултип #trip-tooltip.');
        return;
    }

    if (!(currentDate instanceof Date) || isNaN(currentDate)) {
        container.innerHTML = '<div class="empty-state-message"><span>Ошибка отображения: передана неверная дата.</span></div>';
        return;
    }
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (!state.employees || state.employees.length === 0) {
        container.innerHTML = `<div class="empty-state-message"><span>Нет данных о сотрудниках для отображения графика.</span></div>`;
        return;
    }

    // Гарантируем уникальность сотрудников, чтобы избежать ошибок рендеринга из-за "грязных" данных
    const uniqueEmployees = [...new Map(state.employees.map(e => [e.id, e])).values()];

    let headerHtml = '<div class="grid-header-cell employee-header">Сотрудник / Дата</div>';
    const today = new Date();
    const isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        const dayDate = new Date(year, month, i);
        const isWeekend = dayDate.getDay() === 6 || dayDate.getDay() === 0;
        const isToday = isSameDay(dayDate, today);
        headerHtml += `<div class="grid-header-cell ${isWeekend ? 'is-weekend' : ''} ${isToday ? 'is-today' : ''}">${i}</div>`;
    }

    // утилита: #RRGGBB -> rgba(r,g,b,alpha)
    const hexToRgba = (hex, alpha = 0.22) => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
      if (!m) return null;
      const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    let rowsHtml = '';
    uniqueEmployees.forEach(employee => {
        // Используем нестрогое сравнение (==), чтобы игнорировать разницу типов "строка" vs "число"
        const tripsForEmployee = state.trips.filter(trip => trip.employee_id == employee.id);

        rowsHtml += `<div class="employee-name-cell" data-employee-id="${employee.id}">${escapeHTML(employee.name || `ID: ${employee.id}`)}</div>`;
        
        // 1) фоновые клетки для строки сотрудника
        let rowBackgroundHtml = '';
        for (let i = 1; i <= daysInMonth; i++) {
            const dayDate = new Date(year, month, i);
            const isWeekend = dayDate.getDay() === 6 || dayDate.getDay() === 0;
            const isToday = isSameDay(dayDate, today);
            // командировка в этот день
            const dayTrip = tripsForEmployee.find(trip => {
                const s = new Date(trip.start_date + 'T00:00:00');
                const e = new Date(trip.end_date + 'T00:00:00');
                return s <= dayDate && dayDate <= e;
            });
            const dayColor = dayTrip?.customer_color ? hexToRgba(dayTrip.customer_color, 0.22) : null;
            const style = dayColor ? ` style="--trip-day-color:${dayColor};"` : '';
            rowBackgroundHtml += `<div class="day-cell-bg ${isWeekend ? 'is-weekend' : ''} ${isToday ? 'is-today' : ''} ${dayColor ? 'has-trip' : ''}"${style}></div>`;
        }

        // 2) сами плашки командировок (как было)
        let tripBarsHtml = '';
        tripsForEmployee.forEach(trip => {
            if (!trip.start_date || !trip.end_date) {
                console.warn('[renderer] Пропущена командировка с отсутствующими датами:', trip);
                return;
            }
            
            const start = new Date(trip.start_date + 'T00:00:00');
            const end = new Date(trip.end_date + 'T00:00:00');
            
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                console.warn('[renderer] Пропущена командировка с невалидными датами:', trip);
                return;
            }

            const startDay = start.getMonth() === month ? start.getDate() : 1;
            const endDay = end.getMonth() === month ? end.getDate() : daysInMonth;

            tripBarsHtml += `
                <div class="trip-bar" data-id="${trip.id}" style="grid-column: ${startDay} / ${endDay + 1}; background-color: ${escapeHTML(trip.customer_color || '#a5b4fc')};">
                    <div class="transport-icon">${transportIcons[trip.transport_type] || ''}</div>
                    <span class="trip-bar-label">${escapeHTML(trip.destination || '')}</span>
                </div>
            `;
        });
        
        rowsHtml += `<div class="employee-trips-row">${rowBackgroundHtml}${tripBarsHtml}</div>`;
    });

    container.innerHTML = `
        <div class="trips-grid" style="--days-in-month: ${daysInMonth};">
            <div class="grid-header">${headerHtml}</div>
            <div class="grid-body">${rowsHtml}</div>
        </div>
    `;

    // Навешиваем новые обработчики событий с сигналом отмены
    container.querySelectorAll('.trip-bar').forEach(bar => {
        const options = { signal: eventAbortController.signal };

        bar.addEventListener('mouseenter', (e) => {
            const tripId = e.currentTarget.dataset.id;
            const trip = state.trips.find(t => t.id == tripId);
            if (!trip) return;

            const startDate = formatDisplayDate(trip.start_date);
            const endDate = formatDisplayDate(trip.end_date);
            const duration = trip.duration ? `${trip.duration} дн.` : '—';
            
            tooltip.innerHTML = `
                <div class="tooltip-destination">${escapeHTML(trip.destination || 'Нет данных')}</div>
                <div class="tooltip-details">
                    <span class="label">Начало:</span><span>${startDate}</span>
                    <span class="label">Конец:</span><span>${endDate}</span>
                    <span class="label">Длительность:</span><span>${duration}</span>
                    <span class="label">Заказчик:</span><span>${escapeHTML(trip.customer_name || '—')}</span>
                </div>
            `;
            tooltip.classList.add('visible');
        }, options);

        bar.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        }, options);
        
        bar.addEventListener('mousemove', e => {
            if (tooltip.classList.contains('visible')) {
                const offset = 15;
                let left = e.clientX + offset;
                let top = e.clientY + offset;
                const tooltipRect = tooltip.getBoundingClientRect();
                const bodyRect = document.body.getBoundingClientRect();

                if (left + tooltipRect.width > bodyRect.width) {
                    left = e.clientX - tooltipRect.width - offset;
                }
                if (top + tooltipRect.height > bodyRect.height) {
                    top = e.clientY - tooltipRect.height - offset;
                }
                
                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
            }
        }, options);
    });
}