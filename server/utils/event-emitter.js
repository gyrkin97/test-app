// --- ФАЙЛ: server/utils/event-emitter.js ---
// Этот модуль реализует простой Event Emitter для Server-Sent Events (SSE).

const EventEmitter = require('events');
const emitter = new EventEmitter();

// Увеличиваем лимит слушателей, чтобы избежать предупреждений в консоли
emitter.setMaxListeners(100);

/**
 * Отправляет событие всем подключенным клиентам.
 * @param {object} data - Данные для отправки.
 * @param {string} eventName - Название события.
 */
function sendEvent(data, eventName) {
    emitter.emit('event', { data, eventName });
}

/**
 * Обработчик для Express, который устанавливает SSE-соединение с клиентом.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
function getEventsHandler(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const onEvent = ({ data, eventName }) => {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    emitter.on('event', onEvent);

    // Отправляем "heartbeat" каждые 15 секунд, чтобы поддерживать соединение
    const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
        emitter.removeListener('event', onEvent);
        clearInterval(heartbeatInterval);
        res.end();
    });
}

module.exports = {
    sendEvent,
    getEventsHandler
};