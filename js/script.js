import {
    getLocalTimezone,
    getAllTimezones,
    COMMON_TIMEZONES,
} from './timezones.js';

import {
    createTrackElement,
    updateAllTrackTimes,
    highlightCurrentHour,
    populateTimezoneList,
    showCursorLine,
    hideCursorLine,
    persistLine,
    clearPersistedLine,
    updateNowLines,
    positionNowLine,
    updateNowLabels,
} from './ui.js';

const state = {
    timezones: [],
    tracks: [],
    persistedHours: null,
    zoom: 12,
    scrollOffset: 0,
    isDragging: false,
    dragStart: { x: 0, scrollOffset: 0 },
};

const tracksContainer = document.getElementById('tracks-container');
const timezoneInput = document.getElementById('timezone-input');
const addBtn = document.getElementById('add-btn');
const timezoneList = document.getElementById('timezone-list');
const resetBtn = document.getElementById('reset-btn');

const allTimezones = getAllTimezones();

function getFirstTrackRect() {
    if (state.tracks.length === 0) return null;
    const track = state.tracks[0];
    const timeline = track.querySelector('.track-timeline');
    return timeline.getBoundingClientRect();
}

function getTrackWidth() {
    const rect = getFirstTrackRect();
    return rect ? rect.width : 0;
}

function hoursToPixel(hours) {
    const rect = getFirstTrackRect();
    if (!rect) return 0;
    const fraction = 0.5 + (hours - state.scrollOffset) / (2 * state.zoom);
    return rect.left + fraction * rect.width;
}

function pixelToHours(pixelX) {
    const rect = getFirstTrackRect();
    if (!rect) return 0;
    const fraction = (pixelX - rect.left) / rect.width;
    return state.scrollOffset + (fraction - 0.5) * (2 * state.zoom);
}

function setZoom(newZoom) {
    const minZoom = 1.5;
    const maxZoom = 168;
    state.zoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
    renderAll();
}

function setScrollOffset(newScrollOffset) {
    state.scrollOffset = newScrollOffset;
    renderAll();
}

function resetView() {
    state.zoom = 12;
    state.scrollOffset = 0;
    renderAll();
}

function renderAll() {
    updateNowLines(state.tracks, state.zoom, state.scrollOffset);
    updateNowLabels(state.tracks, state.zoom, state.scrollOffset);
    positionNowLine(state.tracks, state.zoom, state.scrollOffset);
    if (state.persistedHours !== null) {
        persistLine(state.persistedHours, state.tracks, state.zoom, state.scrollOffset);
    }
}

function addTimezone(timezone) {
    if (state.timezones.includes(timezone)) {
        return;
    }

    state.timezones.push(timezone);
    const track = createTrackElement(timezone, removeTimezone);
    state.tracks.push(track);
    tracksContainer.appendChild(track);

    updateAllTrackTimes(state.tracks);
    highlightCurrentHour(state.tracks);
    renderAll();
}

function removeTimezone(timezone) {
    const index = state.timezones.indexOf(timezone);
    if (index === -1) return;

    state.timezones.splice(index, 1);
    const track = state.tracks[index];
    state.tracks.splice(index, 1);
    track.remove();

    if (state.timezones.length === 0) {
        clearPersistedLine([]);
        state.persistedHours = null;
    }
    renderAll();
}

function handleAdd() {
    const value = timezoneInput.value.trim();
    if (!value) return;

    if (allTimezones.includes(value)) {
        addTimezone(value);
        timezoneInput.value = '';
    } else {
        const match = allTimezones.find(tz =>
            tz.toLowerCase().includes(value.toLowerCase())
        );
        if (match) {
            addTimezone(match);
            timezoneInput.value = '';
        } else {
            alert('Timezone not found. Please try a valid IANA timezone name.');
        }
    }
}

function handleMouseMove(e) {
    if (state.isDragging) {
        const dx = e.clientX - state.dragStart.x;
        const width = getTrackWidth();
        if (width === 0) return;
        const hoursPerPixel = (2 * state.zoom) / width;
        setScrollOffset(state.dragStart.scrollOffset - dx * hoursPerPixel);
        return;
    }

    if (state.tracks.length === 0) return;

    const containerRect = tracksContainer.getBoundingClientRect();
    if (e.clientX < containerRect.left || e.clientX > containerRect.right ||
        e.clientY < containerRect.top || e.clientY > containerRect.bottom) {
        hideCursorLine(state.tracks);
        return;
    }

    showCursorLine(e.clientX, state.tracks, state.zoom, state.scrollOffset);
}

