// --- ФАЙЛ: client/test-runner/modules/test-flow/test-loader.js (ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ) ---

import { fetchPublicTests, fetchLastResultProtocol } from '../../../common/shared_modules/api/public.js';
import { pluralize } from '../../../common/shared_modules/utils.js';
import { showConfirmModal } from '../../../common/shared_modules/modals.js';
import { testState } from '../state/test-state.js';
import { loadActiveTest, clearProgress } from '../state/progress.js';
import { renderPublicTestList, showTestSelectionView, showTestRunnerView, showFinalResults } from '../ui/screens.js';
import { startTest } from './test-executor.js';

/**
 * Загружает с сервера список публичных тестов и запускает их отрисовку.
 */
export async function initializeTestSelection() {
    const { userFIO } = testState.getState();
    
    try {
        const tests = await fetchPublicTests(userFIO);
        if (tests) {
            renderPublicTestList(tests, onTestSelect);
        }
    } catch (error) {
        console.error("Не удалось загрузить список тестов:", error);
        showConfirmModal({ 
            title: 'Ошибка', 
            text: 'Не удалось загрузить список тестов. Пожалуйста, попробуйте позже.' 
        });
    }
}

/**
 * Обработчик выбора теста
 */
async function onTestSelect(test) {
    const { id: testId, name: testName } = test;
    const { userFIO } = testState.getState();

    if (test.passedStatus) {
        showConfirmModal({
            title: 'Тест уже сдан',
            text: `Вы уже успешно прошли тест "${testName}". Что вы хотите сделать?`,
            confirmText: 'Пройти заново',
            cancelText: 'Посмотреть результат',
            onConfirm: () => showStartConfirmation(test),
            onCancel: async () => {
                showTestRunnerView('Загрузка результата...');
                try {
                    const lastResult = await fetchLastResultProtocol(testId, userFIO);
                    showFinalResults(lastResult);
                } catch (error) {
                    showConfirmModal({ title: 'Ошибка', text: 'Не удалось загрузить ваш предыдущий результат.' });
                    showTestSelectionView(userFIO);
                }
            }
        });
    } else {
        showStartConfirmation(test);
    }
}

/**
 * Подтверждение начала теста
 */
function showStartConfirmation(test) {
    const { id: testId, name: testName, duration_minutes, questions_per_test } = test;

    const proceedToTest = () => {
        testState.setState({ currentTestId: testId, currentTestName: testName });
        const savedProgress = loadActiveTest();

        if (savedProgress && savedProgress.testId === testId) {
            showConfirmModal({
                title: 'Обнаружен незаконченный тест',
                text: `Хотите продолжить с места, где остановились?`,
                onConfirm: () => startTest(true),
                onCancel: () => { 
                    clearProgress();
                    startTest(false);
                },
                confirmText: 'Продолжить',
                cancelText: 'Начать заново'
            });
        } else {
            clearProgress();
            startTest(false);
        }
    };
    
    showConfirmModal({
        title: `Начать тест "${testName}"?`,
        text: `Вам будет предложено ${questions_per_test} ${pluralize(questions_per_test, 'question')}. Время на выполнение: ${duration_minutes} ${pluralize(duration_minutes, 'minute')}.`,
        onConfirm: proceedToTest,
        confirmText: 'Начать',
        cancelText: 'Отмена'
    });
}

/**
 * Настройка экрана приветствия
 */
export function setupWelcomeScreen() {
    const continueBtn = document.getElementById('startBtn');
    const fioInput = document.getElementById('fioInput');

    console.log('setupWelcomeScreen: continueBtn =', continueBtn);
    console.log('setupWelcomeScreen: fioInput =', fioInput);

    if (!continueBtn || !fioInput) {
        console.error('Элементы не найдены!');
        return;
    }

    const proceed = () => {
        const fio = fioInput.value.trim();
        console.log('Proceed called with FIO:', fio);
        
        if (!fio) {
            showConfirmModal({ 
                title: 'Внимание', 
                text: 'Пожалуйста, введите ваше ФИО, чтобы продолжить.' 
            });
            fioInput.focus();
            return;
        }
        
        testState.setState({ userFIO: fio });
        showTestSelectionView(fio);
        initializeTestSelection();
    };

    continueBtn.onclick = proceed;
    
    fioInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            proceed();
        }
    };
}