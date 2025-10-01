// --- ФАЙЛ: client/test-runner/modules/test-flow/test-executor.js (ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ) ---
// Этот модуль является ядром процесса прохождения теста. Он отвечает за:
// 1. Загрузку вопросов и настроек теста с сервера.
// 2. Инициализацию UI для тестирования (вопросы, навигация, таймер).
// 3. Сбор ответов, отправку их на сервер и отображение результатов.

import { startTestSession, fetchQuestions, submitAnswers } from '../../../common/shared_modules/api/public.js';
import { PENDING_RESULT_SESSION_KEY, LAST_RESULT_SESSION_KEY } from '../../../common/shared_modules/constants.js';
import { showConfirmModal } from '../../../common/shared_modules/modals.js';
import { testState } from '../state/test-state.js';
import { clearProgress, loadActiveTest, saveProgress } from '../state/progress.js';
import { showTestRunnerView, showQuizView, showWaitingScreen, showFinalResults, showTestSelectionView } from '../ui/screens.js';
import { renderQuizLayout, generateQuestionsHTML, restoreAnswers, setupNavigator, showQuestion, updateNavigation } from '../ui/navigation.js';
import { startTimer } from '../ui/timer.js';
import { initializeTestSelection } from './test-loader.js';

/**
 * Хранит коллекцию DOM-элементов вопросов. Экспортируется, чтобы
 * глобальные обработчики событий в script.js имели к ней доступ.
 * @type {NodeListOf<Element>}
 */
export let questionsElements = [];

/**
 * Флаг для предотвращения повторной обработки результатов
 * @type {boolean}
 */
let isProcessing = false;

/**
 * Главная функция для начала процесса тестирования.
 * @param {boolean} [continueFromSave=false] - Флаг, указывающий, нужно ли продолжать тест из сохраненного прогресса.
 */
export async function startTest(continueFromSave = false) {
    const { currentTestId, currentTestName } = testState.getState();
    showTestRunnerView(currentTestName);
    
    // Пытаемся загрузить сохраненный прогресс, только если это указано
    const savedProgress = continueFromSave ? loadActiveTest() : null;
    
    // Если мы начинаем тест заново, а не продолжаем, убедимся, что старый прогресс удален.
    if (!continueFromSave) {
        clearProgress();
    }
    
    await loadAndBeginTest(savedProgress);
}

/**
 * Внутренняя функция для загрузки данных теста и инициализации UI.
 * @param {object|null} [savedProgress=null] - Объект с сохраненным прогрессом, если есть.
 */
async function loadAndBeginTest(savedProgress = null) {
    const quizCard = document.getElementById('quizForm');
    quizCard.innerHTML = '<div class="spinner"></div>';
    showQuizView();

    try {
        const idFromState = testState.getState().currentTestId;
        const currentTestId = savedProgress?.testId || idFromState;
        let testData;

        // Если это не восстановление сессии, нужно инициировать сессию на сервере
        if (!savedProgress) {
            await startTestSession(currentTestId);
        }

        // Если есть сохраненный прогресс, используем его данные
        if (savedProgress) {
            testData = {
                questions: savedProgress.questions,
                duration: savedProgress.totalTime,
                endTime: savedProgress.endTime,
                answers: savedProgress.answers,
                testName: savedProgress.testName
            };
        } else {
            // Иначе, загружаем вопросы и настройки с сервера
            const fetchedData = await fetchQuestions(currentTestId);
            if (!fetchedData || !fetchedData.questions || fetchedData.questions.length === 0) {
                showConfirmModal({ title: 'Ошибка', text: 'В этом тесте пока нет вопросов. Обратитесь к администратору.' });
                // Возвращаем пользователя на экран выбора через 3 секунды
                setTimeout(() => {
                    const { userFIO } = testState.getState();
                    testState.reset();
                    showTestSelectionView(userFIO);
                    initializeTestSelection();
                }, 3000); 
                return;
            }
            testData = fetchedData;
        }
        
        // Устанавливаем глобальное состояние теста
        testState.setState({
            started: true,
            attempted: false,
            testQuestions: testData.questions,
            totalTime: testData.duration,
            testEndTime: testData.endTime || Date.now() + testData.duration * 1000,
            currentTestId: currentTestId,
            currentTestName: testData.testName || testState.getState().currentTestName,
            currentQuestionIndex: savedProgress?.currentQuestionIndex || 0,
        });
        showTestRunnerView(testState.getState().currentTestName);
        
        // Инициализация UI
        renderQuizLayout(quizCard);
        questionsElements = generateQuestionsHTML(testState.getState().testQuestions);
        
        if (testData.answers) {
            restoreAnswers(testData.answers);
        }
        
        const { testQuestions, currentQuestionIndex } = testState.getState();
        setupNavigator(testQuestions.length, (index) => {
            testState.setState({ currentQuestionIndex: index });
            showQuestion(index, questionsElements);
            updateNavigation(index);
        });
        
        showQuestion(currentQuestionIndex, questionsElements);
        updateNavigation(currentQuestionIndex);
        
        startTimer(processAndDisplayResults);

    } catch (error) {
        console.error("Критическая ошибка при загрузке теста:", error);
        quizCard.innerHTML = `<p class="error-message">Не удалось загрузить данные теста. Пожалуйста, обновите страницу и попробуйте снова.</p>`;
    }
}

/**
 * Собирает ответы пользователя, отправляет их на сервер и отображает результат.
 * @returns {Promise<boolean>} Возвращает true, если отправка прошла успешно.
 */
export async function processAndDisplayResults() {
    // Защита от повторного вызова
    if (isProcessing) return false;
    isProcessing = true;
    
    const currentState = testState.getState();
    // Предотвращаем двойную отправку
    if (currentState.attempted) {
        isProcessing = false;
        return true;
    }
    
    testState.setState({ attempted: true });
    // Останавливаем таймер
    if (currentState.testTimerInterval) clearInterval(currentState.testTimerInterval);
    
    const userAnswers = testState.collectAnswers();
    
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.textContent = 'Проверка...';
    }
    
    try {
        const result = await submitAnswers(currentState.currentTestId, currentState.userFIO, userAnswers);
        
        // После успешной отправки, очищаем локальный прогресс
        clearProgress();
        
        if (result.status === 'pending_review') {
            // Сценарий: есть ответы, требующие ручной проверки
            testState.setState({ pendingResultId: result.resultId });
            sessionStorage.setItem(PENDING_RESULT_SESSION_KEY, JSON.stringify({
                resultId: result.resultId,
                fio: currentState.userFIO,
                testName: currentState.currentTestName
            }));
            showWaitingScreen(currentState.userFIO);
        } else {
            // Сценарий: тест проверен автоматически
            sessionStorage.setItem(LAST_RESULT_SESSION_KEY, JSON.stringify({ ...result, testName: currentState.currentTestName }));
            showFinalResults(result);
        }
        isProcessing = false;
        return true;
        
    } catch (error) {
        console.error("Ошибка при отправке ответов:", error);
        // В случае ошибки, позволяем пользователю повторить попытку
        if (nextBtn) {
            nextBtn.disabled = false;
        }
        updateNavigation(currentState.currentQuestionIndex); // Восстанавливаем состояние кнопок
        testState.setState({ attempted: false });
        saveProgress(); // Сохраняем ответы, чтобы не потерялись
        isProcessing = false;
        return false;
    }
}