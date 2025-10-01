// Этот скрипт используется только для генерации хеша пароля.
// Запустите его из командной строки: node server/hash-password.js ВАШ_СУПЕР_ПАРОЛЬ

const bcrypt = require('bcrypt');

// Аргумент командной строки (пароль)
const password = process.argv[2];

if (!password) {
    console.error('Ошибка: Укажите пароль в качестве аргумента.');
    console.log('Пример: node server/hash-password.js MySecurePassword123');
    process.exit(1);
}

// "Соль" определяет сложность вычисления. 12 - хороший, надежный выбор.
const saltRounds = 12;

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
        console.error('Произошла ошибка при хешировании:', err);
        return;
    }
    console.log('Пароль:', password);
    console.log('Ваш безопасный хеш пароля (сохраните его в .env):');
    console.log(hash);
});