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

  try { await loadEventOverrides(); } catch (e) { console.warn('Overrides unavailable:', e); }
  extractDayOrders(); // populate dayOrders from loaded overrides
  renderAllDays();
  updateAuthUI(); // call AFTER render so auth-dependent controls exist in the DOM
  if (currentUser) baselineSeenForNewUser();
  refreshUnreadBadge();
  renderReservationBanner();
  setupScrollSpy();
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
  container.innerHTML = ITINERARY.map(day => `
    <button class="nav-day-btn" onclick="scrollToDay('${day.id}')" id="nav-btn-${day.id}">
      <span class="nav-day-emoji">${day.emoji}</span>
      <span class="nav-day-label">Apr ${day.date.split('-')[2]}</span>
    </button>`).join('');

  // Inject search + comment history + sync buttons into nav-auth area before the auth button
  const authArea = document.getElementById('userInfo');
  if (authArea && !document.getElementById('searchBtn')) {
    const searchBtn = document.createElement('button');
    searchBtn.id = 'searchBtn';
    searchBtn.className = 'btn-nav-search';
    searchBtn.innerHTML = '🔍';
    searchBtn.title = 'Search stops  (/)';
    searchBtn.onclick = openSearch;
    authArea.parentNode.insertBefore(searchBtn, authArea);
  }
  if (authArea && !document.getElementById('commentHistoryBtn')) {
    const btn = document.createElement('button');
    btn.id = 'commentHistoryBtn';
    btn.className = 'btn-nav-comments';
    btn.innerHTML = '💬 <span class="nav-comments-badge" id="navCommentsBadge" style="display:none"></span>';
    btn.title = 'All Comments';
    btn.onclick = openCommentHistoryModal;
    authArea.parentNode.insertBefore(btn, authArea);
  }
  if (authArea && !document.getElementById('syncStatusDot')) {
    const dot = document.createElement('span');
    dot.id = 'syncStatusDot';
    dot.className = 'sync-status-dot';
    dot.title = 'Checking sync…';
    dot.dataset.status = 'pending';
    dot.onclick = forceRefreshFromServer;
    authArea.parentNode.insertBefore(dot, authArea);
  }
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
  const events = getSortedEvents(day);
  const eventsHtml = events.map((event, idx) => renderEvent(event, day, idx)).join('');
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

      <!-- Sticky day indicator — sticks as you scroll through events -->
      <div class="day-sticky-indicator" style="--day-accent:${day.accentColor};" data-day-id="${day.id}">
        <span class="dsi-emoji">${day.emoji}</span>
        <span class="dsi-label">Day ${day.dayNumber} · ${day.title}</span>
        <span class="dsi-date">April ${dateNum}</span>
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
  const imageSrc = getEventImage(e);
  const imgX    = e.imageX    !== undefined ? e.imageX    : 50;
  const imgY    = e.imageY    !== undefined ? e.imageY    : 30;
  const imgZoom = e.imageZoom !== undefined ? e.imageZoom : 1;
  const photoHtml = imageSrc
    ? `<div class="event-photo-wrap">
         <img class="event-photo" src="${imageSrc}" alt="${escapeHtml(e.title)}" loading="lazy"
              style="object-position:${imgX}% ${imgY}%; transform:scale(${imgZoom}); transform-origin:${imgX}% ${imgY}%;"
              onerror="handleEventImageError(this, '${e.coords ? '1' : '0'}', '${e.coords?.lat ?? ''}', '${e.coords?.lng ?? ''}', '${escapeHtml(e.title).replace(/'/g,"\\'")}')">
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

      <div class="event-col">
        <!-- Event card — no overflow:hidden so nothing gets clipped -->
        <div class="event-card" data-event-id="${e.id}">
          ${photoHtml}
          ${splitGroupHtml}
          <div class="event-card-header">
            <div class="event-title-row">
              <h3 class="event-title" id="title-${e.id}" data-field="title" data-event="${e.id}" data-day="${day.id}">
                <a class="event-title-link" href="${googleSearchUrl}" target="_blank" rel="noopener">${escapeHtml(e.title)}</a>
              </h3>
              <div class="event-actions">
                <button class="action-btn move-btn edit-btn" onclick="moveEvent('${e.id}', '${day.id}', 'up')" title="Move earlier" style="display:none;">↑</button>
                <button class="action-btn move-btn edit-btn" onclick="moveEvent('${e.id}', '${day.id}', 'down')" title="Move later" style="display:none;">↓</button>
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

          <div class="event-ext-links">
            ${e.coords ? `<a class="event-ext-link" href="https://www.google.com/maps/search/?api=1&query=${e.coords.lat},${e.coords.lng}" target="_blank">🗺️ Maps</a>` : ''}
            <a class="event-ext-link" href="https://www.google.com/search?q=${encodeURIComponent((e.title || '') + ' Seattle')}" target="_blank">🔍 Google</a>
            ${e.website ? `<a class="event-ext-link" href="${e.website}" target="_blank">🌐 Website</a>` : ''}
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

        <!-- Comments panel — sits below the card, outside overflow:hidden -->
        <div class="inline-comments" id="inline-comments-${e.id}">
          <button class="comment-toggle-btn" onclick="toggleComments('${e.id}', '${day.id}', '${escapeHtml(e.title).replace(/'/g,"\\'")}')">
            <span class="comment-toggle-icon">💬</span>
            <span class="comment-toggle-text">Comments</span>
            <span class="comment-count-badge" id="comment-badge-${e.id}" style="display:none;"></span>
            <span class="comment-toggle-arrow" id="comment-arrow-${e.id}">▾</span>
          </button>
          <div class="comments-body" id="comments-body-${e.id}" style="display:none;">
            <div class="comments-list" id="comments-list-${e.id}"></div>
            <div class="comment-form" id="comment-form-${e.id}"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Panel (hidden by default) -->
    <div class="edit-panel" id="edit-panel-${e.id}" style="display:none;" data-day="${day.id}">
      <div class="edit-panel-inner">
        <h4>Edit this stop</h4>
        <div class="form-group">
          <label>Name</label>
          <div class="address-autocomplete-wrap">
            <input type="text" id="edit-title-${e.id}" value="${escapeHtml(e.title)}"
                   placeholder="Type a place name to search…" autocomplete="off"
                   oninput="onTitleInput('${e.id}', this.value)">
            <div class="address-suggestions" id="title-suggestions-${e.id}"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="edit-desc-${e.id}" rows="3">${escapeHtml(e.description)}</textarea>
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
          <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="edit-ext-btn" onclick="openMapsForEdit('${e.id}')">🗺️ Open in Google Maps</button>
            <a class="edit-ext-btn" href="https://www.google.com/search?q=${encodeURIComponent((e.title || '') + ' Seattle')}" target="_blank">🔍 Google Search</a>
            ${e.website ? `<a class="edit-ext-btn" href="${e.website}" target="_blank">🌐 Website</a>` : ''}
          </div>
        </div>
        <div id="edit-map-${e.id}" class="edit-mini-map" style="display:none;"></div>
        <div class="form-group">
          <label>Website</label>
          <input type="url" id="edit-website-${e.id}" value="${escapeHtml(e.website || '')}" placeholder="https://…">
          <small class="form-help">Optional — adds a Website button on the stop card.</small>
        </div>
        <div class="edit-row">
          <div class="form-group">
            <label>Time</label>
            <input type="text" id="edit-time-${e.id}" value="${e.time || ''}" placeholder="e.g. 14:30 or 2:30 PM">
          </div>
          <div class="form-group">
            <label>Cost</label>
            <input type="text" id="edit-cost-${e.id}" value="${e.cost || ''}">
          </div>
        </div>
        <div class="form-group">
          <label>Photo</label>
          <div class="photo-upload-wrap" id="photo-drop-${e.id}"
               ondragover="event.preventDefault(); document.getElementById('photo-drop-${e.id}').classList.add('drag-over')"
               ondragleave="document.getElementById('photo-drop-${e.id}').classList.remove('drag-over')"
               ondrop="handlePhotoDrop('${e.id}', event)">
            <span class="photo-drop-hint">📎 Drag &amp; drop a photo here, or</span>
            <label class="photo-file-label">
              Choose file
              <input type="file" id="edit-image-file-${e.id}" accept="image/*"
                     onchange="loadEventImageFile('${e.id}', this.files)" style="display:none;">
            </label>
          </div>
          <input class="photo-url-input" type="text" id="edit-image-${e.id}"
                 value="${escapeHtml(e.image || '')}"
                 placeholder="…or paste a photo URL"
                 oninput="onPhotoInputChange('${e.id}')">
          <div class="photo-adjuster" id="photo-adj-${e.id}"${e.image ? '' : ' style="display:none"'}>
            <div class="photo-adj-frame" id="photo-adj-frame-${e.id}"
                 onmousedown="startPhotoDrag(event,'${e.id}')"
                 ontouchstart="startPhotoDrag(event,'${e.id}')">
              <img id="photo-adj-img-${e.id}" src="${escapeHtml(e.image || '')}" draggable="false"
                   style="object-position:${imgX}% ${imgY}%; transform:scale(${imgZoom}); transform-origin:${imgX}% ${imgY}%;">
            </div>
            <div class="photo-adj-controls">
              <span class="zoom-icon">🔍</span>
              <input type="range" id="photo-zoom-${e.id}" class="photo-zoom-slider"
                     min="1" max="2.5" step="0.05" value="${imgZoom}"
                     oninput="applyPhotoAdjust('${e.id}')">
              <button class="photo-adj-reset" type="button" onclick="resetPhotoAdjust('${e.id}')">Reset</button>
            </div>
            <p class="photo-adj-hint">Drag image to reposition · slider to zoom in/out</p>
          </div>
          <small class="form-help">URL or file — Save Changes to apply.</small>
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

  // Show map and init photo adjuster when opening
  if (!isOpen) {
    const day   = ITINERARY.find(d => d.id === dayId);
    const event = day?.events.find(e => e.id === eventId);
    if (event?.coords) {
      setTimeout(() => showEditMap(eventId, event.coords.lat, event.coords.lng, event.title), 100);
    }
    // Init photo adjuster if an image is already set
    setTimeout(() => onPhotoInputChange(eventId), 80);
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
  const newWebsite = document.getElementById('edit-website-' + eventId)?.value.trim();

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
    historyPromises.push(saveEditHistory(eventId, dayId, 'image', cur.image, newImage || '(removed)'));
  }
  if (newWebsite !== undefined && newWebsite !== (cur.website || '')) {
    updates.website = newWebsite || null;
  }
  if (eventOverrides[eventId]?._pendingCoords) {
    updates.coords = eventOverrides[eventId]._pendingCoords;
  }
  // Save photo adjust values if they changed
  const adj = _photoAdjust[eventId] || getPhotoAdjust(eventId);
  if (adj && (newImage || cur.image)) {
    if (Math.abs(adj.x - (cur.imageX ?? 50)) > 0.5)  updates.imageX    = Math.round(adj.x    * 10) / 10;
    if (Math.abs(adj.y - (cur.imageY ?? 30)) > 0.5)  updates.imageY    = Math.round(adj.y    * 10) / 10;
    if (Math.abs(adj.zoom - (cur.imageZoom ?? 1)) > 0.01) updates.imageZoom = Math.round(adj.zoom * 100) / 100;
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
    const newNodes = Array.from(wrapper.children);
    container.replaceWith(...newNodes);
    if (editPanel) editPanel.remove();

    // Re-init map if exists
    const evt = { ...ITINERARY[dayIdx].events[evtIdx], ...(eventOverrides[eventId] || {}) };
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

// ─── Title / place autofill ────────────────────────────────
const _titleDebounce = {};
function onTitleInput(eventId, value) {
  clearTimeout(_titleDebounce[eventId]);
  const suggestionsEl = document.getElementById('title-suggestions-' + eventId);
  if (!value || value.length < 3) {
    if (suggestionsEl) suggestionsEl.innerHTML = '';
    return;
  }

  _titleDebounce[eventId] = setTimeout(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=6&countrycodes=us&extratags=1&viewbox=-122.55,47.25,-121.85,47.85&bounded=0`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();

      if (!suggestionsEl) return;
      if (!data || data.length === 0) { suggestionsEl.innerHTML = ''; return; }

      suggestionsEl.innerHTML = data.map((item, idx) => {
        const parts = item.display_name.split(',');
        const name  = parts[0].trim();
        const loc   = parts.slice(1, 3).join(',').trim();
        return `<div class="addr-suggestion" onclick="selectPlace('${eventId}', ${idx}, '${escapeHtml(JSON.stringify(data)).replace(/'/g,"\\'")}')">
                  📍 <strong>${escapeHtml(name)}</strong>${loc ? ` · <span style="opacity:.7">${escapeHtml(loc)}</span>` : ''}
                </div>`;
      }).join('');

      // Store results on element for selectPlace to read
      suggestionsEl.dataset.results = JSON.stringify(data);
    } catch (_) { /* fail silently */ }
  }, 450);
}

