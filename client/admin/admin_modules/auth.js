// --- ФАЙЛ: client/admin/admin_modules/auth.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ) ---
// Этот файл управляет всей логикой аутентификации для панели администратора тестов.

import { login, checkAuth } from '../../common/shared_modules/api/auth.js';

/**
 * Обрабатывает попытку входа пользователя. Собирает данные из формы, отправляет запрос
 * на сервер и обрабатывает ответ.
 * @param {function} onSuccess - Коллбэк-функция, которая вызывается для инициализации
 *                               основной части админ-панели после успешного входа.
 */
async function handleLogin(onSuccess) {
    const passwordInput = document.getElementById('passwordInput');
    const passwordError = document.getElementById('passwordError');
    const loginForm = document.getElementById('loginForm');
    const password = passwordInput.value;
    
    // Сбрасываем предыдущее сообщение об ошибке
    passwordError.textContent = '';
    
    // Блокируем кнопку на время запроса для предотвращения двойных нажатий
    const submitBtn = document.getElementById('submitPasswordBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Вход...';

    try {
        const loginResponse = await login(password);
        
        // Если сервер подтвердил, что это разработчик, перенаправляем на его специальную панель.
        if (loginResponse.isDev) {
            window.location.href = '/dev-panel/';
            return; // Прерываем выполнение, так как произойдет редирект.
        }

        // Если это обычный администратор, скрываем модальное окно и показываем основной контент.
        document.getElementById('passwordModal').classList.remove('visible');
        document.getElementById('adminContent').classList.remove('hidden');
        
        // Вызываем коллбэк для инициализации остальной части админ-панели (сайдбар, SSE и т.д.).
        onSuccess();

    } catch (error) {
        console.error("Login request failed:", error);
        // Добавляем анимацию встряхивания для визуальной обратной связи
        loginForm.closest('.modal-content')?.classList.add('shake');
        setTimeout(() => loginForm.closest('.modal-content')?.classList.remove('shake'), 500);

        // Обрабатываем специфические ошибки для лучшего UX.
        // Сервер вернет 401 Unauthorized, что будет отражено в сообщении ошибки.
        if (error.message.includes('401') || error.message.toLowerCase().includes('пароль')) {
            passwordError.textContent = 'Неверный пароль. Попробуйте еще раз.';
            passwordInput.select(); // Выделяем текст в поле для удобства повторного ввода.
        } else {
            // Для всех остальных ошибок (сетевые, 500 и т.д.) показываем общее сообщение.
            passwordError.textContent = 'Ошибка сети. Не удалось войти.';
        }
    } finally {
        // Вне зависимости от результата, возвращаем кнопке исходное состояние.
        submitBtn.disabled = false;
        submitBtn.textContent = 'Войти';
    }
}

/**
 * Устанавливает все необходимые обработчики событий для модального окна входа.
 * @param {function} onSuccess - Коллбэк-функция, которая будет передана в handleLogin.
 */
function setupLoginHandlers(onSuccess) {
    const loginForm = document.getElementById('loginForm');
    const passwordInput = document.getElementById('passwordInput');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    
    if (!loginForm || !passwordInput || !togglePasswordBtn) {
        console.error('Ошибка инициализации: не найдены все необходимые элементы для формы входа.');
        return;
    }

    // Обработчик отправки формы (через кнопку или Enter).
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin(onSuccess);
    });

    // Обработчик для кнопки "показать/скрыть пароль".
    togglePasswordBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        
        // Переключаем видимость иконок "глаза".
        togglePasswordBtn.querySelector('.icon-eye').classList.toggle('hidden', isPassword);
        togglePasswordBtn.querySelector('.icon-eye-off').classList.toggle('hidden', !isPassword);
        
        passwordInput.focus(); // Возвращаем фокус на поле ввода.
    });
    
    // Сбрасываем сообщение об ошибке, как только пользователь начинает вводить новый пароль.
    passwordInput.addEventListener('input', () => {
        document.getElementById('passwordError').textContent = '';
    });
}

/**
 * Инициализирует весь модуль аутентификации. Проверяет текущую сессию
 * и решает, показать ли модальное окно входа или сразу админ-панель.
 * @param {function} initializeAdminPanel - Коллбэк для полной инициализации админ-панели,
 *                                          который будет вызван после успешной аутентификации.
 */
export async function initAuth(initializeAdminPanel) {
    setupLoginHandlers(initializeAdminPanel);
    
    const passwordModal = document.getElementById('passwordModal');
    const adminContent = document.getElementById('adminContent');
    
    try {
        const { authenticated, isDev } = await checkAuth();
        
        // Если сессия разработчика активна, сразу перенаправляем его на соответствующую панель.
        if (isDev) {
            window.location.href = '/dev-panel/';
            return;
        }
        
        // Если сессия администратора активна, показываем основной контент и инициализируем панель.
        if (authenticated) {
            passwordModal.classList.remove('visible');
            adminContent.classList.remove('hidden');
            initializeAdminPanel();
        } else {
            // Если нет активной сессии, показываем модальное окно входа.
            adminContent.classList.add('hidden');
            passwordModal.classList.add('visible');
            document.getElementById('passwordInput').focus();
        }
    } catch (error) {
        // В случае любой ошибки (например, сервер недоступен), показываем окно входа как fallback.
        console.error("Auth check failed:", error);
        adminContent.classList.add('hidden');
        passwordModal.classList.add('visible');
        document.getElementById('passwordInput').focus();
    }
}