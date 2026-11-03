const path = require('path');
const fs = require('fs');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestWaWebVersion,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const config = require('../../config/default');
const {
  getAccountsStore,
  findAdminByPhoneNumber,
  getAllAccountsAcrossAllTenants
} = require('../utils/storage');
const { cleanPhone, formatPairingCode } = require('../utils/formatter');
const { setupMessageListener } = require('./listener');

class WhatsAppManager {
  constructor() {
    this.sockets = new Map(); // phone -> socket
    this.connectionStatus = new Map(); // phone -> 'connected' | 'connecting' | 'disconnected'
    this.reconnectTimers = new Map();
    this.phoneToAdminMap = new Map(); // phone -> adminId
    this.onNotificationCallback = null;
  }

  setNotificationHandler(callback) {
    this.onNotificationCallback = callback;
  }

  notify(title, message, targetAdminId = null) {
    if (this.onNotificationCallback) {
      this.onNotificationCallback(title, message, targetAdminId);
    }
  }

  getAdminIdForPhone(rawPhone) {
    const phone = cleanPhone(rawPhone);
    return this.phoneToAdminMap.get(phone) || findAdminByPhoneNumber(phone) || 'default';
  }

  /**
   * Initializes all registered accounts across all tenant admins on startup
   */
  async initAllAccounts() {
    const accounts = getAllAccountsAcrossAllTenants();
    console.log(`[WA Manager] Found ${accounts.length} registered accounts across all admins.`);
    for (const acc of accounts) {
      try {
        console.log(`[WA Manager] Starting account +${acc.phone} for Admin:${acc.adminId}...`);
        await this.connectAccount(acc.phone, {
          adminId: acc.adminId,
          requestPairing: false
        });
      } catch (err) {
        console.error(`[WA Manager] Failed to init account +${acc.phone}:`, err.message);
      }
    }
  }

