// ============================================================
// COMMENTS & SUGGESTIONS — Inline, with replies
// ============================================================

let activeEventId   = null;
let activeEventName = null;

// Loaded comments keyed by eventId
const commentsCache = {};

// ─── Unread / seen tracking (per device) ─────────────────
function _seenKey() {
  return currentUser ? 'kims_seen_' + currentUser.id : null;
}
function getSeenIds() {
  const key = _seenKey();
  if (!key) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch (_) { return new Set(); }
}
function markSeen(ids) {
  const key = _seenKey();
  if (!key || !ids || !ids.length) return;
  const seen = getSeenIds();
  ids.forEach(id => seen.add(String(id)));
  try { localStorage.setItem(key, JSON.stringify([...seen])); } catch (_) {}
  refreshUnreadBadge();
}
function markAllSeen() {
  const all = [];
  Object.values(commentsCache).forEach(list => list.forEach(c => all.push(c.id)));
  markSeen(all);
}
// Called once after a user first sets their nickname — baselines existing comments so nothing old shows as unread
function baselineSeenForNewUser() {
  const key = _seenKey();
  if (!key) return;
  if (localStorage.getItem(key) !== null) return; // already has history
  markAllSeen();
}
function getUnreadCount() {
  if (!currentUser) return 0;
  const seen = getSeenIds();
  let n = 0;
  Object.values(commentsCache).forEach(list => {
    list.forEach(c => {
      if (!seen.has(String(c.id)) && c.user_name !== currentUser.name) n++;
    });
  });
  return n;
}
function refreshUnreadBadge() {
  const badge = document.getElementById('navCommentsBadge');
  if (!badge) return;
  const n = getUnreadCount();
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.style.display = n > 0 ? 'inline-flex' : 'none';
}
function _refreshHistoryIfOpen() {
  const modal = document.getElementById('commentHistoryModal');
  if (!modal || !modal.classList.contains('open')) return;
  _renderCommentHistoryList();
  markAllSeen();
  refreshUnreadBadge();
}

function getLocalComments(dayId) {
  try {
    return JSON.parse(localStorage.getItem('kims_comments_' + dayId) || '{}');
  } catch (_) {
    return {};
  }
}

function mergeCommentsIntoCache(data) {
  Object.entries(data || {}).forEach(([eventId, comments]) => {
    if (!commentsCache[eventId]) commentsCache[eventId] = [];
    (comments || []).forEach(comment => {
      if (!commentsCache[eventId].find(existing => existing.id === comment.id)) {
        commentsCache[eventId].push(comment);
      }
    });
  });
}

function saveLocalComment(dayId, eventId, comment) {
  const stored = getLocalComments(dayId);
  if (!stored[eventId]) stored[eventId] = [];
  stored[eventId].push(comment);
  localStorage.setItem('kims_comments_' + dayId, JSON.stringify(stored));
}

// ─── Load comments for a day (batch fetch) ─────────────────
async function loadCommentsForDay(dayId) {
  mergeCommentsIntoCache(getLocalComments(dayId));

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
    } else if (error) {
      console.error('Comment load error:', error);
      showToast('Comments are loading from this device only right now.');
    }
  }
  refreshCommentCounts();
  refreshUnreadBadge();
  _refreshHistoryIfOpen();
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
      <div class="inline-login-prompt">
        <p>Enter a name to leave a comment.</p>
        <button class="btn-enter-name" onclick="openAuthModal()">Enter my name ✏️</button>
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
    openAuthModal();
    return;
  }

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

  setTimeout(() => document.getElementById('reply-text-' + parentId)?.focus(), 50);
}

// ─── Submit a new top-level comment ───────────────────────
function submitInlineComment(eventId) {
  if (!currentUser) { openAuthModal(); return; }

  const textarea = document.getElementById('inline-text-' + eventId);
  const content  = textarea ? textarea.value.trim() : '';
  if (!content) { if (textarea) textarea.focus(); return; }

  const typeEl = document.querySelector('input[name="itype-' + eventId + '"]:checked');
  const type   = typeEl ? typeEl.value : 'comment';

  const day   = ITINERARY.find(function(d) { return d.events.some(function(e) { return e.id === eventId; }); });
  const dayId = day ? day.id : 'unknown';

  // Build comment immediately
  const comment = _buildComment(eventId, dayId, content, type, null);

  // Show in UI right away — don't wait for network
  textarea.value = '';
  if (!commentsCache[eventId]) commentsCache[eventId] = [];
  commentsCache[eventId].push(comment);
  renderInlineComments(eventId);
  refreshCommentCounts();
  markSeen([comment.id]); // own comment is always seen
  refreshUnreadBadge();
  _refreshHistoryIfOpen();

  // Save in the background
  _persistComment(comment, dayId);
}

