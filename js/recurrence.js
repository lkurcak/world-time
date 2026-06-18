/**
 * DST-aware recurrence helpers.
 *
 * Core idea: store events as an epoch-minutes anchor + a wall-clock
 * recurrence rule in a specific IANA timezone. When computing future/past
 * occurrences we work in wall-clock space (year/month/day/hour/minute) so
 * that DST transitions are handled naturally by the browser's tz database.
 */

/**
 * Extract the wall-clock components of an epoch-minutes value in a given tz.
 * @param {number} epochMinutes
 * @param {string} tz - IANA timezone string
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, dow: number }}
 */
export function getWallClock(epochMinutes, tz) {
    const date = new Date(epochMinutes * 60000);
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
    return {
        year:   parseInt(parts.year),
        month:  parseInt(parts.month),   // 1-indexed
        day:    parseInt(parts.day),
        hour:   parseInt(parts.hour) % 24, // Intl can return 24 for midnight
        minute: parseInt(parts.minute),
        dow:    parts.weekday, // 'Mon', 'Tue', etc.
    };
}

/**
 * Convert a wall-clock date/time in a given tz to epoch minutes.
 * Uses bisection because the Intl API only goes wall-clock → UTC, not vice versa.
 *
 * @param {number} year
 * @param {number} month  1-indexed
 * @param {number} day
 * @param {number} hour
 * @param {number} minute
 * @param {string} tz
 * @returns {number} epoch minutes
 */
export function wallClockToEpochMinutes(year, month, day, hour, minute, tz) {
    // Naive UTC guess: treat the wall clock as if it were UTC
    const naive = Date.UTC(year, month - 1, day, hour, minute) / 60000;

    // Bisect to find the epoch where Intl reports the desired wall clock
    // Search window: ±14 hours around naive (covers all UTC offsets + DST)
    let lo = naive - 14 * 60;
    let hi = naive + 14 * 60;

    for (let i = 0; i < 40; i++) {
        const mid = Math.round((lo + hi) / 2);
        const wc = getWallClock(mid, tz);
        // Compare as minutes-since-some-epoch for easy arithmetic
        const midMinutes = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute) / 60000;
        const targetMinutes = Date.UTC(year, month - 1, day, hour, minute) / 60000;
        if (midMinutes < targetMinutes) {
            lo = mid;
        } else if (midMinutes > targetMinutes) {
            hi = mid;
        } else {
            return mid;
        }
    }
    return Math.round((lo + hi) / 2);
}

/**
 * Advance a wall-clock date by one recurrence step (in calendar terms).
 * Handles month-end clamping (e.g. Jan 31 + 1 month → Feb 28/29).
 *
 * @param {{ year, month, day, hour, minute }} wc
 * @param {string} recurrence
 * @returns {{ year, month, day, hour, minute }}
 */
function advanceWallClock(wc, recurrence) {
    let { year, month, day, hour, minute } = wc;
    switch (recurrence) {
        case 'daily':
            day += 1;
            break;
        case 'weekly':
            day += 7;
            break;
        case 'weekdays': // advance 1 day; getOccurrences skips non-weekdays
            day += 1;
            break;
        case 'monthly':
            month += 1;
            if (month > 12) { month = 1; year += 1; }
            // clamp to last day of month
            const maxDay = new Date(year, month, 0).getDate();
            if (day > maxDay) day = maxDay;
            break;
    }
    // Normalise day overflow
    const norm = new Date(Date.UTC(year, month - 1, day));
    return {
        year: norm.getUTCFullYear(),
        month: norm.getUTCMonth() + 1,
        day: norm.getUTCDate(),
        hour,
        minute,
    };
}

/**
 * Retreat a wall-clock date by one recurrence step (going backwards).
 */
function retreatWallClock(wc, recurrence) {
    let { year, month, day, hour, minute } = wc;
    switch (recurrence) {
        case 'daily':
        case 'weekly':
        case 'weekdays':
            day -= (recurrence === 'weekly' ? 7 : 1);
            break;
        case 'monthly':
            month -= 1;
            if (month < 1) { month = 12; year -= 1; }
            const maxDay = new Date(year, month, 0).getDate();
            if (day > maxDay) day = maxDay;
            break;
    }
    const norm = new Date(Date.UTC(year, month - 1, day));
    return {
        year: norm.getUTCFullYear(),
        month: norm.getUTCMonth() + 1,
        day: norm.getUTCDate(),
        hour,
        minute,
    };
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isWeekday(year, month, day) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun
    return dow >= 1 && dow <= 5;
}

/**
 * Return all epoch-minute occurrences of an event within [windowStart, windowEnd].
 *
 * For non-recurring events returns [event.at] if it falls within the window,
 * else [].
 *
 * @param {{ at: number, tz: string, recurrence: string|null }} event
 * @param {number} windowStart - epoch minutes
 * @param {number} windowEnd   - epoch minutes
 * @returns {number[]} sorted array of epoch minutes
 */
export function getOccurrences(event, windowStart, windowEnd) {
    if (!event.recurrence) {
        return (event.at >= windowStart && event.at <= windowEnd) ? [event.at] : [];
    }

    const tz = event.tz;
    const anchorWC = getWallClock(event.at, tz);

    // Find the earliest occurrence that could be at or before windowStart
    // by retreating from anchor
    let prevCursor = cursor;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const epochMin = wallClockToEpochMinutes(cursor.year, cursor.month, cursor.day, cursor.hour, cursor.minute, tz);
        if (epochMin < windowStart) break;
        prevCursor = cursor;
        cursor = retreatWallClock(cursor, event.recurrence);
        // Safety: if we've retreated more than ~5 years, stop
        if (cursor.year < anchorWC.year - 5) break;
    }
    // cursor is now one step before windowStart (or at anchor if anchor > windowStart)
    cursor = prevCursor;

    const results = [];
    let safety = 0;
    while (safety++ < 10000) {
        // Skip non-weekdays for 'weekdays' recurrence
        let epochMin;
        if (event.recurrence === 'weekdays') {
            if (!isWeekday(cursor.year, cursor.month, cursor.day)) {
                cursor = advanceWallClock(cursor, event.recurrence);
                continue;
            }
        }
        epochMin = wallClockToEpochMinutes(cursor.year, cursor.month, cursor.day, cursor.hour, cursor.minute, tz);
        if (epochMin > windowEnd) break;
        if (epochMin >= windowStart) {
            results.push(epochMin);
        }
        cursor = advanceWallClock(cursor, event.recurrence);
    }

    return results;
}
