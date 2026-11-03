const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mime = require('mime-types');

const config = require('../../config/default');
const {
  AdminsStore,
  getAccountsStore,
  getAutoReplyStore,
  getContactsStore,
  getTemplatesStore,
  getSettingsStore
} = require('../utils/storage');
const { cleanPhone, phoneToJid, parseDelimitedData, renderTemplate } = require('../utils/formatter');
const WhatsAppSender = require('../whatsapp/sender');

function initWebServer(waManager) {
  const app = express();
  const port = config.port || 3000;

  // JSON & URL-encoded parser
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static files for web dashboard
  const publicDir = path.join(__dirname, '..', '..', 'public');
  app.use(express.static(publicDir));

  // Helper to resolve adminId safely
  const getActiveAdminId = (req) => {
    const fromQuery = req.query?.adminId;
    const fromBody = req.body?.adminId;
    const firstAdmin = AdminsStore.getAll()[0]?.id;
    return String(fromQuery || fromBody || firstAdmin || '8903350022');
  };

  // Configure Multer for file uploads (APK, Videos, Photos, Docs)
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, config.paths.mediaDir);
    },
    filename: (req, file, cb) => {
      const safeExt = path.extname(file.originalname) || '.bin';
      const baseName = path.basename(file.originalname, safeExt).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${Date.now()}_${baseName}${safeExt}`);
    }
  });
  const upload = multer({ storage });

  // 1. Overall System Status per Admin
  app.get('/api/status', (req, res) => {
    const adminId = getActiveAdminId(req);
    const accounts = waManager.listAccounts(adminId);
    const connectedCount = waManager.getConnectedCount(adminId);
    const arStore = getAutoReplyStore(adminId);
    const arConfig = arStore.get();
    const activeSteps = arStore.getActiveSteps();
    const contactsStore = getContactsStore(adminId);
    const contacts = contactsStore.getList();
    const settingsStore = getSettingsStore(adminId);
    const settings = settingsStore.get();
    const admins = AdminsStore.getAll();
    const currentAdmin = AdminsStore.get(adminId) || admins[0];

    res.json({
      success: true,
      currentAdmin,
      admins,
      accounts,
      connectedCount,
      autoreply: {
        enabled: arConfig.enabled,
        triggerMode: arConfig.triggerMode,
        delayBetweenMessagesMs: arConfig.delayBetweenMessagesMs,
        slots: arConfig.slots,
        activeCount: activeSteps.length
      },
      contactsCount: contacts.length,
      settings
    });
  });

  // 2. Admins Management API
  app.get('/api/admins', (req, res) => {
    res.json({ success: true, admins: AdminsStore.getAll() });
  });

  app.post('/api/admins', (req, res) => {
    const { id, name } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Telegram ID is required' });
    try {
      const newAdmin = AdminsStore.addAdmin(id, name, 'Web Dashboard');
      res.json({ success: true, admin: newAdmin });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  app.delete('/api/admins/:id', (req, res) => {
    try {
      AdminsStore.removeAdmin(req.params.id);
      res.json({ success: true, message: `Admin ${req.params.id} removed.` });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  // 3. Request WhatsApp Pairing Code via Web UI for active admin
  app.post('/api/accounts/pair', async (req, res) => {
    const adminId = getActiveAdminId(req);
    const rawPhone = req.body.phone;
    const phone = cleanPhone(rawPhone);

    if (!phone || phone.length < 10) {
      return res.status(400).json({ success: false, error: 'Invalid phone number. Include country code (e.g. 919876543210).' });
    }

    let codeSent = false;
    const timeout = setTimeout(() => {
      if (!codeSent) {
        codeSent = true;
        res.status(500).json({ success: false, error: 'Timed out waiting for pairing code from WhatsApp. Please check phone number and try again.' });
      }
    }, 30000);

    try {
      await waManager.connectAccount(phone, {
        adminId,
        requestPairing: true,
        onPairingCode: (code) => {
          if (!codeSent) {
            codeSent = true;
            clearTimeout(timeout);
            res.json({ success: true, phone, code });
          }
        },
        onError: (err) => {
          if (!codeSent) {
            codeSent = true;
            clearTimeout(timeout);
            res.status(500).json({ success: false, error: err.message });
          }
        }
      });
    } catch (err) {
      if (!codeSent) {
        codeSent = true;
        clearTimeout(timeout);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  });

  // 4. Remove WhatsApp Account
  app.delete('/api/accounts/:phone', async (req, res) => {
    const adminId = getActiveAdminId(req);
    const phone = cleanPhone(req.params.phone);
    await waManager.deleteAccount(phone, adminId);
    res.json({ success: true, message: `Account +${phone} removed.` });
  });

  // 5. Get Auto-Reply Config
  app.get('/api/autoreply', (req, res) => {
    const adminId = getActiveAdminId(req);
    const arStore = getAutoReplyStore(adminId);
    const config = arStore.get();
    const active = arStore.getActiveSteps();
    res.json({ success: true, config, activeSteps: active });
  });

  // 6. Update Auto-Reply Slot (Step 1, 2, 3, 4) with Text or File (APK, Photo, Video, Doc)
  app.post('/api/autoreply/slot/:num', upload.single('mediaFile'), (req, res) => {
    const adminId = getActiveAdminId(req);
    const slotNum = parseInt(req.params.num, 10);
    if (![1, 2, 3, 4].includes(slotNum)) {
      return res.status(400).json({ success: false, error: 'Slot number must be 1, 2, 3, or 4.' });
    }

    const arStore = getAutoReplyStore(adminId);

    if (req.file) {
      const origName = req.file.originalname;
      const isApk = origName.toLowerCase().endsWith('.apk');
      const isVideo = req.file.mimetype.startsWith('video/');
      const isImage = req.file.mimetype.startsWith('image/');
      const isAudio = req.file.mimetype.startsWith('audio/');

      let type = 'document';
      if (isApk) type = 'apk';
      else if (isImage) type = 'image';
      else if (isVideo) type = 'video';
      else if (isAudio) type = 'audio';

      const detectedMime = isApk ? 'application/vnd.android.package-archive' : (req.file.mimetype || mime.lookup(req.file.path) || 'application/octet-stream');

      const saved = arStore.setSlot(slotNum, {
        type,
        filePath: req.file.path,
        fileName: origName,
        mimetype: detectedMime,
        caption: req.body.caption || '',
        fileSize: req.file.size
      });

      return res.json({ success: true, slot: saved, message: `Step ${slotNum} saved with file ${origName}` });
    } else if (req.body.content) {
      const saved = arStore.setSlot(slotNum, {
        type: 'text',
        content: req.body.content.trim()
      });
      return res.json({ success: true, slot: saved, message: `Step ${slotNum} saved with text.` });
    }

    res.status(400).json({ success: false, error: 'Provide text content or a media file.' });
  });

  // 7. Clear Auto-Reply Slot
  app.delete('/api/autoreply/slot/:num', (req, res) => {
    const adminId = getActiveAdminId(req);
    const slotNum = parseInt(req.params.num, 10);
    getAutoReplyStore(adminId).clearSlot(slotNum);
    res.json({ success: true, message: `Step ${slotNum} cleared (will be skipped in sequence).` });
  });

  // 8. Toggle Auto-Reply Master Status
  app.post('/api/autoreply/toggle', (req, res) => {
    const adminId = getActiveAdminId(req);
    const isEnabled = getAutoReplyStore(adminId).toggle();
    res.json({ success: true, enabled: isEnabled });
  });

  // 9. Update Auto-Reply Settings (Delay & Trigger Mode)
  app.post('/api/autoreply/settings', (req, res) => {
    const adminId = getActiveAdminId(req);
    const delay = parseInt(req.body.delay, 10);
    const mode = req.body.mode;
    const update = {};
    if (!isNaN(delay)) update.delayBetweenMessagesMs = delay;
    if (mode) update.triggerMode = mode;
    const saved = getAutoReplyStore(adminId).save(update);
    res.json({ success: true, config: saved });
  });

  // 10. Get Contacts List for this admin (with global fallback)
  app.get('/api/contacts', (req, res) => {
    const adminId = getActiveAdminId(req);
    let list = getContactsStore(adminId).getList();
    if (list.length === 0) {
      const { getAllContactsAcrossAllTenants } = require('../utils/storage');
      list = getAllContactsAcrossAllTenants();
    }
    res.json({ success: true, contacts: list, total: list.length });
  });

  // 11. Export Contacts to CSV file for this admin
  app.get('/api/contacts/export', (req, res) => {
    const adminId = getActiveAdminId(req);
    let list = getContactsStore(adminId).getList();
    if (list.length === 0) {
      const { getAllContactsAcrossAllTenants } = require('../utils/storage');
      list = getAllContactsAcrossAllTenants();
    }
    let csv = 'phone,name,first_seen,last_seen,message_count,last_autoreply\n';
    list.forEach(c => {
      const safeName = (c.name || '').replace(/"/g, '""');
      csv += `"${c.phone}","${safeName}","${c.firstSeen || ''}","${c.lastSeen || ''}",${c.messageCount || 1},"${c.lastAutoReplyAt || ''}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="whatsapp_contacts_${adminId}.csv"`);
    res.send(csv);
  });

  // 12. Send Single Direct WhatsApp Message
  app.post('/api/broadcast/single', upload.single('mediaFile'), async (req, res) => {
    const adminId = getActiveAdminId(req);
    const phone = cleanPhone(req.body.phone);
    if (!phone || phone.length < 10) {
      return res.status(400).json({ success: false, error: 'Valid phone number with country code is required.' });
    }

    const sock = waManager.getSocket(null, adminId);
    if (!sock) {
      return res.status(503).json({ success: false, error: 'No WhatsApp account is connected.' });
    }

    try {
      if (req.file) {
        const origName = req.file.originalname;
        const isApk = origName.toLowerCase().endsWith('.apk');
        const isImage = req.file.mimetype.startsWith('image/');
        const isVideo = req.file.mimetype.startsWith('video/');

        let type = 'document';
        if (isApk) type = 'apk';
        else if (isImage) type = 'image';
        else if (isVideo) type = 'video';

        await WhatsAppSender.sendStep(sock, phone, {
          type,
          filePath: req.file.path,
          fileName: origName,
          caption: req.body.caption || req.body.text || '',
          mimetype: isApk ? 'application/vnd.android.package-archive' : req.file.mimetype
        });
      } else {
        await WhatsAppSender.sendText(sock, phone, req.body.text || '');
      }

      res.json({ success: true, message: `Message delivered to +${phone} successfully!` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13. Run Personalized Template Broadcast
  app.post('/api/broadcast/template', upload.single('dataFile'), async (req, res) => {
    const adminId = getActiveAdminId(req);
    const templateText = req.body.template;
    let dataText = req.body.dataText || '';

    if (req.file) {
      dataText = fs.readFileSync(req.file.path, 'utf8');
    }

    if (!templateText) {
      return res.status(400).json({ success: false, error: 'Template text is required.' });
    }
    if (!dataText.trim()) {
      return res.status(400).json({ success: false, error: 'Recipient data (CSV or text) is required.' });
    }

    const parsed = parseDelimitedData(dataText);
    const validRows = parsed.rows.filter(r => r._valid);

    if (validRows.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid phone numbers found in data.' });
    }

    const sock = waManager.getSocket(null, adminId);
    if (!sock) {
      return res.status(503).json({ success: false, error: 'No WhatsApp account connected for this admin.' });
    }

    // Save active template for this admin
    getTemplatesStore(adminId).save({
      id: 'active_template',
      content: templateText,
      variables: parsed.headers.filter(h => h !== 'phone')
    });

    const settings = getSettingsStore(adminId).get();
    const delayMs = settings.broadcastDelayMs || 2500;

    let sent = 0;
    let failed = 0;

    (async () => {
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const personalized = renderTemplate(templateText, row);

        try {
          await WhatsAppSender.sendText(sock, row._phone, personalized);
          sent++;
        } catch (e) {
          console.error(`[Web Broadcast Admin:${adminId}] Error sending to ${row._phone}:`, e.message);
          failed++;
        }

        if (i < validRows.length - 1) {
          await WhatsAppSender.sleep(delayMs);
        }
      }
      console.log(`[Web Broadcast Admin:${adminId}] Complete! Sent: ${sent}, Failed: ${failed}`);
    })();

    res.json({
      success: true,
      message: `Broadcast started for ${validRows.length} recipients.`,
      totalRecipients: validRows.length,
      samplePreview: renderTemplate(templateText, validRows[0])
    });
  });

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`\n🌐 Localhost Web Dashboard is running at: http://localhost:${port}`);
    console.log(`👉 Open http://localhost:${port} in your browser to manage WhatsApp, Auto-Reply, and Broadcasts!\n`);
  });

  return server;
}

module.exports = initWebServer;
