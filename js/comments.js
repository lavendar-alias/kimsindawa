// ============================================================
// COMMENTS & SUGGESTIONS — Inline, with replies
// ============================================================

let activeEventId   = null;
let activeEventName = null;

const commentsCache = {};

function getLocalComments(dayId) {
  try { return JSON.parse(localStorage.getItem('kims_comments_' + dayId) || '{}'); }
  catch (_) { return {}; }
}

function mergeCommentsIntoCache(data) {
  Object.entries(data || {}).forEach(([eventId, comments]) => {
    if (!commentsCache[eventId]) commentsCache[eventId] = [];
    (comments || []).forEach(c => {
      if (!commentsCache[eventId].find(x => x.id === c.id)) commentsCache[eventId].push(c);
    });
  });
}

function saveLocalComment(dayId, eventId, comment) {
  const stored = getLocalComments(dayId);
  if (!stored[eventId]) stored[eventId] = [];
  stored[eventId].push(comment);
  localStorage.setItem('kims_comments_' + dayId, JSON.stringify(stored));
}

// ─── Load comments for a day ───────────────────────────────
async function loadCommentsForDay(dayId) {
  mergeCommentsIntoCache(getLocalComments(dayId));
  if (USE_SUPABASE) {
    try {
      const { data, error } = await supabase
        .from('comments').select('*').eq('day_id', dayId).order('created_at', { ascending: true });
      if (!error && data) {
        data.forEach(c => {
          if (!commentsCache[c.event_id]) commentsCache[c.event_id] = [];
          if (!commentsCache[c.event_id].find(x => x.id === c.id)) commentsCache[c.event_id].push(c);
        });
      }
    } catch (e) {
      console.warn('Comment load error:', e);
    }
  }
  refreshCommentCounts();
}

// ─── Comment count badges ──────────────────────────────────
function refreshCommentCounts() {
  Object.entries(commentsCache).forEach(([eventId, comments]) => {
    const badge    = document.getElementById('comment-badge-' + eventId);
    const topLevel = comments.filter(c => !c.parent_id).length;
    if (badge) {
      badge.textContent   = topLevel > 0 ? topLevel : '';
      badge.style.display = topLevel > 0 ? 'inline-flex' : 'none';
    }
  });
}

// ─── Render inline comments ────────────────────────────────
function renderInlineComments(eventId) {
  const listEl = document.getElementById('comments-list-' + eventId);
  const formEl = document.getElementById('comment-form-'  + eventId);
  if (!listEl || !formEl) return;

  const comments = commentsCache[eventId] || [];
  const topLevel = comments.filter(c => !c.parent_id);
  const replies  = comments.filter(c =>  c.parent_id);

  listEl.innerHTML = topLevel.length === 0
    ? `<p class="no-comments-inline">No comments yet — be the first! 👇</p>`
    : topLevel.map(c => renderInlineComment(c, replies, eventId)).join('');

  formEl.innerHTML = currentUser ? `
    <div class="inline-comment-form">
      <div class="inline-form-avatar">${getInitials(currentUser.name)}</div>
      <div class="inline-form-right">
        <textarea class="inline-comment-input" id="inline-text-${eventId}"
                  placeholder="Leave a comment for this stop…" rows="2"></textarea>
        <div class="inline-form-actions">
          <label class="radio-label-sm"><input type="radio" name="itype-${eventId}" value="comment" checked> 💬 Comment</label>
          <label class="radio-label-sm"><input type="radio" name="itype-${eventId}" value="suggestion"> 💡 Suggestion</label>
          <button class="btn-post-comment" onclick="submitInlineComment('${eventId}')">Post</button>
        </div>
      </div>
    </div>` : `
    <div class="inline-login-prompt">
      <p>Enter a name to leave a comment.</p>
      <button class="btn-enter-name" onclick="openAuthModal()">Enter my name ✏️</button>
    </div>`;
}

function renderInlineComment(comment, allReplies, eventId) {
  const date      = new Date(comment.created_at);
  const myReplies = allReplies.filter(r => r.parent_id === comment.id);
  const typeTag   = comment.type === 'suggestion' ? `<span class="comment-type suggestion-tag">💡 Suggestion</span>` : '';
  const repliesHtml = myReplies.length > 0
    ? `<div class="reply-thread">${myReplies.map(r => renderReplyComment(r)).join('')}</div>` : '';
  return `
    <div class="inline-comment-card ${comment.type === 'suggestion' ? 'is-suggestion' : ''}" id="comment-${comment.id}">
      <div class="ic-header">
        <span class="ic-avatar">${getInitials(comment.user_name)}</span>
        <span class="ic-name">${escapeHtml(comment.user_name)}</span>
        ${typeTag}
        <span class="ic-time" title="${date.toLocaleString()}">${formatCommentDate(date)}</span>
      </div>
      <p class="ic-body">${escapeHtml(comment.content)}</p>
      ${repliesHtml}
      <button class="ic-reply-btn" onclick="showReplyForm('${comment.id}','${eventId}','${escapeHtml(comment.user_name).replace(/'/g,"\\'")}')">↩ Reply</button>
      <div class="reply-form-slot" id="reply-slot-${comment.id}"></div>
    </div>`;
}

