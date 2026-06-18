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
    renderEvents,
    updateNowLines,
    positionNowLine,
    updateNowLabels,
    snapXToMinute,
} from './ui.js';

const state = {
    timezones: [],
    tracks: [],
    events: [],
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

// Modal elements
const eventModal = document.getElementById('event-modal');
const modalTitle = document.getElementById('modal-title');
const modalLabel = document.getElementById('modal-label');
const modalTz = document.getElementById('modal-tz');
const modalRecurrence = document.getElementById('modal-recurrence');
const modalSave = document.getElementById('modal-save');
const modalDelete = document.getElementById('modal-delete');
const modalCancel = document.getElementById('modal-cancel');

const allTimezones = getAllTimezones();
const LS_KEY = 'world-time-state';

// ─── Modal state ─────────────────────────────────────────────────────────────

let modalMode = 'create'; // 'create' | 'edit'
let modalPendingAt = null; // epoch minutes for new event
let modalEditId = null;    // id of event being edited

function buildModalTzOptions(defaultTz) {
    modalTz.innerHTML = '';
    // Tracks first (deduplicated), then remaining COMMON_TIMEZONES
    const trackTzs = state.timezones;
    const remaining = COMMON_TIMEZONES.filter(tz => !trackTzs.includes(tz));
    const ordered = [...trackTzs, ...remaining];

    ordered.forEach(tz => {
        const opt = document.createElement('option');
        opt.value = tz;
        opt.textContent = tz;
        if (tz === defaultTz) opt.selected = true;
        modalTz.appendChild(opt);
    });

    // If defaultTz isn't in the list yet, prepend it
    if (defaultTz && !ordered.includes(defaultTz)) {
        const opt = document.createElement('option');
        opt.value = defaultTz;
        opt.textContent = defaultTz;
        opt.selected = true;
        modalTz.insertBefore(opt, modalTz.firstChild);
    }
}

function openModalCreate(epochMinutes, defaultTz) {
    modalMode = 'create';
    modalPendingAt = epochMinutes;
    modalEditId = null;
    modalTitle.textContent = 'New Event';
    modalLabel.value = '';
    modalRecurrence.value = '';
    buildModalTzOptions(defaultTz || getLocalTimezone());
    modalDelete.style.display = 'none';
    eventModal.classList.add('active');
    modalLabel.focus();
}

function openModalEdit(event) {
    modalMode = 'edit';
    modalPendingAt = null;
    modalEditId = event.id;
    modalTitle.textContent = 'Edit Event';
    modalLabel.value = event.label || '';
    modalRecurrence.value = event.recurrence || '';
    buildModalTzOptions(event.tz);
    modalDelete.style.display = '';
    eventModal.classList.add('active');
    modalLabel.focus();
}

function closeModal() {
    eventModal.classList.remove('active');
    modalMode = 'create';
    modalPendingAt = null;
    modalEditId = null;
}

function handleModalSave() {
    const label = modalLabel.value.trim();
    const tz = modalTz.value;
    const recurrence = modalRecurrence.value || null;

    if (modalMode === 'create') {
        const event = {
            id: crypto.randomUUID(),
            at: modalPendingAt,
            label,
            tz,
            recurrence,
        };
        state.events.push(event);
    } else {
        const idx = state.events.findIndex(e => e.id === modalEditId);
        if (idx !== -1) {
            state.events[idx] = { ...state.events[idx], label, tz, recurrence };
        }
    }

    closeModal();
    renderAll();
    saveState();
}

function handleModalDelete() {
    if (modalEditId) {
        state.events = state.events.filter(e => e.id !== modalEditId);
    }
    closeModal();
    renderAll();
    saveState();
}

// ─── Serialization ────────────────────────────────────────────────────────────

function serializeState() {
    const params = new URLSearchParams();
    state.timezones.forEach(tz => params.append('tz', tz));
    params.set('zoom', Math.round(state.zoom * 100) / 100);
    params.set('offset', Math.round(state.scrollOffset * 100) / 100);
    // Only serialize simple (non-recurring) events to URL for backwards compat
    state.events.forEach(ev => {
        if (!ev.recurrence) {
            const entry = ev.at + (ev.label ? ':' + ev.label : '');
            params.append('at', entry);
        }
    });
    return params.toString();
}

function deserializeState(search) {
    const params = new URLSearchParams(search);
    const timezones = params.getAll('tz');
    if (timezones.length === 0) return null;
    const zoom = parseFloat(params.get('zoom')) || 12;
    const offset = parseFloat(params.get('offset')) || 0;

    let events = [];
    const atEntries = params.getAll('at');
    if (atEntries.length > 0) {
        events = atEntries.map(entry => {
            const [atStr, ...labelParts] = entry.split(':');
            const at = parseInt(atStr);
            const label = labelParts.join(':') || '';
            return {
                id: crypto.randomUUID(),
                at,
                label,
                tz: getLocalTimezone(),
                recurrence: null,
            };
        });
    } else if (params.has('persist')) {
        const val = parseFloat(params.get('persist'));
        const ms = Math.abs(val) < 1e9 ? Date.now() + val * 3600000 : val;
        events = [{
            id: crypto.randomUUID(),
            at: Math.round(ms / 60000),
            label: '',
            tz: getLocalTimezone(),
            recurrence: null,
        }];
    }

    return { timezones, zoom, offset, events };
}

function saveState() {
    const data = {
        timezones: state.timezones,
        zoom: state.zoom,
        scrollOffset: state.scrollOffset,
        events: state.events,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function loadState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);

        // Migrate old persistedHours / persistedTimestamp
        if (data.persists === undefined && data.events === undefined) {
            let at = null;
            if (data.persistedTimestamp !== undefined) {
                at = Math.round(data.persistedTimestamp / 60000);
            } else if (data.persistedHours !== undefined) {
                at = Math.round((Date.now() + data.persistedHours * 3600000) / 60000);
            }
            data.events = at !== null ? [{
                id: crypto.randomUUID(),
                at,
                label: '',
                tz: getLocalTimezone(),
                recurrence: null,
            }] : [];
            delete data.persistedHours;
            delete data.persistedTimestamp;
        }

        // Migrate old persists array → events
        if (data.persists !== undefined && data.events === undefined) {
            data.events = data.persists.map(p => ({
                id: crypto.randomUUID(),
                at: p.at,
                label: p.label || '',
                tz: getLocalTimezone(),
                recurrence: null,
            }));
            delete data.persists;
        }

        return data;
    } catch {
        return null;
    }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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
    state.events = [];
    renderAll();
    saveState();
}