async function selectPlace(eventId, idx, _unused) {
  const suggestionsEl = document.getElementById('title-suggestions-' + eventId);
  if (!suggestionsEl) return;

  let results;
  try { results = JSON.parse(suggestionsEl.dataset.results || '[]'); } catch (_) { return; }
  const item = results[idx];
  if (!item) return;

  suggestionsEl.innerHTML = '';

  const parts   = item.display_name.split(',');
  const name    = parts[0].trim();
  const address = parts.slice(0, 3).join(',').trim();
  const lat     = parseFloat(item.lat);
  const lng     = parseFloat(item.lon);

  const titleInput   = document.getElementById('edit-title-'   + eventId);
  const addressInput = document.getElementById('edit-address-' + eventId);
  if (titleInput)   titleInput.value   = name;
  if (addressInput) addressInput.value = address;

  // Stash pending coords
  eventOverrides[eventId] = eventOverrides[eventId] || {};
  eventOverrides[eventId]._pendingCoords = { lat, lng };
  showEditMap(eventId, lat, lng, name);

  // Auto-fetch photo + description from Wikipedia
  const details = await fetchPlaceWikiDetails(item, name);
  if (details) {
    if (details.image) {
      const imgInput = document.getElementById('edit-image-' + eventId);
      if (imgInput) imgInput.value = details.image;
      showToast('Photo fetched from Wikipedia ✓');
    }
    if (details.description) {
      const descInput = document.getElementById('edit-desc-' + eventId);
      if (descInput && descInput.value.trim() === '') descInput.value = details.description;
    }
  }
}

