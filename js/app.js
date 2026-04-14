// ============================================================
// MAIN APPLICATION
// ============================================================

// ─── Boot ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  renderNav();
  renderHeroStats();
  refreshApp();
});

// Called on boot and whenever auth state changes
async function refreshApp() {
  const container = document.getElementById('daysContainer');
  if (!container) return;

  if (!currentUser) {
    renderAuthGate();
    return;
  }

  // Logged in — show the itinerary
  try { await loadEventOverrides(); } catch (e) { console.warn('Overrides unavailable:', e); }
  renderAllDays();
  updateAuthUI(); // call AFTER render so edit buttons exist in the DOM
  renderReservationBanner();
  setupScrollSpy();
  setupStickyDayHeader();
  autoScrollToToday();

  // Lazy-load comments for visible days
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const dayId = e.target.dataset.dayId;
        if (dayId) loadCommentsForDay(dayId);
      }
    });
  }, { rootMargin: '200px' });

  document.querySelectorAll('.day-section').forEach(el => observer.observe(el));
}

// ─── Auth gate ─────────────────────────────────────────────
function renderAuthGate() {
  const container = document.getElementById('daysContainer');
  container.innerHTML = `
    <div class="auth-gate">
      <div class="auth-gate-inner">
        <div class="auth-gate-icon">🌲</div>
        <h2 class="auth-gate-title">Welcome to Kim's Family Trip</h2>
        <p class="auth-gate-subtitle">Enter a nickname to view the itinerary, leave comments, and make suggestions. No email or password needed.</p>
        <div class="auth-gate-input-row">
          <input type="text" id="gateNicknameInput" placeholder="Your name or nickname…" autocomplete="off" maxlength="30">
          <button class="auth-gate-btn primary" onclick="saveNicknameFromGate()">Let's go 🌲</button>
        </div>
        <p class="auth-gate-note">For Kim's family and friends 🤍</p>
      </div>
    </div>`;

  // Focus the input and allow Enter key
  setTimeout(() => {
    const input = document.getElementById('gateNicknameInput');
    input?.focus();
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') saveNicknameFromGate(); });
  }, 50);
}

// ─── Navigation ────────────────────────────────────────────
function renderNav() {
  const container = document.getElementById('navDays');
  container.innerHTML = ITINERARY.map((day, i) => `
    <button class="nav-day-btn" onclick="scrollToDay('${day.id}')" id="nav-btn-${day.id}">
      <span class="nav-day-emoji">${day.emoji}</span>
      <span class="nav-day-label">Apr ${day.date.split('-')[2]}</span>
    </button>`).join('');
}

function renderHeroStats() {
  let totalEvents = 0;
  ITINERARY.forEach(d => {
    totalEvents += d.events.filter(e => e.coords || e.category === 'restaurant' || e.category === 'activity' || e.category === 'shopping').length;
  });
  const statEl = document.getElementById('heroStopCount');
  if (statEl) statEl.textContent = totalEvents + '+';
}

// ─── Day rendering ─────────────────────────────────────────
function renderAllDays() {
  const container = document.getElementById('daysContainer');
  container.innerHTML = ITINERARY.map(day => renderDay(day)).join('');

  // Initialize maps after DOM is ready
  requestAnimationFrame(() => {
    ITINERARY.forEach(day => {
      day.events.forEach(event => {
        if (event.coords) {
          initMiniMap(event.id, event.coords.lat, event.coords.lng, event.title);
        }
      });
      initDayOverviewMap(day);
    });
  });
}

function renderDay(day) {
  const eventsHtml = day.events.map((event, idx) => renderEvent(event, day, idx)).join('');
  const dateNum = day.date.split('-')[2];

  return `
    <section class="day-section" id="${day.id}" data-day-id="${day.id}">
      <div class="day-header" style="--day-grad-from:${day.gradientFrom};--day-grad-to:${day.gradientTo};">
        <div class="day-header-inner">
          <div class="day-number-badge">${day.emoji} Day ${day.dayNumber}</div>
          <h2 class="day-title">${day.title}</h2>
          <p class="day-subtitle">${day.subtitle}</p>
          <div class="day-meta">
            <span class="day-meta-pill">📅 ${day.dayName}, April ${dateNum}</span>
            <span class="day-meta-pill">🌡️ ${day.weather}</span>
            <span class="day-meta-pill">📍 ${day.area}</span>
          </div>
          ${day.transport ? `<div class="day-transport">🚊 ${day.transport}</div>` : ''}
        </div>
        <div class="day-overview-map" id="map-overview-${day.id}"></div>
      </div>

      <div class="day-timeline">
        ${eventsHtml}
      </div>
    </section>`;
}

