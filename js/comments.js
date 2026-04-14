// ============================================================
// COMMENTS & SUGGESTIONS — Inline, with replies
// ============================================================

let activeEventId   = null;
let activeEventName = null;

// Loaded comments keyed by eventId
const commentsCache = {};

function getLocalComments(dayId) {
  return JSON.parse(localStorage.getItem('kims_comments_' + dayId) || '{}');
}

function saveLocalComment(dayId, eventId, comment) {
  const stored = getLocalComments(dayId);
  if (!stored[eventId]) stored[eventId] = [];
  stored[eventId].push(comment);
  localStorage.setItem('kims_comments_' + dayId, JSON.stringify(stored));
}

function ensureCurrentUserFromName(name) {
  const clean = (name || '').trim();
  if (!clean) return false;
  if (currentUser?.name === clean) return true;

  let deviceId = localStorage.getItem('kims_device_id');
  if (!deviceId) {
    deviceId = 'device-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('kims_device_id', deviceId);
  }

  currentUser = { id: deviceId, name: clean };
  localStorage.setItem('kims_trip_nickname', JSON.stringify(currentUser));
  if (typeof updateAuthUI === 'function') updateAuthUI();
  return true;
}

// ─── Load comments for a day (batch fetch) ─────────────────
async function loadCommentsForDay(dayId) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('day_id', dayId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      data.forEach(c => {
        if (!commentsCache[c.event_id]) commentsCache[c.event_id] = [];
        if (!commentsCache[c.event_id].find(x => x.id === c.id)) {
          commentsCache[c.event_id].push(c);
        }
      });
    }

    // Keep locally-fallback comments available even when Supabase is enabled.
    const localData = getLocalComments(dayId);
    Object.entries(localData).forEach(([eventId, comments]) => {
      if (!commentsCache[eventId]) commentsCache[eventId] = [];
      comments.forEach(c => {
        if (!commentsCache[eventId].find(x => x.id === c.id)) {
          commentsCache[eventId].push(c);
        }
      });
    });
  } else {
    // localStorage fallback
    const data = getLocalComments(dayId);
    Object.assign(commentsCache, data);
  }
  refreshCommentCounts();
}

// ─── Refresh comment count badges ──────────────────────────
function refreshCommentCounts() {
  Object.entries(commentsCache).forEach(([eventId, comments]) => {
    const badge = document.getElementById('comment-badge-' + eventId);
    const topLevel = comments.filter(c => !c.parent_id).length;
    if (badge) {
      badge.textContent = topLevel > 0 ? topLevel : '';
      badge.style.display = topLevel > 0 ? 'inline-flex' : 'none';
    }
  });
}

