// --- ФАЙЛ: client/common/shared_modules/event-bus.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль экспортирует единый экземпляр EventTarget, который используется
// в качестве простой, легковесной и нативной шины событий (Event Bus) для всего 
// клиентского приложения.
//
// Использование:
// В одном модуле (отправитель):
//   import { eventBus } from './event-bus.js';
//   eventBus.dispatchEvent(new CustomEvent('my-event', { detail: { data: 'some-value' } }));
//
// В другом модуле (слушатель):
//   import { eventBus } from './event-bus.js';
//   eventBus.addEventListener('my-event', (event) => {
//     console.log(event.detail.data); // 'some-value'
//   });

/**
 * Глобальная шина событий для межмодульного взаимодействия.
 * @type {EventTarget}
 */
export const eventBus = new EventTarget();