function renderReplyComment(reply) {
  const date = new Date(reply.created_at);
  return `
    <div class="reply-card">
      <div class="ic-header">
        <span class="ic-avatar small">${getInitials(reply.user_name)}</span>
        <span class="ic-name">${escapeHtml(reply.user_name)}</span>
        <span class="ic-time">${formatCommentDate(date)}</span>
      </div>
      <p class="ic-body">${escapeHtml(reply.content)}</p>
    </div>`;
}

// ─── Reply form ────────────────────────────────────────────
function showReplyForm(parentId, eventId, parentAuthor) {
  document.querySelectorAll('.reply-form-slot').forEach(el => {
    if (el.id !== 'reply-slot-' + parentId) el.innerHTML = '';
  });
  const slot = document.getElementById('reply-slot-' + parentId);
  if (!slot) return;
  if (slot.querySelector('textarea')) { slot.innerHTML = ''; return; }
  if (!currentUser) { openAuthModal(); return; }
  slot.innerHTML = `
    <div class="reply-form">
      <div class="inline-form-avatar small">${getInitials(currentUser.name)}</div>
      <div class="inline-form-right">
        <textarea class="inline-comment-input small" id="reply-text-${parentId}"
                  placeholder="Replying to ${escapeHtml(parentAuthor)}…" rows="2"></textarea>
        <div class="inline-form-actions">
          <button class="btn-post-comment small" onclick="submitReply('${parentId}','${eventId}')">Reply</button>
          <button class="btn-cancel-reply" onclick="document.getElementById('reply-slot-${parentId}').innerHTML=''">Cancel</button>
        </div>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('reply-text-' + parentId)?.focus(), 50);
}

// ─── Submit comment ────────────────────────────────────────
async function submitInlineComment(eventId) {
  if (!currentUser) { openAuthModal(); return; }
  const textarea = document.getElementById('inline-text-' + eventId);
  const content  = textarea?.value.trim();
  if (!content) { textarea?.focus(); return; }
  const typeEl = document.querySelector(`input[name="itype-${eventId}"]:checked`);
  const type   = typeEl?.value || 'comment';
  const day    = ITINERARY.find(d => d.events.some(e => e.id === eventId));
  const comment = await _saveComment({ eventId, dayId: day?.id || 'unknown', content, type, parentId: null });
  if (!comment) return;
  textarea.value = '';
  if (!commentsCache[eventId]) commentsCache[eventId] = [];
  commentsCache[eventId].push(comment);
  renderInlineComments(eventId);
  refreshCommentCounts();
}

async function submitReply(parentId, eventId) {
  if (!currentUser) { openAuthModal(); return; }
  const textarea = document.getElementById('reply-text-' + parentId);
  const content  = textarea?.value.trim();
  if (!content) { textarea?.focus(); return; }
  const day   = ITINERARY.find(d => d.events.some(e => e.id === eventId));
  const reply = await _saveComment({ eventId, dayId: day?.id || 'unknown', content, type: 'comment', parentId });
  if (!reply) return;
  if (!commentsCache[eventId]) commentsCache[eventId] = [];
  commentsCache[eventId].push(reply);
  renderInlineComments(eventId);
  refreshCommentCounts();
}

// ─── Core save ─────────────────────────────────────────────
async function _saveComment({ eventId, dayId, content, type, parentId }) {
  const comment = {
    id:         USE_SUPABASE ? null : 'local-' + Date.now(),
    created_at: new Date().toISOString(),
    event_id:   eventId, day_id: dayId,
    user_id:    currentUser.id, user_name: currentUser.name,
    content, type, parent_id: parentId || null,
  };
  if (USE_SUPABASE) {
    const payload = { event_id: comment.event_id, day_id: comment.day_id, user_name: comment.user_name, content: comment.content, type: comment.type };
    if (comment.parent_id) payload.parent_id = comment.parent_id;
    try {
      const { data, error } = await supabase.from('comments').insert(payload).select().single();
      if (error) {
        saveLocalComment(dayId, eventId, { ...comment, id: 'local-' + Date.now() });
        showToast('Saved locally — run supabase-patch.sql to enable cross-device sync.');
        return { ...comment, id: 'local-' + Date.now() };
      }
      Object.assign(comment, data);
    } catch (e) {
      saveLocalComment(dayId, eventId, { ...comment, id: 'local-' + Date.now() });
      return { ...comment, id: 'local-' + Date.now() };
    }
  } else {
    saveLocalComment(dayId, eventId, comment);
  }
  return comment;
}

async function openCommentModal(eventId, eventName, dayId) {
  const body = document.getElementById('comments-body-' + eventId);
  if (body) {
    document.getElementById('event-' + eventId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (body.style.display === 'none') toggleComments(eventId, dayId, eventName);
  }
}

// ─── Comment history modal (all comments, all stops) ───────
async function openCommentHistoryModal() {
  // Create modal lazily
  if (!document.getElementById('commentHistoryModal')) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'commentHistoryModal';
    overlay.innerHTML = `
      <div class="modal modal-large">
        <div class="modal-header">
          <h2>💬 All Comments</h2>
          <button class="modal-close" onclick="closeModal('commentHistoryModal')">×</button>
        </div>
        <div class="modal-body" id="commentHistoryList">
          <p style="text-align:center;padding:32px 0;color:var(--mid);">Loading…</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  document.getElementById('commentHistoryModal').classList.add('open');
  const listEl = document.getElementById('commentHistoryList');
  listEl.innerHTML = '<p style="text-align:center;padding:32px 0;color:var(--mid);">Loading comments…</p>';

  // Ensure all days' comments are loaded
  await Promise.all(ITINERARY.map(day => loadCommentsForDay(day.id)));

  // Collect all top-level comments with their day/stop info
  const topLevel = [];
  const replyMap = {};

  Object.entries(commentsCache).forEach(([eventId, comments]) => {
    let eventTitle = eventId, dayTitle = '', dayNumber = '', dayId = '';
    for (const day of ITINERARY) {
      const evt = day.events.find(e => e.id === eventId);
      if (evt) { eventTitle = evt.title; dayTitle = day.title; dayNumber = day.dayNumber; dayId = day.id; break; }
    }
    comments.forEach(c => {
      const enriched = { ...c, _eventTitle: eventTitle, _dayTitle: dayTitle, _dayNumber: dayNumber, _dayId: dayId };
      if (!c.parent_id) {
        topLevel.push(enriched);
      } else {
        if (!replyMap[c.parent_id]) replyMap[c.parent_id] = [];
        replyMap[c.parent_id].push(enriched);
      }
    });
  });

  if (topLevel.length === 0) {
    listEl.innerHTML = `<p style="text-align:center;padding:40px 0;color:var(--mid);font-style:italic;">No comments yet across any stops — click 💬 on any stop to be first!</p>`;
    return;
  }

  // Sort newest first
  topLevel.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  listEl.innerHTML = topLevel.map(c => {
    const date    = new Date(c.created_at);
    const typeTag = c.type === 'suggestion'
      ? `<span style="font-size:0.7rem;background:#ede9fe;color:#6d28d9;padding:1px 7px;border-radius:10px;font-weight:600;">💡 Suggestion</span>` : '';

    const myReplies = (replyMap[c.id] || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const repliesHtml = myReplies.map(r => {
      const rd = new Date(r.created_at);
      return `
        <div class="ch-reply">
          <span class="ic-avatar small">${getInitials(r.user_name)}</span>
          <div style="flex:1;">
            <div class="ic-header" style="margin-bottom:2px;">
              <span class="ic-name">${escapeHtml(r.user_name)}</span>
              <span class="ic-time">${formatCommentDate(rd)}</span>
            </div>
            <p class="ic-body">${escapeHtml(r.content)}</p>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="ch-entry">
        <div class="ch-location">
          <span class="ch-day-tag">Day ${c._dayNumber}</span>
          <span class="ch-stop-name">📍 ${escapeHtml(c._eventTitle)}</span>
          <button class="ch-goto-btn" onclick="closeModal('commentHistoryModal');scrollToDay('${c._dayId}')">Go to day →</button>
        </div>
        <div class="ch-comment">
          <span class="ic-avatar" style="flex-shrink:0;">${getInitials(c.user_name)}</span>
          <div style="flex:1;">
            <div class="ic-header" style="margin-bottom:4px;">
              <span class="ic-name">${escapeHtml(c.user_name)}</span>
              ${typeTag}
              <span class="ic-time" title="${date.toLocaleString()}">${formatCommentDate(date)}</span>
            </div>
            <p class="ic-body">${escapeHtml(c.content)}</p>
            ${repliesHtml}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ─── Edit History ──────────────────────────────────────────
const editHistoryCache = {};

async function saveEditHistory(eventId, dayId, fieldName, oldValue, newValue) {
  if (!currentUser) return;
  const entry = {
    id: 'local-' + Date.now(), created_at: new Date().toISOString(),
    event_id: eventId, day_id: dayId, user_id: currentUser.id, user_name: currentUser.name,
    field_name: fieldName, old_value: oldValue || '', new_value: newValue || '',
  };
  if (USE_SUPABASE) {
    try {
      const { data, error } = await supabase.from('edit_history').insert({
        event_id: entry.event_id, day_id: entry.day_id, user_name: entry.user_name,
        field_name: entry.field_name, old_value: entry.old_value, new_value: entry.new_value,
      }).select().single();
      if (!error && data) entry.id = data.id;
    } catch (_) {}
  } else {
    const stored = JSON.parse(localStorage.getItem('kims_history') || '{}');
    if (!stored[eventId]) stored[eventId] = [];
    stored[eventId].push(entry);
    localStorage.setItem('kims_history', JSON.stringify(stored));
  }
  if (!editHistoryCache[eventId]) editHistoryCache[eventId] = [];
  editHistoryCache[eventId].push(entry);
}

async function loadEditHistory(eventId) {
  if (editHistoryCache[eventId]) return editHistoryCache[eventId];
  if (USE_SUPABASE) {
    try {
      const { data } = await supabase.from('edit_history').select('*').eq('event_id', eventId).order('created_at', { ascending: false });
      editHistoryCache[eventId] = data || [];
    } catch (_) { editHistoryCache[eventId] = []; }
  } else {
    const stored = JSON.parse(localStorage.getItem('kims_history') || '{}');
    editHistoryCache[eventId] = (stored[eventId] || []).reverse();
  }
  return editHistoryCache[eventId];
}

async function openHistoryModal(eventId, eventName) {
  document.getElementById('historyModalTitle').textContent = `Edit History — ${eventName}`;
  document.getElementById('historyModal').classList.add('open');
  const history = await loadEditHistory(eventId);
  const list    = document.getElementById('historyList');
  if (!history?.length) { list.innerHTML = '<p class="no-comments">No edits have been made to this stop yet.</p>'; return; }
  list.innerHTML = history.map(h => {
    const date = new Date(h.created_at);
    return `
      <div class="history-entry">
        <div class="history-header">
          <span class="history-who"><span class="author-avatar small">${getInitials(h.user_name)}</span><strong>${escapeHtml(h.user_name)}</strong> edited <em>${escapeHtml(h.field_name)}</em></span>
          <span class="history-time">${formatCommentDate(date)}</span>
        </div>
        <div class="history-diff">
          <div class="diff-old"><span class="diff-label">Before</span>${escapeHtml(h.old_value || '(empty)')}</div>
          <div class="diff-arrow">→</div>
          <div class="diff-new"><span class="diff-label">After</span>${escapeHtml(h.new_value || '(empty)')}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── Event overrides — NEVER throws ───────────────────────
const eventOverrides = {};

async function loadEventOverrides() {
  try {
    if (USE_SUPABASE) {
      const { data } = await supabase.from('event_overrides').select('*');
      if (data) data.forEach(row => { eventOverrides[row.event_id] = row.data; });
    } else {
      const stored = localStorage.getItem('kims_overrides');
      if (stored) Object.assign(eventOverrides, JSON.parse(stored));
    }
  } catch (e) { console.warn('Could not load overrides:', e); }
}

async function saveEventOverride(eventId, updates) {
  // Always update in-memory first so re-render works even if storage fails
  const next = { ...(eventOverrides[eventId] || {}), ...updates };
  delete next._pendingCoords;
  eventOverrides[eventId] = next;

  try {
    if (USE_SUPABASE) {
      const { error } = await supabase.from('event_overrides').upsert({
        event_id:        eventId,
        data:            eventOverrides[eventId],
        updated_at:      new Date().toISOString(),
        updated_by_name: currentUser?.name || 'unknown',
      });
      if (error) {
        console.warn('Supabase override error, falling back to localStorage:', error);
        localStorage.setItem('kims_overrides', JSON.stringify(eventOverrides));
      }
    } else {
      localStorage.setItem('kims_overrides', JSON.stringify(eventOverrides));
    }
  } catch (err) {
    console.warn('Override save error, using localStorage:', err);
    try { localStorage.setItem('kims_overrides', JSON.stringify(eventOverrides)); } catch (_) {}
  }
}

// ─── Utilities ─────────────────────────────────────────────
function formatCommentDate(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60)     return 'just now';
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatTimeAgo(date) { return formatCommentDate(date); }

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
