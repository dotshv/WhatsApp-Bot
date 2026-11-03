const fs = require('fs');
const path = require('path');
const config = require('../../config/default');

// Ensure base directories exist
const tenantsBaseDir = path.join(config.paths.dataDir, 'tenants');
[
  config.paths.sessionsDir,
  config.paths.mediaDir,
  config.paths.dataDir,
  tenantsBaseDir
].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper for atomic file write
function safeWriteJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}

function safeReadJSON(filePath, defaultData) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading JSON from ${filePath}:`, err.message);
  }
  return defaultData;
}

// ==========================================
// ADMINS MANAGEMENT STORE (Multi-Admin System)
// ==========================================
const adminsFilePath = path.join(config.paths.dataDir, 'admins.json');

// Initialize super admin from .env
function getInitialAdmins() {
  const envAdmins = config.adminIds || [];
  const list = [];
  envAdmins.forEach((id, index) => {
    list.push({
      id: String(id),
      name: index === 0 ? 'Super Admin' : `Admin ${index + 1}`,
      role: index === 0 ? 'superadmin' : 'admin',
      addedAt: new Date().toISOString()
    });
  });
  return list;
}

const AdminsStore = {
  getAll() {
    const data = safeReadJSON(adminsFilePath, null);
    if (!data || data.length === 0) {
      const initial = getInitialAdmins();
      safeWriteJSON(adminsFilePath, initial);
      return initial;
    }
    return data;
  },
  get(id) {
    const list = this.getAll();
    return list.find(a => String(a.id) === String(id)) || null;
  },
  isAuthorized(id) {
    const list = this.getAll();
    // If no admins are configured at all, anyone can access until first admin is added
    if (list.length === 0) return true;
    return list.some(a => String(a.id) === String(id));
  },
  isSuperAdmin(id) {
    const list = this.getAll();
    if (list.length === 0) return true;
    const admin = list.find(a => String(a.id) === String(id));
    return admin && admin.role === 'superadmin';
  },
  addAdmin(id, name = '', addedBy = 'System') {
    const list = this.getAll();
    const cleanId = String(id).trim();
    if (!cleanId) throw new Error('Invalid Telegram ID');

    const existing = list.find(a => String(a.id) === cleanId);
    if (existing) {
      existing.name = name || existing.name;
      safeWriteJSON(adminsFilePath, list);
      return existing;
    }

    const isFirst = list.length === 0;
    const newAdmin = {
      id: cleanId,
      name: name || `Admin ${cleanId.slice(-4)}`,
      role: isFirst ? 'superadmin' : 'admin',
      addedBy: String(addedBy),
      addedAt: new Date().toISOString()
    };
    list.push(newAdmin);
    safeWriteJSON(adminsFilePath, list);

    // Initialize tenant directory for this admin
    getTenantDir(cleanId);
    return newAdmin;
  },
  removeAdmin(id) {
    let list = this.getAll();
    const target = list.find(a => String(a.id) === String(id));
    if (!target) return false;
    if (target.role === 'superadmin') {
      throw new Error('Cannot remove Super Admin');
    }
    list = list.filter(a => String(a.id) !== String(id));
    safeWriteJSON(adminsFilePath, list);
    return true;
  }
};

// ==========================================
// TENANT DIRECTORY HELPER
// ==========================================
function getTenantDir(adminId) {
  const cleanId = String(adminId || 'default');
  const dir = path.join(tenantsBaseDir, cleanId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ==========================================
// PER-ADMIN FACTORY STORES (TOTAL ISOLATION)
// ==========================================

function getAccountsStore(adminId) {
  const filePath = path.join(getTenantDir(adminId), 'accounts.json');
  return {
    getAll() {
      return safeReadJSON(filePath, []);
    },
    get(phone) {
      return this.getAll().find(a => a.phone === phone);
    },
    getDefault() {
      const list = this.getAll();
      return list.find(a => a.isDefault && a.status === 'connected') ||
             list.find(a => a.status === 'connected') ||
             list[0] || null;
    },
    save(account) {
      let list = this.getAll();
      const index = list.findIndex(a => a.phone === account.phone);
      if (index >= 0) {
        list[index] = { ...list[index], ...account, adminId: String(adminId), updatedAt: new Date().toISOString() };
      } else {
        if (list.length === 0) account.isDefault = true;
        list.push({ ...account, adminId: String(adminId), addedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      safeWriteJSON(filePath, list);
      return account;
    },
    remove(phone) {
      let list = this.getAll();
      list = list.filter(a => a.phone !== phone);
      if (list.length > 0 && !list.some(a => a.isDefault)) {
        list[0].isDefault = true;
      }
      safeWriteJSON(filePath, list);
    }
  };
}

function getAutoReplyStore(adminId) {
  const filePath = path.join(getTenantDir(adminId), 'autoreply.json');
  const defaultAutoReply = {
    enabled: true,
    triggerMode: config.autoreply.defaultTriggerMode,
    delayBetweenMessagesMs: config.autoreply.defaultStepDelayMs,
    replyWindowHours: config.autoreply.replyWindowHours,
    slots: { step1: null, step2: null, step3: null, step4: null }
  };

  return {
    get() {
      const data = safeReadJSON(filePath, defaultAutoReply);
      if (!data.slots) {
        data.slots = { step1: null, step2: null, step3: null, step4: null };
      }
      return data;
    },
    save(data) {
      const current = this.get();
      const updated = { ...current, ...data };
      safeWriteJSON(filePath, updated);
      return updated;
    },
    setSlot(slotNumber, step) {
      const data = this.get();
      const key = `step${slotNumber}`;
      data.slots[key] = {
        slot: slotNumber,
        updatedAt: new Date().toISOString(),
        ...step
      };
      this.save(data);
      return data.slots[key];
    },
    clearSlot(slotNumber) {
      const data = this.get();
      data.slots[`step${slotNumber}`] = null;
      this.save(data);
    },
    getSlot(slotNumber) {
      return this.get().slots[`step${slotNumber}`] || null;
    },
    clearAllSlots() {
      const data = this.get();
      data.slots = { step1: null, step2: null, step3: null, step4: null };
      this.save(data);
    },
    getActiveSteps() {
      const data = this.get();
      const slots = data.slots || {};
      const steps = [];
      [1, 2, 3, 4].forEach(num => {
        const s = slots[`step${num}`];
        if (s && (s.content || s.filePath)) {
          steps.push({ ...s, slotNumber: num });
        }
      });
      return steps;
    },
    toggle() {
      const data = this.get();
      data.enabled = !data.enabled;
      this.save(data);
      return data.enabled;
    }
  };
}

function getContactsStore(adminId) {
  const filePath = path.join(getTenantDir(adminId), 'contacts.json');
  return {
    getAll() {
      return safeReadJSON(filePath, {});
    },
    getList() {
      return Object.values(this.getAll());
    },
    get(phone) {
      return this.getAll()[phone] || null;
    },
    recordMessage(phone, pushName = '', rawJid = '') {
      const obj = this.getAll();
      const now = new Date().toISOString();
      const safeJid = rawJid || (phone && phone.length >= 14 && !phone.startsWith('91') ? `${phone}@lid` : `${phone}@s.whatsapp.net`);
      if (!obj[phone]) {
        obj[phone] = {
          phone,
          jid: safeJid,
          name: pushName || '',
          firstSeen: now,
          lastSeen: now,
          messageCount: 1,
          lastAutoReplyAt: null
        };
      } else {
        obj[phone].lastSeen = now;
        if (safeJid) obj[phone].jid = safeJid;
        obj[phone].messageCount = (obj[phone].messageCount || 0) + 1;
        if (pushName && !obj[phone].name) {
          obj[phone].name = pushName;
        }
      }
      safeWriteJSON(filePath, obj);
      return obj[phone];
    },
    recordAutoReply(phone) {
      const obj = this.getAll();
      if (obj[phone]) {
        obj[phone].lastAutoReplyAt = new Date().toISOString();
        safeWriteJSON(filePath, obj);
      }
    },
    clear() {
      safeWriteJSON(filePath, {});
    }
  };
}

function getTemplatesStore(adminId) {
  const filePath = path.join(getTenantDir(adminId), 'templates.json');
  const defaultTemplates = [
    {
      id: 'active_template',
      name: 'Custom Template',
      content: 'Hello {name} ji! 🙏\nAapka record update ho gaya hai.\nDhanyawad!',
      variables: ['name']
    }
  ];

  return {
    getAll() {
      return safeReadJSON(filePath, defaultTemplates);
    },
    get(id) {
      return this.getAll().find(t => t.id === id);
    },
    save(template) {
      let list = this.getAll();
      const index = list.findIndex(t => t.id === template.id);
      if (index >= 0) {
        list[index] = { ...list[index], ...template };
      } else {
        list.push({ ...template, id: template.id || `tpl_${Date.now()}` });
      }
      safeWriteJSON(filePath, list);
      return template;
    },
    remove(id) {
      let list = this.getAll();
      list = list.filter(t => t.id !== id);
      safeWriteJSON(filePath, list);
    }
  };
}

function getSettingsStore(adminId) {
  const filePath = path.join(getTenantDir(adminId), 'settings.json');
  const defaultSettings = {
    broadcastDelayMs: config.broadcast.defaultDelayMs,
    defaultSenderPhone: null
  };

  return {
    get() {
      return safeReadJSON(filePath, defaultSettings);
    },
    save(data) {
      const current = this.get();
      const updated = { ...current, ...data };
      safeWriteJSON(filePath, updated);
      return updated;
    }
  };
}

// Global lookup helper across all tenants (e.g. to find which admin owns a phone number)
function findAdminByPhoneNumber(phone) {
  if (!fs.existsSync(tenantsBaseDir)) return null;
  const adminDirs = fs.readdirSync(tenantsBaseDir);
  for (const adminId of adminDirs) {
    const accStore = getAccountsStore(adminId);
    if (accStore.get(phone)) {
      return adminId;
    }
  }
  return null;
}

function getAllAccountsAcrossAllTenants() {
  if (!fs.existsSync(tenantsBaseDir)) return [];
  const adminDirs = fs.readdirSync(tenantsBaseDir);
  const all = [];
  for (const adminId of adminDirs) {
    const accStore = getAccountsStore(adminId);
    all.push(...accStore.getAll());
  }
  return all;
}

function getAllContactsAcrossAllTenants() {
  const map = new Map();
  if (!fs.existsSync(tenantsBaseDir)) return [];
  const adminDirs = fs.readdirSync(tenantsBaseDir);
  for (const adminId of adminDirs) {
    const contactsFilePath = path.join(tenantsBaseDir, adminId, 'contacts.json');
    const contacts = safeReadJSON(contactsFilePath, {});
    for (const [key, c] of Object.entries(contacts)) {
      if (!map.has(key)) {
        map.set(key, { ...c, adminId });
      }
    }
  }
  return Array.from(map.values());
}

module.exports = {
  AdminsStore,
  getAccountsStore,
  getAutoReplyStore,
  getContactsStore,
  getTemplatesStore,
  getSettingsStore,
  findAdminByPhoneNumber,
  getAllAccountsAcrossAllTenants,
  getAllContactsAcrossAllTenants
};