function renderEvent(event, day, idx) {
  // Apply any saved overrides
  const override = eventOverrides[event.id] || {};
  const e = { ...event, ...override };

  const catInfo    = CATEGORY_ICONS[e.category] || { icon: '📍', label: '' };
  const hasMap     = !!e.coords;
  const isLast     = idx === day.events.length - 1;

  const commuteHtml = renderCommute(e, day);
  const reservationHtml = e.reservation
    ? `<div class="event-reservation">
         <span class="res-badge">🔖 Reservation Recommended</span>
         ${e.reservationNote ? `<span class="res-note">${escapeHtml(e.reservationNote)}</span>` : ''}
         ${e.reservationLink ? `<a href="${e.reservationLink}" target="_blank" class="res-link">Book Now ↗</a>` : ''}
       </div>` : '';

  const splitGroupHtml = e.splitGroup
    ? `<div class="split-badge ${e.splitGroup === 'sylvia-jennifer' ? 'sisters-badge' : 'couple-badge'}">
         ${e.splitGroup === 'sylvia-jennifer' ? '🎌 Sylvia & Jennifer' : '🌿 Kim · Mom · Kyle'}
       </div>` : '';

  const costHtml = e.cost
    ? `<span class="event-pill cost-pill">💰 ${escapeHtml(e.cost)}</span>` : '';
  const durationHtml = e.duration
    ? `<span class="event-pill dur-pill">⏱ ${escapeHtml(e.duration)}</span>` : '';

  const altNoteHtml = e.altNote
    ? `<div class="event-alt-note">ℹ️ ${escapeHtml(e.altNote)}</div>` : '';

  // Photo banner
  const imageSrc = getEventImageSrc(e.image);
  const photoHtml = imageSrc
    ? `<div class="event-photo-wrap">
         <img class="event-photo" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(e.title)}" loading="lazy" onerror="this.parentElement.style.display='none'">
       </div>` : '';

  // Google search link for the stop title
  const searchQuery = e.address
    ? encodeURIComponent(e.title + ' ' + e.address)
    : encodeURIComponent(e.title + ' Seattle');
  const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`;

  return `
    <div class="timeline-item ${isLast ? 'last-item' : ''}" id="event-${e.id}">
      <div class="timeline-left">
        <div class="timeline-time">${formatTime(e.time)}</div>
        <div class="timeline-dot" style="background:${day.accentColor};">
          <span class="timeline-dot-icon">${catInfo.icon}</span>
        </div>
        ${!isLast ? '<div class="timeline-line"></div>' : ''}
      </div>

      <div class="event-card" data-event-id="${e.id}">
        ${photoHtml}
        ${splitGroupHtml}
        <div class="event-content-grid">
          <div class="event-main-content">
            <div class="event-card-header">
              <div class="event-title-row">
                <h3 class="event-title" id="title-${e.id}" data-field="title" data-event="${e.id}" data-day="${day.id}">
                  <a class="event-title-link" href="${googleSearchUrl}" target="_blank" rel="noopener">${escapeHtml(e.title)}</a>
                </h3>
                <div class="event-actions">
                  <button class="action-btn history-btn edit-btn" onclick="openHistoryModal('${e.id}', '${escapeHtml(e.title).replace(/'/g,"\\'")}', '${day.id}')" title="Edit History" style="display:none;">
                    🕐
                  </button>
                  <button class="action-btn edit-btn" onclick="toggleEditMode('${e.id}', '${day.id}')" title="Edit this stop" style="display:none;">
                    ✏️
                  </button>
                </div>
              </div>

              ${e.address ? `
              <a class="event-address" href="${makeGoogleMapsLink(e.coords)}" target="_blank">
                📍 ${escapeHtml(e.address)}
              </a>` : ''}
            </div>

            <p class="event-description" id="desc-${e.id}" data-field="description" data-event="${e.id}" data-day="${day.id}">${escapeHtml(e.description)}</p>

            ${altNoteHtml}

            <div class="event-pills">
              ${durationHtml}
              ${costHtml}
            </div>

            ${reservationHtml}
            ${commuteHtml}

            ${hasMap ? `<div class="event-map-toggle">
              <button class="map-toggle-btn" onclick="toggleMap('${e.id}')">🗺️ Show on Map</button>
              <div class="event-map-container" id="map-${e.id}" style="display:none;"></div>
            </div>` : ''}
          </div>

          <!-- Side comments (Word-like margin comments) -->
          <aside class="event-comments-rail" id="inline-comments-${e.id}">
            <button class="comment-toggle-btn side" onclick="toggleComments('${e.id}', '${day.id}', '${escapeHtml(e.title).replace(/'/g,"\\'")}')">
              <span class="comment-toggle-icon">💬</span>
              <span class="comment-toggle-text">Comments</span>
              <span class="comment-count-badge" id="comment-badge-${e.id}" style="display:none;"></span>
              <span class="comment-toggle-arrow" id="comment-arrow-${e.id}">▴</span>
            </button>
            <div class="comments-body side" id="comments-body-${e.id}" style="display:block;">
              <div class="comments-list" id="comments-list-${e.id}"></div>
              <div class="comment-form" id="comment-form-${e.id}"></div>
            </div>
          </aside>
        </div>
      </div>
    </div>

    <!-- Edit Panel (hidden by default) -->
    <div class="edit-panel" id="edit-panel-${e.id}" style="display:none;" data-day="${day.id}">
      <div class="edit-panel-inner">
        <h4>Edit this stop</h4>
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="edit-title-${e.id}" value="${escapeHtml(e.title)}">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="edit-desc-${e.id}" rows="3">${escapeHtml(e.description)}</textarea>
        </div>
        <div class="form-group">
          <label>Image URL</label>
          <input type="text" id="edit-image-${e.id}" value="${escapeHtml(e.image || '')}" placeholder="https://...">
        </div>
        <div class="form-group">
          <label>Address</label>
          <div class="address-autocomplete-wrap">
            <input type="text" id="edit-address-${e.id}" value="${escapeHtml(e.address || '')}"
                   placeholder="Type address or place name…"
                   autocomplete="off"
                   oninput="onAddressInput('${e.id}', this.value)">
            <div class="address-suggestions" id="addr-suggestions-${e.id}"></div>
          </div>
        </div>
        <div id="edit-map-${e.id}" class="edit-mini-map" style="display:none;"></div>
        <div class="edit-row">
          <div class="form-group">
            <label>Time</label>
            <input type="text" id="edit-time-${e.id}" value="${e.time || ''}" placeholder="e.g. 14:30">
          </div>
          <div class="form-group">
            <label>Cost</label>
            <input type="text" id="edit-cost-${e.id}" value="${e.cost || ''}">
          </div>
        </div>
        ${commuteHtml ? `<div class="edit-commute-preview">${commuteHtml}</div>` : ''}
        <div class="edit-actions">
          <button class="btn-save" onclick="saveEdit('${e.id}', '${day.id}')">Save Changes</button>
          <button class="btn-cancel" onclick="toggleEditMode('${e.id}', '${day.id}')">Cancel</button>
        </div>
      </div>
    </div>`;
}

// ─── Commute display ───────────────────────────────────────
function renderCommute(event, day) {
  if (!event.commute) return '';
  const { mode, minutes, note } = event.commute;
  const modeInfo = TRAVEL_MODE_ICONS[mode] || TRAVEL_MODE_ICONS.drive;

  // Build Google Maps link between previous event and this one
  let mapsHref = '#';
  if (event.coords) {
    mapsHref = makeDirectionLink(event.commute, event, day);
  }

  // Real-time traffic hint
  const rtLabel = isOnTripDate(day.date) ? '🔴 Live Traffic' : 'View Route';

  return `
    <div class="commute-bar">
      <span class="commute-icon">${modeInfo.icon}</span>
      <span class="commute-text">${escapeHtml(note || '')}</span>
      ${minutes ? `<span class="commute-est">~${minutes} min estimated</span>` : ''}
      ${event.coords ? `<a href="${mapsHref}" target="_blank" class="commute-maps-link">${rtLabel} ↗</a>` : ''}
    </div>`;
}

function isOnTripDate(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  return today === dateStr;
}

function makeGoogleMapsLink(coords) {
  if (!coords) return '#';
  return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
}

function makeDirectionLink(commute, event, day) {
  if (!event.coords) return '#';
  const mode = commute.mode === 'transit' ? 'transit'
             : commute.mode === 'walk'    ? 'walking'
             : 'driving';

  // Find previous event with coords
  const events  = day.events;
  const myIdx   = events.findIndex(e => e.id === event.id);
  const prevEvt = events.slice(0, myIdx).reverse().find(e => e.coords);

  if (!prevEvt) {
    return `https://www.google.com/maps/dir/?api=1&destination=${event.coords.lat},${event.coords.lng}&travelmode=${mode}`;
  }
  return `https://www.google.com/maps/dir/?api=1&origin=${prevEvt.coords.lat},${prevEvt.coords.lng}&destination=${event.coords.lat},${event.coords.lng}&travelmode=${mode}`;
}

