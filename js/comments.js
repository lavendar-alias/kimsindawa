diff --git a/js/comments.js b/js/comments.js
index 325c68174e2cc111b1a741a3a941f461f9f92ef2..0b601cdc1e302f5cd89353dbe42d5e4baa9a6c41 100644
--- a/js/comments.js
+++ b/js/comments.js
@@ -1,59 +1,95 @@
 // ============================================================
 // COMMENTS & SUGGESTIONS — Inline, with replies
 // ============================================================
 
 let activeEventId   = null;
 let activeEventName = null;
 
 // Loaded comments keyed by eventId
 const commentsCache = {};
 
+function getLocalComments(dayId) {
+  return JSON.parse(localStorage.getItem('kims_comments_' + dayId) || '{}');
+}
+
+function saveLocalComment(dayId, eventId, comment) {
+  const stored = getLocalComments(dayId);
+  if (!stored[eventId]) stored[eventId] = [];
+  stored[eventId].push(comment);
+  localStorage.setItem('kims_comments_' + dayId, JSON.stringify(stored));
+}
+
+function ensureCurrentUserFromName(name) {
+  const clean = (name || '').trim();
+  if (!clean) return false;
+  if (currentUser?.name === clean) return true;
+
+  let deviceId = localStorage.getItem('kims_device_id');
+  if (!deviceId) {
+    deviceId = 'device-' + Math.random().toString(36).slice(2, 10);
+    localStorage.setItem('kims_device_id', deviceId);
+  }
+
+  currentUser = { id: deviceId, name: clean };
+  localStorage.setItem('kims_trip_nickname', JSON.stringify(currentUser));
+  if (typeof updateAuthUI === 'function') updateAuthUI();
+  return true;
+}
+
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
+
+    // Keep locally-fallback comments available even when Supabase is enabled.
+    const localData = getLocalComments(dayId);
+    Object.entries(localData).forEach(([eventId, comments]) => {
+      if (!commentsCache[eventId]) commentsCache[eventId] = [];
+      comments.forEach(c => {
+        if (!commentsCache[eventId].find(x => x.id === c.id)) {
+          commentsCache[eventId].push(c);
+        }
+      });
+    });
   } else {
     // localStorage fallback
-    const stored = localStorage.getItem('kims_comments_' + dayId);
-    if (stored) {
-      const data = JSON.parse(stored);
-      Object.assign(commentsCache, data);
-    }
+    const data = getLocalComments(dayId);
+    Object.assign(commentsCache, data);
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
@@ -64,53 +100,66 @@ function renderInlineComments(eventId) {
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
-      <div class="inline-login-prompt">
-        <p>Enter a name to leave a comment.</p>
-        <button class="btn-enter-name" onclick="openAuthModal()">Enter my name ✏️</button>
+      <div class="inline-comment-form" id="guest-comment-form-${eventId}">
+        <div class="inline-form-avatar">?</div>
+        <div class="inline-form-right">
+          <input class="inline-comment-input" id="inline-name-${eventId}" placeholder="Your name" />
+          <textarea class="inline-comment-input" id="inline-text-${eventId}"
+                    placeholder="Leave a comment for this stop…" rows="2"></textarea>
+          <div class="inline-form-actions">
+            <label class="radio-label-sm">
+              <input type="radio" name="itype-${eventId}" value="comment" checked> 💬 Comment
+            </label>
+            <label class="radio-label-sm">
+              <input type="radio" name="itype-${eventId}" value="suggestion"> 💡 Suggestion
+            </label>
+            <button class="btn-post-comment" onclick="submitInlineCommentWithName('${eventId}')">Post</button>
+          </div>
+        </div>
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
@@ -129,96 +178,129 @@ function renderReplyComment(reply) {
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
-    openAuthModal();
-    return;
-  }
-
-  slot.innerHTML = `
-    <div class="reply-form">
-      <div class="inline-form-avatar small">${getInitials(currentUser.name)}</div>
-      <div class="inline-form-right">
-        <textarea class="inline-comment-input small" id="reply-text-${parentId}"
-                  placeholder="Replying to ${escapeHtml(parentAuthor)}…" rows="2"></textarea>
-        <div class="inline-form-actions">
-          <button class="btn-post-comment small" onclick="submitReply('${parentId}', '${eventId}')">Reply</button>
-          <button class="btn-cancel-reply" onclick="document.getElementById('reply-slot-${parentId}').innerHTML=''">Cancel</button>
+    slot.innerHTML = `
+      <div class="reply-form">
+        <div class="inline-form-avatar small">?</div>
+        <div class="inline-form-right">
+          <input class="inline-comment-input small" id="reply-name-${parentId}" placeholder="Your name" />
+          <textarea class="inline-comment-input small" id="reply-text-${parentId}"
+                    placeholder="Replying to ${escapeHtml(parentAuthor)}…" rows="2"></textarea>
+          <div class="inline-form-actions">
+            <button class="btn-post-comment small" onclick="submitReplyWithName('${parentId}', '${eventId}')">Reply</button>
+            <button class="btn-cancel-reply" onclick="document.getElementById('reply-slot-${parentId}').innerHTML=''">Cancel</button>
+          </div>
         </div>
-      </div>
-    </div>`;
+      </div>`;
+  } else {
+    slot.innerHTML = `
+      <div class="reply-form">
+        <div class="inline-form-avatar small">${getInitials(currentUser.name)}</div>
+        <div class="inline-form-right">
+          <textarea class="inline-comment-input small" id="reply-text-${parentId}"
+                    placeholder="Replying to ${escapeHtml(parentAuthor)}…" rows="2"></textarea>
+          <div class="inline-form-actions">
+            <button class="btn-post-comment small" onclick="submitReply('${parentId}', '${eventId}')">Reply</button>
+            <button class="btn-cancel-reply" onclick="document.getElementById('reply-slot-${parentId}').innerHTML=''">Cancel</button>
+          </div>
+        </div>
+      </div>`;
+  }
 
   setTimeout(() => document.getElementById('reply-text-' + parentId)?.focus(), 50);
 }
 
 // ─── Submit a new top-level comment ───────────────────────
