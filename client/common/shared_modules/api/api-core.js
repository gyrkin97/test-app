// --- ФАЙЛ: client/common/shared_modules/api/api-core.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль является ядром для взаимодействия с API.
// Он инкапсулирует фундаментальную логику отправки запросов, обработки ответов и ошибок,
// предоставляя единую точку для всех API-вызовов в приложении.

/**
 * Глобальная коллбэк-функция для обработки ошибок API. 
 * По умолчанию выводит ошибку в консоль. Может быть переопределена 
 * с помощью `registerGlobalErrorCallback` для отображения ошибок в UI (например, через тосты).
 * @type {function(string): void}
 */
let globalErrorCallback = (message) => console.error(`API Error: ${message}`);

/**
 * Регистрирует (переопределяет) глобальный коллбэк для обработки ошибок API.
 * Это позволяет основному приложению решать, как отображать ошибки пользователю.
 * @param {function(string)} callback - Функция, принимающая строковое сообщение об ошибке.
 */
export function registerGlobalErrorCallback(callback) {
    if (typeof callback === 'function') {
        globalErrorCallback = callback;
    } else {
        console.warn('Попытка зарегистрировать некорректный обработчик ошибок API. Ожидалась функция.');
    }
}

/**
 * Универсальная асинхронная функция для выполнения запросов к API сервера.
 * 
 * - Автоматически устанавливает заголовки 'Content-Type' и 'credentials'.
 * - Обрабатывает JSON-ответы.
 * - Корректно обрабатывает ответы без тела (HTTP 204).
 * - Вызывает глобальный обработчик ошибок при сбоях.
 * - Пробрасывает ошибку дальше для локальной обработки в вызывающем коде.
 * 
 * @param {string} url - URL эндпоинта API.
 * @param {object} [options={}] - Стандартные опции для `fetch` (method, body, headers и т.д.).
 * @returns {Promise<any>} - Промис, который разрешается в JSON-тело ответа или `null` в случае ответа 204 No Content.
 * @throws {Error} - Выбрасывает ошибку, если ответ сервера не является успешным (статус не в диапазоне 200-299) или произошла сетевая ошибка.
 */
export async function apiFetch(url, options = {}) {
    // 1. Подготовка опций запроса
    options.headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    // 'include' гарантирует, что cookie (для сессий) будут отправляться с каждым запросом
    options.credentials = 'include';

    try {
        // 2. Выполнение запроса
        const response = await fetch(url, options);

        // 3. Обработка успешного ответа без тела (например, после DELETE-запроса)
        if (response.status === 204) {
            return null;
        }

        // 4. Парсинг JSON-тела ответа
        const data = await response.json();

        // 5. Проверка статуса ответа. Если не "ok", это ошибка с точки зрения бизнес-логики.
        if (!response.ok) {
            // Формируем сообщение об ошибке, предпочитая текст от сервера
            const errorMessage = data.error || `Произошла ошибка сервера (статус ${response.status})`;
            // Вызываем глобальный обработчик для отображения ошибки в UI
            globalErrorCallback(errorMessage);
            // Пробрасываем ошибку, чтобы вызывающий код мог на нее отреагировать (например, остановить спиннер)
            throw new Error(errorMessage);
        }

        // 6. Возвращаем успешные данные
        return data;

    } catch (error) {
        // 7. Обработка сетевых ошибок (сервер недоступен, CORS, нет интернета)
        // Проверяем, не является ли эта ошибка той, которую мы уже сгенерировали выше.
        if (error.name !== 'AbortError' && !(error instanceof Error && error.message.includes('ошибка сервера'))) {
             globalErrorCallback('Сетевая ошибка. Не удалось выполнить запрос к серверу.');
        }
       
        // Пробрасываем ошибку дальше для локальной обработки
        throw error;
    }
}