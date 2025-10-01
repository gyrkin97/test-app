// --- ФАЙЛ: server/knexfile.js (ПОСЛЕ РЕФАКТОРИНГА) ---
// Этот файл содержит конфигурацию для Knex.js, инструмента для управления миграциями базы данных.

const path = require('path');

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {

  // --- Конфигурация для среды разработки (development) ---
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, 'data', 'database.sqlite') // ИСПРАВЛЕН ПУТЬ
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'migrations')
    }
  },

  // --- Конфигурация для производственной среды (production) ---
  production: {
    client: 'sqlite3',
    connection: {
      // --- УЛУЧШЕНИЕ: Читаем путь из переменных окружения ---
      // Теперь путь к файлу БД не зашит в коде, а настраивается на сервере.
      // Если переменная DATABASE_PATH не задана, используется путь по умолчанию.
      filename: process.env.DATABASE_PATH || '/var/data/testing-system/database.sqlite'
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'migrations')
    }
  }
};