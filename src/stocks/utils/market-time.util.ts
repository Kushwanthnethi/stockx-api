/**
 * Utility to check if Indian markets (NSE/BSE) are currently open.
 * Trading hours: 9:15 AM to 3:30 PM IST.
 * Pre-open: 9:00 AM to 9:15 AM IST.
 */

// NSE Trading Holidays 2026
const NSE_HOLIDAYS_2026 = [
    '2026-01-26', // Republic Day
    '2026-03-03', // Holi
    '2026-03-26', // Shri Ram Navami
    '2026-03-31', // Shri Mahavir Jayanti
    '2026-04-03', // Good Friday
    '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-05-28', // Bakri Id
    '2026-06-26', // Muharram
    '2026-09-14', // Ganesh Chaturthi
    '2026-10-02', // Mahatma Gandhi Jayanti
    '2026-10-20', // Dussehra
    '2026-11-10', // Diwali-Balipratipada
    '2026-11-24', // Prakash Gurpurb Sri Guru Nanak Dev
    '2026-12-25', // Christmas
];

// Special Trading Sessions (Sundays/Holidays where market is open)
const SPECIAL_TRADING_SESSIONS = [
    '2026-02-01', // Union Budget Special Session
];

export function isMarketOpen(): boolean {
    const now = new Date();

    // Get IST time using Intl
    const istString = now.toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
    });

    // Format: "MM/DD/YYYY, HH:MM:SS" or similar depending on locale, but en-US is stable
    // Let's use a more robust way to get parts
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(now);

    const getPart = (type: string) => parts.find(p => p.type === type)?.value;

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = parseInt(getPart('hour') || '0');
    const minute = parseInt(getPart('minute') || '0');

    const dateString = `${year}-${month}-${day}`;

    // Check Holidays
    if (NSE_HOLIDAYS_2026.includes(dateString)) return false;

    const dayOfWeek = now.getDay(); // This is local day, might be different!
    // We should use the IST day of week
    const istDayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDay();

    const isSpecialSession = SPECIAL_TRADING_SESSIONS.includes(dateString);

    if (!isSpecialSession && (istDayOfWeek === 0 || istDayOfWeek === 6)) {
        return false;
    }

    const currentTimeMinutes = hour * 60 + minute;

    // Market opens at 9:15 AM (555 mins) and closes at 3:30 PM (930 mins)
    return currentTimeMinutes >= 555 && currentTimeMinutes < 930;
}
