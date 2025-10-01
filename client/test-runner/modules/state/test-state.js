// --- ФАЙЛ: client/test-runner/modules/state/test-state.js (ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ) ---
// Этот модуль является "единственным источником правды" для состояния
// публичного приложения. Он реализован в виде класса-синглтона, который
// управляет всеми данными, связанными с текущей сессией пользователя и прохождением теста.

import { 
    USER_FIO_SESSION_KEY, 
    ACTIVE_TEST_SESSION_KEY,
    PENDING_RESULT_SESSION_KEY,
    LAST_RESULT_SESSION_KEY,
    ACTIVE_TEST_PROGRESS_KEY
} from '../../../common/shared_modules/constants.js';

class TestState {
    /**
     * Инициализирует начальное состояние, пытаясь загрузить ФИО из sessionStorage.
     */
    constructor() {
        this.state = {
            userFIO: sessionStorage.getItem(USER_FIO_SESSION_KEY) || null,
            currentTestId: null,
            currentTestName: null,
            started: false,
            attempted: false,
            currentQuestionIndex: 0,
            testQuestions: [],
            testTimerInterval: null,
            totalTime: 0,
            testEndTime: 0,
            pendingResultId: null,
        };
    }

    /**
     * Возвращает копию текущего состояния, чтобы предотвратить прямое изменение извне.
     * @returns {object} - Текущее состояние приложения.
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Обновляет глобальное состояние и сохраняет необходимые данные в sessionStorage.
     * @param {object} newState - Объект с новыми значениями для состояния.
     */
    setState(newState) {
        Object.assign(this.state, newState);
        
        // Побочные эффекты: сохраняем ключевые данные в сессию для восстановления
        if (newState.userFIO) {
            sessionStorage.setItem(USER_FIO_SESSION_KEY, newState.userFIO);
        }
        if (newState.started === true && newState.currentTestId) {
            sessionStorage.setItem(ACTIVE_TEST_SESSION_KEY, newState.currentTestId);
        }
    }

    /**
     * Собирает ответы пользователя из DOM в правильном формате (массив объектов),
     * который ожидает сервер.
     * @returns {Array<object>} - Массив ответов, готовый к отправке.
     */
    collectAnswers() {
        const userAnswers = [];
        
        this.state.testQuestions.forEach(q => {
            const questionDiv = document.querySelector(`.question[data-question-id="${q.id}"]`);
            if (!questionDiv) return;
    
            const type = questionDiv.dataset.questionType;
            let collectedAnswerIds = [];
    
            if (type === 'match') {
                const answerElements = questionDiv.querySelectorAll('.match-answers-column .match-answer-item');
                collectedAnswerIds = Array.from(answerElements).map(div => div.dataset.id);

            } else if (type === 'text_input') {
                const answerText = questionDiv.querySelector('.free-text-input').value.trim();
                if (answerText) { // Отправляем только непустой ответ
                    collectedAnswerIds = [answerText];
                }

            } else { // 'checkbox'
                collectedAnswerIds = Array.from(document.querySelectorAll(`input[name="${q.id}"]:checked`)).map(cb => cb.value);
            }
            
            // Добавляем в массив объект в формате { questionId, answerIds }, который ожидает сервер.
            userAnswers.push({
                questionId: q.id,
                answerIds: collectedAnswerIds
            });
        });
        
        return userAnswers;
    }
    
    /**
     * Сбрасывает состояние теста после его завершения, но сохраняет ФИО пользователя.
     */
    reset() {
        const currentUserFIO = this.state.userFIO;
        
        if (this.state.testTimerInterval) {
            clearInterval(this.state.testTimerInterval);
        }
        
        // Очищаем localStorage от прогресса теста
        localStorage.removeItem(ACTIVE_TEST_PROGRESS_KEY);
        
        // Создаем новый "чистый" объект состояния, чтобы не осталось старых полей
        const initialState = new TestState().getState();
        this.state = {
            ...initialState,
            userFIO: currentUserFIO
        };

        // Гарантированно очищаем sessionStorage от данных о последнем тесте.
        sessionStorage.removeItem(ACTIVE_TEST_SESSION_KEY);
        sessionStorage.removeItem(LAST_RESULT_SESSION_KEY);
        sessionStorage.removeItem(PENDING_RESULT_SESSION_KEY);
    }
    
    /**
     * Полностью сбрасывает сессию пользователя, включая ФИО.
     */
    logout() {
        this.reset();
        this.setState({ userFIO: null });
        sessionStorage.removeItem(USER_FIO_SESSION_KEY);
    }
}

// Экспортируем единственный экземпляр класса (паттерн Singleton),
// чтобы все модули работали с одним и тем же состоянием.
export const testState = new TestState();