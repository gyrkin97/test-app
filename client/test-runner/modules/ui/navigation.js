// --- ФАЙЛ: client/test-runner/modules/ui/navigation.js (ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ) ---
// Этот модуль инкапсулирует всю логику по управлению UI внутри экрана теста:
// создание каркаса, генерация HTML-разметки для вопросов, отображение текущего вопроса,
// и обновление всех навигационных элементов (кнопки, прогресс-бар, панель навигации).

import { testState } from '../state/test-state.js';

/**
 * Вспомогательная функция для перемешивания массива (алгоритм Фишера — Йетса).
 * @param {Array} array - Массив для перемешивания.
 * @returns {Array} - Тот же массив, но перемешанный.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Создает базовую HTML-структуру (каркас) для экрана прохождения теста.
 * @param {HTMLElement} quizFormElement - DOM-элемент формы, в который будет вставлена разметка.
 */
export function renderQuizLayout(quizFormElement) {
    if (!quizFormElement) return;
    quizFormElement.innerHTML = `
        <div class="quiz-header">
            <div class="timer-container no-print">
                <svg class="timer-svg" viewBox="0 0 100 100">
                    <circle class="timer-bg" cx="50" cy="50" r="45"></circle>
                    <circle id="timerProgress" class="timer-progress" cx="50" cy="50" r="45"></circle>
                </svg>
                <div class="timer-text-content">
                    <div class="timer-label">Оставшееся время</div>
                    <div id="timer">00:00</div>
                </div>
            </div>
            <div id="questionNavigator" class="no-print"></div>
            <div class="progress-container no-print">
              <div class="progress-bar-wrapper"><div id="progressBar" class="progress-bar"></div></div>
              <div id="progressText" class="progress-text"></div>
            </div>
        </div>
        <fieldset id="testFieldset"></fieldset>
        <div class="navigation-controls no-print">
            <button type="button" id="prevBtn" class="btn back-btn">Назад</button>
            <button type="button" id="nextBtn" class="btn">Далее</button>
        </div>
    `;
}

/**
 * Генерирует HTML-разметку для вопросов и заполняет ею уже существующий #testFieldset.
 * @param {Array<object>} testQuestions - Массив объектов вопросов.
 * @returns {NodeListOf<Element>} - Коллекция созданных DOM-элементов вопросов.
 */
