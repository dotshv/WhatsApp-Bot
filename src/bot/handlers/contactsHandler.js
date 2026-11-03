const fs = require('fs');
const path = require('path');
const { getContactsStore } = require('../../utils/storage');
const Keyboards = require('../keyboards');
const config = require('../../../config/default');

module.exports = function registerContactsHandler(bot) {
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const fromId = String(query.from?.id || chatId);
    const data = query.data;

    const contactsStore = getContactsStore(fromId);

    // Contacts Menu
    if (data === 'menu_contacts') {
      await bot.answerCallbackQuery(query.id);
      const list = contactsStore.getList();

      const text =
        `👥 *My Contacts & Leads Database*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 My Captured Contacts: *${list.length}*\n\n` +
        `_Users who message your WhatsApp accounts are automatically stored here privately._\n` +
        `You can broadcast to them or export to CSV.`;

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: Keyboards.contactsMenu()
      }).catch(async () => {
        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.contactsMenu()
        });
      });
    }

    // Stats Detail
    if (data === 'ct_stats') {
      await bot.answerCallbackQuery(query.id);
      const list = contactsStore.getList();

      const withNames = list.filter(c => c.name).length;
      const autoReplied = list.filter(c => c.lastAutoReplyAt).length;

      const text =
        `📊 *My Database Statistics:*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• Total Contacts: *${list.length}*\n` +
        `• With WhatsApp Profile Name: *${withNames}*\n` +
        `• Received Auto-Reply: *${autoReplied}*\n`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.contactsMenu()
      });
    }

    // Export CSV
    if (data === 'ct_export') {
      await bot.answerCallbackQuery(query.id, { text: 'Generating CSV...' });
      const list = contactsStore.getList();

      if (list.length === 0) {
        await bot.sendMessage(chatId, 'No contacts to export under your profile.', {
          reply_markup: Keyboards.contactsMenu()
        });
        return;
      }

      // Generate CSV
      let csvContent = 'phone,name,first_seen,last_seen,message_count,last_autoreply\n';
      list.forEach(c => {
        const safeName = (c.name || '').replace(/"/g, '""');
        csvContent += `"${c.phone}","${safeName}","${c.firstSeen || ''}","${c.lastSeen || ''}",${c.messageCount || 1},"${c.lastAutoReplyAt || ''}"\n`;
      });

      const exportPath = path.join(config.paths.dataDir, `contacts_${fromId}_${Date.now()}.csv`);
      fs.writeFileSync(exportPath, csvContent, 'utf8');

      await bot.sendDocument(chatId, exportPath, {
        caption: `📤 *Exported ${list.length} WhatsApp Contacts (Your Profile)*\nYou can open this file in Microsoft Excel or Google Sheets.`,
        parse_mode: 'Markdown'
      });

      try { fs.unlinkSync(exportPath); } catch (_) {}
    }

    // Clear contacts
    if (data === 'ct_clear') {
      await bot.answerCallbackQuery(query.id);
      contactsStore.clear();
      await bot.sendMessage(chatId, '🗑 *Your contacts database has been cleared!*', {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.contactsMenu()
      });
    }
  });
};
