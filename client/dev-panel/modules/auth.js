// client/dev-panel/modules/auth.js
import { openModal, closeModal } from '../../common/shared_modules/modals.js';
import { showToast } from '../../common/shared_modules/ui.js';
import { checkAuth, devLogin } from '../../common/shared_modules/api/auth.js';

/**
 * Старт авторизации Dev-панели.
 * @param {(isDev: boolean) => void} onAuthorized — вызывается после успешного входа
 */
export function initAuthFlow(onAuthorized) {
  const modal = document.getElementById('devPasswordModal');
  const form = document.getElementById('devLoginForm');
  const input = document.getElementById('devPasswordInput');
  const toggleBtn = document.getElementById('devTogglePasswordBtn');
  const errorBox = document.getElementById('devPasswordError');
  const content = document.getElementById('devContent');

  if (!modal || !form || !input || !content) {
    console.error('auth.js: нет элементов модалки/контента dev-панели');
    return;
  }

  const showContent = (isDev) => {
    closeModal(modal);
    content.classList.remove('hidden');
    if (typeof onAuthorized === 'function') onAuthorized(!!isDev);
  };

  const showLogin = () => {
    content.classList.add('hidden');
    openModal(modal);
    input.focus();
  };

  // 1) пробуем существующую сессию
  checkAuth()
    .then(({ authenticated, isDev }) => {
      if (authenticated) showContent(isDev);
      else showLogin();
    })
    .catch(() => showLogin());

  // 2) показать/скрыть пароль
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      const on = toggleBtn.querySelector('.icon-eye');
      const off = toggleBtn.querySelector('.icon-eye-off');
      on && on.classList.toggle('hidden', !isPwd);
      off && off.classList.toggle('hidden', isPwd);
      input.focus();
    });
  }

  // 3) отправка формы
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    const password = String(input.value || '').trim();
    if (!password) {
      errorBox.textContent = 'Введите пароль';
      input.focus();
      return;
    }

    try {
      // dev-login — специальный маршрут для dev-панели
      const { success, isDev } = await devLogin(password);
      if (success) {
        showToast('Вход выполнен', 'success');
        showContent(isDev);
      } else {
        errorBox.textContent = 'Неверный пароль';
      }
    } catch (err) {
      errorBox.textContent = 'Ошибка входа. Проверьте DEV_PASSWORD_HASH на сервере.';
      console.error(err);
    }
  });
}
