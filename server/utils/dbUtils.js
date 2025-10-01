// Этот файл будет единым источником промисифицированных методов для работы с БД.
const util = require('util');

/**
 * Промисифицированная версия db.run, сохраняющая контекст для lastID/changes.
 * @param {object} db - Экземпляр базы данных.
 * @param {string} sql - SQL-запрос.
 * @param {Array} [params=[]] - Параметры запроса.
 * @returns {Promise<{lastID: number, changes: number}>}
 */
const run = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
    });
});

/**
 * Промисифицированная версия db.get.
 * @param {object} db - Экземпляр базы данных.
 * @param {string} sql - SQL-запрос.
 * @param {Array} [params=[]] - Параметры запроса.
 * @returns {Promise<object>}
 */
const get = (db, sql, params = []) => util.promisify(db.get.bind(db))(sql, params);


/**
 * Промисифицированная версия db.all.
 * @param {object} db - Экземпляр базы данных.
 * @param {string} sql - SQL-запрос.
 * @param {Array} [params=[]] - Параметры запроса.
 * @returns {Promise<Array<object>>}
 */
const all = (db, sql, params = []) => util.promisify(db.all.bind(db))(sql, params);

module.exports = {
    run,
    get,
    all
};