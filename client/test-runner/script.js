// --- ФАЙЛ: client/test-runner/script.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ ПОСЛЕ РЕФАКТОРИНГА) ---
// Главный "оркестратор" для публичного приложения-тестировщика.
// Отвечает за инициализацию, управление состоянием и настройку глобальных обработчиков событий.

// --- Глобальные импорты общих модулей ---
import { registerGlobalErrorCallback } from '../common/shared_modules/api/api-core.js';
import { showConfirmModal } from '../common/shared_modules/modals.js';
import { PENDING_RESULT_SESSION_KEY, LAST_RESULT_SESSION_KEY } from '../common/shared_modules/constants.js';

// --- Импорты модулей, специфичных для test-runner ---
import { testState } from './modules/state/test-state.js';
import { saveProgress, loadActiveTest } from './modules/state/progress.js';
import { setupWelcomeScreen, initializeTestSelection } from './modules/test-flow/test-loader.js';
import { startTest, processAndDisplayResults, questionsElements } from './modules/test-flow/test-executor.js';
import { showWelcomeScreen, showTestSelectionView, showTestRunnerView, showWaitingScreen, showFinalResults } from './modules/ui/screens.js';
import { updateNavigation, showQuestion } from './modules/ui/navigation.js';
import { initializePublicSSE } from './modules/utils/sse-client.js';

/**
 * Главная функция инициализации приложения.
 * Определяет, какой экран показать пользователю при загрузке, проверяя наличие
 * сохраненного прогресса, ожидающих или последних результатов в хранилище.
 */
function initializeApp() {
    // 1. Приоритет: восстановить незаконченный тест из localStorage.
    const activeTestProgress = loadActiveTest();
    if (activeTestProgress) {
        console.log('Найден незавершенный тест. Восстанавливаем сессию...');
        testState.setState({ userFIO: activeTestProgress.fio, currentTestId: activeTestProgress.testId });
        startTest(true); // `true` указывает, что это восстановление
        return;
    }

    // 2. Приоритет: восстановить экран ожидания ручной проверки из sessionStorage.
    const pendingResultJson = sessionStorage.getItem(PENDING_RESULT_SESSION_KEY);
    if (pendingResultJson) {
        console.log('Найден результат, ожидающий проверки. Отображаем экран ожидания...');
        const pendingResult = JSON.parse(pendingResultJson);
        testState.setState({
            userFIO: pendingResult.fio,
            currentTestName: pendingResult.testName,
            pendingResultId: pendingResult.resultId
        });
        showTestRunnerView(pendingResult.testName);
        showWaitingScreen(pendingResult.fio);
        return;
    }
    
    // 3. Приоритет: показать последний результат в этой сессии из sessionStorage.
    const lastResultJson = sessionStorage.getItem(LAST_RESULT_SESSION_KEY);
    if (lastResultJson) {
        console.log('Найден последний результат в этой сессии. Отображаем протокол...');
        const lastResult = JSON.parse(lastResultJson);
        testState.setState({ userFIO: lastResult.fio });
        showTestRunnerView(lastResult.testName || 'Результаты теста');
        showFinalResults(lastResult);
        return;
    }
    
    // 4. Стандартный запуск: если ФИО сохранено в сессии, показать выбор тестов.
    const { userFIO } = testState.getState();
    if (userFIO) {
        showTestSelectionView(userFIO);
        initializeTestSelection();
    } else {
        // 5. В противном случае — показать экран приветствия для нового пользователя.
        showWelcomeScreen();
    }
}

/**
 * Настраивает все глобальные обработчики событий для приложения, используя делегирование.
 */
