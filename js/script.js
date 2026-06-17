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
    renderPersists,
    updateNowLines,
    positionNowLine,
    updateNowLabels,
} from './ui.js';

const state = {
    timezones: [],
    tracks: [],
    persists: [],
    zoom: 12,
    scrollOffset: 0,
    isDragging: false,
    dragStart: { x: 0, scrollOffset: 0 },
    lastMouseX: null,
};

const tracksContainer = document.getElementById('tracks-container');
const timezoneInput = document.getElementById('timezone-input');
const addBtn = document.getElementById('add-btn');
const timezoneList = document.getElementById('timezone-list');
const resetBtn = document.getElementById('reset-btn');
const shareBtn = document.getElementById('share-btn');

const allTimezones = getAllTimezones();
const LS_KEY = 'world-time-state';

function serializeState() {
    const params = new URLSearchParams();
    state.timezones.forEach(tz => params.append('tz', tz));
    params.set('zoom', Math.round(state.zoom * 100) / 100);
    params.set('offset', Math.round(state.scrollOffset * 100) / 100);
    state.persists.forEach(p => {
        const entry = p.at + (p.label ? ':' + p.label : '');
        params.append('at', entry);
    });
    return params.toString();
}

function deserializeState(search) {
    const params = new URLSearchParams(search);
    const timezones = params.getAll('tz');
    if (timezones.length === 0) return null;
    const zoom = parseFloat(params.get('zoom')) || 12;
    const offset = parseFloat(params.get('offset')) || 0;
    
    let persists = [];
    const atEntries = params.getAll('at');
    if (atEntries.length > 0) {
        persists = atEntries.map(entry => {
            const [atStr, ...labelParts] = entry.split(':');
            const at = parseInt(atStr);
            const label = labelParts.join(':') || '';
            return { at, label };
        });
    } else if (params.has('persist')) {
        const val = parseFloat(params.get('persist'));
        // Old relative hours (< 1e9) or old absolute ms timestamps
        const ms = Math.abs(val) < 1e9 ? Date.now() + val * 3600000 : val;
        persists = [{ at: Math.round(ms / 60000), label: '' }];
    }
    
    return { timezones, zoom, offset, persists };
}

function saveState() {
    const data = {
        timezones: state.timezones,
        zoom: state.zoom,
        scrollOffset: state.scrollOffset,
        persists: state.persists,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function loadState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        
        // Migrate old persistedHours / persistedTimestamp to persists array
        if (data.persists === undefined) {
            let at = null;
            if (data.persistedTimestamp !== undefined) {
                at = Math.round(data.persistedTimestamp / 60000);
            } else if (data.persistedHours !== undefined) {
                at = Math.round((Date.now() + data.persistedHours * 3600000) / 60000);
            }
            data.persists = at !== null ? [{ at, label: '' }] : [];
            delete data.persistedHours;
            delete data.persistedTimestamp;
        }
        
        return data;
    } catch {
        return null;
    }
}

function clearUrlParams() {
    if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname);
    }
}

function handleShare() {
    const params = serializeState();
    const url = window.location.origin + window.location.pathname + '?' + params;
    navigator.clipboard.writeText(url).then(() => {
        shareBtn.textContent = 'Copied!';
        shareBtn.classList.add('copied');
        setTimeout(() => {
            shareBtn.textContent = 'Share';
            shareBtn.classList.remove('copied');
        }, 1500);
    });
}

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

function setZoom(newZoom, cursorX) {
    const minZoom = 1.5;
    const maxZoom = 168;
    const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));

    if (cursorX !== undefined && state.tracks.length > 0) {
        const rect = getFirstTrackRect();
        if (rect && cursorX >= rect.left && cursorX <= rect.right) {
            const fraction = (cursorX - rect.left) / rect.width;
            const hoursUnderCursor = state.scrollOffset + (fraction - 0.5) * (2 * state.zoom);
            state.scrollOffset = hoursUnderCursor - (fraction - 0.5) * (2 * clampedZoom);
        }
    }

    state.zoom = clampedZoom;
    renderAll();
    saveState();
}