// ─── Render inline comments ────────────────────────────────
function renderInlineComments(eventId) {
  const listEl = document.getElementById('comments-list-' + eventId);
  const formEl = document.getElementById('comment-form-' + eventId);
  if (!listEl || !formEl) return;

  const comments = commentsCache[eventId] || [];
  const topLevel = comments.filter(c => !c.parent_id);
  const replies  = comments.filter(c =>  c.parent_id);

  // ── Comment list ──
  if (topLevel.length === 0) {
    listEl.innerHTML = `<p class="no-comments-inline">No comments yet — be the first! 👇</p>`;
  } else {
    listEl.innerHTML = topLevel.map(c => renderInlineComment(c, replies, eventId)).join('');
  }

  // ── Add-comment form ──
  if (currentUser) {
    formEl.innerHTML = `
      <div class="inline-comment-form" id="new-comment-form-${eventId}">
        <div class="inline-form-avatar">${getInitials(currentUser.name)}</div>
        <div class="inline-form-right">
          <textarea class="inline-comment-input" id="inline-text-${eventId}"
                    placeholder="Leave a comment for this stop…" rows="2"></textarea>
          <div class="inline-form-actions">
            <label class="radio-label-sm">
              <input type="radio" name="itype-${eventId}" value="comment" checked> 💬 Comment
            </label>
            <label class="radio-label-sm">
              <input type="radio" name="itype-${eventId}" value="suggestion"> 💡 Suggestion
            </label>
            <button class="btn-post-comment" onclick="submitInlineComment('${eventId}')">Post</button>
          </div>
        </div>
      </div>`;
  } else {
    formEl.innerHTML = `
      <div class="inline-comment-form" id="guest-comment-form-${eventId}">
        <div class="inline-form-avatar">?</div>
        <div class="inline-form-right">
          <input class="inline-comment-input" id="inline-name-${eventId}" placeholder="Your name" />
          <textarea class="inline-comment-input" id="inline-text-${eventId}"
                    placeholder="Leave a comment for this stop…" rows="2"></textarea>
          <div class="inline-form-actions">
            <label class="radio-label-sm">
              <input type="radio" name="itype-${eventId}" value="comment" checked> 💬 Comment
            </label>
            <label class="radio-label-sm">
              <input type="radio" name="itype-${eventId}" value="suggestion"> 💡 Suggestion
            </label>
            <button class="btn-post-comment" onclick="submitInlineCommentWithName('${eventId}')">Post</button>
          </div>
        </div>
      </div>`;
  }
}

function renderInlineComment(comment, allReplies, eventId) {
  const date    = new Date(comment.created_at);
  const timeStr = formatCommentDate(date);
  const myReplies = allReplies.filter(r => r.parent_id === comment.id);
  const typeTag = comment.type === 'suggestion'
    ? `<span class="comment-type suggestion-tag">💡 Suggestion</span>`
    : '';

  const repliesHtml = myReplies.length > 0
    ? `<div class="reply-thread">${myReplies.map(r => renderReplyComment(r)).join('')}</div>`
    : '';

  return `
    <div class="inline-comment-card ${comment.type === 'suggestion' ? 'is-suggestion' : ''}" id="comment-${comment.id}">
      <div class="ic-header">
        <span class="ic-avatar">${getInitials(comment.user_name)}</span>
        <span class="ic-name">${escapeHtml(comment.user_name)}</span>
        ${typeTag}
        <span class="ic-time" title="${date.toLocaleString()}">${timeStr}</span>
      </div>
      <p class="ic-body">${escapeHtml(comment.content)}</p>
      ${repliesHtml}
      <button class="ic-reply-btn" onclick="showReplyForm('${comment.id}', '${eventId}', '${escapeHtml(comment.user_name).replace(/'/g,"\\'")}')">
        ↩ Reply
      </button>
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

// ─── Show reply form ────────────────────────────────────────
function showReplyForm(parentId, eventId, parentAuthor) {
  // Close any open reply forms first
  document.querySelectorAll('.reply-form-slot').forEach(el => {
    if (el.id !== 'reply-slot-' + parentId) el.innerHTML = '';
  });

  const slot = document.getElementById('reply-slot-' + parentId);
  if (!slot) return;

  if (slot.querySelector('textarea')) {
    slot.innerHTML = ''; // toggle off
    return;
  }

  if (!currentUser) {
    slot.innerHTML = `
      <div class="reply-form">
        <div class="inline-form-avatar small">?</div>
        <div class="inline-form-right">
          <input class="inline-comment-input small" id="reply-name-${parentId}" placeholder="Your name" />
          <textarea class="inline-comment-input small" id="reply-text-${parentId}"
                    placeholder="Replying to ${escapeHtml(parentAuthor)}…" rows="2"></textarea>
          <div class="inline-form-actions">
            <button class="btn-post-comment small" onclick="submitReplyWithName('${parentId}', '${eventId}')">Reply</button>
            <button class="btn-cancel-reply" onclick="document.getElementById('reply-slot-${parentId}').innerHTML=''">Cancel</button>
          </div>
        </div>
      </div>`;
  } else {
    slot.innerHTML = `
      <div class="reply-form">
        <div class="inline-form-avatar small">${getInitials(currentUser.name)}</div>
        <div class="inline-form-right">
          <textarea class="inline-comment-input small" id="reply-text-${parentId}"
                    placeholder="Replying to ${escapeHtml(parentAuthor)}…" rows="2"></textarea>
          <div class="inline-form-actions">
            <button class="btn-post-comment small" onclick="submitReply('${parentId}', '${eventId}')">Reply</button>
            <button class="btn-cancel-reply" onclick="document.getElementById('reply-slot-${parentId}').innerHTML=''">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  setTimeout(() => document.getElementById('reply-text-' + parentId)?.focus(), 50);
}

