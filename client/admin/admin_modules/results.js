// --- ФАЙЛ: client/admin/admin_modules/results.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль управляет всем UI и логикой для вкладки "Результаты" в админ-панели.

import { pluralize, escapeHTML } from '../../common/shared_modules/utils.js';
import { showToast } from '../../common/shared_modules/ui.js';
import { showConfirmModal, openModal, closeModal } from '../../common/shared_modules/modals.js';
import { fetchResults, deleteResults, fetchProtocol, fetchQuestionsForReview, submitBatchReview } from '../../common/shared_modules/api/admin.js';

// --- Состояние модуля ---
let currentTestId = null;
let currentSearch = '';
let currentSort = { column: 'date', order: 'desc' };
let currentPage = 1;
let debounceTimer;
let selectedResultIds = new Set();
let newResultIdsToHighlight = new Set();
const RESULTS_PER_PAGE = 10;

/**
 * Регистрирует ID нового результата для последующей подсветки.
 * @param {string|number} resultId - ID нового результата.
 */
export function registerNewResultId(resultId) {
    newResultIdsToHighlight.add(String(resultId));
}

/**
 * Сохраняет текущее состояние UI (поиск, сортировка, страница) в sessionStorage.
 */
function saveUiState() {
    if (!currentTestId) return;
    const state = { search: currentSearch, sort: currentSort, page: currentPage };
    sessionStorage.setItem(`resultsState_${currentTestId}`, JSON.stringify(state));
}

/**
 * Загружает состояние UI из sessionStorage.
 * @returns {object | null} Сохраненное состояние или null.
 */
function loadUiState() {
    if (!currentTestId) return null;
    const savedState = sessionStorage.getItem(`resultsState_${currentTestId}`);
    return savedState ? JSON.parse(savedState) : null;
}

/**
 * Загружает результаты с сервера на основе текущих параметров состояния и отображает их.
 */
export async function loadResults() {
    const container = document.getElementById('resultsTableContainer');
    if (!container) return;

    saveUiState();
    container.classList.add('is-sorting');
    selectedResultIds.clear();
    updateBulkActionsUI();

    try {
        const data = await fetchResults(currentTestId, { 
            search: currentSearch, 
            sort: currentSort.column, 
            order: currentSort.order, 
            page: currentPage, 
            limit: RESULTS_PER_PAGE 
        });

        if (data.results.length === 0 && data.currentPage > 1) {
            currentPage = data.totalPages > 0 ? data.totalPages : 1;
            loadResults();
            return;
        }

        renderResultsTable(data.results);
        renderPagination(data.totalPages, data.currentPage);
        
        newResultIdsToHighlight.forEach(id => {
            document.querySelector(`tr[data-id="${id}"]`)?.classList.add('is-highlighted');
        });
        newResultIdsToHighlight.clear();

        setTimeout(() => {
            document.querySelectorAll('tr.is-highlighted').forEach(row => row.classList.remove('is-highlighted'));
        }, 4000);

    } catch (error) {
        container.innerHTML = `<p class="error-message">Не удалось загрузить результаты.</p>`;
        console.error("Ошибка при загрузке результатов:", error);
    } finally {
        container.classList.remove('is-sorting');
        document.querySelector('#results-refresh-btn')?.classList.remove('has-update');
    }
}

/**
 * Отрисовывает таблицу с результатами.
 * @param {Array<object>} results - Массив объектов с результатами.
 */
