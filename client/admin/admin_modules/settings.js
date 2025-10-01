// --- ФАЙЛ: client/test-admin/admin_modules/settings.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ ПОСЛЕ РЕФАКТОРИНГА) ---
// Этот модуль управляет логикой вкладки "Настройки" в панели администратора.

import { showToast } from '../../common/shared_modules/ui.js';
import { refreshSidebar } from './sidebar.js';
import { fetchTestSettings, saveTestSettings, updateTestStatus, fetchTests } from '../../common/shared_modules/api-client.js';

let currentTestId = null;
let onStatusChangeCallback = () => {}; // Коллбэк для обновления UI в main-content (например, индикатора статуса)

/**
 * Загружает настройки для текущего теста с сервера и отображает их в форме.
 */
async function loadSettings() {
    try {
        const settings = await fetchTestSettings(currentTestId);
        document.getElementById('durationInput').value = settings.duration_minutes;
        document.getElementById('passingScoreInput').value = settings.passing_score;
        document.getElementById('questionsCountInput').value = settings.questions_per_test;
        
        // Статус публикации хранится в другой таблице, поэтому нужен отдельный запрос
        const allTests = await fetchTests();
        const currentTest = allTests.find(t => t.id === currentTestId);
        if (currentTest) {
            document.getElementById('publishToggle').checked = !!currentTest.is_active;
        }

    } catch (error) {
        // Ошибка будет отображена глобальным обработчиком.
        // Здесь мы просто отключаем форму, чтобы предотвратить дальнейшие действия.
        console.error("Не удалось загрузить настройки:", error);
        const inputs = document.querySelectorAll('#tab-settings input, #tab-settings button');
        inputs.forEach(input => input.disabled = true);
    }
}

/**
 * Собирает данные из формы, валидирует их и отправляет на сервер для сохранения.
 */
async function handleSaveSettings() {
    const saveBtn = document.getElementById('saveSettingsBtn');
    const originalBtnText = saveBtn.textContent;

    const settingsData = {
        duration_minutes: parseInt(document.getElementById('durationInput').value, 10),
        passing_score: parseInt(document.getElementById('passingScoreInput').value, 10),
        questions_per_test: parseInt(document.getElementById('questionsCountInput').value, 10)
    };

    // Клиентская валидация перед отправкой
    if (isNaN(settingsData.duration_minutes) || isNaN(settingsData.passing_score) || isNaN(settingsData.questions_per_test) ||
        settingsData.duration_minutes <= 0 || settingsData.passing_score <= 0 || settingsData.questions_per_test <= 0) {
        showToast('Все поля должны быть заполнены положительными числами.', 'error');
        return;
    }
    
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение...';

    try {
        await saveTestSettings(currentTestId, settingsData);
        showToast('Настройки теста успешно сохранены!', 'success');
    } catch (error) {
        // Глобальный обработчик покажет ошибку. Здесь просто логируем для отладки.
        console.error("Не удалось сохранить настройки:", error);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalBtnText;
    }
}

/**
 * Обрабатывает изменение статуса публикации теста (вкл/выкл).
 * @param {Event} e - Событие изменения состояния переключателя.
 */
async function handlePublishToggle(e) {
    const isChecked = e.target.checked;
    const toggle = e.target;

    toggle.disabled = true;
    
    try {
        await updateTestStatus(currentTestId, isChecked);
        
        showToast(isChecked ? 'Тест опубликован!' : 'Тест снят с публикации.', 'success');
        
        // Обновляем сайдбар, чтобы там изменился индикатор
        await refreshSidebar();
        
        // Вызываем коллбэк для обновления индикатора в заголовке дашборда
        if (onStatusChangeCallback) {
            onStatusChangeCallback(isChecked);
        }

    } catch (error) {
        // Глобальный обработчик покажет ошибку. Здесь мы откатываем состояние переключателя.
        console.error("Не удалось изменить статус теста:", error);
        toggle.checked = !isChecked;
    } finally {
        toggle.disabled = false;
    }
}

/**
 * Инициализирует модуль настроек для конкретного теста.
 * Создает HTML-структуру и навешивает обработчики событий.
 * @param {string} testId - ID теста, для которого загружаются настройки.
 * @param {function} callback - Функция для вызова при изменении статуса публикации.
 */
export function initSettingsModule(testId, callback) {
    currentTestId = testId;
    onStatusChangeCallback = callback;
    
    const container = document.getElementById('tab-settings');
    
    container.innerHTML = `
      <div class="card">
        <h2>Настройки Теста</h2>
        <div class="settings-grid">
            <div class="input-wrap">
                <label for="durationInput">Время на тест (в минутах)</label>
                <input type="number" id="durationInput" min="1" max="180">
            </div>
            <div class="input-wrap">
                <label for="passingScoreInput">Правильных ответов для сдачи</label>
                <input type="number" id="passingScoreInput" min="1" max="100">
            </div>
            <div class="input-wrap">
                <label for="questionsCountInput">Количество вопросов в тесте</label>
                <input type="number" id="questionsCountInput" min="1" max="100">
            </div>
        </div>
        <div class="admin-actions settings-actions">
            <button id="saveSettingsBtn" class="btn">Сохранить настройки</button>
        </div>
      </div>

      <div class="card settings-card-margin">
        <h2>Публикация</h2>
        <div class="input-wrap publish-toggle-wrap">
            <label for="publishToggle" class="publish-toggle-label">Статус публикации</label>
            <div>
                <input type="checkbox" id="publishToggle" class="switch"> 
                <label for="publishToggle" class="switch-label"></label>
            </div>
            <span class="publish-toggle-hint">(Тест виден пользователям, если переключатель активен)</span>
        </div>
      </div>
    `;

    document.getElementById('saveSettingsBtn').addEventListener('click', handleSaveSettings);
    document.getElementById('publishToggle').addEventListener('change', handlePublishToggle);
    
    loadSettings();
}