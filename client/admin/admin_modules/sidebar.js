// --- ФАЙЛ: client/admin/admin_modules/sidebar.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот модуль отвечает за всю логику боковой панели (сайдбара) в панели администратора.
// Он загружает, отображает список тестов, а также обрабатывает их создание,
// удаление и выбор для отображения в основной рабочей области через шину событий.

import { fetchTests, createTest, deleteTest } from '../../common/shared_modules/api/admin.js';
import { showToast } from '../../common/shared_modules/ui.js';
import { showConfirmModal } from '../../common/shared_modules/modals.js';
import { escapeHTML } from '../../common/shared_modules/utils.js';
import { eventBus } from '../../common/shared_modules/event-bus.js';

/**
 * Отрисовывает HTML-разметку списка тестов в сайдбаре.
 * @param {Array<object>} tests - Массив объектов тестов для отображения.
 */
function renderSidebar(tests) {
    const navContainer = document.getElementById('tests-list-container');
    if (!navContainer) return;

    if (!tests || tests.length === 0) {
        navContainer.innerHTML = '<p class="empty-state-message" style="padding: 20px;">Тестов пока нет. Создайте первый!</p>';
        return;
    }
    
    // Используем DocumentFragment для эффективной вставки в DOM
    const fragment = document.createDocumentFragment();
    tests.forEach(test => {
        const indicatorClass = test.is_active ? 'active' : 'draft';
        const indicatorTitle = test.is_active ? 'Опубликован' : 'Черновик';
        
        const navItem = document.createElement('a');
        navItem.className = 'nav-item';
        navItem.href = '#';
        navItem.dataset.id = test.id;
        navItem.dataset.name = test.name;
        
        // Добавляем специальный класс, если у теста есть результаты для ручной проверки
        if (test.hasPendingReviews) {
            navItem.classList.add('needs-review');
        }
        
        navItem.innerHTML = `
            <div class="nav-item-content">
                <span class="status-indicator ${indicatorClass}" title="${indicatorTitle}"></span>
                <span>${escapeHTML(test.name)}</span>
            </div>
            <button type="button" class="delete-test" title="Удалить тест">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        `;
        fragment.appendChild(navItem);
    });

    navContainer.innerHTML = ''; // Очищаем контейнер перед вставкой
    navContainer.appendChild(fragment);
}

/**
 * Инициирует процесс создания нового теста через модальное окно.
 */
async function handleCreateTest() {
    showConfirmModal({
        title: 'Создание нового теста',
        text: 'Пожалуйста, введите название для нового теста:',
        isInput: true,
        inputPlaceholder: 'Например, "Аттестация для отдела продаж"',
        confirmText: 'Создать',
        cancelText: 'Отмена',
        onConfirm: async (testName) => {
            if (!testName) {
                showToast('Название теста не может быть пустым.', 'error');
                return;
            }

            const creatingToast = showToast('Создание теста...', 'info', 0);
            try {
                const result = await createTest(testName);
                creatingToast.hideToast();
                showToast('Тест успешно создан!', 'success');
                
                await refreshSidebar();
                
                // Автоматически "кликаем" на новый тест, чтобы открыть его дашборд
                const newNavItem = document.querySelector(`.nav-item[data-id="${result.newTest.id}"]`);
                newNavItem?.click();

            } catch (error) {
                creatingToast.hideToast();
                console.error("Не удалось создать тест:", error);
            }
        }
    });
}

/**
 * Инициирует процесс удаления теста с подтверждением.
 * @param {string} testId - ID удаляемого теста.
 * @param {string} testName - Название удаляемого теста.
 */
