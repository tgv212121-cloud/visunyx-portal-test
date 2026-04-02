// ============================================================
// VISUNYX PORTAL — Shared Components & UI Helpers
// ============================================================

let _lucideTimer = null;
function refreshIcons() {
  if (_lucideTimer) return;
  _lucideTimer = requestAnimationFrame(() => {
    _lucideTimer = null;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
}

const _prefetched = new Set();
function prefetchOnHover(selector, urlExtractor) {
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener('mouseenter', () => {
      const url = urlExtractor(el);
      if (!url || _prefetched.has(url)) return;
      _prefetched.add(url);
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    }, { once: true });
  });
}

// ── SIDEBAR (minimaliste : logo + compte) ────────────────────
function renderSidebar(activeItem, unreadCount = 0, role = 'admin') {
  return `
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <img src="${rootPath()}shared/visunyx-icon.svg" alt="Visunyx" style="height:24px;width:auto;">
      <span style="font-size:15px;font-weight:700;color:#fff;letter-spacing:0.02em;">Visunyx</span>
      <span class="sidebar-badge">Studio</span>
    </div>

    <div class="sidebar-footer">
      <div class="sidebar-user" id="sidebar-user-btn" style="cursor:pointer;" data-i18n-title="nav.account">
        <div class="avatar" id="sidebar-avatar" style="position:relative;overflow:hidden;"></div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name" id="sidebar-user-name" data-i18n="nav.loading">${t('nav.loading')}</div>
          <div class="sidebar-user-role">${tRole(role)}</div>
        </div>
        <i data-lucide="settings" style="width:14px;height:14px;color:var(--fg-subtle);flex-shrink:0;"></i>
      </div>
    </div>
  </aside>

  ${renderAccountPanel()}`;
}

/** Rend le panneau parametres du compte (reutilisable sans sidebar) */
function renderAccountPanel() {
  return `<div id="account-panel" class="account-panel" style="display:none;">
    <div class="account-panel-inner">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;">
        <div style="font-size:var(--text-xl);font-weight:800;color:var(--fg);">${t('account.title')}</div>
        <button class="btn btn-ghost btn-icon" onclick="closeAccountPanel()" style="width:32px;height:32px;">
          <i data-lucide="x" style="width:16px;height:16px;"></i>
        </button>
      </div>

      <!-- Avatar -->
      <div style="text-align:center;margin-bottom:28px;">
        <div id="account-avatar-wrap" style="position:relative;display:inline-block;cursor:pointer;" onclick="document.getElementById('avatar-input').click()">
          <div class="avatar" id="account-avatar" style="width:80px;height:80px;font-size:28px;border:3px solid rgba(147,50,255,0.3);"></div>
          <div style="position:absolute;bottom:0;right:0;width:28px;height:28px;background:var(--purple);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg);">
            <i data-lucide="camera" style="width:12px;height:12px;color:#fff;"></i>
          </div>
          <input type="file" id="avatar-input" accept="image/*" style="display:none;" onchange="handleAvatarUpload(this.files)">
        </div>
        <div id="avatar-uploading" style="display:none;font-size:var(--text-xs);color:var(--purple);margin-top:6px;">${t('account.avatar.uploading')}</div>
      </div>

      <!-- Form -->
      <form id="account-form" onsubmit="return saveAccountSettings(event)">
        <div class="field-group">
          <label class="field-label">${t('account.name')}</label>
          <input type="text" id="account-name" class="vx-input" placeholder="${t('account.name.placeholder')}">
        </div>
        <div class="field-group">
          <label class="field-label">${t('account.email')}</label>
          <input type="email" id="account-email" class="vx-input" placeholder="${t('account.email.placeholder')}" disabled style="opacity:0.6;cursor:not-allowed;">
          <div style="font-size:10px;color:var(--fg-subtle);margin-top:4px;">${t('account.email.hint')}</div>
        </div>
        <div class="field-group">
          <label class="field-label">${t('account.phone')}</label>
          <input type="tel" id="account-phone" class="vx-input" placeholder="${t('account.phone.placeholder')}">
        </div>
        <div class="field-group">
          <label class="field-label">${t('account.company')}</label>
          <input type="text" id="account-company" class="vx-input" placeholder="${t('account.company.placeholder')}">
        </div>

        <div style="display:flex;gap:10px;margin-top:24px;">
          <button type="submit" class="btn btn-primary" style="flex:1;">
            <i data-lucide="save" style="width:14px;height:14px;margin-right:6px;"></i> ${t('account.save')}
          </button>
          <button type="button" class="btn btn-ghost" onclick="signOut()">
            <i data-lucide="log-out" style="width:14px;height:14px;margin-right:6px;"></i> ${t('account.logout')}
          </button>
        </div>
      </form>

      <!-- Change Password Section -->
      <div style="margin-top:28px;padding-top:24px;border-top:1px solid var(--glass-border);">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--fg);margin-bottom:16px;">${t('account.password.title')}</div>
        <form id="password-form" onsubmit="return changePassword(event)">
          <div class="field-group">
            <label class="field-label">${t('account.password.new')}</label>
            <input type="password" id="account-new-pw" class="vx-input" placeholder="${t('account.password.new.placeholder')}" minlength="6">
          </div>
          <div class="field-group">
            <label class="field-label">${t('account.password.confirm')}</label>
            <input type="password" id="account-confirm-pw" class="vx-input" placeholder="${t('account.password.confirm.placeholder')}">
          </div>
          <button type="submit" class="btn btn-ghost" style="width:100%;">
            <i data-lucide="lock" style="width:14px;height:14px;margin-right:6px;"></i> ${t('account.password.submit')}
          </button>
        </form>
      </div>
    </div>
  </div>`;
}

