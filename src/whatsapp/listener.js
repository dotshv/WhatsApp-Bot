const { jidToPhone } = require('../utils/formatter');
const { getContactsStore, getAutoReplyStore, findAdminByPhoneNumber } = require('../utils/storage');
const WhatsAppSender = require('./sender');

/**
 * Attaches incoming message event listeners to a Baileys socket
 * @param {object} sock - Baileys socket
 * @param {string} accountPhone - Account phone number
 * @param {string} adminId - Telegram User ID who owns this account
 * @param {function} onNotification - Callback to notify Telegram admin about important events
 */
function setupMessageListener(sock, accountPhone, adminId, onNotification) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Only process new incoming real-time messages
    if (type !== 'notify') return;

    // Resolve owner admin ID
    const ownerAdminId = adminId || findAdminByPhoneNumber(accountPhone) || 'default';
    const contactsStore = getContactsStore(ownerAdminId);
    const autoReplyStore = getAutoReplyStore(ownerAdminId);

    for (const msg of messages) {
      try {
        // Skip messages sent by our own account
        if (msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid) continue;

        // Skip WhatsApp Status broadcasts and Newsletter/Channels
        if (remoteJid === 'status@broadcast' || remoteJid.includes('@newsletter')) continue;

        // Skip Group chats (auto-reply is for 1-to-1 direct chats)
        if (remoteJid.endsWith('@g.us')) continue;

        const senderPhone = jidToPhone(remoteJid);
        const pushName = msg.pushName || '';

        // 1. Record contact to Owner Admin's Database (with full JID preserving @lid or @s.whatsapp.net)
        const contact = contactsStore.recordMessage(senderPhone, pushName, remoteJid);
        console.log(`[WA:${accountPhone} | Admin:${ownerAdminId}] Incoming from ${senderPhone} (${pushName || 'Unknown'})`);

        // 2. Auto-Reply processing for Owner Admin
        const autoReplyConfig = autoReplyStore.get();
        if (!autoReplyConfig.enabled) continue;

        // Get only configured/active steps for this admin (skipping unset/empty steps)
        const activeSteps = autoReplyStore.getActiveSteps();
        if (activeSteps.length === 0) continue;

        // Trigger mode check
        if (autoReplyConfig.triggerMode === 'first_time') {
          if (contact.lastAutoReplyAt) {
            const lastTime = new Date(contact.lastAutoReplyAt).getTime();
            const diffHours = (Date.now() - lastTime) / (1000 * 60 * 60);
            const windowHours = autoReplyConfig.replyWindowHours || 24;
            if (diffHours < windowHours) {
              // User has already received auto-reply within window
              continue;
            }
          }
        }

        // Mark that auto-reply was triggered
        contactsStore.recordAutoReply(senderPhone);
        console.log(`[WA:${accountPhone} | Admin:${ownerAdminId}] Triggering auto-reply (${activeSteps.length} step(s)) to ${senderPhone}`);

        // Execute active steps in sequence
        (async () => {
          try {
            for (let i = 0; i < activeSteps.length; i++) {
              const step = activeSteps[i];
              await WhatsAppSender.sendStep(sock, remoteJid, step);

              // Delay between sequential steps
              if (i < activeSteps.length - 1) {
                const stepDelay = autoReplyConfig.delayBetweenMessagesMs || 1500;
                await WhatsAppSender.sleep(stepDelay);
              }
            }
          } catch (err) {
            console.error(`[WA:${accountPhone}] Error dispatching auto-reply to ${senderPhone}:`, err.message);
          }
        })();

      } catch (err) {
        console.error(`[WA:${accountPhone}] Error handling incoming message:`, err.message);
      }
    }
  });
}

module.exports = {
  setupMessageListener
};