// ─── Submit a new top-level comment ───────────────────────
async function submitInlineCommentWithName(eventId) {
  if (!currentUser) {
    const nameInput = document.getElementById('inline-name-' + eventId);
    if (!ensureCurrentUserFromName(nameInput?.value)) {
      nameInput?.focus();
      return;
    }
  }
  return submitInlineComment(eventId);
}

async function submitInlineComment(eventId) {
  if (!currentUser) {
    const nameInput = document.getElementById('inline-name-' + eventId);
    if (!ensureCurrentUserFromName(nameInput?.value)) {
      nameInput?.focus();
      return;
    }
  }

  const textarea = document.getElementById('inline-text-' + eventId);
  const content  = textarea?.value.trim();
  if (!content) { textarea?.focus(); return; }

  const typeEl = document.querySelector(`input[name="itype-${eventId}"]:checked`);
  const type   = typeEl ? typeEl.value : 'comment';

  const day   = ITINERARY.find(d => d.events.some(e => e.id === eventId));
  const dayId = day ? day.id : 'unknown';

  const comment = await _saveComment({ eventId, dayId, content, type, parentId: null });
  if (!comment) return;

  textarea.value = '';
  if (!commentsCache[eventId]) commentsCache[eventId] = [];
  commentsCache[eventId].push(comment);

  renderInlineComments(eventId);
  refreshCommentCounts();
}

// ─── Submit a reply ────────────────────────────────────────
async function submitReplyWithName(parentId, eventId) {
  if (!currentUser) {
    const nameInput = document.getElementById('reply-name-' + parentId);
    if (!ensureCurrentUserFromName(nameInput?.value)) {
      nameInput?.focus();
      return;
    }
  }
  return submitReply(parentId, eventId);
}

async function submitReply(parentId, eventId) {
  if (!currentUser) {
    const nameInput = document.getElementById('reply-name-' + parentId);
    if (!ensureCurrentUserFromName(nameInput?.value)) {
      nameInput?.focus();
      return;
    }
  }

  const textarea = document.getElementById('reply-text-' + parentId);
  const content  = textarea?.value.trim();
  if (!content) { textarea?.focus(); return; }

  const day   = ITINERARY.find(d => d.events.some(e => e.id === eventId));
  const dayId = day ? day.id : 'unknown';

  const reply = await _saveComment({ eventId, dayId, content, type: 'comment', parentId });
  if (!reply) return;

  if (!commentsCache[eventId]) commentsCache[eventId] = [];
  commentsCache[eventId].push(reply);

  renderInlineComments(eventId);
  refreshCommentCounts();
}

// ─── Core save helper ─────────────────────────────────────
async function _saveComment({ eventId, dayId, content, type, parentId }) {
  const comment = {
    id:         USE_SUPABASE ? null : 'local-' + Date.now(),
    created_at: new Date().toISOString(),
    event_id:   eventId,
    day_id:     dayId,
    user_id:    currentUser.id,
    user_name:  currentUser.name,
    content,
    type,
    parent_id:  parentId || null,
  };

  if (USE_SUPABASE) {
    const payload = {
      event_id:  comment.event_id,
      day_id:    comment.day_id,
      user_name: comment.user_name,
      content:   comment.content,
      type:      comment.type,
    };
    if (comment.parent_id) payload.parent_id = comment.parent_id;

    const { data, error } = await supabase
      .from('comments')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Comment save error:', error);
      saveLocalComment(dayId, eventId, comment);
      showToast('Saved locally on this device (Supabase comment policy blocked this insert).');
      return comment;
    }
    comment.id = data.id;
  } else {
    // localStorage
    saveLocalComment(dayId, eventId, comment);
  }

  return comment;
}

