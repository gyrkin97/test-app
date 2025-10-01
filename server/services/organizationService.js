// --- ФАЙЛ: server/services/organizationService.js ---

const { run, get, all } = require('../utils/dbUtils');

/**
 * Генерирует случайный пастельный цвет в HEX-формате.
 * @returns {string} Цвет в формате #RRGGBB.
 */
function getRandomPastelColor() {
    const hue = Math.floor(Math.random() * 360);
    // Используем HSL-модель: 100% насыщенности и 85% светлоты дают приятные пастельные тона.
    const saturation = 100;
    const lightness = 85;

    // Вспомогательная функция для конвертации HSL в HEX
    const hslToHex = (h, s, l) => {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            // Преобразуем в 8-битное значение и дополняем нулём, если нужно (например, 'F' -> '0F')
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    };

    return hslToHex(hue, saturation, lightness);
}


/**
 * Фабричная функция, которая создает и возвращает сервис для управления организациями.
 * @param {object} db - Экземпляр базы данных sqlite3.
 * @returns {object} - Объект с методами сервиса.
 */
module.exports = (db) => {
    return {
        /**
         * Получает список всех организаций, включая их цвета.
         * @returns {Promise<Array<object>>} - Массив объектов организаций, отсортированный по названию.
         */
        async getAll() {
            return await all(db, 'SELECT id, name, color FROM organizations ORDER BY name ASC');
        },

        /**
         * Создает новую организацию и присваивает ей случайный цвет.
         * @param {string} name - Название новой организации.
         * @returns {Promise<object>} - Объект с данными созданной организации.
         */
        async create(name) {
            const color = getRandomPastelColor();
            const result = await run(db, 'INSERT INTO organizations (name, color) VALUES (?, ?)', [name, color]);
            return await get(db, 'SELECT * FROM organizations WHERE id = ?', [result.lastID]);
        },

        /**
         * Удаляет организацию по ID.
         * @param {number} id - ID организации для удаления.
         * @returns {Promise<{success: boolean}>}
         * @throws {Error} Если организация с указанным ID не найдена.
         */
        async delete(id) {
            // Перед удалением организации, отвязываем её от всех командировок,
            // устанавливая organization_id в NULL.
            await run(db, 'UPDATE business_trips SET organization_id = NULL WHERE organization_id = ?', [id]);

            // Теперь удаляем саму организацию.
            const result = await run(db, 'DELETE FROM organizations WHERE id = ?', [id]);
            
            if (result.changes === 0) {
                throw new Error('NOT_FOUND');
            }

            return { success: true };
        },
    };
};