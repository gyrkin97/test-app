// --- ФАЙЛ: server/services/businessTripService.js ---

// --- ФАЙЛ: server/services/businessTripService.js (ПОЛНАЯ ИТОГОВАЯ ВЕРСИЯ С РЕДАКТИРОВАНИЕМ И УЛУЧШЕНИЯМИ) ---

const { run, get, all } = require('../utils/dbUtils');
const { getGamificationData } = require('./gamificationService'); // Подключаем новый сервис

/**
 * Фабричная функция, которая создает и возвращает сервис для управления командировками.
 * @param {object} db - Экземпляр базы данных sqlite3.
 * @returns {object} - Объект с методами сервиса.
 */
module.exports = (db) => {
    return {
        // =================================================================
        // --- МЕТОДЫ ДЛЯ РАБОТЫ С СОТРУДНИКАМИ ---
        // =================================================================

        async getEmployees() {
            const sql = 'SELECT DISTINCT id, name, position, phone FROM employees ORDER BY name ASC';
            return await all(db, sql);
        },

        async createEmployee({ name, position, phone }) {
            const sql = 'INSERT INTO employees (name, position, phone) VALUES (?, ?, ?)';
            const result = await run(db, sql, [name, position, phone || null]);
            return await get(db, 'SELECT * FROM employees WHERE id = ?', [result.lastID]);
        },

        async deleteEmployee(id) {
            const result = await run(db, 'DELETE FROM employees WHERE id = ?', [id]);
            if (result.changes === 0) {
                throw new Error('NOT_FOUND');
            }
            return { success: true };
        },

        async getEmployeeDetails(id) {
            const today = new Date().toISOString().split('T')[0];

            const employee = await get(db, 'SELECT id, name, position, phone FROM employees WHERE id = ?', [id]);
            if (!employee) {
                throw new Error('NOT_FOUND');
            }

            const allTrips = await all(db, `
                SELECT 
                    bt.id,
                    bt.destination, bt.start_date, bt.end_date, bt.transport_type,
                    o.name as customer,
                    (JULIANDAY(bt.end_date) - JULIANDAY(bt.start_date)) + 1 as duration
                FROM business_trips bt
                LEFT JOIN organizations o ON o.id = bt.organization_id
                WHERE bt.employee_id = ?
                ORDER BY bt.start_date ASC
            `, [id]);

            const metrics = {
                totalTrips: allTrips.length,
                totalDays: allTrips.reduce((sum, trip) => sum + (trip.duration || 0), 0),
            };

            const status = {
                currentTrip: allTrips.find(t => t.start_date <= today && t.end_date >= today) || null
            };
            
            const upcomingTrips = allTrips.filter(t => t.start_date > today);

            // --- НОВЫЙ БЛОК: ИНТЕГРАЦИЯ ГЕЙМИФИКАЦИИ ---
            const gamification = getGamificationData(allTrips, metrics);

            return { employee, metrics, status, upcomingTrips, gamification };
        },


        // =================================================================
        // --- МЕТОДЫ ДЛЯ РАБОТЫ С КОМАНДИРОВКАМИ ---
        // =================================================================

        async getTrips(year, month) {
            const monthPadded = String(month).padStart(2, '0');
            const lastDayOfMonth = new Date(year, month, 0).getDate();
            const startDateOfMonth = `${year}-${monthPadded}-01`;
            const endDateOfMonth = `${year}-${monthPadded}-${lastDayOfMonth}`;

            const sql = `
                SELECT 
                    bt.id, bt.employee_id, bt.destination, bt.start_date, bt.end_date, 
                    bt.organization_id, bt.transport_type, e.name as employee_name,
                    o.name as customer_name, o.color as customer_color,
                    (JULIANDAY(bt.end_date) - JULIANDAY(bt.start_date)) + 1 as duration
                FROM business_trips bt
                JOIN employees e ON e.id = bt.employee_id
                LEFT JOIN organizations o ON o.id = bt.organization_id
                WHERE bt.start_date <= ? AND bt.end_date >= ?
                ORDER BY e.name, bt.start_date ASC
            `;
            
            return await all(db, sql, [endDateOfMonth, startDateOfMonth]);
        },

        async createTripsBatch(payload) {
            const { employee_ids, destination, start_date, end_date, organization_id, transport_type } = payload;
            
            const uniqueIds = [...new Set(employee_ids)];
            if (uniqueIds.length === 0) {
                return { inserted: 0 };
            }
            
            await run(db, 'BEGIN TRANSACTION');
            try {
                const sql = 'INSERT INTO business_trips (employee_id, destination, start_date, end_date, organization_id, transport_type) VALUES (?, ?, ?, ?, ?, ?)';
                for (const employee_id of uniqueIds) {
                    await run(db, sql, [employee_id, destination, start_date, end_date, organization_id, transport_type]);
                }
                await run(db, 'COMMIT');
                return { inserted: uniqueIds.length };
            } catch (err) {
                await run(db, 'ROLLBACK');
                throw err;
            }
        },
        
        async updateTrip(id, payload) {
            const { destination, start_date, end_date, organization_id, transport_type } = payload;

            const updateSql = `
                UPDATE business_trips 
                SET 
                    destination = ?, 
                    start_date = ?, 
                    end_date = ?, 
                    organization_id = ?, 
                    transport_type = ?
                WHERE id = ?`;

            const result = await run(db, updateSql, [
                destination,
                start_date,
                end_date,
                organization_id,
                transport_type,
                id
            ]);

            if (result.changes === 0) {
                throw new Error('NOT_FOUND');
            }
            
            const selectSql = `
                SELECT 
                    bt.id, bt.employee_id, bt.destination, bt.start_date, bt.end_date, 
                    bt.organization_id, bt.transport_type, e.name as employee_name,
                    o.name as customer_name, o.color as customer_color,
                    (JULIANDAY(bt.end_date) - JULIANDAY(bt.start_date)) + 1 as duration
                FROM business_trips bt
                JOIN employees e ON e.id = bt.employee_id
                LEFT JOIN organizations o ON o.id = bt.organization_id
                WHERE bt.id = ?
            `;
            return await get(db, selectSql, [id]);
        },

        async deleteTrip(id) {
            const result = await run(db, 'DELETE FROM business_trips WHERE id = ?', [id]);
            if (result.changes === 0) {
                throw new Error('NOT_FOUND');
            }
            return { success: true };
        }
    };
};