function setupEventHandlers() {
    // Единый обработчик кликов для всего body.
    document.body.addEventListener('click', (e) => {
        const target = e.target;

        // Кнопка "Вернуться к выбору тестов"
        if (target.closest('#exitToSelectionBtn')) {
            e.preventDefault();
            testState.reset();
            window.location.reload();
        }

        // Кнопка "Сменить пользователя"
        if (target.closest('#changeUserBtn')) {
            e.preventDefault();
            testState.logout();
            window.location.reload();
        }

        // Кнопка "Назад" (предыдущий вопрос)
        const prevBtn = target.closest('#prevBtn');
        if (prevBtn) {
            let { currentQuestionIndex } = testState.getState();
            if (currentQuestionIndex > 0) {
                currentQuestionIndex--;
                testState.setState({ currentQuestionIndex });
                showQuestion(currentQuestionIndex, questionsElements);
                updateNavigation(currentQuestionIndex);
            }
        }

        // Кнопка "Далее" / "Завершить"
        const nextBtn = target.closest('#nextBtn');
        if (nextBtn) {
            let { currentQuestionIndex, testQuestions } = testState.getState();
            const totalQuestions = testQuestions.length;

            if (currentQuestionIndex < totalQuestions - 1) {
                // Переход к следующему вопросу
                currentQuestionIndex++;
                testState.setState({ currentQuestionIndex });
                showQuestion(currentQuestionIndex, questionsElements);
                updateNavigation(currentQuestionIndex);
            } else {
                // Попытка завершить тест
                const answeredCount = Array.from(questionsElements).filter(qEl => {
                    const type = qEl.dataset.questionType;
                    if (type === 'match') return true; // Считаем всегда отвеченным
                    if (type === 'text_input') return !!qEl.querySelector('.free-text-input')?.value.trim();
                    return !!qEl.querySelector('input[type="checkbox"]:checked');
                }).length;

                // Если есть неотвеченные вопросы, показываем модальное окно с предупреждением
                if (answeredCount < totalQuestions) {
                    showConfirmModal({
                        title: 'Завершить тест?',
                        text: `Вы ответили не на все вопросы (пропущено ${totalQuestions - answeredCount}). Вы уверены, что хотите завершить?`,
                        onConfirm: processAndDisplayResults,
                        confirmText: 'Да, завершить',
                        cancelText: 'Вернуться к вопросам'
                    });
                } else {
                    processAndDisplayResults();
                }
            }
        }
    });

    // Единый обработчик для любого изменения ответа (клик по чекбоксу, ввод текста).
    const handleAnswerChange = () => {
        const { currentQuestionIndex } = testState.getState();
        updateNavigation(currentQuestionIndex);
    };

    document.body.addEventListener('change', handleAnswerChange);
    document.body.addEventListener('input', (e) => {
        // Дополнительная логика для авто-изменения высоты textarea
        if (e.target.matches('#testFieldset .free-text-input')) {
            const textarea = e.target;
            textarea.style.height = 'auto'; // Сначала сбрасываем, чтобы textarea "сжалась"
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
        handleAnswerChange();
    });

    // Навигация по вопросам с помощью стрелок клавиатуры.
    document.addEventListener('keydown', (e) => {
        const { started, attempted } = testState.getState();
        // Игнорируем, если тест не начат, уже завершен, или фокус находится в поле ввода
        if (!started || attempted || e.target.tagName.toLowerCase() === 'textarea') return;

        if (e.key === 'ArrowLeft') document.getElementById('prevBtn')?.click();
        else if (e.key === 'ArrowRight') document.getElementById('nextBtn')?.click();
    });
}


/**
 * Точка входа в приложение после полной загрузки DOM.
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Регистрируем глобальный обработчик ошибок API, который будет показывать модальное окно.
    registerGlobalErrorCallback((message) => showConfirmModal({ title: 'Ошибка', text: message }));

    // 2. Запускаем основную логику приложения.
    initializeApp();
    
    // 3. Настраиваем обработчики для экрана приветствия.
    setupWelcomeScreen();
    
    // 4. Настраиваем все глобальные обработчики событий.
    setupEventHandlers();
    
    // 5. Инициализируем SSE-клиент для обновлений в реальном времени.
    initializePublicSSE();

    // 6. Сохраняем прогресс перед закрытием или перезагрузкой вкладки.
    window.addEventListener('beforeunload', saveProgress);
});