// ─── Submit a reply ────────────────────────────────────────
function submitReply(parentId, eventId) {
  if (!currentUser) { openAuthModal(); return; }

  const textarea = document.getElementById('reply-text-' + parentId);
  const content  = textarea ? textarea.value.trim() : '';
  if (!content) { if (textarea) textarea.focus(); return; }

  const day   = ITINERARY.find(function(d) { return d.events.some(function(e) { return e.id === eventId; }); });
  const dayId = day ? day.id : 'unknown';

  const reply = _buildComment(eventId, dayId, content, 'comment', parentId);

  // Show immediately
  if (textarea) textarea.value = '';
  if (!commentsCache[eventId]) commentsCache[eventId] = [];
  commentsCache[eventId].push(reply);
  renderInlineComments(eventId);
  refreshCommentCounts();
  markSeen([reply.id]);
  refreshUnreadBadge();
  _refreshHistoryIfOpen();

  _persistComment(reply, dayId);
}

// ─── Build a comment object (synchronous) ─────────────────
function _buildComment(eventId, dayId, content, type, parentId) {
  return {
    id:         'local-' + Date.now(),
    created_at: new Date().toISOString(),
    event_id:   eventId,
    day_id:     dayId,
    user_id:    null,
    user_name:  currentUser.name,
    content:    content,
    type:       type,
    parent_id:  parentId || null,
  };
}

// ─── Persist comment to Supabase + localStorage (async, background) ───
function _persistComment(comment, dayId) {
  // Always save locally first
  saveLocalComment(dayId, comment.event_id, comment);

  if (!USE_SUPABASE) return;

  var payload = {
    event_id:  comment.event_id,
    day_id:    comment.day_id,
    user_name: comment.user_name,
    content:   comment.content,
    type:      comment.type,
  };
  if (comment.parent_id) payload.parent_id = comment.parent_id;

  supabase
    .from('comments')
    .insert(payload)
    .select()
    .single()
    .then(function(result) {
      if (result.error) {
        console.warn('Supabase comment save failed (stored locally):', result.error);
      } else if (result.data) {
        // Update the in-memory entry with the real Supabase ID
        var list = commentsCache[comment.event_id];
        if (list) {
          var idx = list.findIndex(function(c) { return c.id === comment.id; });
          if (idx !== -1) list[idx] = Object.assign({}, comment, result.data);
        }
      }
    })
    .catch(function(err) {
      console.warn('Supabase comment save exception (stored locally):', err);
    });
}

// Keep old name used by any external callers
async function _saveComment({ eventId, dayId, content, type, parentId }) {
  const comment = _buildComment(eventId, dayId, content, type, parentId);
  _persistComment(comment, dayId);
  return comment;
}

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
  // Always load localStorage first as a baseline — so locally-saved overrides survive even if Supabase previously failed
  try {
    const stored = localStorage.getItem('kims_overrides');
    if (stored) Object.assign(eventOverrides, JSON.parse(stored));
  } catch (_) {}

  if (USE_SUPABASE) {
    try {
      const { data } = await supabase.from('event_overrides').select('*');
      // Supabase data wins over localStorage for any row that exists in both
      if (data) data.forEach(row => { eventOverrides[row.event_id] = row.data; });
    } catch (e) {
      console.warn('Could not load event overrides from Supabase, using localStorage data.', e);
    }
  }
}