// ─── Legacy modal comment support (kept for backward compat) ─
async function openCommentModal(eventId, eventName, dayId) {
  // Redirect to inline view
  const body = document.getElementById('comments-body-' + eventId);
  if (body) {
    const card = document.getElementById('event-' + eventId);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (body.style.display === 'none') {
      toggleComments(eventId, dayId, eventName);
    }
    return;
  }
}

// ─── Edit History ──────────────────────────────────────────
const editHistoryCache = {};

async function saveEditHistory(eventId, dayId, fieldName, oldValue, newValue) {
  if (!currentUser) return;

  const entry = {
    id:         'local-' + Date.now(),
    created_at: new Date().toISOString(),
    event_id:   eventId,
    day_id:     dayId,
    user_id:    currentUser.id,
    user_name:  currentUser.name,
    field_name: fieldName,
    old_value:  oldValue || '',
    new_value:  newValue || '',
  };

  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('edit_history').insert({
      event_id:   entry.event_id,
      day_id:     entry.day_id,
      user_name:  entry.user_name,
      field_name: entry.field_name,
      old_value:  entry.old_value,
      new_value:  entry.new_value,
    }).select().single();
    if (!error && data) entry.id = data.id;
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
    const { data } = await supabase
      .from('edit_history')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    editHistoryCache[eventId] = data || [];
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

  if (!history || history.length === 0) {
    list.innerHTML = '<p class="no-comments">No edits have been made to this stop yet.</p>';
    return;
  }

  list.innerHTML = history.map(h => {
    const date    = new Date(h.created_at);
    const timeStr = formatCommentDate(date);
    return `
      <div class="history-entry">
        <div class="history-header">
          <span class="history-who">
            <span class="author-avatar small">${getInitials(h.user_name)}</span>
            <strong>${escapeHtml(h.user_name)}</strong> edited <em>${escapeHtml(h.field_name)}</em>
          </span>
          <span class="history-time">${timeStr}</span>
        </div>
        <div class="history-diff">
          <div class="diff-old"><span class="diff-label">Before</span>${escapeHtml(h.old_value || '(empty)')}</div>
          <div class="diff-arrow">→</div>
          <div class="diff-new"><span class="diff-label">After</span>${escapeHtml(h.new_value || '(empty)')}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── Save event override ────────────────────────────────────
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
  } catch (e) {
    console.warn('Could not load event overrides, continuing without them.', e);
  }
}

async function saveEventOverride(eventId, updates) {
  Object.assign(eventOverrides, { [eventId]: { ...(eventOverrides[eventId] || {}), ...updates } });

  if (USE_SUPABASE) {
    await supabase.from('event_overrides').upsert({
      event_id:        eventId,
      data:            eventOverrides[eventId],
      updated_at:      new Date().toISOString(),
      updated_by_name: currentUser?.name || 'unknown',
    });
  } else {
    localStorage.setItem('kims_overrides', JSON.stringify(eventOverrides));
  }
}

// ─── Utilities ─────────────────────────────────────────────
function formatCommentDate(date) {
  const now     = Date.now();
  const seconds = Math.floor((now - date.getTime()) / 1000);
  if (seconds < 60)     return 'just now';
  if (seconds < 3600)   return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400)  return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Keep old name for backward compat
function formatTimeAgo(date) { return formatCommentDate(date); }

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