export function generateQuestionsHTML(testQuestions) {
    const fieldset = document.getElementById('testFieldset');
    if (!fieldset) {
        console.error('Критическая ошибка: Элемент #testFieldset не найден при генерации вопросов!');
        return [];
    }
    fieldset.innerHTML = '';

    testQuestions.forEach((qData, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';
        questionDiv.dataset.questionId = qData.id;
        questionDiv.dataset.questionType = qData.type || 'checkbox';

        const questionInner = document.createElement('div');
        questionInner.className = 'question-inner';

        const p = document.createElement('p');
        p.textContent = `Вопрос ${index + 1}. ${qData.text}`;
        questionInner.appendChild(p);

        if (qData.type === 'match') {
            const columnsWrapper = document.createElement('div');
            columnsWrapper.className = 'match-columns-wrapper';
            const promptsColumn = document.createElement('ul');
            promptsColumn.className = 'match-prompts-column';
            const answersColumn = document.createElement('ul');
            answersColumn.className = 'match-answers-column';
            
            const shuffledAnswers = shuffleArray([...(qData.match_answers || [])]);

            (qData.match_prompts || []).forEach(promptText => {
                 const promptEl = document.createElement('li');
                 promptEl.className = 'match-prompt-item';
                 promptEl.textContent = promptText;
                 promptsColumn.appendChild(promptEl);
            });
            
            shuffledAnswers.forEach(answerText => {
                const answerItem = document.createElement('li');
                answerItem.className = 'match-answer-item';
                answerItem.textContent = answerText;
                answerItem.dataset.id = answerText;
                answersColumn.appendChild(answerItem);
            });
            
            columnsWrapper.append(promptsColumn, answersColumn);
            questionInner.appendChild(columnsWrapper);
            
            setTimeout(() => {
                if (typeof Sortable !== 'undefined') {
                    new Sortable(answersColumn, { animation: 250, ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen' });
                }
            }, 0);

        } else if (qData.type === 'text_input') {
            const textarea = document.createElement('textarea');
            textarea.className = 'free-text-input';
            textarea.placeholder = 'Введите ваш развернутый ответ...';
            textarea.rows = 5;
            questionInner.appendChild(textarea);
        } else { // checkbox
            const answersDiv = document.createElement('div');
            answersDiv.className = 'answers';
            shuffleArray([...qData.options]).forEach(option => {
                const label = document.createElement('label');
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.name = qData.id;
                input.value = option.id;
                label.appendChild(input);
                label.append(` ${option.text}`);
                answersDiv.appendChild(label);
            });
            questionInner.appendChild(answersDiv);
        }

        questionDiv.appendChild(questionInner);
        fieldset.appendChild(questionDiv);
    });

    return document.querySelectorAll('.question');
}

/**
 * Восстанавливает выбранные ответы из сохраненной сессии.
 * @param {object} answers - Объект с ответами, где ключ - ID вопроса.
 */
export function restoreAnswers(answers) {
    Object.keys(answers).forEach(questionId => {
        const answerIds = answers[questionId];
        if (Array.isArray(answerIds)) {
            const questionDiv = document.querySelector(`.question[data-question-id="${questionId}"]`);
            if (!questionDiv) return;
            
            const type = questionDiv.dataset.questionType;
            
            if (type === 'text_input') {
                const textarea = questionDiv.querySelector('.free-text-input');
                if (textarea) textarea.value = answerIds[0] || '';
            } else if (type === 'match') {
                // Восстановление порядка для match-вопросов
                const answersColumn = questionDiv.querySelector('.match-answers-column');
                if (answersColumn) {
                    // Собираем все текущие элементы в карту по data-id
                    const currentItems = Array.from(answersColumn.children);
                    const itemsMap = new Map(currentItems.map(item => [item.dataset.id, item]));
                    
                    // Очищаем колонку и добавляем элементы в сохраненном порядке
                    answersColumn.innerHTML = '';
                    answerIds.forEach(id => {
                        const item = itemsMap.get(id);
                        if (item) answersColumn.appendChild(item);
                    });
                }
            } else { // 'checkbox'
                answerIds.forEach(answerId => {
                    const checkbox = document.querySelector(`input[value="${answerId}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
        }
    });
}

/**
 * Показывает вопрос с указанным индексом и скрывает остальные, помечая его как "посещенный".
 * @param {number} index - Индекс вопроса для показа.
 * @param {NodeListOf<Element>} questionsElements - Коллекция всех элементов вопросов.
 */
export function showQuestion(index, questionsElements) {
    questionsElements.forEach((q, i) => {
        const isActive = (i === index);
        q.classList.toggle('active', isActive);

        if (isActive && !q.dataset.visited) {
            q.dataset.visited = 'true';
        }
    });
}

/**
 * Централизованно обновляет все навигационные элементы (панель, прогресс-бар, кнопки),
 * а также проверяет и устанавливает статус 'answered' для каждого вопроса.
 * @param {number} currentIndex - Индекс текущего вопроса.
 */
export function updateNavigation(currentIndex) {
    const { testQuestions } = testState.getState();
    const totalQuestions = testQuestions.length;
    
    // Если данные о вопросах еще не загружены, ничего не делаем.
    if (totalQuestions === 0) return;

    // Обновляем квадраты навигации
    const squares = document.querySelectorAll('.nav-square');
    squares.forEach((square, index) => {
        const questionId = testQuestions[index]?.id;
        if (!questionId) return;

        const questionDiv = document.querySelector(`.question[data-question-id="${questionId}"]`);
        if (!questionDiv) return;
        
        const type = questionDiv.dataset.questionType;
        let isAnswered = false;
        
        if (type === 'match') {
            isAnswered = questionDiv.dataset.visited === 'true';
        } else if (type === 'text_input') {
            isAnswered = !!questionDiv.querySelector('.free-text-input')?.value.trim();
        } else { // 'checkbox'
            isAnswered = !!questionDiv.querySelector('input[type="checkbox"]:checked');
        }

        square.classList.toggle('answered', isAnswered);
        square.classList.toggle('active', index === currentIndex);
    });

    // Обновляем прогресс-бар и текст
    const progressBar = document.getElementById('progressBar');
    if(progressBar) progressBar.style.width = `${((currentIndex + 1) / totalQuestions) * 100}%`;
    const progressText = document.getElementById('progressText');
    if(progressText) progressText.textContent = `Вопрос ${currentIndex + 1} из ${totalQuestions}`;

    // Обновляем кнопки
    const prevBtn = document.getElementById('prevBtn');
    if(prevBtn) prevBtn.disabled = (currentIndex === 0);
    const nextBtn = document.getElementById('nextBtn');
    if(nextBtn) {
        nextBtn.textContent = (currentIndex === totalQuestions - 1) ? 'Завершить тест' : 'Далее';
    }
}

/**
 * Создает панель навигации по вопросам.
 * @param {number} totalQuestions - Общее количество вопросов.
 * @param {function} onNavClick - Коллбэк, вызываемый при клике на квадрат навигации.
 */
export function setupNavigator(totalQuestions, onNavClick) {
    const navContainer = document.getElementById('questionNavigator');
    if (!navContainer) {
        console.error('Критическая ошибка: Элемент #questionNavigator не найден!');
        return;
    }
    navContainer.innerHTML = '';
    for (let i = 0; i < totalQuestions; i++) {
        const square = document.createElement('div');
        square.className = 'nav-square';
        square.textContent = i + 1;
        square.dataset.index = i;
        navContainer.appendChild(square);
    }
    navContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('nav-square')) {
            onNavClick(parseInt(e.target.dataset.index, 10));
        }
    });
}