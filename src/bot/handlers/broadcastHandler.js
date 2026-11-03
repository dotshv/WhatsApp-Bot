const fs = require('fs');
const {
  getContactsStore,
  getTemplatesStore,
  getSettingsStore,
  getAllContactsAcrossAllTenants
} = require('../../utils/storage');
const {
  cleanPhone,
  phoneToJid,
  renderTemplate,
  extractPlaceholders,
  parseDelimitedData
} = require('../../utils/formatter');
const { downloadTelegramFile, extractMediaFromTelegramMsg } = require('../../utils/downloader');
const WhatsAppSender = require('../../whatsapp/sender');
const Keyboards = require('../keyboards');
const wizardState = require('../wizardState');

// In-memory cache for pending broadcast jobs
const pendingBroadcasts = new Map();

module.exports = function registerBroadcastHandler(bot, waManager) {
  // Broadcast Menu Callbacks
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const fromId = String(query.from?.id || chatId);
    const data = query.data;

    const contactsStore = getContactsStore(fromId);
    const templatesStore = getTemplatesStore(fromId);
    const settingsStore = getSettingsStore(fromId);

    // Main Broadcast Center
    if (data === 'menu_broadcast') {
      await bot.answerCallbackQuery(query.id);
      let contacts = contactsStore.getList();
      if (contacts.length === 0) {
        contacts = getAllContactsAcrossAllTenants();
      }
      const settings = settingsStore.get();
      const delaySec = (settings.broadcastDelayMs || 2500) / 1000;
      const connectedCount = waManager.getConnectedCount(fromId);

      const text =
        `📢 *My Broadcast Center*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 My Saved Contacts: *${contacts.length}*\n` +
        `⏱️ Safe Delay: *${delaySec}s* per message\n` +
        `📱 Connected WhatsApp: *${connectedCount}*\n\n` +
        `Select an option below:`;

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: Keyboards.broadcastMenu()
      }).catch(async () => {
        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.broadcastMenu()
        });
      });
    }

    // 1. Broadcast to All Contacts
    if (data === 'bc_all') {
      await bot.answerCallbackQuery(query.id);
      let contacts = contactsStore.getList();
      if (contacts.length === 0) {
        contacts = getAllContactsAcrossAllTenants();
      }
      if (contacts.length === 0) {
        await bot.sendMessage(
          chatId,
          `⚠️ *No contacts found in your database!*\n\n` +
          `Contacts are automatically recorded whenever anyone messages your WhatsApp accounts.\n` +
          `You can also use *Template Broadcast* to paste a list of numbers directly!`,
          {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.broadcastMenu()
          }
        );
        return;
      }

      wizardState.set(chatId, 'AWAITING_BROADCAST_ALL_CONTENT', { adminId: fromId });

      const text =
        `👥 *Broadcast to All (${contacts.length} Contacts)*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Please send what you want to broadcast:\n\n` +
        `• 📝 *Text message*\n` +
        `• 🖼️ *Photo* (with optional caption)\n` +
        `• 🎥 *Video* (with optional caption)\n` +
        `• 📦 *Document / APK* (with optional caption)\n\n` +
        `Type /cancel to abort.`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.cancelAction('menu_broadcast')
      });
    }

    // 2. Single User Direct Message
    if (data === 'bc_single') {
      await bot.answerCallbackQuery(query.id);
      wizardState.set(chatId, 'AWAITING_SINGLE_PHONE', { adminId: fromId });

      const text =
        `🎯 *Single User Direct Message*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Please enter the recipient phone number with country code.\n` +
        `Example: \`919876543210\`\n\n` +
        `Type /cancel to abort.`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.cancelAction('menu_broadcast')
      });
    }

    // 3. Template Broadcast Submenu
    if (data === 'bc_template_menu') {
      await bot.answerCallbackQuery(query.id);
      const templates = templatesStore.getAll();
      const current = templates[0] || {};

      const text =
        `📑 *Personalized / Template Broadcast*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `This feature sends customized messages to each person dynamically (e.g. distinct Name, Order ID, etc.)!\n\n` +
        `📌 *Active Template:*\n` +
        `\`\`\`\n${current.content || 'None set'}\n\`\`\`\n` +
        `Variables detected: *${(current.variables || []).map(v => `{${v}}`).join(', ') || 'None'}*\n\n` +
        `Choose an action:`;

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: Keyboards.templateMenu()
      }).catch(async () => {
        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.templateMenu()
        });
      });
    }

    // View Active Template
    if (data === 'tpl_view') {
      await bot.answerCallbackQuery(query.id);
      const templates = templatesStore.getAll();
      const current = templates[0] || {};

      await bot.sendMessage(
        chatId,
        `📋 *Current Active Template:*\n\n` +
        `\`\`\`\n${current.content || 'No template found'}\n\`\`\`\n\n` +
        `Variables: *${(current.variables || []).map(v => `{${v}}`).join(', ') || 'None'}*`,
        {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.templateMenu()
        }
      );
    }

    // Edit Template
    if (data === 'tpl_edit') {
      await bot.answerCallbackQuery(query.id);
      wizardState.set(chatId, 'AWAITING_NEW_TEMPLATE', { adminId: fromId });

      const text =
        `📝 *Set New Message Template*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Send your message format using \`{variable_name}\` placeholders.\n\n` +
        `*Example:*\n` +
        `\`\`\`\n` +
        `Namaste {name}! 🙏\n` +
        `Aapka order confirm ho gaya hai.\n` +
        `Order ID: {order_id}\n` +
        `Item: {item}\n` +
        `\`\`\`\n\n` +
        `Type /cancel to abort.`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.cancelAction('bc_template_menu')
      });
    }

    // Start Personalized Broadcast
    if (data === 'tpl_start') {
      await bot.answerCallbackQuery(query.id);
      const templates = templatesStore.getAll();
      const current = templates[0];
      if (!current || !current.content) {
        await bot.sendMessage(chatId, '⚠️ Please set a template first before starting personalized broadcast.', {
          reply_markup: Keyboards.templateMenu()
        });
        return;
      }

      wizardState.set(chatId, 'AWAITING_TEMPLATE_DATA', { template: current, adminId: fromId });

      const text =
        `🚀 *Start Personalized Broadcast*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Active Template requires columns: *${['phone', ...(current.variables || [])].join(', ')}*\n\n` +
        `*How to provide recipient data:*\n` +
        `1️⃣ *Paste directly in chat* in CSV or Pipe format:\n` +
        `\`\`\`\n` +
        `phone,name,order_id\n` +
        `919876543210,Rahul,ORD-101\n` +
        `919812345678,Aman,ORD-102\n` +
        `\`\`\`\n` +
        `OR\n` +
        `2️⃣ *Upload a .csv or .txt file* exported from Excel / Google Sheets.\n\n` +
        `Type /cancel to abort.`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.cancelAction('bc_template_menu')
      });
    }

    // Broadcast safe delay menu
    if (data === 'bc_delay_menu') {
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, 'Select Anti-Ban Delay between messages:', {
        reply_markup: Keyboards.delaySelection('bc')
      });
    }

    // Set delay callback
    if (data.startsWith('set_delay:')) {
      const parts = data.split(':');
      const target = parts[1];
      const ms = parseInt(parts[2], 10);

      if (target === 'bc') {
        settingsStore.save({ broadcastDelayMs: ms });
        await bot.answerCallbackQuery(query.id, { text: `Broadcast delay set to ${ms / 1000}s` });
        await bot.sendMessage(chatId, `✅ *Broadcast Safe Delay set to ${ms / 1000} seconds!*`, {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.broadcastMenu()
        });
      } else {
        const { getAutoReplyStore } = require('../../utils/storage');
        getAutoReplyStore(fromId).save({ delayBetweenMessagesMs: ms });
        await bot.answerCallbackQuery(query.id, { text: `Step delay set to ${ms / 1000}s` });
        const ar = getAutoReplyStore(fromId).get();
        await bot.sendMessage(chatId, `✅ *Auto-Reply Step Delay set to ${ms / 1000} seconds!*`, {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.autoReplyMenu(ar.enabled, ar.slots)
        });
      }
    }

    // Confirm execution of a broadcast job
    if (data.startsWith('confirm_bc:')) {
      const jobKey = data.replace('confirm_bc:', '');
      const job = pendingBroadcasts.get(jobKey);

      if (!job) {
        await bot.answerCallbackQuery(query.id, { text: 'Job expired or already run.' });
        return;
      }

      await bot.answerCallbackQuery(query.id, { text: 'Starting broadcast...' });
      pendingBroadcasts.delete(jobKey);

      // Execute in background
      executeBroadcastJob(bot, waManager, chatId, job);
    }
  });

  /**
   * Handle text and media messages during Broadcast wizards
   */
  async function handleBroadcastInput(msg) {
    const chatId = msg.chat.id;
    const fromId = String(msg.from?.id || chatId);
    const state = wizardState.get(chatId);
    if (!state) return false;

    const adminId = state.data.adminId || fromId;
    const contactsStore = getContactsStore(adminId);
    const templatesStore = getTemplatesStore(adminId);

    // 1. Awaiting content for Broadcast to All
    if (state.state === 'AWAITING_BROADCAST_ALL_CONTENT') {
      let contacts = contactsStore.getList();
      if (contacts.length === 0) {
        contacts = getAllContactsAcrossAllTenants();
      }
      const media = extractMediaFromTelegramMsg(msg);

      let broadcastItem = null;
      if (media) {
        const waitMsg = await bot.sendMessage(chatId, `⏳ *Downloading ${media.type.toUpperCase()} file...*`, {
          parse_mode: 'Markdown'
        });
        const fileResult = await downloadTelegramFile(bot, media.fileId, media.fileName);
        broadcastItem = {
          type: media.type,
          filePath: fileResult.filePath,
          fileName: fileResult.fileName,
          mimetype: fileResult.mimetype,
          caption: media.caption || ''
        };
        await bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
      } else if (msg.text) {
        broadcastItem = {
          type: 'text',
          content: msg.text.trim()
        };
      }

      if (!broadcastItem) return true;

      wizardState.clear(chatId);
      const jobKey = `job_${Date.now()}`;
      pendingBroadcasts.set(jobKey, {
        adminId,
        type: 'all',
        item: broadcastItem,
        recipients: contacts.map(c => ({
          phone: c.phone,
          jid: c.jid || (c.phone && c.phone.length >= 14 && !c.phone.startsWith('91') ? `${c.phone}@lid` : `${c.phone}@s.whatsapp.net`),
          name: c.name || ''
        }))
      });

      const previewText =
        `📋 *Broadcast to All Contacts Preview:*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 Total Recipients: *${contacts.length}*\n` +
        `📦 Type: *${broadcastItem.type.toUpperCase()}*\n` +
        (broadcastItem.content ? `📝 Text: "${broadcastItem.content.substring(0, 150)}..."\n` : '') +
        (broadcastItem.fileName ? `📁 File: \`${broadcastItem.fileName}\`\n` : '') +
        (broadcastItem.caption ? `💬 Caption: "${broadcastItem.caption}"\n` : '') +
        `\n⚠️ *Anti-ban delay will be applied between each message.*`;

      await bot.sendMessage(chatId, previewText, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.confirmBroadcast(jobKey)
      });
      return true;
    }

    // 2. Awaiting Single Phone Number
    if (state.state === 'AWAITING_SINGLE_PHONE') {
      const phone = cleanPhone(msg.text);
      if (!phone || phone.length < 10) {
        await bot.sendMessage(chatId, '⚠️ Invalid phone number. Please enter digits with country code (e.g. `919876543210`).', {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.cancelAction('menu_broadcast')
        });
        return true;
      }

      wizardState.set(chatId, 'AWAITING_SINGLE_CONTENT', { phone, adminId });

      const text =
        `🎯 *Target Number:* \`+${phone}\`\n\n` +
        `Now send the message you want to deliver:\n` +
        `• 📝 Text\n` +
        `• 🖼️ Photo (with optional caption)\n` +
        `• 🎥 Video (with optional caption)\n` +
        `• 📦 Document / APK (with optional caption)\n\n` +
        `Type /cancel to abort.`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.cancelAction('menu_broadcast')
      });
      return true;
    }

    // 3. Awaiting Single Content
    if (state.state === 'AWAITING_SINGLE_CONTENT') {
      const targetPhone = state.data.phone;
      const sock = waManager.getSocket(null, adminId);

      if (!sock) {
        wizardState.clear(chatId);
        await bot.sendMessage(chatId, '⚠️ *No WhatsApp account connected!* Please link an account first.', {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.accountsMenu()
        });
        return true;
      }

      const media = extractMediaFromTelegramMsg(msg);
      let stepItem = null;

      if (media) {
        const waitMsg = await bot.sendMessage(chatId, `⏳ *Preparing ${media.type.toUpperCase()}...*`, {
          parse_mode: 'Markdown'
        });
        const fileResult = await downloadTelegramFile(bot, media.fileId, media.fileName);
        stepItem = {
          type: media.type,
          filePath: fileResult.filePath,
          fileName: fileResult.fileName,
          mimetype: fileResult.mimetype,
          caption: media.caption || ''
        };
        await bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
      } else if (msg.text) {
        stepItem = {
          type: 'text',
          content: msg.text.trim()
        };
      }

      if (!stepItem) return true;

      wizardState.clear(chatId);
      const sendingMsg = await bot.sendMessage(chatId, `🚀 *Delivering message to +${targetPhone}...*`, {
        parse_mode: 'Markdown'
      });

      try {
        await WhatsAppSender.sendStep(sock, targetPhone, stepItem);
        await bot.editMessageText(`✅ *Message successfully delivered to +${targetPhone}!*`, {
          chat_id: chatId,
          message_id: sendingMsg.message_id,
          parse_mode: 'Markdown',
          reply_markup: Keyboards.broadcastMenu()
        });
      } catch (err) {
        console.error(`[Single Broadcast] Error delivering to ${targetPhone}:`, err.message);
        await bot.editMessageText(`❌ *Failed to deliver message:* ${err.message}`, {
          chat_id: chatId,
          message_id: sendingMsg.message_id,
          reply_markup: Keyboards.broadcastMenu()
        });
      }
      return true;
    }

    // 4. Awaiting New Template String
    if (state.state === 'AWAITING_NEW_TEMPLATE') {
      if (!msg.text || !msg.text.trim()) {
        await bot.sendMessage(chatId, 'Please send text for the template.');
        return true;
      }

      const templateContent = msg.text.trim();
      const variables = extractPlaceholders(templateContent);

      templatesStore.save({
        id: 'active_template',
        name: 'Custom Template',
        content: templateContent,
        variables
      });

      wizardState.clear(chatId);

      const text =
        `✅ *Template Saved Successfully!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `\`\`\`\n${templateContent}\n\`\`\`\n\n` +
        `Variables detected: *${variables.map(v => `{${v}}`).join(', ') || 'None'}*\n\n` +
        `You can now start a personalized broadcast using this template.`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.templateMenu()
      });
      return true;
    }

    // 5. Awaiting Template Recipient Data (CSV or Text)
    if (state.state === 'AWAITING_TEMPLATE_DATA') {
      let rawText = '';

      if (msg.document) {
        const fileResult = await downloadTelegramFile(bot, msg.document.file_id, msg.document.file_name);
        rawText = fs.readFileSync(fileResult.filePath, 'utf8');
      } else if (msg.text) {
        rawText = msg.text.trim();
      }

      if (!rawText) return true;

      const template = state.data.template;
      const parsed = parseDelimitedData(rawText);

      if (parsed.valid === 0) {
        await bot.sendMessage(
          chatId,
          `⚠️ *No valid phone numbers found!* Please verify that your data contains a phone column with at least 10 digits per number.\n\nTry sending again or type /cancel.`,
          {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.cancelAction('bc_template_menu')
          }
        );
        return true;
      }

      wizardState.clear(chatId);

      const validRows = parsed.rows.filter(r => r._valid);
      const sampleRow = validRows[0];
      const sampleRendered = renderTemplate(template.content, sampleRow);

      const jobKey = `job_tpl_${Date.now()}`;
      pendingBroadcasts.set(jobKey, {
        adminId,
        type: 'template',
        template: template.content,
        rows: validRows
      });

      const previewText =
        `📋 *Personalized Broadcast Preview:*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 Valid Recipients: *${validRows.length}*\n` +
        `📱 Sample for #1 (+${sampleRow._phone}):\n\n` +
        `\`\`\`\n${sampleRendered}\n\`\`\`\n\n` +
        `Each user will receive their unique data replaced according to their row!\n\n` +
        `*Do you want to start this broadcast?*`;

      await bot.sendMessage(chatId, previewText, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.confirmBroadcast(jobKey)
      });
      return true;
    }

    return false;
  }

  return { handleBroadcastInput };
};