async function fetchPlaceWikiDetails(nominatimItem, name) {
  try {
    // Try direct Wikipedia link from extratags first
    let wikiTitle = nominatimItem.extratags?.wikipedia?.replace(/^en:/, '');

    if (!wikiTitle) {
      // Fallback: OpenSearch
      const osRes  = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name + ' Seattle')}&limit=1&format=json&origin=*`);
      const osData = await osRes.json();
      wikiTitle = osData[1]?.[0];
    }

    if (!wikiTitle) return null;

    const summaryRes  = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`);
    if (!summaryRes.ok) return null;
    const data = await summaryRes.json();

    const image = data.originalimage?.source || data.thumbnail?.source || null;
    let description = data.extract || '';
    // Keep first two sentences
    const sentences = description.match(/[^.!?]+[.!?]+/g) || [];
    description = sentences.slice(0, 2).join(' ').trim();

    return { image, description };
  } catch (_) {
    return null;
  }
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

async function loadEventImageFile(eventId, files) {
  const file = files && files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please choose an image file.');
    return;
  }

  // Upload to Supabase Storage so all devices see it
  if (USE_SUPABASE) {
    showToast('Uploading photo…');
    const url = await _uploadPhotoToStorage(eventId, file);
    if (url) {
      const input = document.getElementById('edit-image-' + eventId);
      if (input) input.value = url;
      onPhotoInputChange(eventId);
      showToast('Photo uploaded! Hit Save Changes to apply.');
      return;
    }
    showToast('Upload failed — saving locally instead.');
  }

  // Fallback: data: URL (this device only)
  const reader = new FileReader();
  reader.onload = () => {
    const input = document.getElementById('edit-image-' + eventId);
    if (input) input.value = reader.result;
    showToast('Photo saved on this device only.');
    onPhotoInputChange(eventId);
  };
  reader.onerror = () => showToast('Could not read that photo.');
  reader.readAsDataURL(file);
}

