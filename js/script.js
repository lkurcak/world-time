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
    persistedX: null,
    scale: 12,
};

const tracksContainer = document.getElementById('tracks-container');
const timezoneInput = document.getElementById('timezone-input');
const addBtn = document.getElementById('add-btn');
const timezoneList = document.getElementById('timezone-list');
const persistedLine = document.getElementById('persisted-line');
const scaleControls = document.getElementById('scale-controls');

const allTimezones = getAllTimezones();

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
    updateNowLines(state.tracks, state.scale);
    updateNowLabels(state.tracks);
    positionNowLine(state.tracks);

    if (state.persistedX !== null) {
        const containerRect = tracksContainer.getBoundingClientRect();
        persistLine(state.persistedX, state.tracks, containerRect, state.scale);
    }
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
    }
    positionNowLine(state.tracks);
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
    if (state.tracks.length === 0) return;

    const containerRect = tracksContainer.getBoundingClientRect();
    if (e.clientX < containerRect.left || e.clientX > containerRect.right ||
        e.clientY < containerRect.top || e.clientY > containerRect.bottom) {
        hideCursorLine(state.tracks);
        return;
    }

    showCursorLine(e.clientX, state.tracks, containerRect, state.scale);
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

    if (state.persistedX === e.clientX) {
        clearPersistedLine(state.tracks);
        state.persistedX = null;
    } else {
        persistLine(e.clientX, state.tracks, containerRect, state.scale);
        state.persistedX = e.clientX;
    }
}

function setScale(scale) {
    state.scale = scale;

    document.querySelectorAll('.scale-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.scale) === scale);
    });

    updateNowLines(state.tracks, scale);
    updateNowLabels(state.tracks);
    if (state.persistedX !== null) {
        const containerRect = tracksContainer.getBoundingClientRect();
        persistLine(state.persistedX, state.tracks, containerRect, scale);
    }
}

function handleScaleChange(e) {
    if (e.target.classList.contains('scale-btn')) {
        const scale = parseInt(e.target.dataset.scale);
        setScale(scale);
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

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick);
    scaleControls.addEventListener('click', handleScaleChange);

    setInterval(() => {
        updateAllTrackTimes(state.tracks);
        highlightCurrentHour(state.tracks);
        updateNowLines(state.tracks, state.scale);
        updateNowLabels(state.tracks);
        positionNowLine(state.tracks);
    }, 1000);

    updateNowLines(state.tracks, state.scale);
    updateNowLabels(state.tracks);
    positionNowLine(state.tracks);

    window.addEventListener('resize', () => {
        positionNowLine(state.tracks);
    });
}

init();