+async function submitInlineCommentWithName(eventId) {
+  if (!currentUser) {
+    const nameInput = document.getElementById('inline-name-' + eventId);
+    if (!ensureCurrentUserFromName(nameInput?.value)) {
+      nameInput?.focus();
+      return;
+    }
+  }
+  return submitInlineComment(eventId);
+}
+
 async function submitInlineComment(eventId) {
   if (!currentUser) { openAuthModal(); return; }
 
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
+async function submitReplyWithName(parentId, eventId) {
+  if (!currentUser) {
+    const nameInput = document.getElementById('reply-name-' + parentId);
+    if (!ensureCurrentUserFromName(nameInput?.value)) {
+      nameInput?.focus();
+      return;
+    }
+  }
+  return submitReply(parentId, eventId);
+}
+
 async function submitReply(parentId, eventId) {
   if (!currentUser) { openAuthModal(); return; }
 
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
@@ -227,60 +309,58 @@ async function _saveComment({ eventId, dayId, content, type, parentId }) {
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
-      showToast('Could not save — check Supabase setup or run supabase-patch.sql.');
-      return null;
+      saveLocalComment(dayId, eventId, comment);
+      showToast('Saved locally on this device (Supabase comment policy blocked this insert).');
+      return comment;
     }
     comment.id = data.id;
   } else {
     // localStorage
-    const stored = JSON.parse(localStorage.getItem('kims_comments_' + dayId) || '{}');
-    if (!stored[eventId]) stored[eventId] = [];
-    stored[eventId].push(comment);
-    localStorage.setItem('kims_comments_' + dayId, JSON.stringify(stored));
+    saveLocalComment(dayId, eventId, comment);
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
 
