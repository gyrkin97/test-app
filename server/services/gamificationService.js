// --- НОВЫЙ ФАЙЛ: server/services/gamificationService.js ---

// Справочник для определения регионов по городам (легко расширяется)
const REGION_MAP = {
    'север': ['новый уренгой', 'салехард', 'надым', 'ноябрьск', 'сургут', 'ханты-мансийск'],
    'центр': ['москва', 'санкт-петербург', 'тула', 'рязань', 'казань', 'нижний новгород'],
    'урал': ['екатеринбург', 'челябинск', 'тюмень', 'пермь', 'уфа'],
    'сибирь': ['новосибирск', 'омск', 'красноярск', 'иркутск', 'томск'],
    'дальний восток': ['владивосток', 'хабаровск', 'южно-сахалинск']
};

// Конфигурация уровней
const LEVELS = [
    { level: 1, name: 'Испытатель', minDays: 1, maxDays: 35 },
    { level: 2, name: 'Полевой специалист', minDays: 36, maxDays: 70 },
    { level: 3, name: 'Инспектор', minDays: 71, maxDays: 105 },
    { level: 4, name: 'Ведущий эксперт', minDays: 106, maxDays: 140 },
    { level: 5, name: 'Ветеран', minDays: 141, maxDays: Infinity }
];

// Конфигурация всех бейджей с их правилами
const BADGES_CONFIG = [
    { id: 'first_trip', name: 'Первый выезд', description: 'Завершить первую командировку.', check: (trips, metrics) => metrics.totalTrips >= 1 },
    { id: 'seasoned', name: 'Бывалый', description: 'Завершить 10 командировок.', check: (trips, metrics) => metrics.totalTrips >= 10 },
    { id: 'logistics_master', name: 'Магистр логистики', description: 'Завершить 25 командировок.', check: (trips, metrics) => metrics.totalTrips >= 25 },
    { id: 'transport_veteran', name: 'Ветеран транспорта', description: 'Завершить 50 командировок.', check: (trips, metrics) => metrics.totalTrips >= 50 },
    { id: 'week_in_field', name: 'Неделя в поле', description: 'За командировку продолжительностью 7 дней и более.', check: (trips) => trips.some(t => t.duration >= 7) },
    { id: 'long_hauler', name: 'Дальнобойщик', description: 'За командировку продолжительностью 21 день и более.', check: (trips) => trips.some(t => t.duration >= 21) },
    { id: 'field_intern', name: 'Стажер поля', description: 'Провести в командировках суммарно более 30 дней.', check: (trips, metrics) => metrics.totalDays > 30 },
    { id: 'trip_master', name: 'Мастер командировок', description: 'Провести в командировках суммарно более 100 дней.', check: (trips, metrics) => metrics.totalDays > 100 },
    { id: 'legend_of_the_road', name: 'Легенда пути', description: 'Провести в командировках суммарно более 175 дней.', check: (trips, metrics) => metrics.totalDays > 175 },
    {
        id: 'serial_traveler', name: 'Серийный путешественник', description: '3 командировки подряд с перерывом менее 3 дней.', check: (trips) => {
            if (trips.length < 3) return false;
            for (let i = 0; i < trips.length - 2; i++) {
                const trip1_end = new Date(trips[i].end_date);
                const trip2_start = new Date(trips[i+1].start_date);
                const trip2_end = new Date(trips[i+1].end_date);
                const trip3_start = new Date(trips[i+2].start_date);
                const diff1 = (trip2_start - trip1_end) / (1000 * 60 * 60 * 24);
                const diff2 = (trip3_start - trip2_end) / (1000 * 60 * 60 * 24);
                if (diff1 < 3 && diff2 < 3) return true;
            }
            return false;
        }
    },
    { id: 'tourist', name: 'Турист', description: 'Посетить 5 разных населенных пунктов.', check: (trips) => new Set(trips.map(t => t.destination.toLowerCase().trim())).size >= 5 },
    { id: 'explorer', name: 'Исследователь', description: 'Посетить 15 разных населенных пунктов.', check: (trips) => new Set(trips.map(t => t.destination.toLowerCase().trim())).size >= 15 },
    { id: 'cartographer', name: 'Картограф', description: 'Посетить 30 разных населенных пунктов.', check: (trips) => new Set(trips.map(t => t.destination.toLowerCase().trim())).size >= 30 },
    {
        id: 'north_conqueror', name: 'Покоритель Севера', description: 'За работу в северном регионе.', check: (trips) => {
            const dests = new Set(trips.map(t => t.destination.toLowerCase().trim()));
            return Array.from(dests).some(d => REGION_MAP.север.includes(d));
        }
    },
    {
        id: 'central_player', name: 'Центровой', description: 'За работу в центральном регионе.', check: (trips) => {
            const dests = new Set(trips.map(t => t.destination.toLowerCase().trim()));
            return Array.from(dests).some(d => REGION_MAP.центр.includes(d));
        }
    },
    {
        id: 'beyond_urals', name: 'За Уралом', description: 'За работу в сибирском или дальневосточном регионе.', check: (trips) => {
            const dests = new Set(trips.map(t => t.destination.toLowerCase().trim()));
            const uralRegions = [...REGION_MAP.урал, ...REGION_MAP.сибирь, ...REGION_MAP['дальний восток']];
            return Array.from(dests).some(d => uralRegions.includes(d));
        }
    },
    { id: 'reliable_partner', name: 'Надежный партнер', description: 'Работа для ключевого заказчика (5+ командировок к «Новатэку»).', check: (trips) => trips.filter(t => t.customer && t.customer.toLowerCase().includes('новатэк')).length >= 5 },
    { id: 'jubilee_object', name: 'Юбилейный объект', description: 'За работу на 10-м по счету объекте.', check: (trips) => new Set(trips.map(t => t.destination.toLowerCase().trim())).size >= 10 }
];


/**
 * Рассчитывает все данные по геймификации для сотрудника.
 * @param {Array} allTrips - Массив всех командировок сотрудника.
 * @param {object} metrics - Объект с метриками (totalDays, totalTrips).
 * @returns {object} - Объект с данными по уровням и бейджам.
 */
function getGamificationData(allTrips, metrics) {
    // 1. Расчет уровня
    const totalDays = metrics.totalDays;
    const currentLevelInfo = LEVELS.find(l => totalDays >= l.minDays && totalDays <= l.maxDays) || LEVELS[0];
    const nextLevelInfo = LEVELS.find(l => l.level === currentLevelInfo.level + 1);
    
    let progress = {
        currentDays: totalDays,
        nextLevelDays: nextLevelInfo ? nextLevelInfo.minDays -1 : totalDays,
        percentage: 100
    };

    if (nextLevelInfo) {
        const daysInCurrentLevel = totalDays - currentLevelInfo.minDays + 1;
        const daysForNextLevel = nextLevelInfo.minDays - currentLevelInfo.minDays;
        progress.percentage = Math.min(100, Math.round((daysInCurrentLevel / daysForNextLevel) * 100));
    }

    const levelData = {
        name: currentLevelInfo.name,
        level: currentLevelInfo.level,
        progress: progress
    };
    
    // 2. Расчет бейджей
    const badgesData = BADGES_CONFIG.map(badge => ({
        ...badge,
        unlocked: badge.check(allTrips, metrics)
    }));

    return {
        levelInfo: levelData,
        badges: badgesData
    };
}

module.exports = { getGamificationData };