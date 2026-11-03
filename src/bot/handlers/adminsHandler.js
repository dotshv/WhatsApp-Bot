const { AdminsStore } = require('../../utils/storage');
const Keyboards = require('../keyboards');
const wizardState = require('../wizardState');

module.exports = function registerAdminsHandler(bot) {
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const fromId = String(query.from?.id || chatId);
    const data = query.data;

    // View Admins Management Menu
    if (data === 'menu_admins') {
      await bot.answerCallbackQuery(query.id);
      const admins = AdminsStore.getAll();
      const isSuper = AdminsStore.isSuperAdmin(fromId);

      let text =
        `👑 *Admin Access Management*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 Total Authorized Admins: *${admins.length}*\n\n` +
        `💡 *Multi-Tenant System:*\n` +
        `Har admin ka WhatsApp accounts, Step 1-4 auto-reply, aur leads data **100% alag aur private** rehta hai!\n\n` +
        `Select an option below:`;

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: Keyboards.adminsMenu()
      }).catch(async () => {
        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.adminsMenu()
        });
      });
    }

    // View List of Admins
    if (data === 'adm_list') {
      await bot.answerCallbackQuery(query.id);
      const admins = AdminsStore.getAll();

      let text = `📋 *Authorized Bot Admins (${admins.length})*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      admins.forEach((a, idx) => {
        const badge = a.role === 'superadmin' ? '⭐ Super Admin' : '👤 Admin';
        text += `${idx + 1}. *${a.name || 'Admin'}* [${badge}]\n`;
        text += `   🆔 ID: \`${a.id}\`\n`;
        if (a.addedBy) text += `   👑 Added by: \`${a.addedBy}\`\n`;
        text += `\n`;
      });

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.adminsMenu()
      });
    }

    // Start Add Admin flow
    if (data === 'adm_add') {
      await bot.answerCallbackQuery(query.id);
      wizardState.set(chatId, 'AWAITING_NEW_ADMIN_ID');

      const text =
        `➕ *Add New Admin ID*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Please send the numeric **Telegram User ID** of the new admin.\n\n` +
        `*Examples:*\n` +
        `• Only ID: \`1234567890\`\n` +
        `• ID with Name: \`1234567890, Rahul\`\n\n` +
        `💡 _Tip: Naya admin Telegram me @userinfobot se ya is bot ko /myid bhej kar apna ID dekh sakta hai._\n\n` +
        `Type /cancel to abort.`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.cancelAction('menu_admins')
      });
    }

    // Remove Admin Menu
    if (data === 'adm_remove_menu') {
      await bot.answerCallbackQuery(query.id);
      const admins = AdminsStore.getAll();
      const removable = admins.filter(a => a.role !== 'superadmin');

      if (removable.length === 0) {
        await bot.sendMessage(chatId, 'ℹ️ No other admins to remove (Super Admin cannot be deleted).', {
          reply_markup: Keyboards.adminsMenu()
        });
        return;
      }

      await bot.sendMessage(chatId, 'Select the admin you want to remove:', {
        reply_markup: Keyboards.adminSelection(admins)
      });
    }

    // Process Admin Removal
    if (data.startsWith('adm_del:')) {
      const targetId = data.replace('adm_del:', '');
      try {
        AdminsStore.removeAdmin(targetId);
        await bot.answerCallbackQuery(query.id, { text: 'Admin removed!' });
        await bot.sendMessage(chatId, `🗑️ *Admin ID \`${targetId}\` has been removed!*`, {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.adminsMenu()
        });
      } catch (err) {
        await bot.answerCallbackQuery(query.id, { text: err.message, show_alert: true });
      }
    }
  });

  async function handleAdminInput(msg) {
    const chatId = msg.chat.id;
    const fromId = String(msg.from?.id || chatId);
    const state = wizardState.get(chatId);
    if (!state || state.state !== 'AWAITING_NEW_ADMIN_ID') return false;

    const raw = (msg.text || '').trim();
    if (!raw) return true;

    let targetId = raw;
    let targetName = '';
    if (raw.includes(',')) {
      const parts = raw.split(',');
      targetId = parts[0].trim();
      targetName = parts.slice(1).join(',').trim();
    }

    const cleanId = targetId.replace(/[^0-9]/g, '');
    if (!cleanId || cleanId.length < 5) {
      await bot.sendMessage(chatId, '⚠️ Invalid Telegram ID! Please send numeric user ID (e.g. `1234567890`).', {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.cancelAction('menu_admins')
      });
      return true;
    }

    wizardState.clear(chatId);

    try {
      const added = AdminsStore.addAdmin(cleanId, targetName, fromId);
      const text =
        `🎉 *New Admin Added Successfully!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 Name: *${added.name}*\n` +
        `🆔 Telegram ID: \`${added.id}\`\n` +
        `👑 Role: *Admin*\n\n` +
        `✅ *Ab ye user bot ko /start bhej kar use kar sakta hai.*\n` +
        `Inka WhatsApp accounts, Step 1-4 auto-reply aur contacts **100% alag** rahenge!`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.adminsMenu()
      });
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Error: ${err.message}`, {
        reply_markup: Keyboards.adminsMenu()
      });
    }

    return true;
  }

  return { handleAdminInput };
};

