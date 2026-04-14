// ============================================================
// AUTH — Nickname only, saved to this device (localStorage)
// No email or password required.
// ============================================================

let currentUser = null;

// ─── Initialize ────────────────────────────────────────────
async function initAuth() {
  const stored = localStorage.getItem('kims_trip_nickname');
  if (stored) {
    currentUser = JSON.parse(stored);
  }
  updateAuthUI();
}

// ─── Save nickname ─────────────────────────────────────────
function saveNickname() {
  const input = document.getElementById('nicknameInput');
  const name  = input?.value.trim();

  if (!name) {
    input?.classList.add('shake');
    setTimeout(() => input?.classList.remove('shake'), 500);
    return;
  }

  // Generate a stable device ID so comments are attributed consistently
  let deviceId = localStorage.getItem('kims_device_id');
  if (!deviceId) {
    deviceId = 'device-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('kims_device_id', deviceId);
  }

  currentUser = { id: deviceId, name };
  localStorage.setItem('kims_trip_nickname', JSON.stringify(currentUser));

  closeModal('authModal');
  updateAuthUI();
  if (typeof refreshApp === 'function') {
    Promise.resolve(refreshApp()).catch(e => console.warn('refreshApp error:', e));
  }
}

// ─── Change nickname ────────────────────────────────────────
function changeNickname() {
  const input = document.getElementById('nicknameInput');
  if (input && currentUser) input.value = currentUser.name;
  document.getElementById('authModal').classList.add('open');
}

// ─── Clear (sign out) ──────────────────────────────────────
function signOut() {
  currentUser = null;
  localStorage.removeItem('kims_trip_nickname');
  updateAuthUI();
  if (typeof refreshApp === 'function') refreshApp();
}

// ─── Update nav UI ─────────────────────────────────────────
function updateAuthUI() {
  const authBtn  = document.getElementById('authBtn');
  const userInfo = document.getElementById('userInfo');

  if (currentUser) {
    if (authBtn)  { authBtn.textContent = 'Leave'; authBtn.onclick = signOut; }
    if (userInfo) { userInfo.textContent = `👋 ${currentUser.name}`; userInfo.style.display = 'block'; }
    document.querySelectorAll('.edit-btn').forEach(btn => btn.style.display = 'inline-flex');
  } else {
    if (authBtn)  { authBtn.textContent = 'Join the Trip'; authBtn.onclick = openAuthModal; }
    if (userInfo) { userInfo.style.display = 'none'; }
    document.querySelectorAll('.edit-btn').forEach(btn => btn.style.display = 'none');
  }
}

// ─── Open modal ────────────────────────────────────────────
function openAuthModal() {
  const input = document.getElementById('nicknameInput');
  if (input && currentUser) input.value = currentUser.name;
  document.getElementById('authModal').classList.add('open');
  setTimeout(() => document.getElementById('nicknameInput')?.focus(), 100);
}

// ─── Save from the inline gate on the main page ────────────
function saveNicknameFromGate() {
  const input = document.getElementById('gateNicknameInput');
  const name  = input?.value.trim();
  if (!name) {
    input?.classList.add('shake');
    setTimeout(() => input?.classList.remove('shake'), 500);
    return;
  }
  // Reuse the modal input slot so saveNickname() works
  const modalInput = document.getElementById('nicknameInput');
  if (modalInput) modalInput.value = name;
  else {
    // Directly set without the modal
    let deviceId = localStorage.getItem('kims_device_id');
    if (!deviceId) {
      deviceId = 'device-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('kims_device_id', deviceId);
    }
    currentUser = { id: deviceId, name };
    localStorage.setItem('kims_trip_nickname', JSON.stringify(currentUser));
    updateAuthUI();
    if (typeof refreshApp === 'function') refreshApp();
    return;
  }
  saveNickname();
}

// Allow pressing Enter to submit
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('authModal')?.classList.contains('open')) {
    saveNickname();
  }
});
