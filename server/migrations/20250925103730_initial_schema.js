/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // --- Основные таблицы системы тестирования ---
    .createTable('tests', function(table) {
      table.text('id').primary();
      table.text('name').notNullable();
      table.text('created_at').notNullable();
      table.integer('is_active').notNullable().defaultTo(0);
    })
    .createTable('test_settings', function(table) {
      table.text('test_id').primary();
      table.integer('duration_minutes').notNullable().defaultTo(10);
      table.integer('passing_score').notNullable().defaultTo(5);
      table.integer('questions_per_test').notNullable().defaultTo(10);
      table.foreign('test_id').references('id').inTable('tests').onDelete('CASCADE');
    })
    .createTable('questions', function(table) {
      table.text('id').primary();
      table.text('test_id').notNullable();
      table.text('text').notNullable();
      table.text('explain');
      table.text('correct_option_key').notNullable();
      table.text('type').notNullable().defaultTo('checkbox');
      table.text('match_prompts');
      table.text('match_answers');
      table.foreign('test_id').references('id').inTable('tests').onDelete('CASCADE');
    })
    .createTable('options', function(table) {
      table.text('id').primary();
      table.text('question_id').notNullable();
      table.text('text').notNullable();
      table.foreign('question_id').references('id').inTable('questions').onDelete('CASCADE');
    })
    .createTable('test_results', function(table) {
      table.increments('id').primary();
      table.text('test_id').notNullable();
      table.text('fio').notNullable();
      table.integer('score').notNullable();
      table.integer('total').notNullable();
      table.float('percentage').notNullable();
      table.text('date').notNullable();
      table.text('status').notNullable().defaultTo('completed');
      table.integer('passed').notNullable().defaultTo(0);
      table.foreign('test_id').references('id').inTable('tests').onDelete('CASCADE');
    })
    .createTable('test_answers', function(table) {
      table.increments('id').primary();
      table.integer('result_id').notNullable();
      table.text('question_id');
      table.text('user_answer');
      table.integer('is_correct').notNullable();
      table.text('review_status').notNullable().defaultTo('auto');
      table.foreign('result_id').references('id').inTable('test_results').onDelete('CASCADE');
      table.foreign('question_id').references('id').inTable('questions').onDelete('SET NULL');
    })
    
    // --- Таблицы для панели разработчика ---
    .createTable('employees', function(table) {
      table.increments('id').primary();
      table.text('name').notNullable().unique();
      table.text('position'); // Сразу добавляем поле для должности
    })
    .createTable('organizations', function(table) {
      table.increments('id').primary();
      table.text('name').notNullable().unique();
      table.text('color'); // Сразу добавляем поле для цвета
    })
    .createTable('business_trips', function(table) {
      table.increments('id').primary();
      table.integer('employee_id').notNullable();
      table.integer('organization_id').unsigned();
      table.text('destination').notNullable();
      table.text('start_date').notNullable();
      table.text('end_date').notNullable();
      table.text('transport_type').notNullable().defaultTo('car'); // Сразу добавляем транспорт
      
      table.foreign('employee_id').references('id').inTable('employees').onDelete('CASCADE');
      table.foreign('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
      
      table.index(['start_date', 'end_date'], 'idx_trips_dates');
    })
    .createTable('measuring_instruments', function(table) {
      table.increments('id').primary();
      table.text('name').notNullable();
      table.text('modification');
      table.text('serial_number').notNullable().unique();
      table.text('inventory_number');
      table.text('last_verification_date');
      table.text('next_verification_date');
      table.text('notes');
      table.text('type').notNullable().defaultTo('instrument');
      table.integer('verification_interval_months');
      table.text('si_type_reg_number');
      table.text('fif_oei_reg_number');
      table.text('arshin_link');
      table.text('verification_doc_number');
      table.text('commissioning_date');
      table.text('manufacture_year');
      table.text('responsible_person');
      table.index('next_verification_date', 'idx_instruments_next_date');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // Удаляем таблицы в обратном порядке
  return knex.schema
    .dropTableIfExists('measuring_instruments')
    .dropTableIfExists('business_trips')
    .dropTableIfExists('organizations')
    .dropTableIfExists('employees')
    .dropTableIfExists('test_answers')
    .dropTableIfExists('test_results')
    .dropTableIfExists('options')
    .dropTableIfExists('questions')
    .dropTableIfExists('test_settings')
    .dropTableIfExists('tests');
};