// ─── Upload a file to Supabase Storage → returns public URL or null ───
async function _uploadPhotoToStorage(eventId, file) {
  try {
    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `events/${eventId}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('trip-photos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (error) {
      console.warn('Storage upload failed:', error);
      return null;
    }

    const { data } = supabase.storage.from('trip-photos').getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (err) {
    console.warn('Storage upload exception:', err);
    return null;
  }
}

// ─── Photo drag-and-drop ───────────────────────────────────
async function handlePhotoDrop(eventId, event) {
  event.preventDefault();
  const dropZone = document.getElementById('photo-drop-' + eventId);
  if (dropZone) dropZone.classList.remove('drag-over');

  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please drop an image file.'); return; }

  if (USE_SUPABASE) {
    showToast('Uploading photo…');
    const url = await _uploadPhotoToStorage(eventId, file);
    if (url) {
      const input = document.getElementById('edit-image-' + eventId);
      if (input) input.value = url;
      onPhotoInputChange(eventId);
      showToast('Photo uploaded! Hit Save Changes to apply.');
      return;
    }
    showToast('Upload failed — saving locally instead.');
  }

  const reader = new FileReader();
  reader.onload = () => {
    const input = document.getElementById('edit-image-' + eventId);
    if (input) input.value = reader.result;
    showToast('Photo saved on this device only.');
    onPhotoInputChange(eventId);
  };
  reader.onerror = () => showToast('Could not read that photo.');
  reader.readAsDataURL(file);
}

// ─── Photo adjuster (reposition + zoom) ───────────────────
const _photoAdjust   = {};
const _photoDragState = {};

function getPhotoAdjust(eventId) {
  const ev = findEventById(eventId);
  const ov = eventOverrides[eventId] || {};
  return {
    x:    ov.imageX    !== undefined ? ov.imageX    : (ev?.imageX    !== undefined ? ev.imageX    : 50),
    y:    ov.imageY    !== undefined ? ov.imageY    : (ev?.imageY    !== undefined ? ev.imageY    : 30),
    zoom: ov.imageZoom !== undefined ? ov.imageZoom : (ev?.imageZoom !== undefined ? ev.imageZoom : 1),
  };
}

function onPhotoInputChange(eventId) {
  const urlInput = document.getElementById('edit-image-'     + eventId);
  const adjWrap  = document.getElementById('photo-adj-'      + eventId);
  const adjImg   = document.getElementById('photo-adj-img-'  + eventId);
  if (!adjWrap) return;

  const src = urlInput ? urlInput.value.trim() : '';
  if (src) {
    if (adjImg) adjImg.src = src;
    adjWrap.style.display = 'block';
    if (!_photoAdjust[eventId]) _photoAdjust[eventId] = getPhotoAdjust(eventId);
    applyPhotoAdjust(eventId);
  } else {
    adjWrap.style.display = 'none';
  }
}

function applyPhotoAdjust(eventId) {
  if (!_photoAdjust[eventId]) _photoAdjust[eventId] = getPhotoAdjust(eventId);
  const adj = _photoAdjust[eventId];

  const slider = document.getElementById('photo-zoom-' + eventId);
  if (slider) adj.zoom = parseFloat(slider.value);

  const img = document.getElementById('photo-adj-img-' + eventId);
  if (img) {
    img.style.objectPosition  = adj.x + '% ' + adj.y + '%';
    img.style.transform       = 'scale(' + adj.zoom + ')';
    img.style.transformOrigin = adj.x + '% ' + adj.y + '%';
  }
}

function resetPhotoAdjust(eventId) {
  _photoAdjust[eventId] = { x: 50, y: 30, zoom: 1 };
  const slider = document.getElementById('photo-zoom-' + eventId);
  if (slider) slider.value = 1;
  applyPhotoAdjust(eventId);
}

function startPhotoDrag(e, eventId) {
  e.preventDefault();
  const touch  = e.touches && e.touches[0];
  const startX = touch ? touch.clientX : e.clientX;
  const startY = touch ? touch.clientY : e.clientY;

  if (!_photoAdjust[eventId]) _photoAdjust[eventId] = getPhotoAdjust(eventId);
  const adj = _photoAdjust[eventId];
  _photoDragState[eventId] = { startX, startY, baseX: adj.x, baseY: adj.y };

  function onMove(ev) {
    const t  = ev.touches && ev.touches[0];
    const cx = t ? t.clientX : ev.clientX;
    const cy = t ? t.clientY : ev.clientY;
    const drag = _photoDragState[eventId];
    if (!drag) return;

    const frame = document.getElementById('photo-adj-frame-' + eventId);
    const fw = frame ? frame.offsetWidth  : 300;
    const fh = frame ? frame.offsetHeight : 160;

    // Drag right → shows left of image → posX decreases (pan like moving the image under the frame)
    const dx = -(cx - drag.startX) / fw * 100;
    const dy = -(cy - drag.startY) / fh * 100;

    adj.x = Math.max(0, Math.min(100, drag.baseX + dx));
    adj.y = Math.max(0, Math.min(100, drag.baseY + dy));
    applyPhotoAdjust(eventId);
  }

  function onUp() {
    delete _photoDragState[eventId];
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend',  onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend',  onUp);
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
  else document.getElementById('daysContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// ─── Inline comments ──────────────────────────────────────
function toggleComments(eventId, dayId, _eventName) {
  const body  = document.getElementById('comments-body-' + eventId);
  const arrow = document.getElementById('comment-arrow-' + eventId);
  if (!body) return;

  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▾' : '▴';

  if (!isOpen) {
    renderInlineComments(eventId);
    // Mark currently cached comments as seen when the section is opened
    markSeen((commentsCache[eventId] || []).map(c => c.id));
    const day = ITINERARY.find(d => d.id === dayId);
    if (day) loadCommentsForDay(dayId).then(() => {
      renderInlineComments(eventId);
      markSeen((commentsCache[eventId] || []).map(c => c.id));
    });
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
  // Close address/title suggestions when clicking outside
  if (!e.target.closest('.address-autocomplete-wrap')) {
    document.querySelectorAll('.address-suggestions').forEach(el => el.innerHTML = '');
  }
});

// Close on Escape; open search on /
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSearch();
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
  // '/' or Ctrl+K opens search (unless focused in an input)
  if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) &&
      !e.target.closest('input, textarea, [contenteditable]')) {
    e.preventDefault();
    openSearch();
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
function formatTime(timeStr) {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  const prefix = trimmed.startsWith('~') ? '~' : '';
  const raw = prefix ? trimmed.slice(1).trim() : trimmed;
  const match  = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return timeStr;
  let hour   = parseInt(match[1], 10);
  const min    = match[2];
  const explicitMeridiem = match[3] ? match[3].toUpperCase() : null;

  if (explicitMeridiem === 'PM' && hour < 12) hour += 12;
  if (explicitMeridiem === 'AM' && hour === 12) hour = 0;

  const ampm   = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${prefix}${hour12}:${min} ${ampm}`;
}

function getEventImage(event) {
  if (event.image) return event.image;
  if (event.coords) {
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${event.coords.lat},${event.coords.lng}&zoom=15&size=1200x420&markers=${event.coords.lat},${event.coords.lng},red-pushpin`;
  }
  return null;
}

function handleEventImageError(img, hasCoords, lat, lng, title) {
  if (!img) return;
  if (hasCoords === '1' && img.dataset.fallbackApplied !== '1') {
    img.dataset.fallbackApplied = '1';
    img.src = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=1200x420&markers=${lat},${lng},red-pushpin`;
    img.alt = `${title} location preview`;
    return;
  }
  img.parentElement.style.display = 'none';
}

function findEventById(id) {
  for (const day of ITINERARY) {
    const evt = day.events.find(e => e.id === id);
    if (evt) return evt;
  }
  return null;
}

// ─── Day ordering ──────────────────────────────────────────
const dayOrders = {};

function extractDayOrders() {
  Object.entries(eventOverrides).forEach(([key, data]) => {
    if (key.startsWith('__order__') && data && data._order) {
      dayOrders[key.replace('__order__', '')] = data._order;
    }
  });
}

function getSortedEvents(day) {
  const order = dayOrders[day.id];
  if (!order || order.length === 0) return day.events;
  const sorted = order.map(id => day.events.find(e => e.id === id)).filter(Boolean);
  const inOrder = new Set(order);
  const extra = day.events.filter(e => !inOrder.has(e.id));
  return [...sorted, ...extra];
}

function moveEvent(eventId, dayId, direction) {
  if (!currentUser) { openAuthModal(); return; }
  const day = ITINERARY.find(d => d.id === dayId);
  if (!day) return;

  const order = [...(dayOrders[dayId] || day.events.map(e => e.id))];
  const idx = order.indexOf(eventId);
  if (idx < 0) return;
  const swap = direction === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= order.length) return;
  [order[idx], order[swap]] = [order[swap], order[idx]];
  dayOrders[dayId] = order;

  // Clear stale Leaflet instances so re-render can reinitialize them
  day.events.forEach(e => {
    delete mapInstances[e.id];
    delete mapInstances['edit-' + e.id];
  });

  // Re-render only the timeline rows
  const section = document.getElementById(dayId);
  const timeline = section?.querySelector('.day-timeline');
  if (!timeline) return;
  const sorted = getSortedEvents(day);
  timeline.innerHTML = sorted.map((event, i) => renderEvent(event, day, i)).join('');
  updateAuthUI();
  refreshCommentCounts();
  requestAnimationFrame(() => {
    sorted.forEach(event => {
      const e = { ...event, ...(eventOverrides[event.id] || {}) };
      if (e.coords) initMiniMap(e.id, e.coords.lat, e.coords.lng, e.title);
    });
  });

  // Persist order as a special event_overrides entry
  saveEventOverride('__order__' + dayId, { _order: order });
  showToast('Order updated!');
}

