// --- ФАЙЛ: client/test-runner/modules/ui/timer.js ---
// Этот модуль содержит всю логику для управления таймером обратного отсчета
// во время прохождения теста.

import { testState } from '../state/test-state.js';
import { showConfirmModal } from '../../../common/shared_modules/modals.js';

/**
 * Обновляет отображение таймера (круговой индикатор и текст) на основе оставшегося времени.
 * @param {number} timeLeft - Оставшееся время в секундах.
 * @param {number} totalTime - Общее время теста в секундах.
 */
function updateTimerDisplay(timeLeft, totalTime) {
    const timerEl = document.getElementById('timer');
    const progressCircle = document.getElementById('timerProgress');
    if (!timerEl || !progressCircle) return;

    const radius = progressCircle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    
    // Рассчитываем минуты и секунды для текстового отображения
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    // Рассчитываем прогресс для кругового индикатора
    const progress = totalTime > 0 ? timeLeft / totalTime : 0;
    const offset = circumference - progress * circumference;
    progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    progressCircle.style.strokeDashoffset = offset;

    // Добавляем/убираем классы для визуального эффекта, когда время на исходе
    const isEnding = timeLeft < 60 && timeLeft > 0;
    timerEl.classList.toggle('ending', isEnding);
    progressCircle.classList.toggle('ending', isEnding);
}

/**
 * Запускает таймер обратного отсчета и обновляет его отображение каждую секунду.
 * @param {function} onTimeUpCallback - Функция, которая будет вызвана, когда время выйдет.
 */
export function startTimer(onTimeUpCallback) {
    const currentState = testState.getState();
    
    // Гарантированно очищаем любой предыдущий интервал, чтобы избежать "утечек"
    if (currentState.testTimerInterval) {
        clearInterval(currentState.testTimerInterval);
    }

    const timerInterval = setInterval(async () => {
        const { testEndTime, totalTime, attempted } = testState.getState();
        const timeLeft = Math.round((testEndTime - Date.now()) / 1000);

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            updateTimerDisplay(0, totalTime);
            
            // Проверяем, не была ли уже совершена попытка отправки, чтобы не показывать модальное окно дважды
            if (!attempted) {
                showConfirmModal({
                    title: 'Время вышло!',
                    text: 'Отведенное на тест время истекло. Ваши ответы будут отправлены на проверку.'
                });
                // Вызываем коллбэк для отправки результатов
                await onTimeUpCallback();
            }
        } else {
            updateTimerDisplay(timeLeft, totalTime);
        }
    }, 1000);

    // Сохраняем ID интервала в состояние, чтобы его можно было очистить при необходимости
    testState.setState({ testTimerInterval: timerInterval });
    
    // Немедленно обновляем таймер при запуске, чтобы не ждать первую секунду
    const initialTimeLeft = Math.round((currentState.testEndTime - Date.now()) / 1000);
    updateTimerDisplay(initialTimeLeft > 0 ? initialTimeLeft : 0, currentState.totalTime);
}