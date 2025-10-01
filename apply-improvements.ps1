# PowerShell скрипт для автоматического применения улучшений
# Запустите: .\apply-improvements.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 Начинаем применение улучшений..." -ForegroundColor Green

# 1. Создать новый файл миграции
Write-Host "`n📄 Создаю файл миграции..." -ForegroundColor Cyan
$migrationContent = @'
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
'@

$migrationPath = "server\migrations\20251001151703_add_performance_indexes.js"
New-Item -Path $migrationPath -ItemType File -Force | Out-Null
Set-Content -Path $migrationPath -Value $migrationContent -Encoding UTF8
Write-Host "✅ Создан: $migrationPath" -ForegroundColor Green

# 2. Обновить server.js
Write-Host "`n📄 Обновляю server/server.js..." -ForegroundColor Cyan
$serverContent = Get-Content "server\server.js" -Raw -Encoding UTF8

# Добавляем валидацию env vars после require('dotenv').config();
if ($serverContent -notmatch "requiredEnvVars") {
    $serverContent = $serverContent -replace "(require\('dotenv'\)\.config\(\);)", "`$1`n`n// --- Валидация обязательных переменных окружения ---`nconst requiredEnvVars = ['SESSION_SECRET', 'ADMIN_PASSWORD_HASH'];`nconst missingVars = requiredEnvVars.filter(v => !process.env[v]);`n`nif (missingVars.length > 0) {`n    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Не установлены обязательные переменные окружения:');`n    console.error(missingVars.map(v => ``   - ```${v}``).join('\n'));`n    console.error('Проверьте файл .env и убедитесь, что все переменные заполнены.');`n    console.error('Для генерации SESSION_SECRET используйте: openssl rand -base64 32');`n    console.error('Для генерации паролей используйте: node utils/hash-password.js ваш_пароль');`n    process.exit(1);`n}"
}

# Добавляем rate limiters после loginLimiter
if ($serverContent -notmatch "submitLimiter") {
    $rateLimitersCode = @'

// НОВОЕ: Ограничитель скорости для публичных эндпоинтов отправки результатов
const submitLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 минут
    max: 10, // Максимум 10 отправок за 5 минут с одного IP
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Слишком много попыток отправки. Пожалуйста, попробуйте позже.'
});

// НОВОЕ: Ограничитель скорости для загрузки вопросов (защита от DDoS)
const questionsLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 минута
    max: 20, // Максимум 20 запросов за минуту
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Слишком много запросов. Пожалуйста, подождите.'
});
'@
    $serverContent = $serverContent -replace "(const loginLimiter = rateLimit\(\{[^}]+\}\);)", "`$1$rateLimitersCode"
}

# Применяем rate limiters к роутам
if ($serverContent -notmatch "app\.use\('/api/public/tests/:testId/submit'") {
    $serverContent = $serverContent -replace "(// Монтирование роутеров)", "`$1`n// НОВОЕ: Применяем rate limiters к публичным эндпоинтам`napp.use('/api/public/tests/:testId/submit', submitLimiter);`napp.use('/api/public/tests/:testId/questions', questionsLimiter);"
}

Set-Content -Path "server\server.js" -Value $serverContent -Encoding UTF8
Write-Host "✅ Обновлен: server\server.js" -ForegroundColor Green

# 3. Обновить questionService.js
Write-Host "`n📄 Обновляю server/services/questionService.js..." -ForegroundColor Cyan
$questionServiceContent = Get-Content "server\services\questionService.js" -Raw -Encoding UTF8

# Заменяем prepared statement на dbUtils.run
$oldPattern = @'
            // Эта часть остается без изменений, т.к. работает с объектом 'statement', а не напрямую с 'db'
            const insertOptionStmt = db.prepare(`INSERT INTO options (id, question_id, text) VALUES (?, ?, ?)`);
            
            for (const opt of question.options) {
                if (opt.text.trim()) { // Вставляем только непустые варианты
                    const shortKey = opt.id.split('-').pop() || uuidv4();
                    await util.promisify(insertOptionStmt.run.bind(insertOptionStmt))([`${question.id}-${shortKey}`, question.id, opt.text.trim()]);
                }
            }
            await util.promisify(insertOptionStmt.finalize.bind(insertOptionStmt))();
'@

$newPattern = @'
            // ИСПРАВЛЕНО: Унифицирован подход - используем только dbUtils.run
            for (const opt of question.options) {
                if (opt.text.trim()) { // Вставляем только непустые варианты
                    const shortKey = opt.id.split('-').pop() || uuidv4();
                    await run(db, 
                        `INSERT INTO options (id, question_id, text) VALUES (?, ?, ?)`,
                        [`${question.id}-${shortKey}`, question.id, opt.text.trim()]
                    );
                }
            }
'@

$questionServiceContent = $questionServiceContent -replace [regex]::Escape($oldPattern), $newPattern

Set-Content -Path "server\services\questionService.js" -Value $questionServiceContent -Encoding UTF8
Write-Host "✅ Обновлен: server\services\questionService.js" -ForegroundColor Green

# 4. Обновить testTakingService.js
Write-Host "`n📄 Обновляю server/services/testTakingService.js..." -ForegroundColor Cyan
$testTakingContent = Get-Content "server\services\testTakingService.js" -Raw -Encoding UTF8

if ($testTakingContent -notmatch "existingResult") {
    $checkCode = @'
        
        // ИСПРАВЛЕНИЕ: Проверка на повторное прохождение теста
        // Проверяем, не сдал ли пользователь уже этот тест успешно
        const existingResult = await get(db, 
            `SELECT id, passed FROM test_results 
             WHERE test_id = ? AND fio = ? COLLATE NOCASE AND passed = 1
             ORDER BY date DESC LIMIT 1`,
            [testId, fio.trim()]
        );

        if (existingResult) {
            throw new Error('Вы уже успешно сдали этот тест. Повторное прохождение не требуется.');
        }
        
'@
    $testTakingContent = $testTakingContent -replace "(if \(\!fio \|\| \!userAnswers\) \{\s+throw new Error\('ФИО и ответы обязательны\.'\);\s+\})", "`$1$checkCode"
}

Set-Content -Path "server\services\testTakingService.js" -Value $testTakingContent -Encoding UTF8
Write-Host "✅ Обновлен: server\services\testTakingService.js" -ForegroundColor Green

Write-Host "`n✅ Все изменения успешно применены!" -ForegroundColor Green
Write-Host "`n📝 Следующие шаги:" -ForegroundColor Yellow
Write-Host "   1. git add -A" -ForegroundColor Cyan
Write-Host "   2. git commit -m 'feat: критические улучшения безопасности и производительности'" -ForegroundColor Cyan
Write-Host "   3. git push -u origin feature/critical-improvements" -ForegroundColor Cyan