// ─── Edit mode ─────────────────────────────────────────────
function toggleEditMode(eventId, dayId) {
  if (!currentUser) { openAuthModal(); return; }

  const panel = document.getElementById('edit-panel-' + eventId);
  const card  = document.querySelector(`[data-event-id="${eventId}"]`);
  if (!panel) return;

  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (card) card.classList.toggle('editing', !isOpen);

  // Show map if address exists
  if (!isOpen) {
    const day   = ITINERARY.find(d => d.id === dayId);
    const event = day?.events.find(e => e.id === eventId);
    if (event?.coords) {
      setTimeout(() => showEditMap(eventId, event.coords.lat, event.coords.lng, event.title), 100);
    }
  }
}

async function saveEdit(eventId, dayId) {
  if (!currentUser) return;

  const newTitle   = document.getElementById('edit-title-'   + eventId)?.value.trim();
  const newDesc    = document.getElementById('edit-desc-'    + eventId)?.value.trim();
  const newTime    = document.getElementById('edit-time-'    + eventId)?.value.trim();
  const newCost    = document.getElementById('edit-cost-'    + eventId)?.value.trim();
  const newAddress = document.getElementById('edit-address-' + eventId)?.value.trim();
  const newImage   = document.getElementById('edit-image-'   + eventId)?.value.trim();

  const day   = ITINERARY.find(d => d.id === dayId);
  const event = day?.events.find(e => e.id === eventId);
  if (!event) return;

  const override = eventOverrides[eventId] || {};
  const cur = { ...event, ...override };

  const updates = {};
  const historyPromises = [];

  if (newTitle && newTitle !== cur.title) {
    updates.title = newTitle;
    historyPromises.push(saveEditHistory(eventId, dayId, 'title', cur.title, newTitle));
  }
  if (newDesc && newDesc !== cur.description) {
    updates.description = newDesc;
    historyPromises.push(saveEditHistory(eventId, dayId, 'description', cur.description, newDesc));
  }
  if (newTime !== undefined && newTime !== (cur.time || '')) {
    updates.time = newTime;
    historyPromises.push(saveEditHistory(eventId, dayId, 'time', cur.time, newTime));
  }
  if (newCost !== undefined && newCost !== (cur.cost || '')) {
    updates.cost = newCost;
    historyPromises.push(saveEditHistory(eventId, dayId, 'cost', cur.cost, newCost));
  }
  if (newAddress !== undefined && newAddress !== (cur.address || '')) {
    updates.address = newAddress;
    historyPromises.push(saveEditHistory(eventId, dayId, 'address', cur.address, newAddress));
  }
  if (newImage !== undefined && newImage !== (cur.image || '')) {
    updates.image = newImage || null;
    historyPromises.push(saveEditHistory(eventId, dayId, 'image', cur.image || '', newImage || '(removed)'));
  }

  if (Object.keys(updates).length === 0) {
    toggleEditMode(eventId, dayId);
    return;
  }

  await Promise.all([saveEventOverride(eventId, updates), ...historyPromises]);

  // Re-render this event
  const container = document.getElementById('event-' + eventId);
  const editPanel = document.getElementById('edit-panel-' + eventId);
  if (container) {
    const dayIdx = ITINERARY.findIndex(d => d.id === dayId);
    const evtIdx = ITINERARY[dayIdx].events.findIndex(e => e.id === eventId);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderEvent(ITINERARY[dayIdx].events[evtIdx], ITINERARY[dayIdx], evtIdx);
    container.replaceWith(wrapper.children[0]);
    if (editPanel) editPanel.remove();

    // Re-init map if exists
    const evt = ITINERARY[dayIdx].events[evtIdx];
    if (evt.coords) {
      requestAnimationFrame(() => initMiniMap(evt.id, evt.coords.lat, evt.coords.lng, evt.title));
    }
  }

  updateAuthUI();
  refreshCommentCounts();
  showToast(`Saved! Changes to "${newTitle || cur.title}" recorded.`);
}