function handleMouseDown(e) {
    if (e.target.closest('.remove-btn') || e.target.closest('button') || e.target.closest('input')) {
        return;
    }
    state.isDragging = true;
    state.dragStart = { x: e.clientX, scrollOffset: state.scrollOffset };
    document.body.style.cursor = 'grabbing';
}

function handleMouseUp(e) {
    if (!state.isDragging) return;

    const dx = Math.abs(e.clientX - state.dragStart.x);
    const wasClick = dx < 5;

    state.isDragging = false;
    document.body.style.cursor = 'crosshair';

    if (wasClick) {
        handleClick(e);
    }
}

function handleClick(e) {
    if (state.tracks.length === 0) return;

    const containerRect = tracksContainer.getBoundingClientRect();
    if (e.clientX < containerRect.left || e.clientX > containerRect.right ||
        e.clientY < containerRect.top || e.clientY > containerRect.bottom) {
        return;
    }

    if (e.target.closest('.remove-btn')) {
        return;
    }

    const hours = pixelToHours(e.clientX);
    if (state.persistedHours !== null && Math.abs(state.persistedHours - hours) < 0.01) {
        clearPersistedLine(state.tracks);
        state.persistedHours = null;
    } else {
        state.persistedHours = hours;
        persistLine(state.persistedHours, state.tracks, state.zoom, state.scrollOffset);
    }
}

function handleWheel(e) {
    const containerRect = tracksContainer.getBoundingClientRect();
    if (e.clientX < containerRect.left || e.clientX > containerRect.right ||
        e.clientY < containerRect.top || e.clientY > containerRect.bottom) {
        return;
    }

    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomFactor = Math.exp(-e.deltaY * 0.001);
        setZoom(state.zoom * zoomFactor);
    } else if (e.shiftKey) {
        e.preventDefault();
        const width = getTrackWidth();
        if (width === 0) return;
        const hoursPerPixel = (2 * state.zoom) / width;
        setScrollOffset(state.scrollOffset + e.deltaY * hoursPerPixel);
    } else {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            e.preventDefault();
            const width = getTrackWidth();
            if (width === 0) return;
            const hoursPerPixel = (2 * state.zoom) / width;
            setScrollOffset(state.scrollOffset - e.deltaX * hoursPerPixel);
        } else {
            e.preventDefault();
            const zoomFactor = Math.exp(-e.deltaY * 0.001);
            setZoom(state.zoom * zoomFactor);
        }
    }
}

function handleTouchStart(e) {
    if (e.touches.length === 1) {
        state.isDragging = true;
        state.dragStart = { x: e.touches[0].clientX, scrollOffset: state.scrollOffset };
        state.pinchStartDistance = null;
    } else if (e.touches.length === 2) {
        state.isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        state.pinchStartDistance = Math.sqrt(dx * dx + dy * dy);
        state.pinchStartZoom = state.zoom;
    }
}

function handleTouchMove(e) {
    if (e.touches.length === 1 && state.isDragging) {
        const dx = e.touches[0].clientX - state.dragStart.x;
        const width = getTrackWidth();
        if (width === 0) return;
        const hoursPerPixel = (2 * state.zoom) / width;
        setScrollOffset(state.dragStart.scrollOffset - dx * hoursPerPixel);
    } else if (e.touches.length === 2 && state.pinchStartDistance) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const zoomFactor = distance / state.pinchStartDistance;
        setZoom(state.pinchStartZoom * zoomFactor);
    }
}

function handleTouchEnd(e) {
    if (e.touches.length === 0) {
        state.isDragging = false;
        state.pinchStartDistance = null;
        state.pinchStartZoom = null;
    } else if (e.touches.length === 1) {
        state.isDragging = true;
        state.dragStart = { x: e.touches[0].clientX, scrollOffset: state.scrollOffset };
        state.pinchStartDistance = null;
    }
}

function init() {
    populateTimezoneList(timezoneList, COMMON_TIMEZONES);

    addTimezone(getLocalTimezone());

    addBtn.addEventListener('click', handleAdd);
    timezoneInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleAdd();
        }
    });
    resetBtn.addEventListener('click', resetView);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    setInterval(() => {
        updateAllTrackTimes(state.tracks);
        highlightCurrentHour(state.tracks);
        renderAll();
    }, 1000);

    renderAll();

    window.addEventListener('resize', () => {
        renderAll();
    });
}

init();