async function handleDeleteTest(testId, testName) {
    showConfirmModal({
        title: `Удалить тест "${escapeHTML(testName)}"?`,
        text: 'ВНИМАНИЕ: Все вопросы, настройки и результаты этого теста будут безвозвратно удалены!',
        confirmText: 'Да, удалить',
        onConfirm: async () => {
            const navItemToDelete = document.querySelector(`.nav-item[data-id="${testId}"]`);
            if (!navItemToDelete) return;

            const deletingToast = showToast(`Удаление "${escapeHTML(testName)}"...`, 'info', 0);
            navItemToDelete.classList.add('is-deleting'); // Запускаем CSS-анимацию
            
            try {
                await deleteTest(testId);
                
                // Задержка для завершения CSS-анимации перед удалением из DOM
                setTimeout(() => {
                    deletingToast.hideToast();
                    showToast('Тест успешно удален.', 'success');
                    
                    const isActive = navItemToDelete.classList.contains('active');
                    navItemToDelete.remove();
                    
                    // Если удалили активный тест, очищаем основную область
                    if (isActive) {
                        eventBus.dispatchEvent(new CustomEvent('context-cleared'));
                    }
                    
                    // Если тестов не осталось, показываем приветственное сообщение
                    if (document.querySelectorAll('.nav-item').length === 0) {
                        eventBus.dispatchEvent(new CustomEvent('context-cleared'));
                    }
                }, 400);

            } catch (error) {
                deletingToast.hideToast();
                console.error("Ошибка при удалении теста:", error);
                navItemToDelete.classList.remove('is-deleting'); // Отменяем анимацию в случае ошибки
            }
        }
    });
}

/**
 * Перезагружает и перерисовывает содержимое сайдбара с сервера,
 * сохраняя при этом активный выбранный элемент и индикаторы новых результатов.
 */
export async function refreshSidebar() {
    try {
        const activeItemId = document.querySelector('.nav-item.active')?.dataset.id;
        const testsWithNewResults = new Set(
            Array.from(document.querySelectorAll('.nav-item.has-new-result')).map(item => item.dataset.id)
        );

        const tests = await fetchTests();
        sessionStorage.setItem('allTestsData', JSON.stringify(tests));
        
        renderSidebar(tests);

        // Восстанавливаем состояния после перерисовки
        if (activeItemId) {
            document.querySelector(`.nav-item[data-id="${activeItemId}"]`)?.classList.add('active');
        }
        testsWithNewResults.forEach(testId => {
            document.querySelector(`.nav-item[data-id="${testId}"]`)?.classList.add('has-new-result');
        });

    } catch (error) {
        console.error("Не удалось обновить список тестов:", error);
        const navContainer = document.getElementById('tests-list-container');
        if (navContainer) {
            navContainer.innerHTML = `<p class="error-message" style="padding: 20px;">Ошибка загрузки списка тестов</p>`;
        }
    }
}

/**
 * Инициализирует модуль сайдбара: навешивает обработчики событий и загружает данные.
 */
export async function initSidebar() {
    const sidebarContainer = document.getElementById('tests-list-container');
    const addTestBtn = document.getElementById('addTestBtn');

    if (!sidebarContainer || !addTestBtn) return;

    // Используем делегирование событий для обработки всех кликов внутри списка
    sidebarContainer.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-test');
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            const parentNavItem = deleteBtn.closest('.nav-item');
            handleDeleteTest(parentNavItem.dataset.id, parentNavItem.dataset.name);
            return;
        }

        const navItem = e.target.closest('.nav-item');
        if (navItem && !navItem.classList.contains('active')) {
            navItem.classList.remove('has-new-result');
            
            document.querySelectorAll('.nav-item.active').forEach(item => item.classList.remove('active'));
            navItem.classList.add('active');
            
            // Отправляем событие в шину, уведомляя другие части приложения о выборе теста
            eventBus.dispatchEvent(new CustomEvent('test-selected', {
                detail: {
                    testId: navItem.dataset.id,
                    testName: navItem.dataset.name,
                }
            }));
        }
    });

    addTestBtn.addEventListener('click', handleCreateTest);

    // Первоначальная загрузка и отрисовка списка тестов
    await refreshSidebar();
}