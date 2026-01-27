
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
    selectedDates: new Set(), // For bulk selection

    // WOW Features State
    specialDays: new Map(), // dateStr -> type
    comparisonCalendar: null,
    comparisonEntries: new Map(), // dateStr -> entry

    // PRO State
    syncStatus: 'idle', // idle, syncing, offline
    pendingChanges: [] // Queue for retry (simplified)
};

const syncManager = {
    setStatus: (status) => {
        state.syncStatus = status;
        const el = document.getElementById('sync-status');
        if (status === 'syncing') el.textContent = '🔄 Guardando...';
        else if (status === 'offline') el.textContent = '⚠️ Offline';
        else el.textContent = '☁️ Al día';
    },
    saveToLocal: () => {
        if (!state.currentCalendar) return;
        const data = {
            entries: Array.from(state.daysCache.entries()),
            markers: state.markers,
            timestamp: Date.now()
        };
        localStorage.setItem(`cal_${state.currentCalendar.id}_${state.year}`, JSON.stringify(data));
    },
    loadFromLocal: (calendarId) => {
        const key = `cal_${calendarId}_${state.year}`;
        const raw = localStorage.getItem(key);
        if (raw) {
            const data = JSON.parse(raw);
            state.daysCache = new Map(data.entries);
            // state.markers = data.markers; // Assume markers don't change often or fetched anyway
            return true;
        }
        return false;
    }
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
    modalNotifications: document.getElementById('modal-notifications'),
    notificationsList: document.getElementById('notifications-list'),
    btnNotifications: document.getElementById('btn-notifications'),
    notificationBadge: document.getElementById('notification-badge'),

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
        stats: document.getElementById('view-stats'),
        lists: document.getElementById('view-lists')
    },

    // Lists DOM
    listsGrid: document.getElementById('lists-grid'),
    modalCollection: document.getElementById('modal-collection'),
    formCollection: document.getElementById('form-collection'),
    modalItem: document.getElementById('modal-item'),
    formItem: document.getElementById('form-item'),
    btnAddDayItem: document.getElementById('btn-add-day-item'),
    dayItemsList: document.getElementById('day-items-list')
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
        // Default to login if submitter is undefined (e.g. Enter key)
        const submitterId = e.submitter ? e.submitter.id : 'btn-login';
        const type = submitterId === 'btn-signup' ? 'signup' : 'login';
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
            // Check if view exists first (to avoid errors if dashboard is partial)
            const targetView = document.getElementById(`view-${tab.dataset.tab}`);
            if (!targetView) return;

            els.tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Hide all views manually or via helper
            document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
            targetView.classList.remove('hidden');

            if (tab.dataset.tab === 'stats') {
                updateStatsView();
                setupCrossStats();
            }
            if (tab.dataset.tab === 'lists') {
                loadCollections();
            }
            if (tab.dataset.tab === 'dashboard') {
                renderDashboard();
            }
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

    // Notifications
    els.btnNotifications.addEventListener('click', () => {
        renderNotifications();
        show(els.modalNotifications);
    });

    // WOW Features
    document.getElementById('btn-compare-mode').addEventListener('click', openCompareModal);
    document.getElementById('btn-clear-compare').addEventListener('click', clearComparison);
    document.getElementById('stats-filter-month').addEventListener('change', updateStatsView);

    // Pro Features (Year)
    document.getElementById('year-select').addEventListener('change', async (e) => {
        state.year = parseInt(e.target.value);
        if (state.currentCalendar) {
            await loadCalendar(state.currentCalendar.id);
        }
        await loadCollections(); // Reload lists for new year
    });

    // Lists
    document.getElementById('btn-new-collection').addEventListener('click', () => {
        els.formCollection.reset();
        show(els.modalCollection);
    });
    els.formCollection.addEventListener('submit', createCollection);
    els.formItem.addEventListener('submit', createItem);
    els.btnAddDayItem.addEventListener('click', openAddItemFromDay);
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

    // B. Fetch Shared (via email) AND Accepted
    // First get the IDs from calendar_shares
    const { data: shares, error: errorShares } = await supabaseClient
        .from('calendar_shares')
        .select('calendar_id, status')
        .eq('shared_with_email', userEmail)
        .eq('status', 'accepted'); // Only accepted

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

    // Check Notifications (Pending Shares)
    await checkNotifications();
    await loadSpecialDays();

    if (state.calendars.length > 0) {
        // Load initial views in parallel
        const p1 = loadCalendar(state.calendars[0].id);
        const p2 = renderDashboard();
        await Promise.all([p1, p2]);
    } else {
        // Prompt to create one or create a default one
        // For UX, maybe just show new calendar modal if none exist
        els.calendarSelect.innerHTML = '<option>Crea un calendario</option>';
        show(els.modalCalendar);
        renderDashboard();
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

    // Try Local Cache First
    const hasLocal = syncManager.loadFromLocal(calendarId);
    if (hasLocal) {
        renderCalendarGrid();
        updateStatsView(); // Immediate render
    }

    // Load Entries (All for selected year)
    syncManager.setStatus('syncing');
    const { data: entries, error } = await supabaseClient
        .from('day_entries')
        .select('*')
        .eq('calendar_id', calendarId)
        .gte('date', `${state.year}-01-01`)
        .lte('date', `${state.year}-12-31`);

    syncManager.setStatus(error ? 'offline' : 'idle');

    if (entries) {
        entries.forEach(entry => state.daysCache.set(entry.date, entry));
        syncManager.saveToLocal(); // Update cache with fresh server data
    }

    renderCalendarGrid();
    updateStatsView();
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

            // WOW: Comparison Visuals
            const compEntry = state.comparisonEntries.get(dayDateString);
            if (compEntry && compEntry.primary_done) {
                cell.classList.add('compare-hit');
            }

            // WOW: Special Days Visuals
            if (state.specialDays.has(dayDateString)) {
                const type = state.specialDays.get(dayDateString);
                cell.classList.add(`special-${type}`);

                const emojiMap = { 'viaje': '✈️', 'enfermo': '🤒', 'feriado': '🎉', 'cumple': '🎂', 'evento': '📅' };
                const tag = document.createElement('span');
                tag.className = 'special-tag';
                tag.textContent = emojiMap[type] || '★';
                cell.appendChild(tag);
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
        owner_id: state.user.id, // Explicitly send owner ID
        shared_with_email: email,
        status: 'pending' // Default status
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

// *** DASHBOARD LOGIC ***
// *** DASHBOARD LOGIC ***
async function renderDashboard() {
    const grid = document.getElementById('dashboard-grid');
    grid.innerHTML = '<p class="text-muted">Actualizando dashboard...</p>';

    // Use cached calendars from state
    const calendars = state.calendars;

    if (!calendars || calendars.length === 0) {
        grid.innerHTML = '<p>No tienes hábitos creados. Crea uno nuevo.</p>';
        return;
    }

    const today = new Date();
    const dateStr = formatDate(today);

    // 1. Calculate History Range (Last 14 days for stats)
    // We fetch a bit more than just today to calculate streaks and show mini-chart
    const startHistory = new Date(today);
    startHistory.setDate(today.getDate() - 14);
    const startStr = formatDate(startHistory);

    // 2. Fetch Data in Parallel
    // A: Markers for all these calendars
    const pMarkers = supabaseClient
        .from('calendar_markers')
        .select('*')
        .in('calendar_id', calendars.map(c => c.id))
        .order('sort_order');

    // B: Entries for last 14 days (includes today)
    const pEntries = supabaseClient
        .from('day_entries')
        .select('*')
        .gte('date', startStr)
        .lte('date', dateStr)
        .in('calendar_id', calendars.map(c => c.id));

    const [resMarkers, resEntries] = await Promise.all([pMarkers, pEntries]);

    if (resEntries.error || resMarkers.error) {
        console.error("Dashboard Error", resEntries.error || resMarkers.error);
        grid.innerHTML = '<p style="color:red">Error cargando dashboard.</p>';
        return;
    }

    const allMarkers = resMarkers.data || [];
    const allEntries = resEntries.data || [];

    // 3. Process Data
    const calendarMarkers = new Map(); // calId -> [markers]
    allMarkers.forEach(m => {
        if (!calendarMarkers.has(m.calendar_id)) calendarMarkers.set(m.calendar_id, []);
        calendarMarkers.get(m.calendar_id).push(m);
    });

    const calendarEntries = new Map(); // calId -> { dateStr: entry }
    allEntries.forEach(e => {
        if (!calendarEntries.has(e.calendar_id)) calendarEntries.set(e.calendar_id, {});
        calendarEntries.get(e.calendar_id)[e.date] = e;
    });

    // 4. Render
    grid.innerHTML = '';

    calendars.forEach(cal => {
        const entriesMap = calendarEntries.get(cal.id) || {};
        const markers = calendarMarkers.get(cal.id) || [];

        // Today's Status
        const todayEntry = entriesMap[dateStr] || {};
        const isDone = !!todayEntry.primary_done;

        // Calculate Streak (Simplified based on recent cache)
        // For accurate streak we might need more history, but let's use what we fetched + logic
        // or just calculate "Last 7 days" completion. 
        // Real Streak requires fetching backwards until break. 
        // Let's show "Weekly Consurency" (days in last 7) to be safe/fast,
        // OR calculate simple streak from the 14 days buffer.
        let localStreak = 0;
        if (isDone) localStreak = 1;
        // Check days before
        for (let i = 1; i < 14; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dStr = formatDate(d);
            if (entriesMap[dStr] && entriesMap[dStr].primary_done) {
                localStreak++;
            } else {
                // If yesterday (i=1) is missing, streak is 0?
                // If today is NOT done, check if yesterday IS done to show "current streak".
                if (i === 1 && !isDone) localStreak = 0; // Reset if today incomplete? No, commonly show previous streak until broken.
                // Re-logic:
                // If today is done: streak includes today + contiguous past.
                // If today is NOT done: streak is contiguous past up to yesterday.
                if (!isDone && i === 1) {
                    if (entriesMap[dStr] && entriesMap[dStr].primary_done) localStreak = 1;
                    else break;
                } else if (!isDone && i > 1) {
                    // continuing past streak
                    if (localStreak > 0) localStreak++;
                    else break;
                } else if (isDone) {
                    // normal
                }

                // Keep it simple: Continuous days ending today or yesterday.
                // (This logic is complex to inline, let's just count days in last 7 for visual appeal "x/7")
                break;
            }
        }

        // Mini Chart (Last 7 days)
        let weekDotsHtml = '<div class="week-dots" style="display:flex; gap:4px; margin-top:8px;">';
        const dotsDate = new Date(today);
        dotsDate.setDate(today.getDate() - 6); // Start 6 days ago
        for (let i = 0; i < 7; i++) {
            const dStr = formatDate(dotsDate);
            const done = entriesMap[dStr] && entriesMap[dStr].primary_done;
            const isToday = dStr === dateStr;
            const color = done ? (cal.primary_on_color || '#4ade80') : '#e5e7eb';
            const border = isToday ? '2px solid #666' : 'none';

            weekDotsHtml += `<div title="${dStr}" style="width:10px; height:10px; border-radius:50%; background:${color}; border:${border};"></div>`;
            dotsDate.setDate(dotsDate.getDate() + 1);
        }
        weekDotsHtml += '</div>';

        // Markers HTML
        let markersHtml = '';
        if (markers.length > 0) {
            markersHtml = '<div class="dashboard-markers" style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">';
            markers.forEach(m => {
                const isActive = todayEntry.markers && todayEntry.markers[m.key];
                const activeStyle = isActive ? `background:${cal.primary_on_color}; border-color:${cal.primary_on_color}; color:white;` : '';
                markersHtml += `
                    <button class="btn-xs marker-btn" 
                        style="border:1px solid #ccc; border-radius:12px; padding:2px 8px; font-size:0.8rem; cursor:pointer; background:white; ${activeStyle}"
                        onclick="toggleDashboardMarker('${cal.id}', '${dateStr}', '${m.key}')">
                        ${m.symbol} ${m.label}
                    </button>
                `;
            });
            markersHtml += '</div>';
        }

        const card = document.createElement('div');
        card.className = `dashboard-card ${isDone ? 'done' : ''}`;

        // Inline CSS for improved styling
        card.style.padding = '1rem';
        card.style.borderRadius = '12px';
        card.style.background = isDone ? '#f0fdf4' : 'white';
        card.style.border = '1px solid ' + (isDone ? '#bbf7d0' : '#e5e7eb');
        card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
        card.style.marginBottom = '1rem';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <h3 style="margin:0; font-size:1.1rem; color:#1f2937;">${cal.name}</h3>
                    <p class="text-xs text-muted" style="margin:0;">${cal.primary_label || 'Hábito'}</p>
                </div>
                <div style="text-align:right;">
                    <span class="text-xs text-muted" style="font-weight:600;">🔥 Racha?</span>
                    <div style="font-size:1.2rem; font-weight:bold; color:#f59e0b; line-height:1;">
                        ${localStreak} <span style="font-size:0.8rem;">días</span>
                    </div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem;">
                <!-- Main Check -->
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:500;">
                    <input type="checkbox" style="width:1.2rem; height:1.2rem;" 
                        ${isDone ? 'checked' : ''} 
                        onchange="toggleDashboardHabit('${cal.id}', '${dateStr}', this.checked)">
                    <span>${isDone ? '¡Completado!' : 'Marcar hoy'}</span>
                </label>
                
                <!-- Weekly Dots -->
                ${weekDotsHtml}
            </div>

            <!-- Markers -->
             ${markersHtml}
        `;
        grid.appendChild(card);
    });

    const titleEl = document.getElementById('dashboard-date-title');
    if (titleEl) titleEl.textContent = today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

window.toggleDashboardMarker = async (calId, dateStr, markerKey) => {
    // 1. Fetch current (or use cache/optimistic) - Let's use cache-first optimistic
    // Note: We don't have easy access to state.daysCache entry for specific marker in dashboard view 
    // without refreshing. Let's do a quick fetch-modify-save.

    // Optimistic UI: toggle class visually immediately? 
    // Hard to target generic button. Let's reload dashboard after short delay or just fetch.

    const { data: current, error } = await supabaseClient
        .from('day_entries')
        .select('*')
        .eq('calendar_id', calId)
        .eq('date', dateStr)
        .single();

    let entry = current;
    if (!entry) {
        // Create if doesn't exist
        entry = { calendar_id: calId, date: dateStr, primary_done: false, markers: {} };
    }
    if (!entry.markers) entry.markers = {};

    // Toggle
    const newVal = !entry.markers[markerKey];
    entry.markers[markerKey] = newVal;

    // Save
    const { error: saveError } = await supabaseClient
        .from('day_entries')
        .upsert(entry);

    if (!saveError) {
        renderDashboard(); // Re-render to show state
    }
};

window.toggleDashboardHabit = async (calId, dateStr, isChecked) => {
    const { error } = await supabaseClient
        .from('day_entries')
        .upsert({
            calendar_id: calId,
            date: dateStr,
            primary_done: isChecked
        }, { onConflict: 'calendar_id, date' });

    if (error) {
        console.error('Error toggling dashboard', error);
        alert('Error al actualizar');
    } else {
        renderDashboard();
        // Sync cache if needed
        if (state.currentCalendar && state.currentCalendar.id === calId) {
            // Invalidate or update cache? 
            // Simplest is to let loadCalendar handle it when switching views
        }
    }
};

// *** NOTIFICATIONS LOGIC ***
async function checkNotifications() {
    const { count, error } = await supabaseClient
        .from('calendar_shares')
        .select('*', { count: 'exact', head: true })
        .eq('shared_with_email', state.user.email)
        .eq('status', 'pending');

    if (!error && count > 0) {
        els.notificationBadge.classList.remove('hidden');
    } else {
        els.notificationBadge.classList.add('hidden');
    }
}

async function renderNotifications() {
    els.notificationsList.innerHTML = '<p class="text-muted">Cargando...</p>';

    // Get pending shares with calendar details
    // We need to fetch shares first, then calendar names manually since we don't have join setup easily in JS client without foreign key hint sometimes, 
    // but assuming RLS allows seeing the calendar if invited? 
    // Actually, usually you can't see the calendar name if you haven't accepted? 
    // Let's assume for this "pending" state we might need a join or just fetch `calendars` table where id is in shares.

    const { data: shares, error } = await supabaseClient
        .from('calendar_shares')
        .select('*')
        .eq('shared_with_email', state.user.email)
        .eq('status', 'pending');

    if (error || !shares || shares.length === 0) {
        els.notificationsList.innerHTML = '<p class="text-muted text-sm">No tienes invitaciones pendientes.</p>';
        return;
    }

    // Fetch calendar names
    const calendarIds = shares.map(s => s.calendar_id);
    const { data: calendars } = await supabaseClient
        .from('calendars')
        .select('id, name, user_id') // We might want to show who invited (owner) logic is slightly complex if owner not stored in share, but we can get it from calendar
        .in('id', calendarIds);

    const calendarMap = new Map();
    if (calendars) calendars.forEach(c => calendarMap.set(c.id, c));

    els.notificationsList.innerHTML = shares.map(s => {
        const cal = calendarMap.get(s.calendar_id);
        const name = cal ? cal.name : 'Calendario desconocido';
        return `
        <div class="notification-item">
            <div class="notification-info">
                <p>Invitación a <strong>${name}</strong></p>
                <span class="small">Te han invitado a colaborar</span>
            </div>
            <div class="notification-actions">
                <button class="btn btn-sm btn-primary" onclick="respondToShare('${s.id}', 'accept')">✅</button>
                <button class="btn btn-sm btn-ghost" style="color:red;" onclick="respondToShare('${s.id}', 'reject')">❌</button>
            </div>
        </div>
        `;
    }).join('');
}

window.respondToShare = async (shareId, action) => {
    if (action === 'accept') {
        const { error } = await supabaseClient
            .from('calendar_shares')
            .update({ status: 'accepted' })
            .eq('id', shareId);

        if (!error) {
            checkNotifications();
            renderNotifications(); // Refresh list
            // Reload app/calendars to show the new one
            await initApp();
            // Better UX: Show toast?
            closeModal(els.modalNotifications);
            alert("¡Calendario agregado exitosamente!");
        } else {
            alert("Error al aceptar.");
        }
    } else {
        if (!confirm("¿Rechazar invitación?")) return;
        const { error } = await supabaseClient
            .from('calendar_shares')
            .delete() // Rejecting = deleting the invite
            .eq('id', shareId);

        if (!error) {
            checkNotifications();
            renderNotifications();
        } else {
            alert("Error al rechazar.");
        }
    }
};

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
    const group = document.getElementById('marker-group').value || null;
    const key = `m_${Date.now()}`;

    const { data, error } = await supabaseClient.from('calendar_markers').insert({
        calendar_id: state.currentCalendar.id,
        key,
        label,
        symbol,
        group_name: group
    }).select().single();

    if (error) {
        alert("Error creando marcador");
        return;
    }

    state.markers.push(data);
    renderMarkersList();
    document.getElementById('marker-label').value = '';
    document.getElementById('marker-symbol').value = '';
    document.getElementById('marker-group').value = '';
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
    const targetMarkerDef = state.markers.find(m => m.key === targetKey);

    const entry = state.daysCache.get(dateString) || { calendar_id: state.currentCalendar.id, date: dateString, primary_done: false, markers: {}, note: '' };
    if (!entry.markers) entry.markers = {};

    const newValue = !entry.markers[targetKey];

    // Exclusive Logic (Group)
    if (newValue && targetMarkerDef && targetMarkerDef.group_name) {
        // Disable other markers in same group
        state.markers.forEach(m => {
            if (m.group_name === targetMarkerDef.group_name && m.key !== targetKey) {
                entry.markers[m.key] = false;
            }
        });
    }

    // 1. Optimistic
    entry.markers[targetKey] = newValue;
    state.daysCache.set(dateString, entry);
    updateDayVisual(dateString, entry);
    syncManager.saveToLocal(); // PRO: Update Local
    syncManager.setStatus('syncing');

    // 2. Network
    const { error } = await supabaseClient
        .from('day_entries')
        .upsert(entry, { onConflict: 'calendar_id, date' });

    if (error) {
        syncManager.setStatus('offline');
        // entry.markers[targetKey] = !newValue; // Revert optional
        // updateDayVisual(dateString, entry);
        // alert("Error al guardar marcador");
    } else {
        syncManager.setStatus('idle');
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
    const [y, m, d] = dateString.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d); // Create as Local Time
    els.dayTitle.textContent = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const entry = state.daysCache.get(dateString) || { primary_done: false, markers: {}, note: '' };

    // Set UI
    els.dayCheckPrimary.checked = entry.primary_done;
    els.dayPrimaryLabel.textContent = state.currentCalendar.primary_label;
    els.dayNote.value = entry.note || '';

    // WOW: Special Day
    document.getElementById('day-special-type').value = state.specialDays.get(dateString) || '';

    // Lists: Render Day Items
    renderDayItems(dateString);

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

    // WOW: Save Special Day
    const specialType = document.getElementById('day-special-type').value;
    await saveSpecialDayLogic(currentEditingDate, specialType);

    renderCalendarGrid();
    closeModal(els.modalDay);
}

// *** LOGIC: STATS ***
function updateStatsView() {
    if (!state.currentCalendar) return;

    let entries = Array.from(state.daysCache.values());
    const filterVal = document.getElementById('stats-filter-month').value;

    // Filter by Month if selected
    if (filterVal !== 'all') {
        const month = parseInt(filterVal);
        entries = entries.filter(e => new Date(e.date).getMonth() === month);
        // Note: This filters keys for calculation.
        // For Heatmap, we might want to show whole year still? Or zoom?
        // Let's keep heatmap as year view for now, effectively only stats numbers change.
    }

    // Adjust "Total Potential Days" based on filter
    const totalDays = calculateDaysPassed(filterVal);
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

    // Heatmap
    renderHeatmap(entries);

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
    const ctx = document.getElementById('chart-weekday');
    if (chartWeekday) chartWeekday.destroy();

    chartWeekday = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
            datasets: [{
                label: 'Frecuencia',
                data: counts,
                backgroundColor: 'rgba(16, 185, 129, 0.6)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { display: false } }
        }
    });
}

function renderTrendChart(doneEntries) {
    // Calculate Monthly Totals for Trend Line
    const monthlyCounts = new Array(12).fill(0);
    doneEntries.forEach(e => {
        const month = parseInt(e.date.split('-')[1]) - 1;
        if (month >= 0 && month < 12) monthlyCounts[month]++;
    });

    const ctx = document.getElementById('chart-trend');
    if (chartTrend) chartTrend.destroy();

    // Filter out future months for cleaner look? or show all
    const currentMonth = new Date().getMonth();
    const dataToShow = monthlyCounts.slice(0, currentMonth + 1);
    const labelsToShow = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].slice(0, currentMonth + 1);

    chartTrend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsToShow,
            datasets: [{
                label: 'Tendencia',
                data: dataToShow,
                borderColor: '#8b5cf6',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(139, 92, 246, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function calculateDaysPassed(filterVal = 'all') {
    const start = new Date(state.year, 0, 1);
    const now = new Date();
    // If future year
    if (now.getFullYear() < state.year) return 0;

    let endCalc = now.getFullYear() === state.year ? now : new Date(state.year, 11, 31);
    let startCalc = start;

    if (filterVal !== 'all') {
        const month = parseInt(filterVal);
        // Start of that month
        startCalc = new Date(state.year, month, 1);
        // End of that month
        const endOfMonth = new Date(state.year, month + 1, 0);

        // If month is in future relative to now?
        // If current month, end at today used?
        // Let's cap at today if in current year.
        if (state.year === now.getFullYear()) {
            if (month > now.getMonth()) return 0; // Future month
            if (month === now.getMonth()) endCalc = now;
            else endCalc = endOfMonth;
        } else {
            endCalc = endOfMonth;
        }
    }

    const diff = endCalc - startCalc;
    if (diff < 0) return 0;
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

// *** STATS: Chart.js Implementations ***
let chartMonthly = null;
let chartWeekday = null;
let chartTrend = null;

function renderStatsChart(doneEntries) {
    const monthlyCounts = new Array(12).fill(0);
    doneEntries.forEach(e => {
        const month = parseInt(e.date.split('-')[1]) - 1;
        if (month >= 0 && month < 12) monthlyCounts[month]++;
    });

    const ctx = document.getElementById('chart-monthly');
    if (chartMonthly) chartMonthly.destroy();

    chartMonthly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
            datasets: [{
                label: 'Días Cumplidos',
                data: monthlyCounts,
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                hoverBackgroundColor: 'rgba(59, 130, 246, 1)',
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 31,
                    grid: { color: '#f3f4f6' },
                    ticks: { color: '#9ca3af' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#f9fafb',
                    bodyColor: '#f9fafb',
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false
                }
            }
        }
    });
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

function renderHeatmap(entries) {
    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';

    // Determine year range
    const start = new Date(state.year, 0, 1);
    const end = new Date(state.year, 11, 31);

    // Map date -> level
    const dataMap = new Map();
    entries.forEach(e => {
        if (e.primary_done) dataMap.set(e.date, 4);
    });

    // We iterate all days
    // Logic: Fill columns text-top-to-bottom (weekdays).
    // So we assume the grid flows column-wise.
    // We need to pad the start if Jan 1 is not Sunday.
    const startDay = start.getDay();
    for (let i = 0; i < startDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'heatmap-cell';
        empty.style.backgroundColor = 'transparent';
        grid.appendChild(empty);
    }

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d);
        const level = dataMap.get(dateStr) || 0;

        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.dataset.date = dateStr;
        if (level > 0) cell.dataset.level = level;

        const datePretty = d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
        cell.title = `${datePretty}: ${level > 0 ? 'Cumplido' : 'No realizado'}`;

        grid.appendChild(cell);
    }
}



// *** WOW FEATURES ***

async function loadSpecialDays() {
    state.specialDays.clear();
    const { data, error } = await supabaseClient
        .from('special_days')
        .select('*')
        .eq('user_id', state.user.id)
        .gte('date', `${state.year}-01-01`)
        .lte('date', `${state.year}-12-31`);

    if (data) {
        data.forEach(d => state.specialDays.set(d.date, d.type));
    }
}

async function saveSpecialDayLogic(date, type) {
    if (!state.user) return;

    if (!type) {
        // Delete if exists
        await supabaseClient.from('special_days').delete().eq('user_id', state.user.id).eq('date', date);
        state.specialDays.delete(date);
    } else {
        // Upsert
        const { error } = await supabaseClient.from('special_days').upsert({
            user_id: state.user.id,
            date: date,
            type: type
        }, { onConflict: 'user_id, date' });

        if (!error) state.specialDays.set(date, type);
    }
}

// Comparison
function openCompareModal() {
    show(document.getElementById('modal-compare'));
    const list = document.getElementById('compare-list');
    list.innerHTML = state.calendars
        .filter(c => c.id !== state.currentCalendar.id)
        .map(c => `
            <div class="share-item" onclick="setComparison('${c.id}')" style="cursor:pointer; padding: 1rem; hover:bg-gray-100;">
                <span>${c.name}</span>
                <span class="btn btn-sm btn-outline">Elegir</span>
            </div>
        `).join('') || '<p class="text-muted">No hay otros calendarios para comparar.</p>';
}

async function setComparison(calendarId) {
    state.comparisonCalendar = state.calendars.find(c => c.id === calendarId);
    state.comparisonEntries.clear();

    // Fetch entries
    const { data: entries } = await supabaseClient
        .from('day_entries')
        .select('*')
        .eq('calendar_id', calendarId)
        .gte('date', `${state.year}-01-01`)
        .lte('date', `${state.year}-12-31`);

    if (entries) {
        entries.forEach(e => state.comparisonEntries.set(e.date, e));
    }

    closeModal(document.getElementById('modal-compare'));
    document.getElementById('legend-secondary').classList.remove('hidden');
    document.getElementById('calendar-legend').classList.remove('hidden');
    renderCalendarGrid();
}

function clearComparison() {
    state.comparisonCalendar = null;
    state.comparisonEntries.clear();
    document.getElementById('calendar-legend').classList.add('hidden');
    renderCalendarGrid();
    closeModal(document.getElementById('modal-compare'));
}

// Analytics Cross
async function setupCrossStats() {
    const s1 = document.getElementById('stats-cross-source');
    const s2 = document.getElementById('stats-cross-target');

    const opts = state.calendars.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    s1.innerHTML = opts;
    s2.innerHTML = opts;

    // Select different defaults if possible
    if (state.calendars.length > 1) {
        s2.value = state.calendars[1].id;
    }

    calculateCrossAnalytics();

    s1.onchange = calculateCrossAnalytics;
    s2.onchange = calculateCrossAnalytics;
}

async function calculateCrossAnalytics() {
    const idA = document.getElementById('stats-cross-source').value;
    const idB = document.getElementById('stats-cross-target').value;
    const resultEl = document.getElementById('cross-stats-result');

    if (idA === idB) {
        resultEl.innerHTML = '<p class="text-muted">Elige calendarios distintos</p>';
        return;
    }

    // Need data for both. 
    // Optimization: check if we have them in cache or fetch.
    // For simplicity, fetch fresh or assume current logic.
    // Ideally we should cache all calendar data or fetch on demand.

    const [entriesA, entriesB] = await Promise.all([
        fetchEntriesForAnalysis(idA),
        fetchEntriesForAnalysis(idB)
    ]);

    // Logic: P(B|A)
    // Count(A done)
    // Count(A done AND B done)

    let countA = 0;
    let countBoth = 0;

    const setA = new Set(entriesA.filter(e => e.primary_done).map(e => e.date));
    const setB = new Set(entriesB.filter(e => e.primary_done).map(e => e.date)); // Optimization

    setA.forEach(date => {
        countA++;
        if (setB.has(date)) countBoth++;
    });

    if (countA === 0) {
        resultEl.innerHTML = '<p class="text-muted">Sin datos suficientes en ' + (state.calendars.find(c => c.id == idA)?.name) + '</p>';
        return;
    }

    const percent = Math.round((countBoth / countA) * 100);
    resultEl.innerHTML = `
        <div style="margin-top:0.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <span style="font-size: 2rem; font-weight: bold; color: var(--primary);">${percent}%</span>
                <span class="text-sm text-muted">(${countBoth}/${countA})</span>
            </div>
            <div class="progress-bar-bg" style="height: 8px; margin-top: 4px;">
                <div class="progress-bar-fill" style="width: ${percent}%"></div>
            </div>
        </div>
    `;
}

async function fetchEntriesForAnalysis(calId) {
    if (state.currentCalendar && state.currentCalendar.id === calId) {
        return Array.from(state.daysCache.values());
    }
    // Fetch
    const { data } = await supabaseClient
        .from('day_entries')
        .select('date, primary_done')
        .eq('calendar_id', calId)
        .gte('date', `${state.year}-01-01`)
        .lte('date', `${state.year}-12-31`);
    return data || [];
}


// *** LISTS & COLLECTIONS ***

let collections = []; // Cache for collections [ {id, name, items: []} ]

async function loadCollections() {
    if (!state.user) return;

    // 1. Fetch Collections
    const { data: cols, error } = await supabaseClient
        .from('collections')
        .select('*')
        .eq('user_id', state.user.id);

    if (error) return console.error("Error loading collections", error);

    // 2. Fetch Items (for this year?) - Let's fetch all for simplicity or filter by year in UI
    const { data: items, error: errorItems } = await supabaseClient
        .from('collection_items')
        .select('*')
        .gte('completed_date', `${state.year}-01-01`)
        .lte('completed_date', `${state.year}-12-31`)
        .order('completed_date', { ascending: false });

    // Map items to collections
    collections = cols.map(c => ({
        ...c,
        items: items ? items.filter(i => i.collection_id === c.id) : []
    }));

    renderListsView();
}

function renderListsView() {
    els.listsGrid.innerHTML = collections.map(c => `
        <div class="stat-card" style="align-items: flex-start;">
            <div style="display:flex; justify-content:space-between; width:100%;">
                <h3 style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-size:1.5rem;">${c.icon || '📝'}</span> 
                    ${c.name}
                </h3>
                <span class="badge" style="background: var(--bg-body);">${c.items.length}</span>
            </div>
            
            <div class="items-preview" style="width:100%; margin-top:1rem; max-height: 200px; overflow-y: auto;">
                ${c.items.length === 0 ? '<p class="text-muted text-sm">Sin elementos este año.</p>' :
            c.items.map(i => `
                    <div style="padding: 0.5rem; border-bottom: 1px solid var(--border); font-size: 0.9rem;">
                        <strong>${i.title}</strong>
                        <div style="display:flex; justify-content:space-between; color: var(--text-muted); font-size: 0.8rem;">
                            <span>${i.completed_date}</span>
                            <span>${i.rating ? '⭐'.repeat(i.rating) : ''}</span>
                        </div>
                    </div>
                  `).join('')}
            </div>
            <button class="btn btn-sm btn-outline full-width" style="margin-top:auto;" onclick="openItemModal('${c.id}')">+ Agregar</button>
        </div>
    `).join('');
}

async function createCollection(e) {
    e.preventDefault();
    const name = document.getElementById('col-name').value;
    const icon = document.getElementById('col-icon').value;

    const { error } = await supabaseClient.from('collections').insert({
        user_id: state.user.id,
        name,
        icon,
        color: '#3b82f6'
    });

    if (!error) {
        closeModal(els.modalCollection);
        loadCollections();
    }
}

async function createItem(e) {
    e.preventDefault();
    const collection_id = document.getElementById('item-collection-id').value;
    const title = document.getElementById('item-title').value;
    const date = document.getElementById('item-date').value;
    const rating = document.getElementById('item-rating').value || null;

    const { error } = await supabaseClient.from('collection_items').insert({
        collection_id,
        title,
        completed_date: date,
        rating: rating ? parseInt(rating) : null
    });

    if (!error) {
        closeModal(els.modalItem);
        // If date matches current viewed day, refresh day modal?
        // Refetch everything for now
        await loadCollections();
        // If we are in the day modal context, refresh that list too
        if (!els.modalDay.classList.contains('hidden')) {
            renderDayItems(date); // Not perfect if date changed, but ok
        }
    }
}

// Helpers
window.openItemModal = (colId) => {
    document.getElementById('item-collection-id').value = colId;
    document.getElementById('item-date').value = formatDate(new Date()); // Today default
    show(els.modalItem);
};

// Day Modal Integration
function renderDayItems(dateStr) {
    const container = els.dayItemsList;
    if (!collections.length) {
        container.innerHTML = '<p class="text-muted">Crea una colección primero (Pestaña Listas)</p>';
        return;
    }

    // Find items for this date
    let dayItems = [];
    collections.forEach(c => {
        c.items.forEach(i => {
            if (i.completed_date === dateStr) {
                dayItems.push({ ...i, colName: c.name, colIcon: c.icon });
            }
        });
    });

    if (dayItems.length === 0) {
        container.innerHTML = '<p class="text-muted">Nada registrado.</p>';
    } else {
        container.innerHTML = dayItems.map(i => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.25rem 0; border-bottom: 1px dashed var(--border);">
                <span>${i.colIcon} ${i.title}</span>
                <span class="text-sm">${i.rating ? '⭐' + i.rating : ''}</span>
            </div>
        `).join('');
    }
}

function openAddItemFromDay() {
    // Show a small popup to choose collection first? Or just default to first?
    if (collections.length === 0) return alert("Crea una colección primero");

    // For simplicity, just pick first or standard behavior
    // Better: Helper modal to pick collection? 
    // Let's reuse modal-item but we need to select collection.
    // Hack: Add collection select to modal-item if opened from here? 
    // Plan: Just open a prompt or simple choice if multiple.

    if (collections.length === 1) {
        openItemModal(collections[0].id);
        document.getElementById('item-date').value = currentEditingDate;
    } else {
        // Simple prompt for now or auto-select first
        // Ideally show a mini-menu. 
        // Let's just default to first for MVP.
        openItemModal(collections[0].id);
        document.getElementById('item-date').value = currentEditingDate;
    }
}

// Start Application
window.addEventListener('DOMContentLoaded', init);
