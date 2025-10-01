// --- ФАЙЛ: client/admin/admin_modules/questions.js (ПОЛНАЯ ВЕРСИЯ С ПРАВИЛЬНЫМ ЭКСПОРТОМ) ---
// Этот модуль управляет всей логикой вкладки "Банк вопросов" в панели администратора.

import { showToast } from '../../common/shared_modules/ui.js';
import { pluralize, escapeHTML } from '../../common/shared_modules/utils.js';
import { showConfirmModal, openModal, closeModal } from '../../common/shared_modules/modals.js';
import { fetchAllQuestions, addQuestion, updateQuestion, deleteQuestions } from '../../common/shared_modules/api/admin.js';

let currentTestId = null;
let allQuestions = [];
let isQuestionFormDirty = false; // Флаг для отслеживания несохраненных изменений
let tempOptionIdCounter = 0; // Для генерации временных ID новым вариантам ответа
let isModalInitialized = false; // Флаг, чтобы модальное окно инициализировалось только один раз

// --- Загрузка и Рендеринг списка вопросов ---

async function loadQuestions() {
    const container = document.getElementById('questionsListContainer');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    try {
        allQuestions = await fetchAllQuestions(currentTestId);
        const titleElement = document.querySelector('#tab-questions .admin-controls h2');
        if (titleElement) {
            const count = allQuestions.length;
            titleElement.textContent = `Банк Вопросов (${count} ${pluralize(count, 'question')})`;
        }
        renderQuestionsList(allQuestions);
    } catch (error) {
        container.innerHTML = `<p class="error-message">Не удалось загрузить вопросы.</p>`;
        console.error("Ошибка при загрузке вопросов:", error);
    }
}

