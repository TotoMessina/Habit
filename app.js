
// *** CONFIGURACIÓN SUPABASE ***
// REEMPLAZAR CON TUS VALORES REALES DE SUPABASE
const SUPABASE_URL = 'https://peacchivqntezgvcknvx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlYWNjaGl2cW50ZXpndmNrbnZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczODE5MjIsImV4cCI6MjA4Mjk1NzkyMn0.Lp1dM4tNU-5BNtEc6taslBFHqYJuZ1NK_nk7gNYYr-M';

// Renamed variable to avoid conflict with window.supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// *** ESTADO GLOBAL ***
let state = {
    user: null,
    calendars: [],
    currentCalendar: null,
    markers: [],
    // Cache de días: Clave = 'YYYY-MM-DD', Valor = Objeto DayEntry
    daysCache: new Map(),
    year: 2026,
    selectedDate: null, // For keyboard navigation
    isSelectMode: false,
    selectedDates: new Set() // For bulk selection
};

// *** ELEMENTOS DOM ***
const els = {
    authContainer: document.getElementById('auth-container'),
    appContainer: document.getElementById('app-container'),
    authForm: document.getElementById('auth-form'),
    btnSignup: document.getElementById('btn-signup'),
    btnLogin: document.getElementById('btn-login'), // If needed separately
    btnLogout: document.getElementById('btn-logout'),
    calendarSelect: document.getElementById('calendar-select'),
    btnNewCalendar: document.getElementById('btn-new-calendar'),
    btnManageMarkers: document.getElementById('btn-manage-markers'),
    calendarGrid: document.getElementById('calendar-grid'),

    // Modals
    modalCalendar: document.getElementById('modal-calendar'),
    formCalendar: document.getElementById('form-calendar'),
    modalMarkers: document.getElementById('modal-markers'),
    formMarkerAdd: document.getElementById('form-marker-add'),
    markersList: document.getElementById('markers-list'),
    modalDay: document.getElementById('modal-day'),

    // Day Modal Inputs
    dayTitle: document.getElementById('day-title'),
    dayCheckPrimary: document.getElementById('day-check-primary'),
    dayPrimaryLabel: document.getElementById('day-primary-label'),
    dayMarkersContainer: document.getElementById('day-markers-container'),
    dayNote: document.getElementById('day-note'),
    btnSaveDay: document.getElementById('btn-save-day'),

    // Stats
    statTotalDone: document.getElementById('stat-total-done'),
    statPercentage: document.getElementById('stat-percentage'),
    statStreak: document.getElementById('stat-streak'),
    statChart: document.getElementById('stat-chart'),
    statStreak: document.getElementById('stat-streak'),
    statChart: document.getElementById('stat-chart'),
    statStreak: document.getElementById('stat-streak'),
    statChart: document.getElementById('stat-chart'),
    statMarkersGrid: document.getElementById('stat-markers-grid'),

    // Advanced Stats
    statMaxStreak: document.getElementById('stat-max-streak'),
    statBestMonth: document.getElementById('stat-best-month'),
    statBestDay: document.getElementById('stat-best-day'),
    goalsContainer: document.getElementById('goals-container'),
    statWeekdayChart: document.getElementById('stat-weekday-chart'),
    statTrendChart: document.getElementById('stat-trend-chart'),

    // Sharing
    btnShare: document.getElementById('btn-share-calendar'),
    modalShare: document.getElementById('modal-share'),
    sharesList: document.getElementById('shares-list'),
    formShareAdd: document.getElementById('form-share-add'),

    // Bulk / Interaction
    btnSelectMode: document.getElementById('btn-select-mode'),
    bulkToolbar: document.getElementById('bulk-toolbar'),
    bulkCount: document.getElementById('bulk-count'),
    btnBulkDone: document.getElementById('btn-bulk-done'),
    btnBulkUndone: document.getElementById('btn-bulk-undone'),
    btnBulkCancel: document.getElementById('btn-bulk-cancel'),

    // Tabs
    tabs: document.querySelectorAll('.tab-btn'),
    views: {
        calendar: document.getElementById('view-calendar'),
        stats: document.getElementById('view-stats')
    }
};

// *** UTILS ***
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');
const formatDate = (date) => date.toISOString().split('T')[0];

function closeModal(modal) {
    hide(modal);
}

// *** INICIO ***
async function init() {
    setupEventListeners();
    await checkSession();
}

