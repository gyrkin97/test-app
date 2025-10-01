/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // Функция up() описывает изменения, которые мы хотим применить.
  // В нашем случае - добавить колонку 'phone' в таблицу 'employees'.
  return knex.schema.alterTable('employees', function(table) {
    // Добавляем текстовую колонку 'phone'. Она может быть пустой (NULL).
    table.text('phone');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // Функция down() описывает, как отменить эти изменения (сделать "откат").
  // Мы должны удалить колонку 'phone'.
  return knex.schema.alterTable('employees', function(table) {
    table.dropColumn('phone');
  });
};