/**
 * Background Broadcast Execution Loop with safe delay and progress reporting
 */
async function executeBroadcastJob(bot, waManager, chatId, job) {
  const adminId = job.adminId;
  const sock = waManager.getSocket(null, adminId);
  if (!sock) {
    await bot.sendMessage(chatId, '❌ *Broadcast failed:* No WhatsApp account is connected!', {
      parse_mode: 'Markdown'
    });
    return;
  }

  const settingsStore = getSettingsStore(adminId);
  const settings = settingsStore.get();
  const delayMs = settings.broadcastDelayMs || 2500;

  const total = job.type === 'all' ? job.recipients.length : job.rows.length;
  let sentCount = 0;
  let failCount = 0;

  const statusMsg = await bot.sendMessage(
    chatId,
    `🚀 *Broadcast Started!*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Total: *${total}* | Safe Delay: *${delayMs / 1000}s*\n` +
    `Progress: *0/${total}* (0%)\n` +
    `Please wait...`,
    { parse_mode: 'Markdown' }
  );

  for (let i = 0; i < total; i++) {
    try {
      if (job.type === 'all') {
        const recipient = job.recipients[i];
        const target = (typeof recipient === 'object') ? (recipient.jid || recipient.phone) : recipient;
        await WhatsAppSender.sendStep(sock, target, job.item);
        sentCount++;
      } else if (job.type === 'template') {
        const row = job.rows[i];
        const target = row._jid || row._phone;
        const personalizedText = renderTemplate(job.template, row);
        await WhatsAppSender.sendText(sock, target, personalizedText);
        sentCount++;
      }
    } catch (err) {
      console.error(`[Broadcast] Error sending to recipient #${i + 1}:`, err.message);
      failCount++;
    }

    if ((i + 1) % 5 === 0 || i === total - 1) {
      const pct = Math.round(((i + 1) / total) * 100);
      await bot.editMessageText(
        `🚀 *Broadcast in Progress...*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Progress: *${i + 1}/${total}* (${pct}%)\n` +
        `✅ Sent: *${sentCount}* | ❌ Failed: *${failCount}*`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      ).catch(() => {});
    }

    if (i < total - 1) {
      await WhatsAppSender.sleep(delayMs);
    }
  }

  await bot.sendMessage(
    chatId,
    `🎉 *Broadcast Complete!*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Total: *${total}*\n` +
    `✅ Successfully Sent: *${sentCount}*\n` +
    `❌ Failed: *${failCount}*`,
    {
      parse_mode: 'Markdown',
      reply_markup: Keyboards.broadcastMenu()
    }
  );
}