function setupEventListeners() {
    // Auth
    els.authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const type = e.submitter.id === 'btn-signup' ? 'signup' : 'login'; // Determine action
        await handleAuth(email, password, type);
    });

    // Support creating account with secondary button click handling hack or distinct buttons
    // Event listener removed as the button is now type="submit"

    els.btnLogout.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    });

    // Navigation
    els.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            els.tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            Object.values(els.views).forEach(hide);
            els.views[tab.dataset.tab].classList.remove('hidden');
            if (tab.dataset.tab === 'stats') updateStatsView();
        });
    });

    // Calendar Selection
    els.calendarSelect.addEventListener('change', (e) => loadCalendar(e.target.value));

    // Modals Open/Close
    els.btnNewCalendar.addEventListener('click', () => {
        els.formCalendar.reset();
        show(els.modalCalendar);
    });
    els.btnManageMarkers.addEventListener('click', () => {
        renderMarkersList();
        show(els.modalMarkers);
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => closeModal(e.target.closest('.modal')));
    });

    // Forms
    els.formCalendar.addEventListener('submit', createCalendar);
    els.formMarkerAdd.addEventListener('submit', createMarker);
    els.btnSaveDay.addEventListener('click', saveDayEntry);

    // Copy Prev Day
    document.getElementById('btn-copy-prev').addEventListener('click', copyPreviousDay);

    // Bulk Mode
    els.btnSelectMode.addEventListener('click', toggleSelectMode);
    els.btnBulkCancel.addEventListener('click', toggleSelectMode);
    els.btnBulkDone.addEventListener('click', () => applyBulkAction(true));
    els.btnBulkUndone.addEventListener('click', () => applyBulkAction(false));

    // Sharing
    els.btnShare.addEventListener('click', openShareModal);
    els.formShareAdd.addEventListener('submit', inviteUser);
}

// ... (other code)

async function copyPreviousDay() {
    if (!currentEditingDate || !state.currentCalendar) return;

    const curr = new Date(currentEditingDate);
    curr.setDate(curr.getDate() - 1);

    // Clamp
    if (curr.getFullYear() !== state.year) {
        alert("No hay día anterior en este año.");
        return;
    }

    const prevDateStr = formatDate(curr);
    const prevEntry = state.daysCache.get(prevDateStr);

    if (!prevEntry) {
        alert("El día anterior no tiene datos.");
        return;
    }

    // Apply to UI
    els.dayCheckPrimary.checked = prevEntry.primary_done;
    els.dayNote.value = prevEntry.note || '';

    // Markers
    const markerEls = els.dayMarkersContainer.querySelectorAll('.marker-toggle');
    state.markers.forEach((m, idx) => {
        const isActive = prevEntry.markers && prevEntry.markers[m.key];
        const el = markerEls[idx];
        if (isActive) el.classList.add('active');
        else el.classList.remove('active');
    });
}

// *** AUTH ***
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        state.user = session.user;
        hide(els.authContainer);
        show(els.appContainer);
        await initApp();
    }
}

async function handleAuth(email, password, type) {
    let result;
    if (type === 'signup') {
        result = await supabaseClient.auth.signUp({ email, password });
    } else {
        result = await supabaseClient.auth.signInWithPassword({ email, password });
    }

    if (result.error) {
        alert("Error: " + result.error.message);
    } else {
        checkSession();
    }
}

// *** DATA LOADING ***
async function initApp() {
    // 1. Load Calendars (Owned + Shared)
    const userEmail = state.user.email;

    // A. Fetch Owned
    const { data: owned, error: errorOwned } = await supabaseClient
        .from('calendars')
        .select('*')
        .eq('user_id', state.user.id);

    if (errorOwned) return console.error("Error loading owned calendars:", errorOwned);

    // B. Fetch Shared (via email)
    // First get the IDs from calendar_shares
    const { data: shares, error: errorShares } = await supabaseClient
        .from('calendar_shares')
        .select('calendar_id')
        .eq('shared_with_email', userEmail);

    let sharedCalendars = [];
    if (!errorShares && shares && shares.length > 0) {
        const calendarIds = shares.map(s => s.calendar_id);
        // Then fetch the actual calendars
        const { data: shared, error: errorSharedDetails } = await supabaseClient
            .from('calendars')
            .select('*')
            .in('id', calendarIds);

        if (!errorSharedDetails && shared) {
            sharedCalendars = shared;
        }
    }

    // Combine and Sort
    // We can add a flag or property to indicate it's shared if we want, 
    // but the UI currently checks (user_id !== state.user.id) which works fine.
    state.calendars = [...(owned || []), ...sharedCalendars];
    // Sort by creation date
    state.calendars.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    renderCalendarSelect();

    if (state.calendars.length > 0) {

        await loadCalendar(state.calendars[0].id);
    } else {
        // Prompt to create one or create a default one
        // For UX, maybe just show new calendar modal if none exist
        els.calendarSelect.innerHTML = '<option>Crea un calendario</option>';
        show(els.modalCalendar);
    }
}