function setScrollOffset(newScrollOffset) {
    state.scrollOffset = newScrollOffset;
    renderAll();
    saveState();
}

function resetView() {
    state.zoom = 12;
    state.scrollOffset = 0;
    state.persists = [];
    renderAll();
    saveState();
}

function renderAll() {
    updateNowLines(state.tracks, state.zoom, state.scrollOffset);
    updateNowLabels(state.tracks, state.zoom, state.scrollOffset);
    positionNowLine(state.tracks, state.zoom, state.scrollOffset);
    renderPersists(state.persists, state.tracks, state.zoom, state.scrollOffset);
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
    saveState();
}

function removeTimezone(timezone) {
    const index = state.timezones.indexOf(timezone);
    if (index === -1) return;

    state.timezones.splice(index, 1);
    const track = state.tracks[index];
    state.tracks.splice(index, 1);
    track.remove();

    if (state.timezones.length === 0) {
        state.persists = [];
    }
    renderAll();
    saveState();
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
    state.lastMouseX = e.clientX;

    if (state.isDragging) {
        const dx = e.clientX - state.dragStart.x;
        const width = getTrackWidth();
        if (width === 0) return;
        const hoursPerPixel = (2 * state.zoom) / width;
        setScrollOffset(state.dragStart.scrollOffset + dx * hoursPerPixel);
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
    const targetAt = Math.round((Date.now() / 60000) + hours * 60);
    
    const existingIndex = state.persists.findIndex(p => Math.abs(p.at - targetAt) <= 1);
    if (existingIndex !== -1) {
        state.persists.splice(existingIndex, 1);
    } else {
        const label = prompt('Label for this time marker (optional):');
        if (label !== null) {
            state.persists.push({ at: targetAt, label: label.trim() });
        }
    }
    renderAll();
    saveState();
}

function handleWheel(e) {
    const containerRect = tracksContainer.getBoundingClientRect();
    if (e.clientX < containerRect.left || e.clientX > containerRect.right ||
        e.clientY < containerRect.top || e.clientY > containerRect.bottom) {
        return;
    }

    const cursorX = e.clientX;

    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomFactor = Math.exp(-e.deltaY * 0.001);
        setZoom(state.zoom * zoomFactor, cursorX);
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
            setScrollOffset(state.scrollOffset + e.deltaX * hoursPerPixel);
        } else {
            e.preventDefault();
            const zoomFactor = Math.exp(-e.deltaY * 0.001);
            setZoom(state.zoom * zoomFactor, cursorX);
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
        setScrollOffset(state.dragStart.scrollOffset + dx * hoursPerPixel);
    } else if (e.touches.length === 2 && state.pinchStartDistance) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const zoomFactor = distance / state.pinchStartDistance;
        const cursorX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        setZoom(state.pinchStartZoom * zoomFactor, cursorX);
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

    const urlState = deserializeState(window.location.search);
    if (urlState) {
        state.zoom = urlState.zoom;
        state.scrollOffset = urlState.offset;
        state.persists = urlState.persists;
        urlState.timezones.forEach(tz => addTimezone(tz));
        clearUrlParams();
    } else {
        const saved = loadState();
        if (saved) {
            state.zoom = saved.zoom;
            state.scrollOffset = saved.scrollOffset;
            state.persists = saved.persists;
            saved.timezones.forEach(tz => addTimezone(tz));
        } else {
            addTimezone(getLocalTimezone());
        }
    }

    addBtn.addEventListener('click', handleAdd);
    timezoneInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleAdd();
        }
    });
    resetBtn.addEventListener('click', resetView);
    shareBtn.addEventListener('click', handleShare);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('gestureend', (e) => e.preventDefault());

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