function renderAll() {
    updateNowLines(state.tracks, state.zoom, state.scrollOffset);
    updateNowLabels(state.tracks, state.zoom, state.scrollOffset);
    positionNowLine(state.tracks, state.zoom, state.scrollOffset);
    renderEvents(state.events, state.tracks, state.zoom, state.scrollOffset, openModalEdit);
}

// ─── Track management ─────────────────────────────────────────────────────────

function addTimezone(timezone) {
    if (state.timezones.includes(timezone)) return;

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
        state.events = [];
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

// ─── Mouse / touch handlers ───────────────────────────────────────────────────

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
    if (e.target.closest('.remove-btn') || e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) {
        return;
    }
    // Don't start drag on event label clicks (they open the modal)
    if (e.target.closest('.persisted-label')) return;

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

    if (e.target.closest('.remove-btn')) return;
    // Clicks on persisted labels are handled by their own listener in ui.js
    if (e.target.closest('.persisted-label')) return;

    // Determine which track was clicked for default tz
    const clickedTrack = e.target.closest('.track');
    const defaultTz = clickedTrack
        ? clickedTrack.dataset.timezone
        : (state.timezones[0] || getLocalTimezone());

    const snapX = snapXToMinute(e.clientX, state.tracks, state.zoom, state.scrollOffset);
    const hours = pixelToHours(snapX);
    const targetAt = Math.round((Date.now() / 60000) + hours * 60);

    openModalCreate(targetAt, defaultTz);
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

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
    populateTimezoneList(timezoneList, COMMON_TIMEZONES);

    const urlState = deserializeState(window.location.search);
    if (urlState) {
        state.zoom = urlState.zoom;
        state.scrollOffset = urlState.offset;
        state.events = urlState.events;
        urlState.timezones.forEach(tz => addTimezone(tz));
        clearUrlParams();
    } else {
        const saved = loadState();
        if (saved) {
            state.zoom = saved.zoom;
            state.scrollOffset = saved.scrollOffset;
            state.events = saved.events || [];
            saved.timezones.forEach(tz => addTimezone(tz));
        } else {
            addTimezone(getLocalTimezone());
        }
    }

    addBtn.addEventListener('click', handleAdd);
    timezoneInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdd();
    });
    resetBtn.addEventListener('click', resetView);
    shareBtn.addEventListener('click', handleShare);

    // Modal buttons
    modalSave.addEventListener('click', handleModalSave);
    modalDelete.addEventListener('click', handleModalDelete);
    modalCancel.addEventListener('click', closeModal);
    eventModal.addEventListener('click', (e) => {
        if (e.target === eventModal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && eventModal.classList.contains('active')) closeModal();
        if (e.key === 'Enter' && eventModal.classList.contains('active') && e.target !== modalSave && e.target !== modalDelete && e.target !== modalCancel) {
            handleModalSave();
        }
    });

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
