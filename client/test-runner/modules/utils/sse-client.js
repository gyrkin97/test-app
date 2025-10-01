// --- ФАЙЛ: client/test-runner/modules/utils/sse-client.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль инкапсулирует логику работы с Server-Sent Events (SSE)
// для публичной части приложения. Он слушает события от сервера и обновляет UI в реальном времени.

import { testState } from '../state/test-state.js';
import { showFinalResults } from '../ui/screens.js';
import { initializeTestSelection } from '../test-flow/test-loader.js';
import { PENDING_RESULT_SESSION_KEY } from '../../../common/shared_modules/constants.js';

let sseSource = null;
const RECONNECT_DELAY = 5000; // 5 секунд

/**
 * Обработчик события 'result-reviewed'.
 * Срабатывает, когда администратор завершает ручную проверку ответов.
 * @param {MessageEvent} event - Событие, полученное от сервера.
 */
function handleResultReviewed(event) {
    const { resultId, finalResultData } = JSON.parse(event.data);
    const currentState = testState.getState();

    // Проверяем, ждет ли текущий пользователь именно этот результат.
    if (currentState.pendingResultId && currentState.pendingResultId === resultId) {
        console.log(`Получен финализированный результат для теста ID: ${resultId}`);
        sessionStorage.removeItem(PENDING_RESULT_SESSION_KEY);
        testState.setState({ pendingResultId: null });
        showFinalResults(finalResultData);
    }
}

/**
 * Обработчик события 'tests-updated'.
 * Срабатывает, когда администратор вносит изменения в тесты.
 */
function handleTestsUpdated() {
    // Обновляем список тестов, только если пользователь находится на экране выбора.
    const testSelectionScreen = document.getElementById('testSelectionScreen');
    if (testSelectionScreen && !testSelectionScreen.classList.contains('hidden')) {
        console.log('Получено событие обновления тестов. Обновляю список...');
        initializeTestSelection();
    }
}

/**
 * Устанавливает соединение с сервером для получения Server-Sent Events.
 */
function connect() {
    // Закрываем предыдущее соединение, если оно существует
    if (sseSource && sseSource.readyState !== EventSource.CLOSED) {
        sseSource.close();
    }
    
    sseSource = new EventSource('/api/events');

    sseSource.onopen = () => {
        console.log('SSE-соединение для публичной страницы установлено.');
    };

    // Привязываем обработчики к именованным событиям
    sseSource.addEventListener('tests-updated', handleTestsUpdated);
    sseSource.addEventListener('result-reviewed', handleResultReviewed);

    // Обработчик ошибок с логикой переподключения
    sseSource.onerror = () => {
        console.error(`Ошибка SSE-соединения. Попытка переподключения через ${RECONNECT_DELAY / 1000} секунд...`);
        sseSource.close();
        setTimeout(connect, RECONNECT_DELAY);
    };
}

/**
 * Главная функция для инициализации SSE-клиента.
 */
export function initializePublicSSE() {
    if (typeof EventSource !== 'undefined') {
        connect();
    } else {
        console.warn("Server-Sent Events не поддерживаются этим браузером. Обновления в реальном времени будут недоступны.");
    }
}