import {
    getTimezoneName,
    getTimezoneShortName,
    formatTime,
    getDayIndicator,
    formatOffset,
} from './timezones.js';

export function createTrackElement(timezone, onRemove) {
    const track = document.createElement('div');
    track.className = 'track';
    track.dataset.timezone = timezone;

    const header = document.createElement('div');
    header.className = 'track-header';

    const info = document.createElement('div');
    info.className = 'track-info';

    const name = document.createElement('div');
    name.className = 'track-name';
    name.textContent = getTimezoneName(timezone);

    const timeContainer = document.createElement('div');
    timeContainer.style.display = 'flex';
    timeContainer.style.alignItems = 'center';

    const time = document.createElement('div');
    time.className = 'track-time';
    time.dataset.timezone = timezone;

    const dayIndicator = document.createElement('span');
    dayIndicator.className = 'day-indicator';
    dayIndicator.dataset.timezone = timezone;

    timeContainer.appendChild(time);
    timeContainer.appendChild(dayIndicator);

    info.appendChild(name);
    info.appendChild(timeContainer);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => {
        onRemove(timezone);
    });

    header.appendChild(info);
    header.appendChild(removeBtn);

    const trackTimeline = document.createElement('div');
    trackTimeline.className = 'track-timeline';

    const hoursWrapper = document.createElement('div');
    hoursWrapper.className = 'hours-wrapper';

    for (let i = 0; i < 24; i++) {
        const marker = document.createElement('div');
        marker.className = 'hour-marker';
        marker.dataset.hour = i;
        const num = document.createElement('span');
        num.className = 'hour-number';
        num.textContent = i;
        marker.appendChild(num);
        hoursWrapper.appendChild(marker);
    }

    trackTimeline.appendChild(hoursWrapper);

    const nowDisplay = document.createElement('div');
    nowDisplay.className = 'track-time-display now-display';
    nowDisplay.innerHTML = '<span class="time-part"></span><span class="date-part"></span>';
    trackTimeline.appendChild(nowDisplay);

    const cursorDisplay = document.createElement('div');
    cursorDisplay.className = 'track-time-display cursor-display';
    cursorDisplay.innerHTML = '<span class="time-part"></span><span class="date-part"></span>';
    trackTimeline.appendChild(cursorDisplay);

    const persistedDisplay = document.createElement('div');
    persistedDisplay.className = 'track-time-display persisted-display';
    persistedDisplay.innerHTML = '<span class="time-part"></span><span class="date-part"></span>';
    trackTimeline.appendChild(persistedDisplay);

    track.appendChild(header);
    track.appendChild(trackTimeline);

    return track;
}

export function updateTrackTime(track, timezone) {
    const timeEl = track.querySelector('.track-time[data-timezone="' + timezone + '"]');
    const dayEl = track.querySelector('.day-indicator[data-timezone="' + timezone + '"]');
    if (timeEl) {
        timeEl.textContent = formatTime(timezone);
    }
    if (dayEl) {
        dayEl.textContent = getDayIndicator(timezone);
    }
}

export function updateAllTrackTimes(tracks) {
    tracks.forEach(track => {
        const timezone = track.dataset.timezone;
        updateTrackTime(track, timezone);
    });
}

export function highlightCurrentHour(tracks) {
    tracks.forEach(track => {
        const timezone = track.dataset.timezone;
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hour12: false,
        });
        const parts = formatter.formatToParts(now);
        const currentHour = parseInt(parts.find(p => p.type === 'hour').value);

        track.querySelectorAll('.hour-marker').forEach(marker => {
            marker.classList.remove('current-hour');
            if (parseInt(marker.dataset.hour) === currentHour) {
                marker.classList.add('current-hour');
            }
        });
    });
}

export function populateTimezoneList(datalist, timezones) {
    datalist.innerHTML = '';
    timezones.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz;
        option.textContent = getTimezoneShortName(tz);
        datalist.appendChild(option);
    });
}

function computeTimeAtX(track, x, scale = 12) {
    const timezone = track.dataset.timezone;
    const timeline = track.querySelector('.track-timeline');
    const timelineRect = timeline.getBoundingClientRect();
    const relativeX = x - timelineRect.left;
    const relativeXFraction = relativeX / timelineRect.width;
    const offsetHours = (relativeXFraction - 0.5) * (2 * scale);
    const offsetMs = offsetHours * 3600 * 1000;
    const targetTime = new Date(Date.now() + offsetMs);
    const offsetStr = formatOffset(offsetMs);
    return { relativeX, timeStr: formatTime(timezone, targetTime), dayStr: getDayIndicator(timezone, targetTime), offsetStr };
}