function renderQuestionsList(questions) {
    const container = document.getElementById('questionsListContainer');
    if (!container) return;

    if (questions.length === 0) {
        container.innerHTML = `<div class="empty-state-message"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg><span>В этом тесте пока нет вопросов. Создайте первый!</span></div>`;
        updateBulkActionsUI();
        return;
    }

    container.innerHTML = `
        <div class="question-list-header">
            <div class="checkbox-cell"><input type="checkbox" id="selectAllQuestionsCheckbox" class="custom-table-checkbox" title="Выбрать все"></div>
            <span>Текст вопроса</span>
        </div>
        <div class="question-list"></div>`;
        
    const listContainer = container.querySelector('.question-list');
    const fragment = document.createDocumentFragment();

    questions.forEach((q, index) => {
        let iconSVG;
        if (q.type === 'match') {
            iconSVG = `<svg class="question-type-icon" title="Вопрос на сопоставление" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;
        } else if (q.type === 'text_input') {
            iconSVG = `<svg class="question-type-icon" title="Открытый ответ" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
        } else {
            iconSVG = `<svg class="question-type-icon" title="Вопрос с выбором вариантов" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        }

        const questionItem = document.createElement('div');
        questionItem.className = 'question-item';
        questionItem.dataset.id = q.id;
        
        questionItem.innerHTML = `
            <div class="checkbox-cell"><input type="checkbox" class="question-item-checkbox custom-table-checkbox" data-id="${q.id}"></div>
            <div class="question-item-number">${index + 1}.</div>
            ${iconSVG}
            <div class="question-item-text">${escapeHTML(q.text)}</div>
            <div class="question-item-actions">
                <button type="button" class="btn-icon delete" data-id="${q.id}" title="Удалить">
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>`;
        fragment.appendChild(questionItem);
    });
    listContainer.appendChild(fragment);
    updateBulkActionsUI();
}

// --- Управление UI для массовых действий ---

function updateBulkActionsUI() {
    const checkedCheckboxes = document.querySelectorAll('.question-item-checkbox:checked');
    const checkedCount = checkedCheckboxes.length;
    const deleteBtn = document.getElementById('deleteSelectedQuestionsBtn');
    if (!deleteBtn) return;
    
    deleteBtn.textContent = `Удалить выбранные (${checkedCount})`;
    deleteBtn.classList.toggle('visible', checkedCount > 0);
    
    const selectAllCheckbox = document.getElementById('selectAllQuestionsCheckbox');
    if (selectAllCheckbox) {
        const allOnPageCount = document.querySelectorAll('.question-item-checkbox').length;
        selectAllCheckbox.checked = checkedCount === allOnPageCount && allOnPageCount > 0;
        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allOnPageCount;
    }
}

// --- Логика Удаления ---

function confirmAndDeleteQuestions(idsToDelete) {
    if (idsToDelete.length === 0) return;
    const count = idsToDelete.length;
    showConfirmModal({
        title: `Удалить ${count} ${pluralize(count, 'question')}?`,
        text: 'Это действие необратимо.',
        confirmText: 'Да, удалить',
        onConfirm: async () => {
            const deleteBtn = document.getElementById('deleteSelectedQuestionsBtn');
            if (deleteBtn) deleteBtn.disabled = true;
            try {
                await deleteQuestions(idsToDelete);
                showToast(`${count} ${pluralize(count, 'question')} удалено.`, 'success');
                await loadQuestions();
            } catch (error) {
                console.error("Ошибка при удалении вопросов:", error);
            } finally {
                if (deleteBtn) deleteBtn.disabled = false;
            }
        }
    });
}

// --- Управление формой вопроса (модальное окно) ---

function renderSpecificForm(type) {
    document.getElementById('optionsContainerWrapper').classList.toggle('hidden', type !== 'checkbox');
    document.getElementById('matchContainer').classList.toggle('hidden', type !== 'match');
}

function prepareAddQuestion() {
    tempOptionIdCounter = 0;
    const modal = document.getElementById('questionModal');
    modal.querySelector('#questionModalTitle').textContent = 'Добавить новый вопрос';
    modal.querySelector('form').reset();
    modal.querySelector('#questionIdInput').value = '';
    
    document.querySelectorAll('.type-selector-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.type-selector-btn[data-type="checkbox"]').classList.add('active');
    
    renderSpecificForm('checkbox');
    renderOptionsForm([], []);
    renderMatchForm([], []);
    isQuestionFormDirty = false;
    openModal(modal);
}

function prepareEditQuestion(questionId) {
    const questionData = allQuestions.find(q => q.id === questionId);
    if (!questionData) return;

    tempOptionIdCounter = 0;
    const modal = document.getElementById('questionModal');
    modal.querySelector('#questionModalTitle').textContent = `Редактировать вопрос`;
    const form = modal.querySelector('form');
    form.reset();
    
    form.querySelector('#questionIdInput').value = questionData.id;
    form.querySelector('#questionTextInput').value = questionData.text;
    form.querySelector('#questionExplainInput').value = questionData.explain || '';
    
    const questionType = questionData.type || 'checkbox';
    document.querySelectorAll('.type-selector-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === questionType);
    });
    
    renderSpecificForm(questionType);
    renderOptionsForm(questionData.options, questionData.correct);
    renderMatchForm(questionData.match_prompts, questionData.match_answers);
    isQuestionFormDirty = false;
    openModal(modal);
}

function renderOptionsForm(options = [], correctOptionKeys = []) {
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';
    const optionsToRender = (options.length === 0) 
        ? [{ id: `temp_${++tempOptionIdCounter}`, text: '' }, { id: `temp_${++tempOptionIdCounter}`, text: '' }] 
        : options;
    const correctSet = new Set(correctOptionKeys);
    optionsToRender.forEach(opt => {
        const keySuffix = opt.id.substring(opt.id.lastIndexOf('-') + 1);
        addOptionToForm(keySuffix, opt.text, correctSet.has(keySuffix));
    });
    updateOptionLabels();
}

function addOptionToForm(shortKey, text, isChecked) {
    const optionsContainer = document.getElementById('optionsContainer');
    const checkedAttr = isChecked ? 'checked' : '';
    const optionHTML = `
        <div class="option-edit-item" data-key="${shortKey}">
            <input type="checkbox" name="correctOption" value="${shortKey}" id="cb_${shortKey}" ${checkedAttr}>
            <label for="cb_${shortKey}" class="option-label-char"></label>
            <textarea class="option-text-input" placeholder="Текст варианта ответа" rows="1">${escapeHTML(text)}</textarea>
            <button type="button" class="btn-icon delete delete-option" aria-label="Удалить вариант">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div>`;
    optionsContainer.insertAdjacentHTML('beforeend', optionHTML);
}

function renderMatchForm(prompts = [], answers = []) {
    const container = document.getElementById('matchPairsContainer');
    container.innerHTML = '';
    const pairs = prompts.map((prompt, i) => ({ prompt, answer: answers[i] || '' }));
    if (pairs.length < 2) {
        for (let i = pairs.length; i < 2; i++) pairs.push({ prompt: '', answer: '' });
    }
    pairs.forEach(p => addMatchPairToForm(p.prompt, p.answer));
}

function addMatchPairToForm(prompt = '', answer = '') {
    const container = document.getElementById('matchPairsContainer');
    const div = document.createElement('div');
    div.className = 'match-pair-item';
    div.innerHTML = `
        <div class="input-wrap"><input type="text" class="match-prompt-input" placeholder="Левая часть" value="${escapeHTML(prompt)}"></div>
        <div class="pair-separator"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="12" x2="2" y2="12"></line><polyline points="16 6 22 12 16 18"></polyline><polyline points="8 18 2 12 8 6"></polyline></svg></div>
        <div class="input-wrap"><input type="text" class="match-answer-input" placeholder="Правая часть" value="${escapeHTML(answer)}"></div>
        <button type="button" class="btn-icon delete delete-match-pair" aria-label="Удалить пару">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>`;
    container.appendChild(div);
}

function updateOptionLabels() {
    document.querySelectorAll('.option-label-char').forEach((label, index) => {
        label.textContent = String.fromCharCode(65 + index);
    });
}

function attemptToCloseQuestionModal() {
    if (isQuestionFormDirty) {
        showConfirmModal({ 
            title: 'Несохраненные изменения', 
            text: 'Вы уверены, что хотите закрыть окно без сохранения?', 
            onConfirm: () => closeModal(document.getElementById('questionModal')) 
        });
    } else {
        closeModal(document.getElementById('questionModal'));
    }
}

async function handleSaveQuestion(event) {
    event.preventDefault();
    const form = event.target;
    const questionText = form.querySelector('#questionTextInput').value.trim();
    if (!questionText) {
        showToast('Текст вопроса не может быть пустым.', 'error');
        form.querySelector('#questionTextInput').focus();
        return;
    }

    const saveBtn = form.querySelector('#questionModalSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение...';

    const questionId = form.querySelector('#questionIdInput').value || null;
    const type = document.querySelector('.type-selector-btn.active').dataset.type;
    const questionData = { 
        id: questionId, 
        type, 
        text: questionText, 
        explain: form.querySelector('#questionExplainInput').value.trim() 
    };

    if (type === 'match') {
        questionData.match_prompts = Array.from(form.querySelectorAll('.match-prompt-input')).map(i => i.value.trim());
        questionData.match_answers = Array.from(form.querySelectorAll('.match-answer-input')).map(i => i.value.trim());
        const filledPairs = questionData.match_prompts.filter((p, i) => p && questionData.match_answers[i]).length;
        if (filledPairs < 2) {
            showToast('Нужно заполнить как минимум две полные пары для соответствия.', 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Сохранить';
            return;
        }
    } else if (type === 'checkbox') {
        questionData.correct = Array.from(form.querySelectorAll('input[name="correctOption"]:checked')).map(cb => cb.value);
        questionData.options = Array.from(form.querySelectorAll('.option-edit-item')).map(item => ({ 
            id: `${questionId || 'new'}-${item.dataset.key}`, 
            text: item.querySelector('.option-text-input').value.trim() 
        }));
        if (questionData.options.filter(opt => opt.text).length < 2) {
            showToast('Нужно заполнить как минимум два варианта ответа.', 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Сохранить';
            return;
        }
        if (questionData.correct.length === 0) {
            showToast('Выберите хотя бы один правильный ответ.', 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Сохранить';
            return;
        }
    }

    try {
        if (questionData.id) {
            await updateQuestion(questionData);
        } else {
            await addQuestion(currentTestId, questionData);
        }
        closeModal(document.getElementById('questionModal'));
        isQuestionFormDirty = false;
        showToast('Вопрос успешно сохранен!', 'success');
        await loadQuestions();
    } catch (error) {
        console.error("Не удалось сохранить вопрос:", error);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить';
    }
}

function autoResizeTextarea(event) {
    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
}

// --- Инициализация модуля ---

function initializeModalDOM() {
    if (isModalInitialized) return;
    const modal = document.getElementById('questionModal');
    modal.innerHTML = `
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h3 id="questionModalTitle"></h3>
            </div>
            <form id="questionForm">
                <div class="question-form-body">
                    <input type="hidden" id="questionIdInput">
                    <div class="input-wrap">
                        <label>Тип вопроса</label>
                        <div class="question-type-selector-wrap">
                            <button type="button" class="type-selector-btn" data-type="checkbox"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>Выбор вариантов</span></button>
                            <button type="button" class="type-selector-btn" data-type="match"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg><span>На соответствие</span></button>
                            <button type="button" class="type-selector-btn" data-type="text_input"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg><span>Открытый ответ</span></button>
                        </div>
                    </div>
                    <div class="input-wrap"><label for="questionTextInput">Текст вопроса</label><textarea id="questionTextInput" rows="3" required></textarea></div>
                    <div id="optionsContainerWrapper" class="hidden"><label>Варианты ответов (отметьте правильные)</label><div id="optionsContainer"></div><button type="button" id="addOptionBtn" class="btn btn-add-option">Добавить вариант</button></div>
                    <div id="matchContainer" class="hidden"><label>Пары для соответствия</label><div id="matchPairsContainer"></div><button type="button" id="addMatchPairBtn" class="btn btn-add-option">Добавить пару</button></div>
                    <div class="input-wrap"><label for="questionExplainInput">Пояснение (показывается в протоколе)</label><textarea id="questionExplainInput" rows="2"></textarea></div>
                </div>
                <div class="question-form-footer">
                    <div class="modal-actions"><button id="questionModalCancelBtn" type="button" class="btn back-btn">Отмена</button><button id="questionModalSaveBtn" type="submit" class="btn">Сохранить</button></div>
                </div>
            </form>
        </div>`;
    
    // Стили для SVG иконок в модальном окне
    modal.querySelectorAll('svg').forEach(svg => {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
    });

    isModalInitialized = true;
}

function setupModalEventListeners() {
    const questionForm = document.getElementById('questionForm');
    questionForm.addEventListener('submit', handleSaveQuestion);
    questionForm.addEventListener('input', (e) => { 
        isQuestionFormDirty = true; 
        if (e.target.tagName.toLowerCase() === 'textarea') autoResizeTextarea(e); 
    });
    
    document.querySelector('.question-type-selector-wrap').addEventListener('click', (e) => {
        const selectedBtn = e.target.closest('.type-selector-btn');
        if (!selectedBtn) return;
        document.querySelectorAll('.type-selector-btn').forEach(btn => btn.classList.remove('active'));
        selectedBtn.classList.add('active');
        renderSpecificForm(selectedBtn.dataset.type);
        isQuestionFormDirty = true;
    });

    document.getElementById('questionModalCancelBtn').addEventListener('click', attemptToCloseQuestionModal);
    
    document.getElementById('questionModal').addEventListener('click', (e) => {
        const target = e.target;
        if (target.id === 'addOptionBtn') { addOptionToForm(`temp_${++tempOptionIdCounter}`, '', false); updateOptionLabels(); }
        if (target.id === 'addMatchPairBtn') { addMatchPairToForm(); }
        
        const deleteOptionBtn = target.closest('.delete-option');
        if (deleteOptionBtn) {
            if (document.querySelectorAll('#optionsContainer .option-edit-item').length > 2) {
                deleteOptionBtn.closest('.option-edit-item').remove();
                updateOptionLabels();
            } else {
                showToast('Должно быть как минимум два варианта ответа.', 'info');
            }
        }
        
        const deleteMatchBtn = target.closest('.delete-match-pair');
        if (deleteMatchBtn) {
            if (document.querySelectorAll('.match-pair-item').length > 2) {
                deleteMatchBtn.closest('.match-pair-item').remove();
            } else {
                showToast('Должно быть как минимум две пары для соответствия.', 'info');
            }
        }
    });
}

/**
 * Инициализирует модуль вопросов для конкретного теста.
 * @param {string} testId - ID теста.
 */
export function initQuestionsModule(testId) {
    currentTestId = testId;
    const container = document.getElementById('tab-questions');
    container.innerHTML = `
        <div class="card">
            <div class="admin-controls">
                <h2>Банк Вопросов</h2>
                <div class="admin-actions">
                    <button id="deleteSelectedQuestionsBtn" class="btn btn-danger">Удалить выбранные</button>
                    <button id="addQuestionBtn" class="btn">Добавить вопрос</button>
                </div>
            </div>
            <div id="questionsListContainer"><div class="spinner"></div></div>
        </div>`;

    initializeModalDOM();
    setupModalEventListeners();

    container.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('#addQuestionBtn')) { prepareAddQuestion(); }
        
        if (target.closest('#deleteSelectedQuestionsBtn')) {
            const ids = Array.from(document.querySelectorAll('.question-item-checkbox:checked')).map(cb => cb.dataset.id);
            confirmAndDeleteQuestions(ids);
        }
        
        if (target.matches('.question-item-checkbox, #selectAllQuestionsCheckbox')) {
            if (target.id === 'selectAllQuestionsCheckbox') {
                document.querySelectorAll('.question-item-checkbox').forEach(cb => { cb.checked = target.checked; });
            }
            updateBulkActionsUI();
        }
        
        const questionRow = target.closest('.question-item');
        if (questionRow && !target.closest('.checkbox-cell, .btn-icon.delete')) {
            prepareEditQuestion(questionRow.dataset.id);
        }
        
        const deleteBtn = target.closest('.btn-icon.delete');
        if (deleteBtn) {
            confirmAndDeleteQuestions([deleteBtn.dataset.id]);
        }
    });

    loadQuestions();
}