/**
 * ChatChannel — Module de messagerie réutilisable pour Visunyx Portal
 *
 * Gère : chargement, envoi, realtime, polling incrémental,
 * dédoublonnage, typing presence, notifications lu, pièces jointes.
 *
 * Utilisé par : client/project.html, admin/project.html, designer/project.html
 */
class ChatChannel {
  constructor(opts) {
    this.projectId = opts.projectId;
    this.userId = opts.currentUserId;
    this.userName = opts.currentUserName;
    this.userRole = opts.currentUserRole;
    this.isInternal = !!opts.isInternal;

    this.container = opts.messagesContainer;
    this.input = opts.inputElement;
    this.typingIndicator = opts.typingIndicator || null;
    this.typingNameEl = opts.typingNameEl || null;
    this.attachInputId = opts.attachInputId || null;
    this.badge = opts.badgeElement || null;
    this.pollInterval = opts.pollIntervalMs || 0;
    this.onActivity = opts.onActivity || null;

    this._displayedIds = new Set();
    this._lastTimestamp = null;
    this._realtimeChannel = null;
    this._pollingTimer = null;
    this._typingPresence = null;

    // Wire Enter key on input
    if (this.input) {
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      this.input.addEventListener('input', () => {
        // Auto-resize
        this.input.style.height = 'auto';
        this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
        // Typing indicator
        if (this._typingPresence) this._typingPresence.sendTyping();
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────

  async loadMessages() {
    const msgs = await this._fetchMessages();
    if (!msgs || !msgs.length) {
      this.container.innerHTML = this.isInternal
        ? renderEmptyState('shield', t('chat.internal.empty'), t('chat.internal.empty.hint'))
        : renderEmptyState('message-circle', t('chat.empty'), t('chat.empty.client') || t('chat.empty'));
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      msgs.forEach(m => {
        if (m.id) this._displayedIds.add(m.id);
        if (m.created_at) this._lastTimestamp = m.created_at;
      });
      this.container.innerHTML = msgs.map(m => this._renderBubble(m)).join('');
      this._scrollToBottom();
      // Unread badge
      if (this.badge && !this.isInternal) {
        const unread = msgs.filter(m => !m.is_read && m.sender_id !== this.userId).length;
        if (unread > 0) {
          this.badge.style.display = '';
          this.badge.textContent = unread;
        }
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
      if (typeof loadMessageAttachments === 'function') loadMessageAttachments();
    }

    this._setupRealtime();
    if (this.pollInterval > 0) this._setupPolling();
    this._setupTyping();
  }

  async sendMessage() {
    if (!this.input) return;
    const content = this.input.value.trim();
    const pendingFile = this.attachInputId ? getPendingAttachment(this.attachInputId) : null;
    if (!content && !pendingFile) return;

    this.input.value = '';
    this.input.style.height = '';
    const msgContent = content || (pendingFile ? pendingFile.name : '');

    try {
      let attachPath = null;
      if (pendingFile) {
        attachPath = `${this.projectId}/msg-${Date.now()}-${pendingFile.name}`;
        await uploadFile('attachments', attachPath, pendingFile);
        if (typeof clearPendingAttachment === 'function') clearPendingAttachment(this.attachInputId);
      }

      const { data: inserted, error: insertErr } = await db.from('messages').insert({
        project_id: this.projectId,
        sender_id: this.userId,
        content: msgContent,
        attachment_path: attachPath,
        is_internal: this.isInternal
      }).select('*, profiles(full_name, role, avatar_url)').single();

      if (inserted) {
        this._appendMessage(inserted);
      } else {
        // Fallback si le SELECT échoue (RLS restrictive côté client)
        this._appendMessage({
          id: 'local-' + Date.now(),
          sender_id: this.userId,
          content: msgContent,
          attachment_path: attachPath,
          is_internal: this.isInternal,
          created_at: new Date().toISOString(),
          profiles: { full_name: this.userName, role: this.userRole }
        });
      }
      if (this.onActivity) this.onActivity();
    } catch (e) {
      console.error('ChatChannel sendMessage error:', e);
      showToast(t('chat.error'), 'error');
    }
  }

  async markRead() {
    try {
      await db.from('messages')
        .update({ is_read: true })
        .eq('project_id', this.projectId)
        .eq('is_internal', this.isInternal)
        .neq('sender_id', this.userId);
      if (this.badge) this.badge.style.display = 'none';
    } catch (e) {}
  }

  destroy() {
    if (this._realtimeChannel) {
      db.removeChannel(this._realtimeChannel);
      this._realtimeChannel = null;
    }
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
    if (this._typingPresence) {
      this._typingPresence.destroy();
      this._typingPresence = null;
    }
  }

  // ── Private ────────────────────────────────────────────────

  async _fetchMessages(afterTimestamp) {
    let query = db.from('messages')
      .select('*, profiles(full_name, role, avatar_url)')
      .eq('project_id', this.projectId);

    if (this.isInternal) {
      query = query.eq('is_internal', true);
    } else {
      query = query.or('is_internal.is.null,is_internal.eq.false');
    }

    if (afterTimestamp) {
      query = query.gt('created_at', afterTimestamp);
    }

    query = query.order('created_at', { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  _appendMessage(msg) {
    if (msg.id && this._displayedIds.has(msg.id)) return;
    if (msg.id) this._displayedIds.add(msg.id);
    if (msg.created_at && (!this._lastTimestamp || msg.created_at > this._lastTimestamp)) {
      this._lastTimestamp = msg.created_at;
    }

    // Clear empty state
    const emptyEl = this.container.querySelector('.empty-state');
    if (emptyEl) this.container.innerHTML = '';

    // Ensure profiles exist
    if (!msg.profiles) {
      const isOwn = msg.sender_id === this.userId;
      if (isOwn) {
        msg.profiles = { full_name: this.isInternal ? this.userName : t('you'), role: this.userRole };
      } else {
        msg.profiles = this.isInternal
          ? { full_name: t('chat.team'), role: 'admin' }
          : { full_name: 'Visunyx Studio', role: 'admin' };
      }
    }

    this.container.insertAdjacentHTML('beforeend', this._renderBubble(msg));
    this._scrollToBottom();
    if (typeof lucide !== 'undefined') lucide.createIcons();
    if (!this.isInternal && typeof loadMessageAttachments === 'function') loadMessageAttachments();
  }

  _renderBubble(msg) {
    if (this.isInternal) return this._renderInternalBubble(msg);
    return renderMessageBubble(msg, this.userId);
  }

  _renderInternalBubble(msg) {
    const isOwn = msg.sender_id === this.userId;
    const name = msg.profiles?.full_name || t('chat.team');
    const role = msg.profiles?.role === 'admin' ? tRole('admin') : tRole('designer');
    return `
    <div class="chat-bubble-wrap ${isOwn ? 'own' : ''}">
      <div class="chat-avatar" style="background:linear-gradient(135deg,#FBBF24,#F59E0B);">${initials(name)}</div>
      <div>
        <div class="chat-bubble" style="${isOwn ? '' : 'background:rgba(251,191,36,0.08);border-color:rgba(251,191,36,0.2);'}">${escHtml(msg.content).replace(/\n/g, '<br>')}</div>
        <div class="chat-meta">
          <span>${isOwn ? t('chat.you') || t('you') : escHtml(name)}</span>
          <span>·</span>
          <span style="color:#FBBF24;">${role}</span>
          <span>·</span>
          <span>${formatDateTime(msg.created_at)}</span>
        </div>
      </div>
    </div>`;
  }

  _setupRealtime() {
    const channelName = `chat-${this.projectId}-${this.isInternal ? 'int' : 'ext'}`;
    this._realtimeChannel = db.channel(channelName)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${this.projectId}` },
        (payload) => {
          const msg = payload.new;
          // Skip own messages (already displayed after insert)
          if (msg.sender_id === this.userId) return;
          // Skip wrong channel type
          if (this.isInternal && !msg.is_internal) return;
          if (!this.isInternal && msg.is_internal) return;
          this._appendMessage(msg);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `project_id=eq.${this.projectId}` },
        (payload) => {
          // Read receipt update
          if (!this.isInternal && payload.new.is_read && !payload.old?.is_read) {
            this.container.querySelectorAll('.chat-read').forEach(el => {
              el.style.color = 'var(--purple)';
            });
          }
        })
      .subscribe();
  }

  _setupPolling() {
    this._pollingTimer = setInterval(async () => {
      try {
        const msgs = await this._fetchMessages(this._lastTimestamp);
        if (msgs && msgs.length) {
          msgs.forEach(m => this._appendMessage(m));
        }
      } catch (e) {}
    }, this.pollInterval);
  }

  _setupTyping() {
    if (!this.typingIndicator || !this.typingNameEl) return;
    if (typeof API === 'undefined' || !API.initTypingPresence) return;

    this._typingPresence = API.initTypingPresence(
      this.projectId, this.userId, this.userName,
      ({ typingUsers }) => {
        if (typingUsers.length > 0) {
          this.typingNameEl.textContent = typingUsers.map(u => u.name).join(', ');
          this.typingIndicator.classList.add('visible');
        } else {
          this.typingIndicator.classList.remove('visible');
        }
      }
    );
  }

  _scrollToBottom() {
    this.container.scrollTop = this.container.scrollHeight;
  }
}