export function showCursorLine(x, tracks, containerRect, scale = 12) {
    const cursorLine = document.getElementById('cursor-line');
    cursorLine.style.left = x + 'px';
    cursorLine.classList.add('active');

    let firstOffsetStr = '';
    tracks.forEach(track => {
        const { relativeX, timeStr, dayStr, offsetStr } = computeTimeAtX(track, x, scale);
        if (!firstOffsetStr) firstOffsetStr = offsetStr;
        const display = track.querySelector('.cursor-display');
        display.querySelector('.time-part').textContent = timeStr;
        display.querySelector('.date-part').textContent = dayStr;
        display.style.left = relativeX + 'px';
        display.style.display = 'flex';
    });

    const cursorLabel = document.getElementById('cursor-label');
    if (cursorLabel) {
        cursorLabel.textContent = firstOffsetStr;
    }
}

export function hideCursorLine(tracks) {
    const cursorLine = document.getElementById('cursor-line');
    cursorLine.classList.remove('active');

    tracks.forEach(track => {
        const display = track.querySelector('.cursor-display');
        if (display) {
            display.style.display = 'none';
        }
    });

    const cursorLabel = document.getElementById('cursor-label');
    if (cursorLabel) {
        cursorLabel.textContent = '';
    }
}

export function persistLine(x, tracks, containerRect, scale = 12) {
    const persistedLine = document.getElementById('persisted-line');
    persistedLine.style.left = x + 'px';
    persistedLine.classList.remove('hidden');
    persistedLine.classList.add('active');

    let firstOffsetStr = '';
    tracks.forEach(track => {
        const { relativeX, timeStr, dayStr, offsetStr } = computeTimeAtX(track, x, scale);
        if (!firstOffsetStr) firstOffsetStr = offsetStr;
        const display = track.querySelector('.persisted-display');
        display.querySelector('.time-part').textContent = timeStr;
        display.querySelector('.date-part').textContent = dayStr;
        display.style.left = relativeX + 'px';
        display.style.display = 'flex';
    });

    const persistedLabel = document.getElementById('persisted-label');
    if (persistedLabel) {
        persistedLabel.textContent = firstOffsetStr;
    }
}

export function clearPersistedLine(tracks) {
    const persistedLine = document.getElementById('persisted-line');
    persistedLine.classList.add('hidden');
    persistedLine.classList.remove('active');

    tracks.forEach(track => {
        const display = track.querySelector('.persisted-display');
        if (display) {
            display.style.display = 'none';
        }
    });

    const persistedLabel = document.getElementById('persisted-label');
    if (persistedLabel) {
        persistedLabel.textContent = '';
    }
}

export function updateNowLabels(tracks) {
    tracks.forEach(track => {
        const timezone = track.dataset.timezone;
        const display = track.querySelector('.now-display');
        const timeline = track.querySelector('.track-timeline');
        const timelineRect = timeline.getBoundingClientRect();
        const centerX = timelineRect.width / 2;
        const timeStr = formatTime(timezone);
        const dayStr = getDayIndicator(timezone);
        display.querySelector('.time-part').textContent = timeStr;
        display.querySelector('.date-part').textContent = dayStr;
        display.style.left = centerX + 'px';
        display.style.display = 'flex';
    });
}

export function updateNowLines(tracks, scale = 12) {
    tracks.forEach(track => {
        const timezone = track.dataset.timezone;
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
        const currentTime = hour + minute / 60 + second / 3600;

        track.querySelectorAll('.hour-marker').forEach(marker => {
            const h = parseInt(marker.dataset.hour);
            let offset = h - currentTime;

            if (offset <= -12) offset += 24;
            if (offset > 12) offset -= 24;

            const position = 50 + offset * (100 / (2 * scale));
            marker.style.left = position + '%';

            if (offset > -scale && offset <= scale) {
                marker.style.display = 'block';
            } else {
                marker.style.display = 'none';
            }

            marker.classList.remove('current-hour');
            if (h === hour) {
                marker.classList.add('current-hour');
            }
        });
    });
}

export function positionNowLine(tracks) {
    const nowLine = document.getElementById('now-line');
    if (tracks.length === 0) {
        nowLine.style.display = 'none';
        return;
    }
    const firstTrack = tracks[0];
    const trackRect = firstTrack.getBoundingClientRect();
    const centerX = trackRect.left + trackRect.width / 2;
    nowLine.style.left = centerX + 'px';
    nowLine.style.display = 'block';
}
