import {
    getTimezoneName,
    getTimezoneShortName,
    formatTime,
    getDayIndicator,
    formatOffset,
} from './timezones.js';

import { getOccurrences } from './recurrence.js';

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

export function computeTimeAtX(track, x, zoom, scrollOffset) {
    const timezone = track.dataset.timezone;
    const timeline = track.querySelector('.track-timeline');
    const timelineRect = timeline.getBoundingClientRect();
    const relativeX = x - timelineRect.left;
    const relativeXFraction = relativeX / timelineRect.width;
    const hours = scrollOffset + (relativeXFraction - 0.5) * (2 * zoom);
    const offsetMs = hours * 3600 * 1000;
    const targetTime = new Date(Date.now() + offsetMs);
    const offsetStr = formatOffset(offsetMs);
    return { relativeX, timeStr: formatTime(timezone, targetTime), dayStr: getDayIndicator(timezone, targetTime), offsetStr };
}

export function snapXToMinute(x, tracks, zoom, scrollOffset) {
    if (tracks.length === 0) return x;
    const firstTrack = tracks[0];
    const timeline = firstTrack.querySelector('.track-timeline');
    const rect = timeline.getBoundingClientRect();
    const relativeX = x - rect.left;
    const fraction = relativeX / rect.width;
    const hours = scrollOffset + (fraction - 0.5) * (2 * zoom);
    const offsetMs = hours * 3600 * 1000;
    const roundedOffsetMs = Math.round(offsetMs / 60000) * 60000;
    const roundedHours = roundedOffsetMs / 3600000;
    const roundedFraction = (roundedHours - scrollOffset) / (2 * zoom) + 0.5;
    return rect.left + roundedFraction * rect.width;
}