// ── Account Panel Logic ─────────────────────────────────────
let _accountPanelOpen = false;
let _currentProfile = null;

function openAccountPanel() {
  const panel = document.getElementById('account-panel');
  if (!panel) return;
  panel.style.display = '';
  _accountPanelOpen = true;
  loadAccountData();
  requestAnimationFrame(() => panel.classList.add('open'));
}

function closeAccountPanel() {
  const panel = document.getElementById('account-panel');
  if (!panel) return;
  panel.classList.remove('open');
  _accountPanelOpen = false;
  setTimeout(() => { panel.style.display = 'none'; }, 250);
}

async function loadAccountData() {
  const user = await getUser();
  if (!user) return;
  const profile = await getProfile(user.id);
  _currentProfile = profile;

  document.getElementById('account-name').value = profile?.full_name || '';
  document.getElementById('account-email').value = profile?.email || user.email || '';
  document.getElementById('account-phone').value = profile?.phone || '';
  document.getElementById('account-company').value = profile?.company_name || '';

  const avatarEl = document.getElementById('account-avatar');
  if (profile?.avatar_url) {
    avatarEl.innerHTML = `<img src="${profile.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    avatarEl.textContent = initials(profile?.full_name || user.email);
  }
}

async function handleAvatarUpload(files) {
  if (!files || !files.length) return;
  const file = files[0];
  if (file.size > 5 * 1024 * 1024) { showToast(t('account.avatar.toobig'), 'error'); return; }

  const uploading = document.getElementById('avatar-uploading');
  uploading.style.display = '';
  try {
    const user = await getUser();
    const url = await uploadAvatar(user.id, file);
    // Update avatar everywhere
    const accountAvatar = document.getElementById('account-avatar');
    accountAvatar.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    if (sidebarAvatar) sidebarAvatar.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    showToast(t('account.avatar.success'), 'success');
  } catch(e) {
    showToast(t('account.avatar.error'), 'error');
  }
  uploading.style.display = 'none';
}

async function saveAccountSettings(e) {
  e.preventDefault();
  const user = await getUser();
  if (!user) return;

  const name = document.getElementById('account-name').value.trim();
  const phone = document.getElementById('account-phone').value.trim();
  const company = document.getElementById('account-company').value.trim();

  if (!name) { showToast(t('account.name.required'), 'error'); return; }

  try {
    await updateProfile(user.id, {
      full_name: name,
      phone: phone || null,
      company_name: company || null
    });
    // Update sidebar
    const nameEl = document.getElementById('sidebar-user-name');
    if (nameEl) nameEl.textContent = name;
    const avatarEl = document.getElementById('sidebar-avatar');
    if (avatarEl && !avatarEl.querySelector('img')) avatarEl.textContent = initials(name);
    showToast(t('account.saved'), 'success');
    closeAccountPanel();
  } catch(e) {
    showToast(t('account.error'), 'error');
  }
  return false;
}

async function changePassword(e) {
  e.preventDefault();
  const newPw = document.getElementById('account-new-pw').value;
  const confirmPw = document.getElementById('account-confirm-pw').value;

  if (!newPw || newPw.length < 6) { showToast(t('account.password.short'), 'error'); return false; }
  if (newPw !== confirmPw) { showToast(t('account.password.mismatch'), 'error'); return false; }

  try {
    const { error } = await db.auth.updateUser({ password: newPw });
    if (error) throw error;
    document.getElementById('account-new-pw').value = '';
    document.getElementById('account-confirm-pw').value = '';
    showToast(t('account.password.success'), 'success');
  } catch(err) {
    showToast('Erreur: ' + (err.message || 'Impossible de modifier le mot de passe'), 'error');
  }
  return false;
}

// ── TOPBAR ────────────────────────────────────────────────────
function renderTopbar(title, subtitle = '', actions = '') {
  return `
  <header class="topbar">
    <button class="btn btn-ghost btn-icon" id="sidebar-toggle" style="display:none;">
      <i data-lucide="menu" style="width:18px;height:18px;"></i>
    </button>
    <div style="flex:1;">
      <div class="topbar-title">${title}</div>
      ${subtitle ? `<div style="font-size:var(--text-xs);color:var(--fg-muted);margin-top:1px;">${subtitle}</div>` : ''}
    </div>
    <div class="topbar-actions" style="display:flex;align-items:center;gap:10px;">
      ${actions}
      <div style="position:relative;" id="notif-wrap">
        <button class="btn btn-ghost btn-icon" id="notif-bell" style="position:relative;" onclick="toggleNotifPanel()" title="Notifications">
          <i data-lucide="bell" style="width:16px;height:16px;"></i>
          <span id="notif-count" style="display:none;position:absolute;top:2px;right:2px;min-width:16px;height:16px;background:var(--purple);color:#fff;font-size:9px;font-weight:700;border-radius:50%;align-items:center;justify-content:center;line-height:1;"></span>
        </button>
        <div id="notif-panel" style="display:none;position:absolute;top:calc(100% + 8px);right:0;width:360px;max-height:420px;overflow-y:auto;background:#1e1740;border:1px solid rgba(147,50,255,0.4);border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,0.6),0 0 40px rgba(147,50,255,0.1);z-index:200;">
          <div style="padding:16px 18px 12px;border-bottom:1px solid rgba(147,50,255,0.15);display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:var(--text-sm);font-weight:700;color:var(--fg);">${t('notif.title')}</span>
            <span id="notif-panel-count" style="font-size:var(--text-xs);color:var(--fg-muted);"></span>
          </div>
          <div id="notif-list" style="padding:6px;"></div>
        </div>
      </div>
    </div>
  </header>`;
}

let _notifPanelOpen = false;

function toggleNotifPanel() {
  _notifPanelOpen = !_notifPanelOpen;
  document.getElementById('notif-panel').style.display = _notifPanelOpen ? '' : 'none';
  if (_notifPanelOpen) loadNotifications();
}

// Close notif panel on click outside
document.addEventListener('click', e => {
  const wrap = document.getElementById('notif-wrap');
  if (wrap && _notifPanelOpen && !wrap.contains(e.target)) {
    _notifPanelOpen = false;
    document.getElementById('notif-panel').style.display = 'none';
  }
});

async function loadNotifCount() {
  try {
    const user = await getUser();
    if (!user) return;
    const count = await API.getUnreadCount(user.id);
    const badge = document.getElementById('notif-count');
    if (badge && count > 0) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.style.display = 'flex';
    }
  } catch(e) {}
}

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--fg-subtle);font-size:var(--text-xs);">${t('loading')}</div>`;

  try {
    // Fetch unread messages + recent activity in parallel
    const [msgsResult, logs] = await Promise.all([
      db.from('messages')
        .select('*, profiles(full_name, role), projects(title)')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(20),
      API.getActivity()
    ]);

    const unreadMsgs = (msgsResult.data || []).filter(m => m.profiles?.role !== 'admin');
    const recentLogs = (logs || []).slice(0, 10);

    // Build unified notification list
    const items = [];

    // Add unread messages first (priority)
    unreadMsgs.forEach(m => {
      items.push({
        icon: 'message-circle',
        label: `<strong>${escHtml(m.profiles?.full_name || 'Client')}</strong> : ${escHtml((m.content || '').substring(0, 60))}${m.content?.length > 60 ? '...' : ''}`,
        sub: escHtml(m.projects?.title || 'Projet'),
        time: formatDateTime(m.created_at),
        href: rootPath() + 'admin/project.html?id=' + m.project_id + '#messages',
        isNew: true
      });
    });

    // Add activity log entries
    recentLogs.forEach(log => {
      items.push({
        icon: _notifIcon(log.action),
        label: _notifLabel(log),
        sub: log.profiles?.full_name || t('activity.system'),
        time: formatDateTime(log.created_at),
        href: _notifHref(log),
        isNew: false
      });
    });

    if (!items.length) {
      list.innerHTML = `<div style="padding:30px 20px;text-align:center;color:var(--fg-subtle);font-size:var(--text-xs);">${t('notif.none')}</div>`;
      document.getElementById('notif-panel-count').textContent = '';
      return;
    }

    const msgCount = unreadMsgs.length;
    document.getElementById('notif-panel-count').textContent = msgCount > 0 ? `${msgCount} ${msgCount > 1 ? t('notif.unread.msg') : t('notif.unread.msg.one')}` : `${items.length} ${t('notif.recent')}`;

    list.innerHTML = items.slice(0, 20).map(item => `
      <a href="${item.href}" style="display:flex;gap:10px;padding:10px 12px;border-radius:10px;text-decoration:none;color:inherit;transition:background 0.15s;${item.isNew ? 'background:rgba(147,50,255,0.06);' : ''}" onmouseover="this.style.background='rgba(147,50,255,0.12)'" onmouseout="this.style.background='${item.isNew ? 'rgba(147,50,255,0.06)' : ''}'">
        <div style="width:32px;height:32px;border-radius:8px;background:${item.isNew ? 'rgba(147,50,255,0.2)' : 'rgba(147,50,255,0.1)'};border:1px solid rgba(147,50,255,${item.isNew ? '0.4' : '0.2'});display:flex;align-items:center;justify-content:center;color:var(--purple);flex-shrink:0;">
          <i data-lucide="${item.icon}" style="width:14px;height:14px;"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--text-xs);color:var(--fg);line-height:1.4;${item.isNew ? 'font-weight:600;' : ''}">${item.label}</div>
          <div style="font-size:10px;color:var(--fg-subtle);margin-top:2px;">${item.sub} · ${item.time}</div>
        </div>
        ${item.isNew ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--purple);flex-shrink:0;margin-top:4px;"></div>' : ''}
      </a>`).join('');

    refreshIcons();
  } catch(e) {
    console.error('Notif load error:', e);
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--fg-subtle);font-size:var(--text-xs);">${t('account.error')}</div>`;
  }
}