  /**
   * Connect or initiate pairing for a WhatsApp account owned by an admin
   */
  async connectAccount(rawPhone, options = {}) {
    const phone = cleanPhone(rawPhone);
    if (!phone) throw new Error('Invalid phone number provided');

    const adminId = String(options.adminId || findAdminByPhoneNumber(phone) || 'default');
    this.phoneToAdminMap.set(phone, adminId);

    // Clear any existing reconnect timer
    if (this.reconnectTimers.has(phone)) {
      clearTimeout(this.reconnectTimers.get(phone));
      this.reconnectTimers.delete(phone);
    }

    // Close any previous socket for this phone
    if (this.sockets.has(phone)) {
      try {
        const oldSock = this.sockets.get(phone);
        oldSock.end(undefined);
      } catch (_) {}
      this.sockets.delete(phone);
    }

    const sessionDir = path.join(config.paths.sessionsDir, `${adminId}_${phone}`);

    // If fresh pairing requested, wipe old session folder to ensure brand new cryptographic keys
    if (options.requestPairing && fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (_) {}
    }

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // Always fetch the real live WhatsApp Web version from server
    let version = [2, 3000, 1052650559];
    try {
      const v = await fetchLatestWaWebVersion();
      if (v && v.version) version = v.version;
    } catch (_) {
      try {
        const v = await fetchLatestBaileysVersion();
        if (v && v.version) version = v.version;
      } catch (__) {}
    }

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false
    });

    this.sockets.set(phone, sock);
    this.connectionStatus.set(phone, 'connecting');

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    let pairingRequested = false;

    // Connection lifecycle handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // When the socket is ready for pairing, update.qr is emitted
      if (options.requestPairing && !sock.authState.creds.registered && !pairingRequested && qr) {
        pairingRequested = true;
        try {
          console.log(`[WA Manager] Handshake ready. Requesting real pairing code for +${phone} (Admin: ${adminId})...`);
          const pairingCode = await sock.requestPairingCode(phone);
          const formatted = formatPairingCode(pairingCode);
          console.log(`[WA Manager] Real Pairing Code Generated: ${formatted}`);
          if (options.onPairingCode) {
            options.onPairingCode(formatted);
          }
        } catch (err) {
          console.error(`[WA Manager] Error requesting pairing code for +${phone}:`, err.message);
          if (options.onError) options.onError(err);
        }
      }

      if (connection === 'open') {
        this.connectionStatus.set(phone, 'connected');
        console.log(`[WA Manager] ✅ Account +${phone} successfully connected for Admin:${adminId}!`);

        const me = sock.user || {};
        getAccountsStore(adminId).save({
          phone,
          adminId,
          name: me.name || `WhatsApp ${phone}`,
          status: 'connected',
          jid: me.id
        });

        // Attach incoming message listener for this admin's auto-reply & contacts
        setupMessageListener(sock, phone, adminId, this.notify.bind(this));

        if (options.onConnected) {
          options.onConnected({ phone, adminId, name: me.name || phone });
        }
        this.notify('WA_CONNECTED', { phone, name: me.name || phone }, adminId);
      }

      if (connection === 'close') {
        this.connectionStatus.set(phone, 'disconnected');
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        console.log(`[WA Manager] Account +${phone} (Admin:${adminId}) connection closed. Code: ${statusCode}, LoggedOut: ${isLoggedOut}`);

        // If not yet registered (during pairing), don't loop reconnect
        if (!sock.authState.creds.registered) {
          if (statusCode === 408) {
            if (options.onError) {
              options.onError(new Error('Pairing code timed out. Please request a new code.'));
            }
          }
          return;
        }

        if (isLoggedOut) {
          getAccountsStore(adminId).save({ phone, status: 'logged_out' });
          this.sockets.delete(phone);
          this.notify('WA_LOGGED_OUT', { phone }, adminId);
          if (options.onDisconnected) {
            options.onDisconnected({ phone, isLoggedOut: true });
          }
        } else {
          // Reconnect for registered account
          getAccountsStore(adminId).save({ phone, status: 'reconnecting' });
          const timer = setTimeout(() => {
            console.log(`[WA Manager] Attempting auto-reconnect for +${phone}...`);
            this.connectAccount(phone, { adminId, requestPairing: false }).catch(e => {
              console.error(`[WA Manager] Reconnect error for +${phone}:`, e.message);
            });
          }, 8000);
          this.reconnectTimers.set(phone, timer);
        }
      }
    });

    return sock;
  }

  /**
   * Delete account session and credentials
   */
  async deleteAccount(rawPhone, adminId = null) {
    const phone = cleanPhone(rawPhone);
    if (!phone) return;

    const ownerAdminId = adminId || this.getAdminIdForPhone(phone);

    if (this.reconnectTimers.has(phone)) {
      clearTimeout(this.reconnectTimers.get(phone));
      this.reconnectTimers.delete(phone);
    }

    if (this.sockets.has(phone)) {
      try {
        const sock = this.sockets.get(phone);
        await sock.logout().catch(() => {});
        sock.end(undefined);
      } catch (_) {}
      this.sockets.delete(phone);
    }

    this.connectionStatus.delete(phone);
    this.phoneToAdminMap.delete(phone);

    // Delete session files
    const sessionDir = path.join(config.paths.sessionsDir, `${ownerAdminId}_${phone}`);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`[WA Manager] Error removing session dir for ${phone}:`, err.message);
      }
    }

    getAccountsStore(ownerAdminId).remove(phone);
    console.log(`[WA Manager] Account +${phone} removed completely for Admin:${ownerAdminId}.`);
  }

  /**
   * Get active socket for a phone or default active socket for an admin,
   * falling back to any connected socket across all admins if needed.
   */
  getSocket(rawPhone = null, adminId = null) {
    // 1. Explicit phone number check
    if (rawPhone) {
      const phone = cleanPhone(rawPhone);
      if (this.sockets.has(phone) && this.connectionStatus.get(phone) === 'connected') {
        return this.sockets.get(phone);
      }
    }

    // 2. Specific admin's connected accounts
    if (adminId) {
      const def = getAccountsStore(adminId).getDefault();
      if (def && this.connectionStatus.get(def.phone) === 'connected' && this.sockets.has(def.phone)) {
        return this.sockets.get(def.phone);
      }
      const myAccounts = getAccountsStore(adminId).getAll();
      for (const a of myAccounts) {
        if (this.connectionStatus.get(a.phone) === 'connected' && this.sockets.has(a.phone)) {
          return this.sockets.get(a.phone);
        }
      }
    }

    // 3. System-wide fallback: return ANY connected socket so broadcasts never stall
    for (const [phone, sock] of this.sockets.entries()) {
      if (this.connectionStatus.get(phone) === 'connected') {
        return sock;
      }
    }
    return null;
  }

  /**
   * List accounts belonging to a specific admin
   */
  listAccounts(adminId = null) {
    if (adminId) {
      const accounts = getAccountsStore(adminId).getAll();
      return accounts.map(acc => {
        const liveStatus = this.connectionStatus.get(acc.phone) || acc.status || 'disconnected';
        const isOnline = liveStatus === 'connected';
        return {
          ...acc,
          liveStatus,
          isOnline
        };
      });
    }

    // All accounts across all tenants
    const all = getAllAccountsAcrossAllTenants();
    return all.map(acc => {
      const liveStatus = this.connectionStatus.get(acc.phone) || acc.status || 'disconnected';
      return {
        ...acc,
        liveStatus,
        isOnline: liveStatus === 'connected'
      };
    });
  }

  /**
   * Count connected accounts for an admin (with system total fallback)
   */
  getConnectedCount(adminId = null) {
    if (adminId) {
      const accounts = getAccountsStore(adminId).getAll();
      let count = 0;
      accounts.forEach(a => {
        if (this.connectionStatus.get(a.phone) === 'connected') count++;
      });
      if (count > 0) return count;
    }

    let count = 0;
    for (const status of this.connectionStatus.values()) {
      if (status === 'connected') count++;
    }
    return count;
  }
}

// Export singleton instance
const manager = new WhatsAppManager();
module.exports = manager;