export function showCursorLine(x, tracks, zoom, scrollOffset) {
    x = snapXToMinute(x, tracks, zoom, scrollOffset);

    const cursorLine = document.getElementById('cursor-line');
    cursorLine.style.left = x + 'px';
    cursorLine.classList.add('active');

    let firstOffsetStr = '';
    tracks.forEach(track => {
        const { relativeX, timeStr, dayStr, offsetStr } = computeTimeAtX(track, x, zoom, scrollOffset);
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

/**
 * Render all events (including recurring occurrences) onto the timeline.
 *
 * Each occurrence gets a DOM id of the form:
 *   persist-line-<eventId>-<occurrenceIndex>
 *
 * @param {Array} events
 * @param {HTMLElement[]} tracks
 * @param {number} zoom
 * @param {number} scrollOffset
 * @param {Function} onEventClick - called with the event object when a label is clicked
 */
export function renderEvents(events, tracks, zoom, scrollOffset, onEventClick) {
    // Build the set of line IDs that should exist after this render
    const firstTrack = tracks.length > 0 ? tracks[0] : null;
    const timelineRect = firstTrack
        ? firstTrack.querySelector('.track-timeline').getBoundingClientRect()
        : null;

    const nowMs = Date.now();
    // Visible window in epoch minutes
    const windowStartMin = Math.floor((nowMs / 60000) + (scrollOffset - zoom) * 60);
    const windowEndMin   = Math.ceil((nowMs / 60000) + (scrollOffset + zoom) * 60);

    // Collect all (event, occurrenceEpochMin, occurrenceIndex) tuples
    const occurrenceLines = [];
    events.forEach(event => {
        const occurrences = getOccurrences(event, windowStartMin, windowEndMin);
        occurrences.forEach((epochMin, idx) => {
            occurrenceLines.push({ event, epochMin, idx });
        });
    });

    const activeLineIds = new Set(occurrenceLines.map(({ event, idx }) => `persist-line-${event.id}-${idx}`));
    const activeDisplayPrefix = new Set(occurrenceLines.map(({ event, idx }) => `persist-display-${event.id}-${idx}`));

    // Remove stale global lines
    document.querySelectorAll('.persisted-line').forEach(el => {
        if (!activeLineIds.has(el.id)) el.remove();
    });

    // Remove stale track displays
    tracks.forEach(track => {
        track.querySelectorAll('.persisted-display').forEach(el => {
            // class list contains the unique display id as a class
            const match = el.className.match(/persist-display-[^\s]+/);
            if (match && !activeDisplayPrefix.has(match[0])) el.remove();
        });
    });

    if (occurrenceLines.length === 0 || tracks.length === 0) return;

    occurrenceLines.forEach(({ event, epochMin, idx }) => {
        const lineId = `persist-line-${event.id}-${idx}`;
        const displayClass = `persist-display-${event.id}-${idx}`;
        const isRecurring = !!event.recurrence;

        const hours = (epochMin * 60000 - nowMs) / 3600000;
        const x = timelineRect.left + timelineRect.width * (0.5 + (hours - scrollOffset) / (2 * zoom));

        // ── Global line ───────────────────────────────────────────────────────
        let lineEl = document.getElementById(lineId);
        if (!lineEl) {
            lineEl = document.createElement('div');
            lineEl.id = lineId;
            lineEl.className = 'persisted-line' + (isRecurring ? ' persisted-line--recurring' : '');

            const labelChip = document.createElement('div');
            labelChip.className = 'line-offset-label persisted-label';
            labelChip.style.pointerEvents = 'auto';
            labelChip.style.cursor = 'pointer';
            labelChip.addEventListener('click', (e) => {
                e.stopPropagation();
                if (onEventClick) onEventClick(event);
            });

            if (isRecurring) {
                const recurIcon = document.createElement('span');
                recurIcon.className = 'persist-recur-icon';
                recurIcon.textContent = '↻';
                labelChip.appendChild(recurIcon);
            }

            const offsetText = document.createElement('span');
            offsetText.className = 'persist-offset-text';
            labelChip.appendChild(offsetText);

            const labelText = document.createElement('span');
            labelText.className = 'persist-label-text';
            labelChip.appendChild(labelText);

            lineEl.appendChild(labelChip);
            document.body.appendChild(lineEl);
        }

        lineEl.style.left = x + 'px';
        lineEl.style.display = 'block';

        const offsetMs = epochMin * 60000 - nowMs;
        lineEl.querySelector('.persist-offset-text').textContent = formatOffset(offsetMs);
        lineEl.querySelector('.persist-label-text').textContent = event.label || '';

        // ── Track displays ────────────────────────────────────────────────────
        tracks.forEach(track => {
            let displayEl = track.querySelector('.' + displayClass);
            if (!displayEl) {
                displayEl = document.createElement('div');
                displayEl.className = `track-time-display persisted-display ${displayClass}`;
                displayEl.innerHTML = '<span class="time-part"></span><span class="date-part"></span>';
                track.querySelector('.track-timeline').appendChild(displayEl);
            }

            const trackTimeline = track.querySelector('.track-timeline');
            const trackRect = trackTimeline.getBoundingClientRect();
            const relativeX = x - trackRect.left;

            const { timeStr, dayStr } = computeTimeAtX(track, x, zoom, scrollOffset);
            displayEl.querySelector('.time-part').textContent = timeStr;
            displayEl.querySelector('.date-part').textContent = dayStr;
            displayEl.style.left = relativeX + 'px';
            displayEl.style.display = 'flex';
        });
    });
}

export function updateNowLabels(tracks, zoom, scrollOffset) {
    tracks.forEach(track => {
        const timezone = track.dataset.timezone;
        const display = track.querySelector('.now-display');
        const timeline = track.querySelector('.track-timeline');
        const timelineRect = timeline.getBoundingClientRect();
        const relativeX = timelineRect.width * (0.5 + (0 - scrollOffset) / (2 * zoom));
        const timeStr = formatTime(timezone);
        const dayStr = getDayIndicator(timezone);
        display.querySelector('.time-part').textContent = timeStr;
        display.querySelector('.date-part').textContent = dayStr;
        display.style.left = relativeX + 'px';
        display.style.display = 'flex';
    });
}

export function updateNowLines(tracks, zoom, scrollOffset) {
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

            const position = 50 + (offset - scrollOffset) * (100 / (2 * zoom));
            marker.style.left = position + '%';

            if (position > -10 && position < 110) {
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

export function positionNowLine(tracks, zoom, scrollOffset) {
    const nowLine = document.getElementById('now-line');
    const nowIndicator = document.getElementById('now-indicator');
    if (tracks.length === 0) {
        nowLine.style.display = 'none';
        nowIndicator.style.display = 'none';
        return;
    }
    const firstTrack = tracks[0];
    const timeline = firstTrack.querySelector('.track-timeline');
    const timelineRect = timeline.getBoundingClientRect();

    const x = timelineRect.left + timelineRect.width * (0.5 + (0 - scrollOffset) / (2 * zoom));

    if (x >= timelineRect.left && x <= timelineRect.right) {
        nowLine.style.display = 'block';
        nowLine.style.left = x + 'px';
        nowIndicator.style.display = 'none';
    } else {
        nowLine.style.display = 'none';
        nowIndicator.style.display = 'block';
        const arrow = nowIndicator.querySelector('.now-indicator-arrow');
        if (x < timelineRect.left) {
            nowIndicator.style.left = timelineRect.left + 'px';
            if (arrow) arrow.textContent = '◀';
        } else {
            nowIndicator.style.left = timelineRect.right + 'px';
            if (arrow) arrow.textContent = '▶';
        }
    }
}
