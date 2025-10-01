// --- ФАЙЛ: client/test-runner/modules/state/progress.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль инкапсулирует всю логику работы с localStorage
// для сохранения, загрузки и очистки прогресса активного теста пользователя.

import { ACTIVE_TEST_PROGRESS_KEY } from '../../../common/shared_modules/constants.js';
import { testState } from './test-state.js';

/**
 * Сохраняет текущий прогресс теста в localStorage.
 * Функция собирает актуальные данные из testState, включая ответы пользователя из DOM,
 * и сохраняет их как единый объект. Вызывается автоматически при закрытии вкладки.
 */
export function saveProgress() {
    const currentState = testState.getState();
    
    // Предотвращаем сохранение, если тест не был начат, уже завершен, или нет ID теста.
    // Это гарантирует, что в хранилище не останется "мусорных" данных.
    if (!currentState.started || currentState.attempted || !currentState.currentTestId) {
        return;
    }

    // Собираем все данные, необходимые для полного восстановления сессии.
    const progress = {
        testId: currentState.currentTestId,
        testName: currentState.currentTestName,
        fio: currentState.userFIO,
        questions: currentState.testQuestions,
        answers: testState.collectAnswers(), // Получаем актуальные ответы прямо из DOM
        endTime: currentState.testEndTime,
        totalTime: currentState.totalTime,
        currentQuestionIndex: currentState.currentQuestionIndex,
    };
    
    // Сохраняем весь прогресс по одному стандартизированному ключу.
    localStorage.setItem(ACTIVE_TEST_PROGRESS_KEY, JSON.stringify(progress));
    console.log('Прогресс теста сохранен в localStorage.');
}

/**
 * Загружает активный тест из localStorage.
 * Эта функция является единственной точкой входа для восстановления сессии.
 * @returns {object|null} - Объект с данными прогресса или null, если прогресс не найден или поврежден.
 */
export function loadActiveTest() {
    const savedProgressJSON = localStorage.getItem(ACTIVE_TEST_PROGRESS_KEY);
    
    if (!savedProgressJSON) {
        return null;
    }

    try {
        // Пытаемся распарсить данные. Если успешно, возвращаем объект.
        return JSON.parse(savedProgressJSON);
    } catch (error) {
        console.error("Ошибка парсинга сохраненного прогресса. Данные будут очищены.", error);
        // Если данные в localStorage повреждены, очищаем их, чтобы избежать циклических ошибок.
        clearProgress();
        return null;
    }
}

/**
 * Полностью удаляет сохраненный прогресс из localStorage.
 * Вызывается после успешного завершения и отправки теста на сервер.
 */
export function clearProgress() {
    localStorage.removeItem(ACTIVE_TEST_PROGRESS_KEY);
    console.log('Прогресс теста очищен из localStorage.');
}