// ─── Stop search ────────────────────────────────────────────
function openSearch() {
  let overlay = document.getElementById('searchOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'searchOverlay';
    overlay.className = 'search-overlay';
    overlay.innerHTML = `
      <div class="search-inner">
        <div class="search-input-wrap">
          <span class="search-icon-glyph">🔍</span>
          <input type="text" id="searchInput" class="search-input"
                 placeholder="Search stops, restaurants, activities…"
                 oninput="renderSearchResults(this.value)"
                 autocomplete="off">
          <button class="search-close-btn" onclick="closeSearch()">×</button>
        </div>
        <div id="searchResults" class="search-results"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSearch(); });
  }
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('open'));
  setTimeout(() => document.getElementById('searchInput')?.focus(), 60);
  renderSearchResults('');
}

function closeSearch() {
  const overlay = document.getElementById('searchOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

function renderSearchResults(query) {
  const el = document.getElementById('searchResults');
  if (!el) return;
  const q = query.toLowerCase().trim();

  const results = [];
  ITINERARY.forEach(day => {
    getSortedEvents(day).forEach(event => {
      const e = { ...event, ...(eventOverrides[event.id] || {}) };
      const haystack = [e.title, e.description, e.address, e.category].join(' ').toLowerCase();
      if (!q || haystack.includes(q)) results.push({ e, day });
    });
  });

  if (results.length === 0) {
    el.innerHTML = `<p class="search-no-results">No stops match "<em>${escapeHtml(query)}</em>"</p>`;
    return;
  }

  el.innerHTML = results.slice(0, 30).map(({ e, day }) => {
    const catInfo = CATEGORY_ICONS[e.category] || { icon: '📍' };
    const mapsUrl = e.coords
      ? `https://www.google.com/maps/search/?api=1&query=${e.coords.lat},${e.coords.lng}` : null;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(e.title + ' Seattle')}`;
    const shortAddr = e.address ? e.address.split(',').slice(0, 2).join(',') : '';
    return `
      <div class="search-result-item" onclick="jumpToStop('${e.id}', '${day.id}')">
        <span class="sr-icon">${catInfo.icon}</span>
        <div class="sr-body">
          <div class="sr-name">${escapeHtml(e.title)}</div>
          <div class="sr-meta">
            <span class="sr-day" style="color:${day.accentColor}">${day.emoji} ${escapeHtml(day.title)}</span>
            ${shortAddr ? `<span class="sr-addr"> · ${escapeHtml(shortAddr)}</span>` : ''}
          </div>
        </div>
        <div class="sr-links">
          ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" onclick="event.stopPropagation()" class="sr-link" title="Google Maps">🗺️</a>` : ''}
          <a href="${searchUrl}" target="_blank" onclick="event.stopPropagation()" class="sr-link" title="Google Search">🔍</a>
        </div>
      </div>`;
  }).join('');
}

function jumpToStop(eventId, dayId) {
  closeSearch();
  setTimeout(() => {
    const el = document.getElementById('event-' + eventId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('stop-highlight');
      setTimeout(() => el.classList.remove('stop-highlight'), 1800);
    } else {
      scrollToDay(dayId);
    }
  }, 220);
}

// ─── Force reload all data from Supabase ───────────────────
async function forceRefreshFromServer() {
  const dot = document.getElementById('syncStatusDot');
  if (dot) { dot.dataset.status = 'pending'; dot.title = 'Refreshing…'; }
  showToast('Refreshing from server…');

  Object.keys(eventOverrides).forEach(k => delete eventOverrides[k]);
  Object.keys(commentsCache).forEach(k => delete commentsCache[k]);

  try { await loadEventOverrides(); } catch (e) { console.warn('Force refresh failed:', e); }

  extractDayOrders();
  renderAllDays();
  updateAuthUI();
  refreshCommentCounts();
  refreshUnreadBadge();
  ITINERARY.forEach(day => loadCommentsForDay(day.id));
  showToast('Refreshed from server ✓');
}

// ─── Push ALL local overrides to Supabase at once ──────────
async function pushAllToSupabase() {
  if (!USE_SUPABASE) { showToast('Supabase not configured.'); return; }

  const entries = Object.entries(eventOverrides);
  if (entries.length === 0) { showToast('Nothing in local storage to push.'); return; }

  const btn = document.getElementById('pushAllBtn');
  if (btn) btn.disabled = true;
  showToast('Pushing ' + entries.length + ' entries to server…');

  let ok = 0, fail = 0, lastErr = null;
  for (const [eventId, data] of entries) {
    const supabaseData = { ...data };
    if (supabaseData.image && supabaseData.image.startsWith('data:')) delete supabaseData.image;
    const { error } = await supabase.from('event_overrides').upsert({
      event_id:        eventId,
      data:            supabaseData,
      updated_at:      new Date().toISOString(),
      updated_by_name: currentUser?.name || 'local-export',
    }, { onConflict: 'event_id' });
    if (error) { fail++; lastErr = error; console.error('Push failed for', eventId, error); }
    else ok++;
  }

  if (btn) btn.disabled = false;
  if (fail === 0) {
    _setSyncStatus('ok');
    showToast('✅ Pushed ' + ok + ' entries — all devices will now see your changes!');
  } else {
    _setSyncStatus('error', lastErr?.message || 'partial failure');
    showToast('⚠️ ' + ok + ' pushed, ' + fail + ' failed. Error: ' + (lastErr?.message || lastErr?.code || 'unknown'));
    openDataExportModal(); // show export so user can share data with developer
  }
}

// ─── Export local data as JSON (for developer to hardcode) ─
function openDataExportModal() {
  let modal = document.getElementById('dataExportModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'dataExportModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal modal-large">
        <div class="modal-header">
          <h2>📋 Export My Changes</h2>
          <button class="modal-close" onclick="closeModal('dataExportModal')">×</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:12px;color:var(--mid);font-size:0.9rem;">Copy this and send it to the developer — they can hardcode your changes into the site so everyone sees them without needing Supabase.</p>
          <textarea id="dataExportText" style="width:100%;height:300px;font-family:monospace;font-size:0.75rem;border:1px solid var(--fog);border-radius:8px;padding:12px;resize:vertical;" readonly></textarea>
          <button class="btn-save" style="margin-top:12px;width:100%;" onclick="copyExportData()">Copy to clipboard</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  }

  // Populate with current data
  const exportData = {
    eventOverrides: Object.fromEntries(
      Object.entries(eventOverrides).filter(([, v]) => {
        // Strip data: URLs from export (they're device-local anyway)
        const d = { ...v };
        if (d.image && d.image.startsWith('data:')) delete d.image;
        return true;
      }).map(([k, v]) => {
        const d = { ...v };
        if (d.image && d.image.startsWith('data:')) delete d.image;
        return [k, d];
      })
    ),
    exportedAt: new Date().toISOString(),
    exportedBy: currentUser?.name || 'unknown',
  };
  document.getElementById('dataExportText').value = JSON.stringify(exportData, null, 2);
  modal.classList.add('open');
}

function copyExportData() {
  const ta = document.getElementById('dataExportText');
  if (!ta) return;
  ta.select();
  navigator.clipboard?.writeText(ta.value).then(() => showToast('Copied!')).catch(() => {
    document.execCommand('copy');
    showToast('Copied!');
  });
}

// ─── Admin sync bar (shown when logged in) ─────────────────
function renderAdminBar() {
  let bar = document.getElementById('adminSyncBar');
  if (!currentUser) {
    if (bar) bar.remove();
    return;
  }
  if (bar) return; // already rendered

  bar = document.createElement('div');
  bar.id = 'adminSyncBar';
  bar.className = 'admin-sync-bar';
  bar.innerHTML = `
    <span class="admin-bar-label">Your changes:</span>
    <button class="admin-bar-btn primary" id="pushAllBtn" onclick="pushAllToSupabase()">
      ☁️ Push all to all devices
    </button>
    <button class="admin-bar-btn" onclick="openDataExportModal()">
      📋 Export data
    </button>
    <button class="admin-bar-btn" onclick="forceRefreshFromServer()">
      🔄 Refresh from server
    </button>
  `;
  // Insert right after navbar
  const nav = document.getElementById('navbar');
  if (nav && nav.nextSibling) {
    nav.parentNode.insertBefore(bar, nav.nextSibling);
  } else {
    document.body.prepend(bar);
  }
}

// ─── Edit panel: open address in Google Maps live ──────────
function openMapsForEdit(eventId) {
  const addressInput = document.getElementById('edit-address-' + eventId);
  const address = addressInput?.value.trim() || '';
  const pending = eventOverrides[eventId]?._pendingCoords;
  let url;
  if (pending) {
    url = `https://www.google.com/maps/search/?api=1&query=${pending.lat},${pending.lng}`;
  } else if (address) {
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  if (url) window.open(url, '_blank');
}

