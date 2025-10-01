// --- ФАЙЛ: client/admin/admin_modules/main-content.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль выступает в роли "контроллера" для основной рабочей области админ-панели.
// Он отвечает за рендеринг либо приветственного сообщения, либо полноценного дашборда
// для управления выбранным тестом, а также инициализирует дочерние модули для каждой вкладки.

import { initSettingsModule } from './settings.js';
import { initResultsModule, loadResults } from './results.js';
import { initQuestionsModule } from './questions.js';
import { showConfirmModal } from '../../common/shared_modules/modals.js';
import { showToast } from '../../common/shared_modules/ui.js';
import { refreshSidebar } from './sidebar.js';
import { escapeHTML } from '../../common/shared_modules/utils.js';
import { renameTest } from '../../common/shared_modules/api/admin.js';
import { eventBus } from '../../common/shared_modules/event-bus.js';

const mainContentArea = document.getElementById('main-content-area');

/**
 * Показывает приветственное сообщение в основной рабочей области,
 * когда ни один тест не выбран.
 */
export function showWelcomeMessage() {
    mainContentArea.innerHTML = `
        <div class="card welcome-dashboard">
            <h1>Добро пожаловать в панель управления!</h1>
            <p class="welcome-dashboard-subtitle">
                Выберите тест в панели слева, чтобы начать им управлять, или создайте новый.
            </p>
        </div>
    `;
    // Очищаем контекст, чтобы избежать случайных действий над несуществующим тестом
    eventBus.dispatchEvent(new CustomEvent('context-cleared'));
}

/**
 * Генерирует и отображает полную панель управления (дашборд) для выбранного теста,
 * включая вкладки для результатов, вопросов и настроек.
 * @param {object} testContext - Объект с { id, name } выбранного теста.
 * @param {Array<number>} [highlightIds=[]] - Массив ID результатов для подсветки.
 */
export function showTestDashboard(testContext, highlightIds = []) {
    // Получаем актуальный статус теста из данных, закэшированных в sessionStorage модулем sidebar
    const allTests = JSON.parse(sessionStorage.getItem('allTestsData') || '[]');
    const currentTest = allTests.find(t => t.id === testContext.id);
    const isActive = !!currentTest?.is_active;

    mainContentArea.innerHTML = `
        <div class="test-dashboard">
            <div class="dashboard-header">
                <span id="dashboardStatusIndicator" class="status-indicator-large ${isActive ? 'active' : ''}" title="${isActive ? 'Тест опубликован' : 'Тест является черновиком'}"></span>
                <h1 id="testDashboardTitle">${escapeHTML(testContext.name)}</h1>
                <button id="editTestNameBtn" type="button" class="btn-icon edit" title="Редактировать название теста">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                </button>
            </div>
            
            <div class="tabs">
                <button class="tab-button active" data-tab="results" type="button">Результаты</button>
                <button class="tab-button" data-tab="questions" type="button">Банк вопросов</button>
                <button class="tab-button" data-tab="settings" type="button">Настройки</button>
            </div>
            
            <div class="tab-content-wrapper">
                <div id="tab-results" class="tab-content active"></div>
                <div id="tab-questions" class="tab-content"></div>
                <div id="tab-settings" class="tab-content"></div>
            </div>
        </div>
    `;

    /**
     * Внутренняя функция для обновления UI индикатора статуса в заголовке.
     * @param {boolean} newIsActive - Новый статус активности теста.
     */
    const updateHeaderIndicator = (newIsActive) => {
        const indicator = document.getElementById('dashboardStatusIndicator');
        if (indicator) {
            indicator.classList.toggle('active', newIsActive);
            indicator.title = newIsActive ? "Тест опубликован и виден пользователям" : "Тест является черновиком и скрыт";
        }
    };

    // Инициализируем дочерние модули для каждой вкладки
    initSettingsModule(testContext.id, updateHeaderIndicator);
    initResultsModule(testContext.id, highlightIds);
    initQuestionsModule(testContext.id);

    // Устанавливаем логику переключения вкладок
    const tabsContainer = document.querySelector('.tabs');
    tabsContainer.addEventListener('click', (e) => {
        const clickedButton = e.target.closest('.tab-button');
        if (!clickedButton || clickedButton.classList.contains('active')) return;

        document.querySelector('.tab-button.active')?.classList.remove('active');
        document.querySelector('.tab-content.active')?.classList.remove('active');
        
        clickedButton.classList.add('active');
        document.getElementById(`tab-${clickedButton.dataset.tab}`)?.classList.add('active');
        
        // Если переключились на вкладку "Результаты" с индикатором обновления,
        // принудительно перезагружаем результаты и убираем индикатор.
        if (clickedButton.dataset.tab === 'results' && clickedButton.classList.contains('has-update')) {
            loadResults(); // Функция импортирована из results.js
            clickedButton.classList.remove('has-update');
        }
    });

    // Устанавливаем обработчик для кнопки редактирования названия теста
    document.getElementById('editTestNameBtn').addEventListener('click', () => {
        showConfirmModal({
            title: 'Редактировать название теста',
            text: `Текущее название: "${escapeHTML(testContext.name)}"`,
            isInput: true,
            inputPlaceholder: 'Введите новое название',
            confirmText: 'Сохранить',
            cancelText: 'Отмена',
            onConfirm: async (newName) => {
                if (!newName || newName === testContext.name) return;
                
                const savingToast = showToast('Сохранение...', 'info', 0);
                try {
                    await renameTest(testContext.id, newName);

                    // Обновляем UI без перезагрузки всей страницы
                    document.getElementById('testDashboardTitle').textContent = newName;
                    testContext.name = newName; // Обновляем локальный контекст
                    await refreshSidebar(); // Обновляем сайдбар, чтобы там тоже изменилось название
                    
                    savingToast.hideToast();
                    showToast('Название теста успешно обновлено!', 'success');
                } catch (error) {
                    savingToast.hideToast();
                    console.error("Ошибка при переименовании теста:", error);
                }
            }
        });
    });
}