function _notifIcon(action) {
  const map = {
    'project_created': 'plus-circle', 'status_changed': 'arrow-right-circle',
    'file_uploaded': 'upload-cloud', 'message_sent': 'message-circle',
    'brief_updated': 'file-edit', 'client_invited': 'user-plus',
    'client_created': 'user-plus', 'project_updated': 'edit'
  };
  return map[action] || 'activity';
}

function _notifLabel(log) {
  const d = log.details || {};
  const map = {
    'project_created': `${t('activity.project_created')} <strong>${d.title || ''}</strong>`,
    'status_changed': `${t('activity.status_changed')} <strong>${tStatus(d.to) || d.to || ''}</strong>`,
    'file_uploaded': `${t('activity.file_uploaded')} <strong>${d.file_name || ''}</strong>`,
    'message_sent': t('activity.message_sent'),
    'brief_updated': t('activity.brief_updated'),
    'client_invited': t('activity.client_invited'),
    'client_created': `${t('activity.client_created')} <strong>${d.company_name || ''}</strong>`,
    'project_updated': t('activity.project_updated')
  };
  return map[log.action] || log.action;
}

function _notifHref(log) {
  const root = rootPath();
  if (log.project_id) return root + 'admin/project.html?id=' + log.project_id;
  if (log.client_id) return root + 'admin/client.html?id=' + log.client_id;
  return root + 'admin/index.html';
}