// ─── Address autofill in edit panel ───────────────────────
const _addrDebounce = {};
function onAddressInput(eventId, value) {
  clearTimeout(_addrDebounce[eventId]);
  const suggestionsEl = document.getElementById('addr-suggestions-' + eventId);
  if (!value || value.length < 3) {
    if (suggestionsEl) suggestionsEl.innerHTML = '';
    return;
  }

  _addrDebounce[eventId] = setTimeout(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=5&countrycodes=us`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();

      if (!suggestionsEl) return;
      if (!data || data.length === 0) {
        suggestionsEl.innerHTML = '';
        return;
      }

      suggestionsEl.innerHTML = data.map(item => {
        const label = item.display_name.split(',').slice(0, 3).join(',');
        return `<div class="addr-suggestion" onclick="selectAddress('${eventId}', '${escapeHtml(label).replace(/'/g,"\\'")}', ${item.lat}, ${item.lon})">
                  📍 ${escapeHtml(label)}
                </div>`;
      }).join('');
    } catch (_) { /* network error — fail silently */ }
  }, 450);
}

function selectAddress(eventId, address, lat, lng) {
  const input = document.getElementById('edit-address-' + eventId);
  const suggestionsEl = document.getElementById('addr-suggestions-' + eventId);
  if (input) input.value = address;
  if (suggestionsEl) suggestionsEl.innerHTML = '';

  // Store the new coords so they can be saved
  const event = findEventById(eventId);
  if (event) {
    eventOverrides[eventId] = eventOverrides[eventId] || {};
    eventOverrides[eventId]._pendingCoords = { lat: parseFloat(lat), lng: parseFloat(lng) };
  }

  showEditMap(eventId, parseFloat(lat), parseFloat(lng), address);
}

function showEditMap(eventId, lat, lng, title) {
  const container = document.getElementById('edit-map-' + eventId);
  if (!container) return;
  container.style.display = 'block';

  if (mapInstances['edit-' + eventId]) {
    mapInstances['edit-' + eventId].setView([lat, lng], 15);
    return;
  }

  const map = L.map('edit-map-' + eventId, {
    center: [lat, lng],
    zoom: 15,
    zoomControl: true,
    scrollWheelZoom: false,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  const day = ITINERARY.find(d => d.events.some(e => e.id === eventId));
  const marker = L.marker([lat, lng], { icon: createMarker(day?.accentColor || '#2E6B8A') }).addTo(map);
  marker.bindPopup(`<strong>${title}</strong>`, { closeButton: false });

  mapInstances['edit-' + eventId] = map;
  setTimeout(() => map.invalidateSize(), 100);
}

// ─── Map toggling ──────────────────────────────────────────
function toggleMap(eventId) {
  const container = document.getElementById('map-' + eventId);
  const btn       = container?.previousElementSibling;
  if (!container) return;

  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = isHidden ? '🗺️ Hide Map' : '🗺️ Show on Map';

  if (isHidden) {
    if (!container.dataset.initialized) {
      const event = findEventById(eventId);
      if (event?.coords) {
        initMiniMap(eventId, event.coords.lat, event.coords.lng, event.title);
        container.dataset.initialized = '1';
      }
    } else {
      const map = mapInstances[eventId];
      if (map) setTimeout(() => map.invalidateSize(), 50);
    }
  }
}

// ─── Reservation banner ────────────────────────────────────
function renderReservationBanner() {
  const el = document.getElementById('checklistItems');
  if (!el) return;
  el.innerHTML = RESERVATIONS.map(r =>
    r.link
      ? `<a href="${r.link}" target="_blank" class="res-chip">${r.name} (${r.day})</a>`
      : `<span class="res-chip">${r.name} (${r.day})</span>`
  ).join('');
}

// ─── Auto-scroll to today's day during the trip ────────────
function autoScrollToToday() {
  const today = new Date().toISOString().slice(0, 10);
  const tripDay = ITINERARY.find(d => d.date === today);
  if (!tripDay) return;
  setTimeout(() => {
    const el = document.getElementById(tripDay.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 700);
}

// ─── Scroll helpers ────────────────────────────────────────
function scrollToDay(dayId) {
  const el = document.getElementById(dayId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupScrollSpy() {
  const sections = document.querySelectorAll('.day-section');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const dayId = e.target.id;
        document.querySelectorAll('.nav-day-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById('nav-btn-' + dayId);
        if (activeBtn) activeBtn.classList.add('active');
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });

  sections.forEach(s => observer.observe(s));
}

function setupStickyDayHeader() {
  let sticky = document.getElementById('global-day-sticky');
  if (!sticky) {
    sticky = document.createElement('div');
    sticky.id = 'global-day-sticky';
    sticky.className = 'global-day-sticky';
    const anchor = document.getElementById('checklistBanner');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sticky, anchor.nextSibling);
    else document.body.appendChild(sticky);
  }

  const renderSticky = () => {
    const offset = window.innerWidth >= 641 ? 100 : 60;
    const firstDayEl = document.getElementById(ITINERARY[0]?.id || '');
    if (!firstDayEl) return;

    if (firstDayEl.getBoundingClientRect().top > offset) {
      sticky.style.display = 'none';
      return;
    }

    let activeDay = ITINERARY[0];
    for (const day of ITINERARY) {
      const el = document.getElementById(day.id);
      if (!el) continue;
      if (el.getBoundingClientRect().top - offset <= 0) activeDay = day;
    }

    const dateNum = activeDay.date.split('-')[2];
    sticky.style.setProperty('--day-accent', activeDay.accentColor || '#2E6B8A');
    sticky.innerHTML = `
      <span class="dsi-emoji">${activeDay.emoji}</span>
      <span class="dsi-label">Day ${activeDay.dayNumber} · ${escapeHtml(activeDay.title)}</span>
      <span class="dsi-date">April ${dateNum}</span>`;
    sticky.style.display = 'flex';
  };

  if (window.__stickyDayHandler) {
    window.removeEventListener('scroll', window.__stickyDayHandler);
    window.removeEventListener('resize', window.__stickyDayHandler);
  }
  window.__stickyDayHandler = renderSticky;
  window.addEventListener('scroll', window.__stickyDayHandler, { passive: true });
  window.addEventListener('resize', window.__stickyDayHandler);
  renderSticky();
}

// ─── Inline comments ──────────────────────────────────────
function toggleComments(eventId, dayId, eventName) {
  const body  = document.getElementById('comments-body-' + eventId);
  const arrow = document.getElementById('comment-arrow-' + eventId);
  if (!body) return;

  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▾' : '▴';

  if (!isOpen) {
    // Load comments if not loaded yet
    const day = ITINERARY.find(d => d.id === dayId);
    if (day && !commentsCache[eventId]) {
      loadCommentsForDay(dayId).then(() => renderInlineComments(eventId));
    } else {
      renderInlineComments(eventId);
    }
  }
}

// ─── Modal helpers ─────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// Close on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
  // Close address suggestions when clicking outside
  if (!e.target.closest('.address-autocomplete-wrap')) {
    document.querySelectorAll('.address-suggestions').forEach(el => el.innerHTML = '');
  }
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// ─── Toast notification ────────────────────────────────────
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ─── Format helpers ────────────────────────────────────────
function getEventImageSrc(rawUrl) {
  const clean = (rawUrl || '').trim();
  if (!clean) return '';

  // Google Drive shared links -> direct image endpoint
  const driveMatch = clean.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  }

  // Dropbox shared links -> direct download link
  if (clean.includes('dropbox.com')) {
    try {
      const u = new URL(clean);
      u.searchParams.set('raw', '1');
      u.searchParams.delete('dl');
      return u.toString();
    } catch (_) { /* ignore parse errors */ }
  }

  // If it already looks like an image URL, use it as-is.
  if (/\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)/i.test(clean)) return clean;

  // Fallback: screenshot service for normal page URLs (Word-like "any URL" behavior).
  if (/^https?:\/\//i.test(clean)) {
    return `https://image.thum.io/get/width/1200/noanimate/${encodeURIComponent(clean)}`;
  }

  return clean;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const prefix = timeStr.startsWith('~') ? '~' : '';
  const match  = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return timeStr;
  const hour   = parseInt(match[1], 10);
  const min    = match[2];
  const ampm   = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${prefix}${hour12}:${min} ${ampm}`;
}

function findEventById(id) {
  for (const day of ITINERARY) {
    const evt = day.events.find(e => e.id === id);
    if (evt) return evt;
  }
  return null;
}
