export const COMMON_TIMEZONES = [
    "UTC",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Moscow",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Bangkok",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Australia/Sydney",
    "Pacific/Auckland",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Toronto",
    "America/Sao_Paulo",
    "America/Buenos_Aires",
];

export function getLocalTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getAllTimezones() {
    try {
        return Intl.supportedValuesOf('timeZone');
    } catch {
        return COMMON_TIMEZONES;
    }
}

export function getTimezoneName(timezone) {
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'long',
        }).formatToParts(new Date())
            .find(p => p.type === 'timeZoneName')?.value || timezone;
    } catch {
        return timezone;
    }
}

export function getTimezoneShortName(timezone) {
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'short',
        }).formatToParts(new Date())
            .find(p => p.type === 'timeZoneName')?.value || timezone;
    } catch {
        return timezone;
    }
}

export function formatTime(timezone, date = new Date()) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
}

export function formatTimeWithSeconds(timezone, date = new Date()) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date);
}

export function getDayIndicator(timezone, date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    });
    return formatter.format(date);
}

export function getCurrentDayProgress(timezone) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour').value);
    const minute = parseInt(parts.find(p => p.type === 'minute').value);
    const second = parseInt(parts.find(p => p.type === 'second').value);
    const totalSeconds = hour * 3600 + minute * 60 + second;
    return totalSeconds / 86400;
}

export function formatOffset(offsetMs) {
    const totalMinutes = Math.round(offsetMs / 60000);
    if (totalMinutes === 0) return 'NOW';
    const sign = totalMinutes > 0 ? '+' : '-';
    const absMinutes = Math.abs(totalMinutes);
    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;

    if (minutes === 0) {
        return `${sign}${hours}h`;
    } else {
        return `${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
    }
}
