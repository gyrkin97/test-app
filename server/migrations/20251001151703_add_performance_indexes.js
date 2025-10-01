/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Индекс для поиска результатов по ФИО
    .raw('CREATE INDEX IF NOT EXISTS idx_results_fio ON test_results(fio)')
    // Индекс для фильтрации результатов по статусу (pending_review, completed)
    .raw('CREATE INDEX IF NOT EXISTS idx_results_status ON test_results(status)')
    // Индекс для группировки вопросов по тесту
    .raw('CREATE INDEX IF NOT EXISTS idx_questions_test_id ON questions(test_id)')
    // Индекс для ускорения проверки на дублирование результатов
    .raw('CREATE INDEX IF NOT EXISTS idx_results_test_fio ON test_results(test_id, fio, passed)');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .raw('DROP INDEX IF EXISTS idx_results_fio')
    .raw('DROP INDEX IF EXISTS idx_results_status')
    .raw('DROP INDEX IF EXISTS idx_questions_test_id')
    .raw('DROP INDEX IF EXISTS idx_results_test_fio');
};