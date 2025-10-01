// --- ФАЙЛ: server/services/instrumentService.js (ПОСЛЕ РЕФАКТОРИНГА) ---

// УЛУЧШЕНИЕ: Импортируем централизованные утилиты для работы с БД.
const { run, all } = require('../utils/dbUtils');

/**
 * Фабричная функция, которая создает и возвращает сервис для управления записями об оборудовании.
 * @param {object} db - Экземпляр базы данных sqlite3.
 * @returns {object} - Объект с методами сервиса.
 */
module.exports = (db) => {
    // УЛУЧШЕНИЕ: Локальные промисификации удалены. Теперь все методы используют
    // импортированные функции, передавая 'db' первым аргументом.

    return {
        /**
         * Получает список всех записей об оборудовании из базы данных.
         * @returns {Promise<Array<object>>} - Массив объектов оборудования, отсортированный по наименованию.
         */
        getAll: async () => {
            const sql = `SELECT * FROM measuring_instruments ORDER BY name ASC`;
            return await all(db, sql);
        },

        /**
         * Создает новую запись об оборудовании в базе данных.
         * @param {object} instrumentData - Объект с данными нового оборудования.
         * @returns {Promise<object>} - Объект с данными созданной записи, включая новый ID.
         * @throws {Error} - Выбрасывает ошибку при нарушении логики (например, некорректные даты) или ограничений БД.
         */
        create: async (instrumentData) => {
            const {
                name, modification, serial_number, inventory_number,
                last_verification_date, next_verification_date, notes, type,
                verification_interval_months, si_type_reg_number, fif_oei_reg_number,
                arshin_link, verification_doc_number, commissioning_date,
                manufacture_year, responsible_person
            } = instrumentData;

            // Серверная валидация логики дат
            if (last_verification_date && next_verification_date) {
                if (new Date(next_verification_date) <= new Date(last_verification_date)) {
                    const error = new Error('Дата следующей поверки должна быть позже даты последней поверки.');
                    error.code = 'INVALID_DATE_LOGIC'; // Кастомный код для обработки в роутере
                    throw error;
                }
            }
            
            const sql = `
                INSERT INTO measuring_instruments (
                    name, modification, serial_number, inventory_number, last_verification_date, 
                    next_verification_date, notes, type, verification_interval_months, 
                    si_type_reg_number, fif_oei_reg_number, arshin_link, verification_doc_number, 
                    commissioning_date, manufacture_year, responsible_person
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            
            const params = [
                name, modification, serial_number, inventory_number, last_verification_date,
                next_verification_date, notes, type, verification_interval_months,
                si_type_reg_number, fif_oei_reg_number, arshin_link, verification_doc_number,
                commissioning_date, manufacture_year, responsible_person
            ];

            const result = await run(db, sql, params);
            return { id: result.lastID, ...instrumentData };
        },

        /**
         * Обновляет существующую запись об оборудовании по ее ID.
         * @param {number|string} id - ID записи для обновления.
         * @param {object} instrumentData - Объект с новыми данными.
         * @returns {Promise<object>} - Объект с обновленными данными.
         * @throws {Error} - Выбрасывает ошибку 'NOT_FOUND', если запись не найдена, или ошибку валидации.
         */
        update: async (id, instrumentData) => {
            const {
                name, modification, serial_number, inventory_number,
                last_verification_date, next_verification_date, notes, type,
                verification_interval_months, si_type_reg_number, fif_oei_reg_number,
                arshin_link, verification_doc_number, commissioning_date,
                manufacture_year, responsible_person
            } = instrumentData;

            // Серверная валидация логики дат
            if (last_verification_date && next_verification_date) {
                if (new Date(next_verification_date) <= new Date(last_verification_date)) {
                    const error = new Error('Дата следующей поверки должна быть позже даты последней поверки.');
                    error.code = 'INVALID_DATE_LOGIC';
                    throw error;
                }
            }
            
            const sql = `
                UPDATE measuring_instruments SET 
                    name = ?, modification = ?, serial_number = ?, inventory_number = ?, 
                    last_verification_date = ?, next_verification_date = ?, notes = ?, 
                    type = ?, verification_interval_months = ?, 
                    si_type_reg_number = ?, fif_oei_reg_number = ?, arshin_link = ?, 
                    verification_doc_number = ?, commissioning_date = ?, 
                    manufacture_year = ?, responsible_person = ?
                WHERE id = ?`;
            
            const params = [
                name, modification, serial_number, inventory_number, last_verification_date,
                next_verification_date, notes, type, verification_interval_months,
                si_type_reg_number, fif_oei_reg_number, arshin_link, verification_doc_number,
                commissioning_date, manufacture_year, responsible_person, 
                id
            ];

            const result = await run(db, sql, params);

            if (result.changes === 0) {
                throw new Error('NOT_FOUND');
            }
            return { id, ...instrumentData };
        },

        /**
         * Удаляет запись об оборудовании по ее ID.
         * @param {number|string} id - ID записи для удаления.
         * @returns {Promise<{success: boolean}>} - Объект, подтверждающий успешное удаление.
         * @throws {Error} - Выбрасывает ошибку 'NOT_FOUND', если запись с таким ID не найдена.
         */
        delete: async (id) => {
            const sql = `DELETE FROM measuring_instruments WHERE id = ?`;
            const result = await run(db, sql, [id]);

            if (result.changes === 0) {
                throw new Error('NOT_FOUND');
            }
            return { success: true };
        }
    };
};