// ── STATUS BADGE ──────────────────────────────────────────────
function renderStatusBadge(status) {
  const cls = status === 'brief-envoye' ? 'badge-brief'
    : status === 'en-cours'   ? 'badge-en-cours'
    : `badge-${status}`;
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${tStatus(status)}</span>`;
}

function renderPriorityBadge(priority) {
  return `<span class="badge badge-priority-${priority}">${tPriority(priority)}</span>`;
}

// ── PROJECT CARD ──────────────────────────────────────────────
function renderProjectCard(project, linkPrefix = '../admin/project.html') {
  const clientName = project.clients?.company_name || project.clients?.contact_name || '-';
  return `
  <div class="glass-card project-card" onclick="window.location.href='${linkPrefix}?id=${project.id}'"
       data-magnetic>
    <div class="project-card-header">
      <div>
        <div class="project-card-title">${escHtml(project.title)}</div>
        <div class="project-card-client">${escHtml(clientName)}</div>
      </div>
      ${renderStatusBadge(project.status)}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${renderPriorityBadge(project.priority)}
      ${project.project_type ? `<span class="badge" style="background:var(--bg-card);border:1px solid var(--glass-border);color:var(--fg-muted);">${escHtml(project.project_type)}</span>` : ''}
    </div>
    <div class="project-card-meta">
      <span class="project-card-date">
        <i data-lucide="calendar" style="width:11px;height:11px;"></i>
        ${formatDate(project.due_date || project.order_date)}
      </span>
      ${project.total_price ? `<span style="font-size:var(--text-xs);font-weight:700;color:var(--fg);">${formatPrice(project.total_price)}</span>` : ''}
    </div>
  </div>`;
}

// ── CLIENT ROW (table) ────────────────────────────────────────
function renderClientRow(client) {
  return `
  <tr onclick="window.location.href='./client.html?id=${client.id}'">
    <td class="td-main">
      <div style="font-weight:600;">${escHtml(client.company_name)}</div>
      ${client.contact_name ? `<div style="font-size:var(--text-xs);color:var(--fg-muted);">${escHtml(client.contact_name)}</div>` : ''}
    </td>
    <td>${escHtml(client.contact_email || '-')}</td>
    <td>${escHtml(client.industry || '-')}</td>
    <td>${formatDate(client.created_at)}</td>
    <td>
      <div style="display:flex;gap:4px;">
        <a href="./client.html?id=${client.id}" class="btn btn-ghost btn-sm" onclick="event.stopPropagation()">
          ${t('btn.view')}
        </a>
        <button class="btn btn-danger btn-sm btn-icon" onclick="event.stopPropagation();deleteClientRow('${client.id}','${escHtml(client.company_name)}')" title="Supprimer">
          <i data-lucide="trash-2" style="width:11px;height:11px;"></i>
        </button>
      </div>
    </td>
  </tr>`;
}

// ── FILE CARD ─────────────────────────────────────────────────
function renderFileCard(file, onDownload, onDelete, onRename) {
  const ext = (file.file_name || '').split('.').pop().toLowerCase();
  const iconMap = {
    pdf: 'file-text', png: 'image', jpg: 'image', jpeg: 'image', svg: 'image',
    zip: 'archive', ai: 'pen-tool', psd: 'layers', mp4: 'video', gif: 'image', webp: 'image'
  };
  const icon = iconMap[ext] || 'file';
  const isImage = ['png','jpg','jpeg','gif','webp','svg'].includes(ext);
  const isPdf = ext === 'pdf';
  const canPreview = isImage || isPdf;

  // Thumbnail for images, icon for others
  const visualHtml = isImage
    ? `<img class="file-thumb" data-path="${escHtml(file.file_path)}" alt="${escHtml(file.file_name)}" onclick="openFilePreview('${escHtml(file.file_path)}','${escHtml(file.file_name)}',${file.file_size || 0})">`
    : `<div class="file-icon" ${canPreview ? `style="cursor:pointer;" onclick="openFilePreview('${escHtml(file.file_path)}','${escHtml(file.file_name)}',${file.file_size || 0})"` : ''}>
        <i data-lucide="${icon}" style="width:24px;height:24px;"></i>
      </div>`;

  // Category badge
  const catHtml = file.category && file.category !== 'final'
    ? `<span class="file-category">${escHtml(file.category)}</span>` : '';

  // Upload date
  const dateHtml = file.created_at
    ? `<div class="file-uploaded-by">${timeAgo(file.created_at)}</div>` : '';

  return `
  <div class="glass-card file-card" data-id="${file.id}">
    ${visualHtml}
    <div class="file-name">${escHtml(file.file_name)}</div>
    ${file.file_size ? `<div class="file-meta">${formatFileSize(file.file_size)}</div>` : ''}
    ${catHtml}
    ${dateHtml}
    <div style="display:flex;gap:6px;width:100%;">
      <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="${onDownload}">
        <i data-lucide="download" style="width:12px;height:12px;"></i> ${t('btn.download')}
      </button>
      ${onRename ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="${onRename}" title="Renommer">
        <i data-lucide="pencil" style="width:12px;height:12px;"></i>
      </button>` : ''}
      ${onDelete ? `<button class="btn btn-danger btn-sm btn-icon" onclick="${onDelete}" title="Supprimer">
        <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
      </button>` : ''}
    </div>
  </div>`;
}

// ── MESSAGE BUBBLE ────────────────────────────────────────────
function renderMessageBubble(msg, currentUserId) {
  const isOwn = msg.sender_id === currentUserId;
  const senderName = msg.profiles?.full_name || 'Visunyx';
  const senderInitials = initials(senderName);

  // Attachment rendering
  let attachHtml = '';
  if (msg.attachment_path) {
    const fname = msg.attachment_path.split('/').pop().replace(/^\d+-/, '');
    const ext = fname.split('.').pop().toLowerCase();
    const isImg = ['png','jpg','jpeg','gif','webp','svg'].includes(ext);
    if (isImg) {
      attachHtml = `<img class="msg-attachment-img" src="" data-path="${escHtml(msg.attachment_path)}" alt="${escHtml(fname)}" onclick="previewFileFromPath('${escHtml(msg.attachment_path)}','${escHtml(fname)}')">`;
    } else {
      attachHtml = `<div class="msg-attachment" onclick="downloadFromPath('${escHtml(msg.attachment_path)}','${escHtml(fname)}')">
        <i data-lucide="paperclip" style="width:12px;height:12px;flex-shrink:0;"></i>
        <span style="font-size:var(--text-xs);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(fname)}</span>
        <i data-lucide="download" style="width:12px;height:12px;flex-shrink:0;margin-left:auto;"></i>
      </div>`;
    }
  }

  // Read receipt for own messages
  let readHtml = '';
  if (isOwn && msg.is_read) {
    readHtml = `<span class="chat-read"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${t('chat.read')}</span>`;
  }

  return `
  <div class="chat-bubble-wrap ${isOwn ? 'own' : ''}">
    <div class="chat-avatar">${senderInitials}</div>
    <div>
      <div class="chat-bubble">${escHtml(msg.content).replace(/\n/g, '<br>')}${attachHtml}</div>
      <div class="chat-meta">
        <span>${isOwn ? t('you') : escHtml(senderName)}</span>
        <span>·</span>
        <span>${formatDateTime(msg.created_at)}</span>
        ${readHtml}
      </div>
    </div>
  </div>`;
}

// ── EMPTY STATE ───────────────────────────────────────────────
function renderEmptyState(icon, title, subtitle, actionHtml = '') {
  return `
  <div class="empty-state">
    <div class="empty-state-icon">
      <i data-lucide="${icon}" style="width:24px;height:24px;"></i>
    </div>
    <div class="empty-state-title">${title}</div>
    <p class="empty-state-sub">${subtitle}</p>
    ${actionHtml}
  </div>`;
}

// ── SKELETON ──────────────────────────────────────────────────
function renderSkeletonCards(count = 3) {
  return Array.from({ length: count }, () => `
  <div class="glass-card" style="padding:22px;">
    <div class="skeleton" style="height:14px;width:60%;margin-bottom:10px;"></div>
    <div class="skeleton" style="height:10px;width:40%;margin-bottom:18px;"></div>
    <div style="display:flex;gap:8px;">
      <div class="skeleton" style="height:22px;width:70px;border-radius:100px;"></div>
    </div>
  </div>`).join('');
}

function renderSkeletonRows(count = 5) {
  return Array.from({ length: count }, () => `
  <tr>
    <td><div class="skeleton" style="height:14px;width:140px;"></div></td>
    <td><div class="skeleton" style="height:14px;width:100px;"></div></td>
    <td><div class="skeleton" style="height:14px;width:80px;"></div></td>
    <td><div class="skeleton" style="height:14px;width:60px;"></div></td>
    <td></td>
  </tr>`).join('');
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: 'check-circle', error: 'x-circle', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="toast-icon" style="width:16px;height:16px;flex-shrink:0;"></i>
    <span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  refreshIcons();
  setTimeout(() => {
    toast.style.animation = 'none';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.25s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── CONFIRM DIALOG (premium) ──────────────────────────────────
function confirmAction(title, message, onConfirm) {
  // Remove existing
  document.getElementById('confirm-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;animation:confirmFadeIn 0.2s ease;';
  overlay.innerHTML = `
    <div style="width:100%;max-width:400px;background:#1e1740;border:1px solid rgba(239,68,68,0.3);border-radius:16px;padding:32px;box-shadow:0 25px 60px rgba(0,0,0,0.7),0 0 40px rgba(239,68,68,0.08);animation:confirmSlideIn 0.25s cubic-bezier(0.22,1,0.36,1);">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F87171" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </div>
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--fg);">${title}</div>
          <div style="font-size:12px;color:var(--fg-muted);margin-top:4px;line-height:1.5;">${message}</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="confirm-cancel" style="padding:10px 20px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(147,50,255,0.2);color:var(--fg-muted);font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;">${t('confirm.cancel')}</button>
        <button id="confirm-ok" style="padding:10px 20px;border-radius:10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);color:#F87171;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;">${t('confirm.delete')}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.15s';
    setTimeout(() => overlay.remove(), 150);
  };

  overlay.querySelector('#confirm-cancel').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  overlay.querySelector('#confirm-ok').onclick = () => {
    close();
    onConfirm();
  };

  // Hover effects
  const cancelBtn = overlay.querySelector('#confirm-cancel');
  cancelBtn.onmouseover = () => { cancelBtn.style.background = 'rgba(255,255,255,0.08)'; cancelBtn.style.color = 'var(--fg)'; };
  cancelBtn.onmouseout = () => { cancelBtn.style.background = 'rgba(255,255,255,0.05)'; cancelBtn.style.color = 'var(--fg-muted)'; };
  const okBtn = overlay.querySelector('#confirm-ok');
  okBtn.onmouseover = () => { okBtn.style.background = 'rgba(239,68,68,0.25)'; };
  okBtn.onmouseout = () => { okBtn.style.background = 'rgba(239,68,68,0.15)'; };
}

// ── PROMPT INPUT (premium modal) ──────────────────────────────
/**
 * Affiche un modal premium avec un champ input.
 * @param {string} title - Titre du modal
 * @param {string} placeholder - Placeholder de l'input
 * @param {string} defaultValue - Valeur par defaut
 * @param {string} icon - Lucide icon name
 * @param {string} confirmLabel - Texte du bouton confirmer
 * @returns {Promise<string|null>} - Valeur saisie ou null si annule
 */
function promptInput(title, placeholder = '', defaultValue = '', icon = 'folder-plus', confirmLabel = 'Confirmer') {
  return new Promise(resolve => {
    document.getElementById('prompt-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'prompt-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;animation:confirmFadeIn 0.2s ease;';
    overlay.innerHTML = `
    <div style="width:100%;max-width:420px;background:linear-gradient(180deg,#1e1740 0%,#150f30 100%);border:1px solid rgba(147,50,255,0.3);border-radius:18px;padding:32px;box-shadow:0 25px 60px rgba(0,0,0,0.7),0 0 60px rgba(147,50,255,0.08);animation:confirmSlideIn 0.3s cubic-bezier(0.22,1,0.36,1);">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;">
        <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,rgba(147,50,255,0.15),rgba(77,101,255,0.1));border:1px solid rgba(147,50,255,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i data-lucide="${icon}" style="width:20px;height:20px;color:var(--purple);"></i>
        </div>
        <div style="font-size:17px;font-weight:700;color:var(--fg);">${title}</div>
      </div>
      <input type="text" id="prompt-input" class="vx-input" placeholder="${escHtml(placeholder)}" value="${escHtml(defaultValue)}" style="margin-bottom:20px;font-size:15px;padding:12px 16px;" autofocus>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="prompt-cancel" class="btn btn-ghost btn-sm" style="padding:10px 20px;">${t('btn.cancel')}</button>
        <button id="prompt-ok" class="btn btn-primary btn-sm" style="padding:10px 24px;">${confirmLabel}</button>
      </div>
    </div>`;

    document.body.appendChild(overlay);
    refreshIcons();

    const input = overlay.querySelector('#prompt-input');
    input.focus();
    input.select();

    const close = (val) => {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.15s';
      setTimeout(() => overlay.remove(), 150);
      resolve(val);
    };

    overlay.querySelector('#prompt-cancel').onclick = () => close(null);
    overlay.onclick = e => { if (e.target === overlay) close(null); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(null); document.removeEventListener('keydown', esc); }
    });

    input.onkeydown = e => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (val) close(val); else input.style.borderColor = 'rgba(239,68,68,0.5)';
      }
    };

    overlay.querySelector('#prompt-ok').onclick = () => {
      const val = input.value.trim();
      if (val) close(val); else { input.style.borderColor = 'rgba(239,68,68,0.5)'; input.focus(); }
    };
  });
}

// ── MODAL ─────────────────────────────────────────────────────
function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => { overlay.style.display = 'none'; }, 280);
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const openModal = document.querySelector('.modal-overlay[style*="flex"], .modal-overlay.open');
    if (openModal) closeModal(openModal.id);
  }
});

// ── ACTIVITY ICON ─────────────────────────────────────────────
function activityIcon(action) {
  const map = {
    'project_created': 'plus-circle',
    'status_changed':  'arrow-right-circle',
    'file_uploaded':   'upload-cloud',
    'message_sent':    'message-circle',
    'brief_updated':   'file-edit',
    'client_invited':  'user-plus',
    'client_created':  'user-plus',
    'project_updated': 'edit'
  };
  return map[action] || 'activity';
}

function activityLabel(log) {
  const d = log.details || {};
  const map = {
    'project_created': `Projet <strong>${d.title || ''}</strong> créé`,
    'status_changed':  `Statut changé → <strong>${STATUS_LABELS[d.to] || d.to}</strong>`,
    'file_uploaded':   `Fichier <strong>${d.file_name || ''}</strong> uploadé`,
    'message_sent':    `Nouveau message envoyé`,
    'brief_updated':   `Brief mis à jour`,
    'client_invited':  `Client invité au portail`,
    'client_created':  `Client <strong>${d.company_name || ''}</strong> ajouté`,
    'project_updated': `Projet mis à jour`
  };
  return map[log.action] || log.action;
}

// ── MAGNETIC BUTTONS ──────────────────────────────────────────
function initMagnetic(selector = '[data-magnetic]') {
  if ('ontouchstart' in window || window.innerWidth < 800) return;
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener('mousemove', e => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width  / 2;
      const y = e.clientY - rect.top  - rect.height / 2;
      el.style.transform = `translate(${x * 0.12}px, ${y * 0.12}px)`;
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = '';
      el.style.transition = 'transform 0.4s cubic-bezier(0.22,1,0.36,1)';
      setTimeout(() => { el.style.transition = ''; }, 400);
    });
  });
}

// ── SPOTLIGHT CARDS ───────────────────────────────────────────
function initSpotlight(selector = '.glass-card') {
  if ('ontouchstart' in window || window.innerWidth < 800) return;
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener('mousemove', e => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    });
  });
}

// ── GSAP PAGE REVEAL ─────────────────────────────────────────
function initPageReveal() {
  if (typeof gsap === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.innerWidth < 800) return;
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.fromTo('.sidebar', { x: -20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, clearProps: 'all' }, 0)
    .fromTo('.topbar', { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, clearProps: 'all' }, 0.1)
    .fromTo('.page-content .glass-card:not([style*="display: none"]):not([style*="display:none"]), .stat-card',
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, stagger: 0.06, clearProps: 'transform,opacity' },
    0.2);
}

// ── SETUP SIDEBAR USER ────────────────────────────────────────
async function setupSidebarUser() {
  const user = await getUser();
  if (!user) return;
  const profile = await getProfile(user.id);
  const nameEl   = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl) {
    nameEl.textContent = profile?.full_name || user.email;
    nameEl.removeAttribute('data-i18n');
  }
  if (avatarEl) avatarEl.textContent = initials(profile?.full_name || user.email);
  // Avatar image if available
  if (profile?.avatar_url && avatarEl) {
    avatarEl.innerHTML = `<img src="${profile.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  }

  const btn = document.getElementById('sidebar-user-btn');
  if (btn) btn.addEventListener('click', openAccountPanel);
  initMobileSidebar();

  // Global realtime: notify on new messages + activity (admin + designer)
  if (db && (profile?.role === 'admin' || profile?.role === 'designer')) {
    const projectBase = profile.role === 'admin' ? 'admin/project.html' : 'designer/project.html';
    db.channel('global-messages-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new;
        if (msg.sender_id === user.id) return;
        showToast('Nouveau message recu', 'info');
        _updateBellBadge();
        _prependNotifItem({
          icon: 'message-circle',
          label: 'Nouveau message',
          time: 'A l\'instant',
          href: rootPath() + projectBase + '?id=' + msg.project_id + '#messages'
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, payload => {
        const log = payload.new;
        if (log.user_id === user.id) return;
        _updateBellBadge();
        _prependNotifItem({
          icon: _notifIcon(log.action),
          label: _notifLabel(log),
          time: 'A l\'instant',
          href: _notifHref(log)
        });
      })
      .subscribe();
  }

  function _updateBellBadge() {
    const badge = document.getElementById('notif-count');
    if (badge) {
      const current = parseInt(badge.textContent) || 0;
      badge.textContent = current + 1 > 9 ? '9+' : current + 1;
      badge.style.display = 'flex';
    }
  }

  function _prependNotifItem({ icon, label, time, href }) {
    const list = document.getElementById('notif-list');
    if (!list) return;
    const empty = list.querySelector('[style*="text-align:center"]');
    if (empty && empty.textContent.includes('Aucune')) empty.remove();
    const html = `
    <a href="${href}" style="display:flex;gap:10px;padding:10px 12px;border-radius:10px;text-decoration:none;color:inherit;transition:background 0.15s;background:rgba(147,50,255,0.06);" onmouseover="this.style.background='rgba(147,50,255,0.12)'" onmouseout="this.style.background='rgba(147,50,255,0.06)'">
      <div style="width:32px;height:32px;border-radius:8px;background:rgba(147,50,255,0.15);border:1px solid rgba(147,50,255,0.3);display:flex;align-items:center;justify-content:center;color:var(--purple);flex-shrink:0;">
        <i data-lucide="${icon}" style="width:14px;height:14px;"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:var(--text-xs);color:var(--fg);line-height:1.4;font-weight:600;">${label}</div>
        <div style="font-size:10px;color:var(--purple);margin-top:2px;">${time}</div>
      </div>
    </a>`;
    list.insertAdjacentHTML('afterbegin', html);
    refreshIcons();
  }
}

// ── MOBILE SIDEBAR TOGGLE ─────────────────────────────────────
function initMobileSidebar() {
  const btn = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;

  // Show toggle only on mobile
  const mq = window.matchMedia('(max-width: 800px)');
  const update = () => { btn.style.display = mq.matches ? '' : 'none'; };
  update();
  mq.addEventListener('change', update);

  btn.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (mq.matches && !sidebar.contains(e.target) && !btn.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

// ── BACKGROUND SYSTEM ─────────────────────────────────────────
function renderBackground() {
  return `
  <div class="vx-bg">
    <div class="vx-orb vx-orb-1"></div>
    <div class="vx-orb vx-orb-2"></div>
    <div class="vx-orb vx-orb-3"></div>
  </div>
  <div class="vx-grid"></div>
  <svg class="vx-noise" xmlns="http://www.w3.org/2000/svg">
    <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    <rect width="100%" height="100%" filter="url(#noise)"/>
  </svg>`;
}

// ── ESCAPE HTML ───────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── TIME AGO ─────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'A l\'instant';
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 172800) return 'Hier';
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)}j`;
  return formatDate(dateStr);
}

// ── FILE PREVIEW MODAL ───────────────────────────────────────
function _ensurePreviewOverlay() {
  if (document.getElementById('file-preview-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'file-preview-overlay';
  overlay.className = 'file-preview-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeFilePreview(); };
  overlay.innerHTML = '<div class="file-preview-content" id="file-preview-content"></div>';
  document.body.appendChild(overlay);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFilePreview();
  });
}

async function openFilePreview(filePath, fileName, fileSize) {
  _ensurePreviewOverlay();
  const overlay = document.getElementById('file-preview-overlay');
  const content = document.getElementById('file-preview-content');
  const ext = fileName.split('.').pop().toLowerCase();
  const isImage = ['png','jpg','jpeg','gif','webp','svg'].includes(ext);

  const url = await getFileUrl('deliverables', filePath);
  if (!url) { showToast('Impossible de charger le fichier.', 'error'); return; }

  let previewHtml = '';
  if (isImage) {
    previewHtml = `<img src="${url}" alt="${escHtml(fileName)}">`;
  } else if (ext === 'pdf') {
    previewHtml = `<iframe src="${url}#toolbar=0"></iframe>`;
  }

  content.innerHTML = `
    <button class="file-preview-close" onclick="closeFilePreview()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    ${previewHtml}
    <div class="file-preview-info">
      <span class="file-name">${escHtml(fileName)}</span>
      ${fileSize ? `<span class="file-meta">${formatFileSize(fileSize)}</span>` : ''}
      <a href="${url}" download="${escHtml(fileName)}" class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="event.stopPropagation()">
        <i data-lucide="download" style="width:12px;height:12px;"></i> Telecharger
      </a>
    </div>`;

  overlay.classList.add('open');
  refreshIcons();
}

function closeFilePreview() {
  const overlay = document.getElementById('file-preview-overlay');
  if (overlay) overlay.classList.remove('open');
}

async function previewFileFromPath(path, name) {
  await openFilePreview(path, name, 0);
}

async function downloadFromPath(path, name) {
  const url = await getFileUrl('deliverables', path);
  if (!url) { showToast('Lien indisponible.', 'error'); return; }
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
}

// ── LOAD THUMBNAILS ──────────────────────────────────────────
async function loadFileThumbnails() {
  const thumbs = document.querySelectorAll('.file-thumb[data-path]');
  for (const img of thumbs) {
    if (img.src && !img.src.endsWith('/')) continue;
    const path = img.getAttribute('data-path');
    if (!path) continue;
    try {
      const url = await getFileUrl('deliverables', path);
      if (url) img.src = url;
    } catch(e) {}
  }
}

// Load attachment images in chat
async function loadMessageAttachments() {
  const imgs = document.querySelectorAll('.msg-attachment-img[data-path]');
  for (const img of imgs) {
    if (img.src && !img.src.endsWith('/')) continue;
    const path = img.getAttribute('data-path');
    if (!path) continue;
    try {
      const url = await getFileUrl('attachments', path);
      if (url) img.src = url;
      else {
        const url2 = await getFileUrl('deliverables', path);
        if (url2) img.src = url2;
      }
    } catch(e) {}
  }
}

// ── CHAT ATTACHMENT HELPERS ──────────────────────────────────
function renderChatInputWithAttachment(inputId, sendFn, placeholder) {
  return `
    <div class="chat-pending-attachment" id="${inputId}-pending">
      <i data-lucide="paperclip" style="width:12px;height:12px;color:var(--purple);flex-shrink:0;"></i>
      <span id="${inputId}-pending-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
      <button class="remove-attach" onclick="removePendingAttachment('${inputId}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="chat-input-bar">
      <button class="btn-attach" onclick="document.getElementById('${inputId}-file').click()" title="Joindre un fichier">
        <i data-lucide="paperclip" style="width:16px;height:16px;"></i>
      </button>
      <input type="file" id="${inputId}-file" style="display:none;" onchange="setPendingAttachment('${inputId}', this.files)">
      <textarea id="${inputId}" placeholder="${placeholder}" rows="1"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();${sendFn}()}" oninput="autoResize(this)"></textarea>
      <button class="btn btn-primary btn-icon" onclick="${sendFn}()">
        <i data-lucide="send" style="width:16px;height:16px;"></i>
      </button>
    </div>`;
}

const _pendingFiles = {};

function setPendingAttachment(inputId, files) {
  if (!files || !files.length) return;
  _pendingFiles[inputId] = files[0];
  const bar = document.getElementById(inputId + '-pending');
  const nameEl = document.getElementById(inputId + '-pending-name');
  if (bar) bar.classList.add('visible');
  if (nameEl) nameEl.textContent = files[0].name + ' (' + formatFileSize(files[0].size) + ')';
}

function removePendingAttachment(inputId) {
  delete _pendingFiles[inputId];
  const bar = document.getElementById(inputId + '-pending');
  if (bar) bar.classList.remove('visible');
  const fileInput = document.getElementById(inputId + '-file');
  if (fileInput) fileInput.value = '';
}

function getPendingAttachment(inputId) {
  return _pendingFiles[inputId] || null;
}

function clearPendingAttachment(inputId) {
  removePendingAttachment(inputId);
}

// STATUS_LABELS already defined in supabase.js