async function loadCalendar(calendarId) {
    if (!calendarId) return;
    state.currentCalendar = state.calendars.find(c => c.id === calendarId);
    state.daysCache.clear();

    // Update select value in case called programmatically
    els.calendarSelect.value = calendarId;

    // Load Markers
    const { data: markers } = await supabaseClient
        .from('calendar_markers')
        .select('*')
        .eq('calendar_id', calendarId)
        .order('sort_order');
    state.markers = markers || [];

    // Load Entries (All for 2026)
    const { data: entries } = await supabaseClient
        .from('day_entries')
        .select('*')
        .eq('calendar_id', calendarId)
        .gte('date', `${state.year}-01-01`)
        .lte('date', `${state.year}-12-31`);

    if (entries) {
        entries.forEach(entry => state.daysCache.set(entry.date, entry));
    }

    renderCalendarGrid();
}

// *** RENDERING CALENDAR ***
function renderCalendarSelect() {
    els.calendarSelect.innerHTML = state.calendars
        .map(c => {
            const isShared = c.user_id !== state.user.id;
            const displayName = isShared ? `🔗 ${c.name}` : c.name;
            return `<option value="${c.id}">${displayName}</option>`;
        })
        .join('');
}

function renderCalendarGrid() {
    els.calendarGrid.innerHTML = '';
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    months.forEach((monthName, index) => {
        const monthCard = document.createElement('div');
        monthCard.className = 'month-card';

        const grid = document.createElement('div');
        grid.className = 'days-grid';

        // Weekday Headers
        const weekdays = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
        weekdays.forEach(d => {
            const el = document.createElement('div');
            el.className = 'weekday-label';
            el.textContent = d;
            grid.appendChild(el);
        });

        // Days
        const date = new Date(state.year, index, 1);
        const daysInMonth = new Date(state.year, index + 1, 0).getDate();
        const startDay = date.getDay(); // 0 = Sunday

        // Empty cells before start
        for (let i = 0; i < startDay; i++) {
            grid.appendChild(document.createElement('div'));
        }

        // Day cells
        for (let d = 1; d <= daysInMonth; d++) {
            const dayDateString = `${state.year}-${String(index + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const entry = state.daysCache.get(dayDateString);

            const cell = document.createElement('div');
            cell.className = 'day-cell';
            cell.textContent = d;
            cell.dataset.date = dayDateString;

            if (entry && entry.primary_done) {
                cell.style.backgroundColor = state.currentCalendar.primary_on_color;
                // Check contrast for text color? Defaulting to inherit.
            } else {
                cell.style.backgroundColor = state.currentCalendar.primary_off_color;
            }

            // Render markers
            const markersDiv = document.createElement('div');
            markersDiv.className = 'day-markers';
            if (entry && entry.markers) {
                let symbols = '';
                state.markers.forEach(m => {
                    if (entry.markers[m.key]) symbols += m.symbol;
                });
                markersDiv.textContent = symbols;
            }
            cell.appendChild(markersDiv);

            // Mobile Long Press Logic
            let touchTimer = null;
            let hasLongPressed = false;

            cell.addEventListener('touchstart', () => {
                hasLongPressed = false;
                touchTimer = setTimeout(() => {
                    hasLongPressed = true;
                    openDayModal(dayDateString);
                    if (navigator.vibrate) navigator.vibrate(50);
                }, 500);
            }, { passive: true });

            cell.addEventListener('touchend', () => {
                if (touchTimer) clearTimeout(touchTimer);
            });

            cell.addEventListener('touchmove', () => {
                if (touchTimer) clearTimeout(touchTimer);
            }, { passive: true });

            cell.addEventListener('click', (e) => {
                if (hasLongPressed) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    hasLongPressed = false;
                } else {
                    handleDayClick(e, dayDateString);
                }
            });

            if (state.selectedDate === dayDateString) {
                cell.classList.add('selected');
            }

            grid.appendChild(cell);
        }

        const title = document.createElement('div');
        title.className = 'month-title';
        title.textContent = monthName;

        monthCard.appendChild(title);
        monthCard.appendChild(grid);
        els.calendarGrid.appendChild(monthCard);
    });
}


// *** SHARING LOGIC ***

async function openShareModal() {
    if (!state.currentCalendar) return;

    // Validar si soy el dueño (o si la política permite ver shares)
    // En este diseño simplificado, asumimos que si puedo ver el calendario, intento cargar shares.
    // La RLS filtrará si no soy dueño.

    show(els.modalShare);
    renderSharesList();
}

async function renderSharesList() {
    els.sharesList.innerHTML = '<p class="text-muted">Cargando...</p>';

    const { data: shares, error } = await supabaseClient
        .from('calendar_shares')
        .select('*')
        .eq('calendar_id', state.currentCalendar.id);

    if (error) {
        // Probablemente no soy dueño
        els.sharesList.innerHTML = '<p class="text-sm">Solo el propietario puede gestionar accesos.</p>';
        return;
    }

    if (!shares || shares.length === 0) {
        els.sharesList.innerHTML = '<p class="text-muted text-sm">Este calendario es privado.</p>';
        return;
    }

    els.sharesList.innerHTML = shares.map(s => `
        <div class="share-item">
            <span>${s.shared_with_email}</span>
            <button class="btn btn-ghost btn-sm" style="color:red;" onclick="revokeAccess('${s.id}')">Eliminar</button>
        </div>
    `).join('');
}

async function inviteUser(e) {
    e.preventDefault();
    const email = document.getElementById('share-email').value;

    if (!email || !state.currentCalendar) return;

    const { data, error } = await supabaseClient.from('calendar_shares').insert({
        calendar_id: state.currentCalendar.id,
        shared_with_email: email
    }).select();

    if (error) {
        alert("Error al invitar: " + error.message);
    } else {
        document.getElementById('share-email').value = '';
        renderSharesList();
    }
}

window.revokeAccess = async (shareId) => {
    if (!confirm("¿Quitar acceso a este usuario?")) return;

    const { error } = await supabaseClient.from('calendar_shares').delete().eq('id', shareId);
    if (!error) {
        renderSharesList();
    } else {
        alert("Error al eliminar acceso.");
    }
}

// *** LOGIC: CREATE CALENDAR ***
async function createCalendar(e) {
    e.preventDefault();
    const name = document.getElementById('cal-name').value;
    const label = document.getElementById('cal-label').value;
    const colorOn = document.getElementById('cal-color-on').value;
    const colorOff = document.getElementById('cal-color-off').value;

    // New fields
    const goalMonthly = parseInt(document.getElementById('cal-goal-monthly').value) || 0;
    const goalAnnual = parseInt(document.getElementById('cal-goal-annual').value) || 0;

    const { data, error } = await supabaseClient.from('calendars').insert({
        user_id: state.user.id,
        name,
        primary_label: label,
        primary_on_color: colorOn,
        primary_off_color: colorOff,
        monthly_goal: goalMonthly,
        annual_goal: goalAnnual
    }).select().single();

    if (error) {
        alert("Error creando calendario");
        return;
    }

    state.calendars.push(data);
    renderCalendarSelect();
    await loadCalendar(data.id);
    closeModal(els.modalCalendar);
}

// *** LOGIC: MARKERS ***
async function createMarker(e) {
    e.preventDefault();
    if (!state.currentCalendar) return;

    const label = document.getElementById('marker-label').value;
    const symbol = document.getElementById('marker-symbol').value;
    const key = `m_${Date.now()}`; // Simple unique key

    const { data, error } = await supabaseClient.from('calendar_markers').insert({
        calendar_id: state.currentCalendar.id,
        key,
        label,
        symbol
    }).select().single();

    if (error) {
        alert("Error creando marcador");
        return;
    }

    state.markers.push(data);
    renderMarkersList();
    document.getElementById('marker-label').value = '';
    document.getElementById('marker-symbol').value = '';
    // Refresh calendar view to update days if needed (unlikely for new marker but safe)
    renderCalendarGrid();
}

function renderMarkersList() {
    els.markersList.innerHTML = state.markers.map(m => `
        <div class="marker-item">
            <span>${m.symbol} ${m.label}</span>
            <button class="btn btn-ghost btn-sm" onclick="deleteMarker('${m.id}')">🗑</button>
        </div>
    `).join('');
}

window.deleteMarker = async (id) => {
    if (!confirm("¿Eliminar marcador?")) return;
    const { error } = await supabaseClient.from('calendar_markers').delete().eq('id', id);
    if (!error) {
        state.markers = state.markers.filter(m => m.id !== id);
        renderMarkersList();
        renderCalendarGrid();
    }
};

// *** INTERACTION LOGIC ***

async function handleDayClick(e, dateString) {
    if (state.isSelectMode) {
        handleBulkSelection(e, dateString);
        return;
    }

    // Select for keyboard nav
    selectDate(dateString);

    if (e.shiftKey) {
        // Shift+Click: Toggle first marker (or specific logic)
        await toggleDayMarkerOptimistic(dateString);
    } else {
        // Normal Click: Toggle Primary
        await toggleDayPrimaryOptimistic(dateString);
    }
}

function handleBulkSelection(e, dateString) {
    if (e.shiftKey && state.selectedDate) {
        // Range select from last clicked (stored in selectedDate for convenience)
        const start = new Date(state.selectedDate);
        const end = new Date(dateString);

        // Normalize range
        const startDate = start < end ? start : end;
        const endDate = start < end ? end : start;

        const current = new Date(startDate);
        while (current <= endDate) {
            state.selectedDates.add(formatDate(current));
            current.setDate(current.getDate() + 1);
        }
    } else {
        // Toggle single
        if (state.selectedDates.has(dateString)) {
            state.selectedDates.delete(dateString);
        } else {
            state.selectedDates.add(dateString);
        }
        // Update "cursor" for shift-click
        state.selectedDate = dateString;
    }

    updateBulkVisuals();
}

function updateBulkVisuals() {
    els.bulkCount.textContent = `${state.selectedDates.size} seleccionados`;

    // Update visuals
    document.querySelectorAll('.day-cell').forEach(cell => {
        if (state.selectedDates.has(cell.dataset.date)) {
            cell.classList.add('multi-selected');
        } else {
            cell.classList.remove('multi-selected');
        }
    });

    if (state.selectedDates.size > 0) show(els.bulkToolbar);
    // Note: we might want toolbar visible always when in mode, or only when selected. 
    // Requirement said "load by range: select 'from 10 to 15'".
}

function toggleSelectMode() {
    state.isSelectMode = !state.isSelectMode;
    state.selectedDates.clear();
    updateBulkVisuals();

    if (state.isSelectMode) {
        els.btnSelectMode.classList.add('btn-primary');
        els.btnSelectMode.classList.remove('btn-outline');
        show(els.bulkToolbar);
    } else {
        els.btnSelectMode.classList.remove('btn-primary');
        els.btnSelectMode.classList.add('btn-outline');
        hide(els.bulkToolbar);
        state.selectedDate = null; // Clear cursor
        document.querySelectorAll('.day-cell.selected').forEach(el => el.classList.remove('selected'));
    }
}

async function applyBulkAction(isDone) {
    if (!state.selectedDates.size || !state.currentCalendar) return;

    const updates = [];
    const entriesToUpdate = [];

    // Optimistic
    state.selectedDates.forEach(date => {
        const entry = state.daysCache.get(date) || { calendar_id: state.currentCalendar.id, date: date, primary_done: false, markers: {}, note: '' };
        entry.primary_done = isDone;
        state.daysCache.set(date, entry);
        updateDayVisual(date, entry);

        updates.push({
            calendar_id: state.currentCalendar.id,
            date: date,
            primary_done: isDone,
            markers: entry.markers, // Keep existing markers
            note: entry.note
        });
    });

    // Batch Network Request
    const { error } = await supabaseClient
        .from('day_entries')
        .upsert(updates, { onConflict: 'calendar_id, date' });

    if (error) {
        alert("Error en actualización masiva");
        console.error(error);
        // Should revert optimistic updates here in a real app
    }

    // Exit selection mode after action? Or toggle off selection?
    // Usually keep selection or clear it. Let's clear selection.
    state.selectedDates.clear();
    updateBulkVisuals();
}

function selectDate(dateString) {
    const prevSelected = document.querySelector(`.day-cell[data-date="${state.selectedDate}"]`);
    if (prevSelected) prevSelected.classList.remove('selected');

    state.selectedDate = dateString;
    const newSelected = document.querySelector(`.day-cell[data-date="${dateString}"]`);
    if (newSelected) {
        newSelected.classList.add('selected');
        // Ensure visible if needed (scrolling)
        if (!isElementInViewport(newSelected)) {
            newSelected.scrollIntoView({ block: 'nearest' });
        }
    }
}

function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Keyboard Listeners
document.addEventListener('keydown', async (e) => {
    if (state.selectedDate && !els.modalDay.classList.contains('hidden')) return; // Ignore if modal open (except maybe Escape)
    if (!state.selectedDate && !state.currentCalendar) return;

    if (!state.selectedDate && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // Auto select first day if nothing selected
        selectDate(`${state.year}-01-01`);
        return;
    }

    switch (e.key) {
        case 'ArrowRight': navigateDate(1); break;
        case 'ArrowLeft': navigateDate(-1); break;
        case 'ArrowDown': navigateDate(7); break;
        case 'ArrowUp': navigateDate(-7); break;
        case ' ': // Space
        case 'Enter':
            e.preventDefault();
            await toggleDayPrimaryOptimistic(state.selectedDate);
            break;
        case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
            const index = parseInt(e.key) - 1;
            if (state.markers[index]) {
                await toggleDayMarkerOptimistic(state.selectedDate, state.markers[index].key);
            }
            break;
    }
});

function navigateDate(offset) {
    const currentDate = new Date(state.selectedDate);
    currentDate.setDate(currentDate.getDate() + offset);

    // Clamp to 2026
    if (currentDate.getFullYear() !== state.year) return;

    selectDate(formatDate(currentDate));
}


// *** LOGIC: DAY ENTRY (Optimistic) ***

async function toggleDayPrimaryOptimistic(dateString) {
    const entry = state.daysCache.get(dateString) || { calendar_id: state.currentCalendar.id, date: dateString, primary_done: false, markers: {}, note: '' };
    const newValue = !entry.primary_done;

    // 1. Optimistic Update
    entry.primary_done = newValue;
    state.daysCache.set(dateString, entry);
    updateDayVisual(dateString, entry); // Only update specific cell

    // 2. Network Request
    const { error } = await supabaseClient
        .from('day_entries')
        .upsert(entry, { onConflict: 'calendar_id, date' });

    if (error) {
        console.error("Sync error", error);
        // Revert on error? For now assuming success or alert
        entry.primary_done = !newValue;
        updateDayVisual(dateString, entry);
        alert("Error al guardar estado");
    }
}

async function toggleDayMarkerOptimistic(dateString, markerKey = null) {
    if (!state.markers.length) return;

    // Default to first marker if not key provided (Shift+Click)
    const targetKey = markerKey || state.markers[0].key;

    const entry = state.daysCache.get(dateString) || { calendar_id: state.currentCalendar.id, date: dateString, primary_done: false, markers: {}, note: '' };
    if (!entry.markers) entry.markers = {};

    const newValue = !entry.markers[targetKey];

    // 1. Optimistic
    entry.markers[targetKey] = newValue;
    state.daysCache.set(dateString, entry);
    updateDayVisual(dateString, entry);

    // 2. Network
    const { error } = await supabaseClient
        .from('day_entries')
        .upsert(entry, { onConflict: 'calendar_id, date' });

    if (error) {
        entry.markers[targetKey] = !newValue;
        updateDayVisual(dateString, entry);
        alert("Error al guardar marcador");
    }
}

function updateDayVisual(dateString, entry) {
    const cell = document.querySelector(`.day-cell[data-date="${dateString}"]`);
    if (!cell) return;

    if (entry.primary_done) {
        cell.style.backgroundColor = state.currentCalendar.primary_on_color;
    } else {
        cell.style.backgroundColor = state.currentCalendar.primary_off_color;
    }

    const markersDiv = cell.querySelector('.day-markers');
    if (markersDiv) {
        let symbols = '';
        state.markers.forEach(m => {
            if (entry.markers && entry.markers[m.key]) symbols += m.symbol;
        });
        markersDiv.textContent = symbols;
    }
}

// Double click to open modal
document.getElementById('calendar-grid').addEventListener('dblclick', (e) => {
    const cell = e.target.closest('.day-cell');
    if (cell) {
        openDayModal(cell.dataset.date);
    }
});

let currentEditingDate = null;

function openDayModal(dateString) {
    currentEditingDate = dateString;
    els.dayTitle.textContent = new Date(dateString).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const entry = state.daysCache.get(dateString) || { primary_done: false, markers: {}, note: '' };

    // Set UI
    els.dayCheckPrimary.checked = entry.primary_done;
    els.dayPrimaryLabel.textContent = state.currentCalendar.primary_label;
    els.dayNote.value = entry.note || '';

    // Render Markers Toggles
    els.dayMarkersContainer.innerHTML = state.markers.map(m => {
        const isActive = entry.markers && entry.markers[m.key];
        return `
            <div class="marker-toggle ${isActive ? 'active' : ''}" onclick="toggleMarkerUI(this, '${m.key}')">
                <span>${m.symbol}</span> <span>${m.label}</span>
            </div>
        `;
    }).join('');

    show(els.modalDay);
}

window.toggleMarkerUI = (el, key) => {
    el.classList.toggle('active');
};

async function saveDayEntry() {
    if (!currentEditingDate || !state.currentCalendar) return;

    const primaryDone = els.dayCheckPrimary.checked;
    const note = els.dayNote.value;

    // Collect markers
    const markersState = {};
    const markerEls = els.dayMarkersContainer.querySelectorAll('.marker-toggle');
    state.markers.forEach((m, idx) => {
        if (markerEls[idx].classList.contains('active')) {
            markersState[m.key] = true;
        }
    });

    const entryData = {
        calendar_id: state.currentCalendar.id,
        date: currentEditingDate,
        primary_done: primaryDone,
        markers: markersState,
        note: note
    };

    const { data, error } = await supabaseClient
        .from('day_entries')
        .upsert(entryData, { onConflict: 'calendar_id, date' })
        .select()
        .single();

    if (error) {
        alert("Error guardando día");
        console.error(error);
        return;
    }

    state.daysCache.set(currentEditingDate, data);
    renderCalendarGrid();
    closeModal(els.modalDay);
}

// *** LOGIC: STATS ***
function updateStatsView() {
    if (!state.currentCalendar) return;

    const entries = Array.from(state.daysCache.values());
    const totalDays = calculateDaysPassed(); // implement logic up to today
    const doneEntries = entries.filter(e => e.primary_done);
    const totalDone = doneEntries.length;

    els.statTotalDone.textContent = totalDone;
    els.statPercentage.textContent = totalDays > 0 ? Math.round((totalDone / totalDays) * 100) + '%' : '0%';

    // Streak
    els.statStreak.textContent = calculateStreak();

    // Chart
    renderStatsChart(doneEntries);

    // Marker Stats
    renderMarkerStats(entries);

    // Advanced Stats
    updateAdvancedStats(entries, doneEntries);
}

function updateAdvancedStats(entries, doneEntries) {
    if (!state.currentCalendar) return;

    // 1. Max Streak & Best Month
    const { maxStreak, bestMonth, bestMonthValue } = calculateExtendedStats(entries);
    els.statMaxStreak.textContent = maxStreak;
    els.statBestMonth.textContent = bestMonth ? `${bestMonth} (${bestMonthValue})` : '-';

    // 2. Best Weekday
    const weekdayCounts = new Array(7).fill(0); // 0=Sun, 6=Sat
    doneEntries.forEach(e => {
        const d = new Date(e.date);
        weekdayCounts[d.getDay()]++;
    });
    const maxDayVal = Math.max(...weekdayCounts);
    const bestDayIdx = weekdayCounts.indexOf(maxDayVal);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    els.statBestDay.textContent = maxDayVal > 0 ? days[bestDayIdx] : '-';

    renderWeekdayChart(weekdayCounts, maxDayVal);

    // 3. Goals
    renderGoals(doneEntries.length);

    // 4. Trend (Monthly Avg)
    renderTrendChart(doneEntries);
}

function calculateExtendedStats(entries) {
    // Sort logic handled by cache keys mostly, but let's ensure order
    const sortedDates = Array.from(state.daysCache.keys()).sort();

    let currentStreak = 0;
    let maxStreak = 0;

    // We need to iterate over all possible days to break streak correctly?
    // Simplified: Iterate known "done" entries if contiguous? No, gaps matter.
    // Iterating full range of days from first entry?
    // Costly? 365 iterations is cheap.

    const start = new Date(state.year, 0, 1);
    const end = new Date(); // Up to today for Max Streak calculation logic?
    // Or Max streak ever in the year? Let's do entire year if future allowed, or up to today.
    // Let's assume up to today for "record".

    const endCalc = end.getFullYear() === state.year ? end : new Date(state.year, 11, 31);

    let tempStreak = 0;
    const monthCounts = new Array(12).fill(0);

    for (let d = new Date(start); d <= endCalc; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d);
        const entry = state.daysCache.get(dateStr);
        const isDone = entry && entry.primary_done;

        if (isDone) {
            tempStreak++;
            monthCounts[d.getMonth()]++;
        } else {
            if (tempStreak > maxStreak) maxStreak = tempStreak;
            tempStreak = 0;
        }
    }
    // Check last streak
    if (tempStreak > maxStreak) maxStreak = tempStreak;

    // Best Month
    const maxMonthVal = Math.max(...monthCounts);
    const bestMonthIdx = monthCounts.indexOf(maxMonthVal);
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    return {
        maxStreak,
        bestMonth: maxMonthVal > 0 ? monthNames[bestMonthIdx] : null,
        bestMonthValue: maxMonthVal
    };
}

function renderGoals(totalDone) {
    const goals = [];

    // Annual Goal
    if (state.currentCalendar.annual_goal > 0) {
        goals.push({
            label: 'Meta Anual',
            current: totalDone,
            target: state.currentCalendar.annual_goal
        });
    }

    // Monthly Goal (Current Month)
    const currentMonth = new Date().getMonth();
    if (state.currentCalendar.monthly_goal > 0) {
        const doneThisMonth = Array.from(state.daysCache.values())
            .filter(e => e.primary_done && new Date(e.date).getMonth() === currentMonth)
            .length;

        goals.push({
            label: 'Meta Mensual (Este mes)',
            current: doneThisMonth,
            target: state.currentCalendar.monthly_goal
        });
    }

    if (!goals.length) {
        els.goalsContainer.innerHTML = '<p class="text-muted">Sin objetivos definidos.</p>';
        return;
    }

    els.goalsContainer.innerHTML = goals.map(g => {
        const pct = Math.min(100, Math.round((g.current / g.target) * 100));
        return `
            <div class="goal-row">
                <div class="goal-header">
                    <span>${g.label}</span>
                    <span>${g.current} / ${g.target}</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderWeekdayChart(counts, maxVal) {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    els.statWeekdayChart.innerHTML = counts.map((count, idx) => {
        // Avoid div by zero
        const height = maxVal > 0 ? (count / maxVal) * 100 : 0;
        return `
            <div class="weekday-col">
                <div class="weekday-bar" style="height: ${height}%;" title="${count} veces"></div>
                <span class="weekday-name">${days[idx]}</span>
            </div>
        `;
    }).join('');
}

function renderTrendChart(doneEntries) {
    // Show last 3 months trend compared to average?
    // Or just simple monthly bars again? The user asked for "evolution (up/down)".
    // Let's repurpose the trend chart to show Monthly Average vs Global Average?
    // OR: Weekly averages for the last 4 weeks.

    // Let's do simple: Textual trend for now "Trending Up/Down" based on last month vs this month.

    const currentMonth = new Date().getMonth();
    const doneThisMonth = doneEntries.filter(e => new Date(e.date).getMonth() === currentMonth).length;

    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const donePrevMonth = doneEntries.filter(e => new Date(e.date).getMonth() === prevMonth).length;

    let trendHtml = '';
    const diff = doneThisMonth - donePrevMonth;

    if (diff > 0) trendHtml = `<span style="color:var(--primary)">📈 +${diff} vs mes anterior</span>`;
    else if (diff < 0) trendHtml = `<span style="color:#ef4444">📉 ${diff} vs mes anterior</span>`;
    else trendHtml = `<span class="text-muted">➡ Igual que mes anterior</span>`;

    els.statTrendChart.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; width:100%; justify-content:center;">
             <p style="font-size:1.5rem; font-weight:bold;">${doneThisMonth}</p>
             <p class="text-muted">Este mes</p>
             <div style="margin-top:0.5rem">${trendHtml}</div>
        </div>
    `;
}

function calculateDaysPassed() {
    const start = new Date(state.year, 0, 1);
    const now = new Date();
    const end = now.getFullYear() === state.year ? now : new Date(state.year, 11, 31);

    if (now.getFullYear() < state.year) return 0; // Not started

    const diff = end - start;
    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

function calculateStreak() {
    const today = new Date();
    if (today.getFullYear() !== state.year) return 0; // Only calc relevant streak

    let streak = 0;
    // Iterate backwards from today
    // Note: simple implementation, strictly consecutive days
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = formatDate(d);
        const entry = state.daysCache.get(dateStr);

        if (entry && entry.primary_done) {
            streak++;
        } else {
            // Allow skipping today if checking mid-day and not done yet? 
            // Simplified: if yesterday was done, and today isn't, streak is still valid until broken?
            // Strict version: break immediately.
            if (i === 0) continue; // If today is not done, check yesterday
            break;
        }
    }
    return streak;
}

function renderStatsChart(doneEntries) {
    // 12 bars for months
    const monthlyCounts = new Array(12).fill(0);
    doneEntries.forEach(e => {
        const month = parseInt(e.date.split('-')[1]) - 1;
        if (month >= 0 && month < 12) monthlyCounts[month]++;
    });

    els.statChart.innerHTML = monthlyCounts.map((count, idx) => {
        const daysInMonth = new Date(state.year, idx + 1, 0).getDate();
        const heightPct = Math.round((count / daysInMonth) * 100);
        const monthName = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][idx];
        return `<div class="chart-bar" style="height: ${heightPct}%;" title="${monthName}: ${count}"></div>`;
    }).join('');
}

function renderMarkerStats(entries) {
    if (!state.markers.length) {
        els.statMarkersGrid.innerHTML = '<p class="text-muted col-span-full">No hay marcadores definidos.</p>';
        return;
    }

    // Count occurrences
    const counts = {};
    state.markers.forEach(m => counts[m.key] = 0);

    entries.forEach(e => {
        if (e.markers) {
            Object.keys(e.markers).forEach(key => {
                if (e.markers[key] && counts.hasOwnProperty(key)) {
                    counts[key]++;
                }
            });
        }
    });

    els.statMarkersGrid.innerHTML = state.markers.map(m => {
        return `
            <div class="marker-stat-item">
                <span class="marker-stat-symbol">${m.symbol}</span>
                <span class="marker-stat-count">${counts[m.key]}</span>
                <span class="marker-stat-label">${m.label}</span>
            </div>
        `;
    }).join('');
}


// Start
init();