async function saveEventOverride(eventId, updates) {
  const nextOverride = { ...(eventOverrides[eventId] || {}), ...updates };
  delete nextOverride._pendingCoords;
  // Update in-memory store first — synchronously, before any async work
  eventOverrides[eventId] = nextOverride;

  // Always write to localStorage immediately as insurance
  try {
    localStorage.setItem('kims_overrides', JSON.stringify(eventOverrides));
  } catch (_) {}

  if (USE_SUPABASE) {
    try {
      await supabase.from('event_overrides').upsert({
        event_id:        eventId,
        data:            eventOverrides[eventId],
        updated_at:      new Date().toISOString(),
        updated_by_name: currentUser?.name || 'unknown',
      });
    } catch (err) {
      // Supabase failed — data is still in localStorage and in-memory, so the page re-renders correctly
      console.warn('Supabase override save failed, using localStorage fallback:', err);
    }
  }
  // Never throws, so Promise.all in saveEdit always completes and the re-render always runs
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

// ─── Comment History Modal ─────────────────────────────────
async function openCommentHistoryModal() {
  // Lazily create modal DOM on first open
  let modal = document.getElementById('commentHistoryModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'commentHistoryModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal modal-large">
        <div class="modal-header">
          <h2>💬 All Comments</h2>
          <button class="modal-close" onclick="closeModal('commentHistoryModal')">×</button>
        </div>
        <div class="modal-body" id="commentHistoryList">
          <p class="no-comments">Loading…</p>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }
  modal.classList.add('open');

  const listEl = document.getElementById('commentHistoryList');
  listEl.innerHTML = '<p class="no-comments">Loading comments…</p>';

  // Load all days, then render and mark everything as seen
  await Promise.all(ITINERARY.map(day => loadCommentsForDay(day.id)));
  _renderCommentHistoryList();
  markAllSeen();
  refreshUnreadBadge();
}

// ─── Renders the comment history list (called on open + real-time updates) ──
function _renderCommentHistoryList() {
  const listEl = document.getElementById('commentHistoryList');
  if (!listEl) return;

  const allComments = [];
  ITINERARY.forEach(day => {
    day.events.forEach(event => {
      const topLevel = (commentsCache[event.id] || []).filter(c => !c.parent_id);
      topLevel.forEach(c => {
        const replies = (commentsCache[event.id] || []).filter(r => r.parent_id === c.id);
        allComments.push({
          comment:   c,
          replies,
          dayTitle:  day.title,
          dayEmoji:  day.emoji,
          dayId:     day.id,
          eventName: event.title,
        });
      });
    });
  });

  allComments.sort((a, b) => new Date(b.comment.created_at) - new Date(a.comment.created_at));

  if (allComments.length === 0) {
    listEl.innerHTML = '<p class="no-comments">No comments yet — be the first to leave one on a stop!</p>';
    return;
  }

  const seen = getSeenIds();

  listEl.innerHTML = allComments.map(({ comment, replies, dayTitle, dayEmoji, dayId, eventName }) => {
    const date    = new Date(comment.created_at);
    const timeStr = formatCommentDate(date);
    const typeTag = comment.type === 'suggestion'
      ? `<span class="comment-type suggestion-tag">💡 Suggestion</span>` : '';
    const isUnread = currentUser
      && comment.user_name !== currentUser.name
      && !seen.has(String(comment.id));

    const repliesHtml = replies.length > 0
      ? `<div class="ch-replies">${replies.map(r => {
          const rUnread = currentUser && r.user_name !== currentUser.name && !seen.has(String(r.id));
          return `<div class="ch-reply${rUnread ? ' ch-unread-item' : ''}">
            <span class="ic-avatar small">${getInitials(r.user_name)}</span>
            <div>
              <span class="ic-name">${escapeHtml(r.user_name)}</span>
              <span class="ic-time">${formatCommentDate(new Date(r.created_at))}</span>
              <p class="ic-body">${escapeHtml(r.content)}</p>
            </div>
          </div>`;
        }).join('')}</div>` : '';

    return `
      <div class="ch-entry${isUnread ? ' ch-unread-item' : ''}">
        <div class="ch-location">
          <span class="ch-day-tag">${dayEmoji} ${escapeHtml(dayTitle)}</span>
          <span class="ch-stop-name">· ${escapeHtml(eventName)}</span>
          <button class="ch-goto-btn" onclick="closeModal('commentHistoryModal'); scrollToDay('${dayId}')">Go to day ↗</button>
        </div>
        <div class="ch-comment">
          <span class="ic-avatar">${getInitials(comment.user_name)}</span>
          <div class="ch-comment-body">
            <div class="ic-header">
              <span class="ic-name">${escapeHtml(comment.user_name)}</span>
              ${typeTag}
              <span class="ic-time">${timeStr}</span>
            </div>
            <p class="ic-body">${escapeHtml(comment.content)}</p>
          </div>
        </div>
        ${repliesHtml}
      </div>`;
  }).join('');
}