function renderResultsTable(results) {
    const container = document.getElementById('resultsTableContainer');
    if (!container) return;

    if (results.length === 0) {
        const message = currentSearch 
            ? `По запросу "${escapeHTML(currentSearch)}" ничего не найдено.` 
            : 'Для этого теста пока нет результатов.';
        container.innerHTML = `<div class="empty-state-message"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg><span>${message}</span></div>`;
        return;
    }

    const sortIndicator = (column) => (column !== currentSort.column) ? '' : (currentSort.order === 'asc' ? ' ▲' : ' ▼');
    
    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th class="checkbox-cell"><input type="checkbox" id="selectAllResultsCheckbox" class="custom-table-checkbox" title="Выбрать все на странице"></th>
                    <th class="sortable" data-sort="id">№${sortIndicator('id')}</th>
                    <th class="sortable" data-sort="fio">ФИО${sortIndicator('fio')}</th>
                    <th class="sortable" data-sort="score">Результат${sortIndicator('score')}</th>
                    <th class="sortable" data-sort="status">Статус${sortIndicator('status')}</th>
                    <th class="sortable" data-sort="percentage">Процент${sortIndicator('percentage')}</th>
                    <th class="sortable" data-sort="date">Дата и время${sortIndicator('date')}</th>
                    <th>Действия</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>`;
        
    const tableBody = container.querySelector('tbody');
    const fragment = document.createDocumentFragment();

    results.forEach((result) => {
        const isPassed = !!result.passed;
        const needsReview = result.status === 'pending_review';
        
        let statusClass, statusText;
        if (needsReview) {
            statusClass = 'status-pending';
            statusText = 'НА ПРОВЕРКЕ';
        } else {
            statusClass = isPassed ? 'status-pass' : 'status-fail';
            statusText = isPassed ? 'СДАН' : 'НЕ СДАН';
        }

        const row = document.createElement('tr');
        row.dataset.id = result.id;
        row.dataset.fio = result.fio;
        if (needsReview) {
            row.classList.add('needs-review');
            row.title = "Нажмите для ручной проверки";
        } else {
            row.title = "Нажмите для просмотра протокола";
        }

        row.innerHTML = `
            <td class="checkbox-cell"><input type="checkbox" class="result-checkbox custom-table-checkbox" data-id="${result.id}"></td>
            <td data-label="№">${result.id}</td>
            <td data-label="ФИО">${escapeHTML(result.fio)}</td>
            <td data-label="Результат">${result.score}/${result.total}</td>
            <td data-label="Статус"><span class="status-label ${statusClass}">${statusText}</span></td>
            <td data-label="Процент">
                <div class="percentage-bar" title="${result.percentage}%">
                    <div class="percentage-fill ${isPassed ? 'pass' : 'fail'}" style="width: ${result.percentage}%;"></div>
                    <span>${result.percentage}%</span>
                </div>
            </td>
            <td data-label="Дата">${new Date(result.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
            <td data-label="Действия" class="actions-cell">
                <button type="button" class="btn-icon delete" data-id="${result.id}" title="Удалить запись">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </td>`;
        fragment.appendChild(row);
    });
    tableBody.appendChild(fragment);
}

function renderPagination(totalPages, currentPageNum) {
    const container = document.getElementById('paginationContainer');
    if (!container) return;
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    let paginationHTML = `<button class="btn-pagination" data-page="${currentPageNum - 1}" ${currentPageNum === 1 ? 'disabled' : ''}>&laquo; Назад</button>`;
    for (let i = 1; i <= totalPages; i++) {
        paginationHTML += `<button class="btn-pagination ${i === currentPageNum ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    paginationHTML += `<button class="btn-pagination" data-page="${currentPageNum + 1}" ${currentPageNum === totalPages ? 'disabled' : ''}>Вперед &raquo;</button>`;
    container.innerHTML = paginationHTML;
}

function updateBulkActionsUI() {
    const deleteBtn = document.getElementById('deleteSelectedResultsBtn');
    if (!deleteBtn) return;
    const count = selectedResultIds.size;
    deleteBtn.textContent = `Удалить выбранные (${count})`;
    deleteBtn.classList.toggle('visible', count > 0);
    
    const selectAllCheckbox = document.getElementById('selectAllResultsCheckbox');
    if (selectAllCheckbox) {
        const allOnPageCount = document.querySelectorAll('.result-checkbox').length;
        selectAllCheckbox.checked = count === allOnPageCount && allOnPageCount > 0;
        selectAllCheckbox.indeterminate = count > 0 && count < allOnPageCount;
    }
}

function confirmAndHandleBulkDelete() {
    const idsToDelete = Array.from(selectedResultIds);
    if (idsToDelete.length === 0) return;
    const count = idsToDelete.length;
    showConfirmModal({
        title: `Удалить ${count} ${pluralize(count, 'result')}?`,
        text: 'Это действие необратимо. Вы уверены?',
        onConfirm: async () => {
            const deleteBtn = document.getElementById('deleteSelectedResultsBtn');
            if (deleteBtn) deleteBtn.disabled = true;
            try {
                await deleteResults(idsToDelete);
                showToast(`${count} ${pluralize(count, 'result')} успешно удалено.`, 'success');
                await loadResults();
            } catch (error) {
                console.error("Ошибка удаления результатов:", error);
            } finally {
                if (deleteBtn) deleteBtn.disabled = false;
            }
        }
    });
}

async function showProtocolModal(resultId, fio) {
    const modal = document.getElementById('protocolModal');
    openModal(modal);
    const titleEl = modal.querySelector('#protocolModalTitle');
    const contentEl = modal.querySelector('#protocolContent');
    titleEl.innerHTML = `Загрузка протокола...`;
    contentEl.innerHTML = '<div class="spinner"></div>';

    try {
        const { summary, protocol: protocolData } = await fetchProtocol(resultId);
        const statusClass = summary.passed ? 'status-pass' : 'status-fail';
        const statusText = summary.passed ? 'СДАН' : 'НЕ СДАН';
        titleEl.innerHTML = `Протокол теста для: ${escapeHTML(fio)} <span class="protocol-status ${statusClass}">${statusText}</span>`;
        
        if (!protocolData || protocolData.length === 0) {
            contentEl.innerHTML = '<p class="empty-state-message">Детальная информация для этого теста недоступна.</p>';
            return;
        }

        const protocolHTML = protocolData.map((item, index) => {
            const itemClass = item.isCorrect ? 'correct' : 'incorrect';
            const explanationHTML = item.explanation ? `<div class="explanation-box"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span><strong>Пояснение:</strong> ${escapeHTML(item.explanation)}</span></div>` : '';
            const userIcon = item.isCorrect ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            let chosenAnswerContent, correctAnswerContent;

            if (item.type === 'match') {
                chosenAnswerContent = '<ul>' + item.match_prompts.map((prompt, i) => `<li><strong>${escapeHTML(prompt)}:</strong> ${escapeHTML(item.chosen_answers_match[i] || '—')}</li>`).join('') + '</ul>';
                correctAnswerContent = '<ul>' + item.match_prompts.map((prompt, i) => `<li><strong>${escapeHTML(prompt)}:</strong> ${escapeHTML(item.correct_answers_match[i] || '—')}</li>`).join('') + '</ul>';
            } else {
                chosenAnswerContent = escapeHTML(item.chosenAnswerText) || "—";
                correctAnswerContent = escapeHTML(item.correctAnswerText) || "—";
            }
            return `
                <div class="protocol-item ${itemClass}">
                    <div class="protocol-item-header"><span>Вопрос ${index + 1}: ${escapeHTML(item.questionText)}</span></div>
                    <div class="protocol-item-body">
                        <div class="protocol-answer-block">
                            <span class="answer-label user-answer">${userIcon} Ваш ответ</span>
                            <div class="answer-text">${chosenAnswerContent}</div>
                        </div>
                        <div class="protocol-answer-block">
                            <span class="answer-label correct-answer"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>Правильный ответ</span>
                            <div class="answer-text">${correctAnswerContent}</div>
                        </div>
                    </div>
                    ${explanationHTML}
                </div>`;
        }).join('');
        contentEl.innerHTML = protocolHTML;

    } catch (error) {
        contentEl.innerHTML = `<p class="error-message">Не удалось загрузить протокол.</p>`;
        console.error("Ошибка загрузки протокола:", error);
    }
}

async function showReviewModal(resultId, fio) {
    const modal = document.getElementById('reviewModal');
    openModal(modal);
    const title = modal.querySelector('#reviewModalTitle');
    const content = modal.querySelector('#reviewContent');
    title.innerHTML = `Проверка ответов для: ${escapeHTML(fio)}`;
    content.innerHTML = '<div class="spinner"></div>';

    try {
        const questionsToReview = await fetchQuestionsForReview(resultId);
        if (questionsToReview.length === 0) {
            content.innerHTML = '<p class="empty-state-message">Все открытые вопросы в этом тесте уже проверены.</p>';
            return;
        }
        
        const total = questionsToReview.length;
        title.innerHTML += ` <span id="reviewProgressCounter">Оценено 0 из ${total}</span>`;
        content.innerHTML = questionsToReview.map(q => `
            <div class="review-item-compact" data-answer-id="${q.answerId}">
                <div class="review-item-content-compact">
                    <div class="review-question-text-compact">${escapeHTML(q.questionText)}</div>
                    <div class="review-user-answer-compact">${escapeHTML(q.userAnswer) || "<em>— ответ не дан —</em>"}</div>
                    ${q.questionExplanation ? `<div class="explanation-box"><span>${escapeHTML(q.questionExplanation)}</span></div>` : ''}
                </div>
                <div class="review-item-actions-compact">
                    <button type="button" class="btn-review-compact btn-review-correct-compact" data-correct="true" title="Правильно"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
                    <button type="button" class="btn-review-compact btn-review-incorrect-compact" data-correct="false" title="Неправильно"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </div>
            </div>`).join('');
        
        modal.querySelectorAll('svg').forEach(svg => {
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '3');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
        });

    } catch (error) {
        content.innerHTML = `<p class="error-message">Не удалось загрузить вопросы для проверки.</p>`;
    }
}

export function initResultsModule(testId, initialHighlightIds = []) {
    currentTestId = testId;
    newResultIdsToHighlight = new Set(initialHighlightIds.map(String));
    const savedState = loadUiState();
    currentPage = savedState?.page || 1;
    currentSearch = savedState?.search || '';
    currentSort = savedState?.sort || { column: 'date', order: 'desc' };
    selectedResultIds.clear();

    const container = document.getElementById('tab-results');
    container.innerHTML = `
        <div class="card">
            <div class="admin-controls">
                <h2>Результаты Теста</h2>
                <div class="admin-actions">
                    <button id="deleteSelectedResultsBtn" class="btn btn-danger">Удалить выбранные</button>
                    <button id="results-refresh-btn" type="button" class="btn">Обновить</button>
                </div>
            </div>
            <div class="input-wrap search-wrap"><input type="search" id="results-search-input" placeholder="Поиск по ФИО..." value="${escapeHTML(currentSearch)}"></div>
            <div id="resultsTableContainer"><div class="spinner"></div></div>
            <div id="paginationContainer" class="pagination-container"></div>
        </div>`;
    
    const searchInput = document.getElementById('results-search-input');
    searchInput.addEventListener('input', () => {
        currentSearch = searchInput.value;
        currentPage = 1;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadResults(), 350);
    });

    container.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('#results-refresh-btn')) { loadResults(); }
        if (target.closest('#deleteSelectedResultsBtn')) { confirmAndHandleBulkDelete(); }

        const sortableHeader = target.closest('th.sortable');
        if (sortableHeader) {
            const newSortColumn = sortableHeader.dataset.sort;
            currentSort.column = newSortColumn;
            currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
            currentPage = 1;
            loadResults();
        }

        if (target.matches('.result-checkbox, #selectAllResultsCheckbox')) {
            const isSelectAll = target.id === 'selectAllResultsCheckbox';
            const isChecked = target.checked;
            document.querySelectorAll('.result-checkbox').forEach(cb => {
                if (isSelectAll) cb.checked = isChecked;
                const id = cb.dataset.id;
                isChecked ? selectedResultIds.add(id) : selectedResultIds.delete(id);
            });
            if (!isSelectAll) {
                const id = target.dataset.id;
                isChecked ? selectedResultIds.add(id) : selectedResultIds.delete(id);
            }
            updateBulkActionsUI();
        }

        const deleteBtn = target.closest('.btn-icon.delete');
        if (deleteBtn) {
            e.stopPropagation();
            const resultId = deleteBtn.dataset.id;
            const fio = deleteBtn.closest('tr')?.dataset.fio || `ID ${resultId}`;
            showConfirmModal({
                title: 'Удалить результат?',
                text: `Вы уверены, что хотите удалить запись для "${escapeHTML(fio)}"?`,
                onConfirm: async () => {
                    await deleteResults([resultId]);
                    await loadResults();
                }
            });
        }

        const row = target.closest('tr[data-id]');
        if (row && !target.closest('.checkbox-cell, .actions-cell')) {
            if (row.classList.contains('needs-review')) {
                showReviewModal(row.dataset.id, row.dataset.fio);
            } else {
                showProtocolModal(row.dataset.id, row.dataset.fio);
            }
        }

        const pageBtn = target.closest('.btn-pagination:not(:disabled)');
        if (pageBtn) {
            currentPage = parseInt(pageBtn.dataset.page, 10);
            loadResults();
        }
    });

    document.getElementById('reviewModal').addEventListener('click', async (e) => {
        const reviewBtn = e.target.closest('.btn-review-compact');
        if (reviewBtn) {
            const item = reviewBtn.closest('.review-item-compact');
            const isCorrect = reviewBtn.dataset.correct === 'true';
            item.classList.toggle('is-judged-correct', isCorrect);
            item.classList.toggle('is-judged-incorrect', !isCorrect);
            item.dataset.judgedStatus = isCorrect ? 'correct' : 'incorrect';
            // Логика обновления счетчика и кнопки "Завершить"
        }

        const finishBtn = e.target.closest('#reviewFinishBtn');
        if (finishBtn && !finishBtn.disabled) {
            finishBtn.disabled = true;
            finishBtn.textContent = 'Сохранение...';
            const verdicts = Array.from(document.querySelectorAll('.review-item-compact[data-judged-status]')).map(item => ({
                answerId: parseInt(item.dataset.answerId),
                isCorrect: item.dataset.judgedStatus === 'correct'
            }));
            await submitBatchReview(verdicts);
            closeModal(document.getElementById('reviewModal'));
            await loadResults();
        }
    });

    loadResults();
}

export function prependNewResultRow(result) {
    if (currentPage === 1 && currentSearch === '' && currentSort.column === 'date' && currentSort.order === 'desc') {
        registerNewResultId(result.id);
        loadResults();
    } else {
        document.querySelector('#results-refresh-btn')?.classList.add('has-update');
    }
}