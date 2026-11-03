const { getAccountsStore } = require('../../utils/storage');
const { cleanPhone } = require('../../utils/formatter');
const Keyboards = require('../keyboards');
const wizardState = require('../wizardState');

module.exports = function registerAccountsHandler(bot, waManager) {
  // Show Accounts Menu
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const fromId = String(query.from?.id || chatId);
    const data = query.data;

    if (data === 'menu_accounts') {
      await bot.answerCallbackQuery(query.id);
      const accounts = waManager.listAccounts(fromId);
      const connectedCount = waManager.getConnectedCount(fromId);

      let text = `📱 *My WhatsApp Accounts*\n━━━━━━━━━━━━━━━━━━━━\n`;
      text += `Total Linked: *${accounts.length}* | Online: *${connectedCount}*\n\n`;

      if (accounts.length === 0) {
        text += `_No WhatsApp accounts added yet for your profile._\nTap *Link New Account* to add one via pairing code!`;
      } else {
        accounts.forEach((acc, idx) => {
          const statusIcon = acc.isOnline ? '🟢 Connected' : '🔴 Disconnected';
          text += `${idx + 1}. *+${acc.phone}* - ${statusIcon}\n`;
        });
      }

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: Keyboards.accountsMenu()
      }).catch(async () => {
        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.accountsMenu()
        });
      });
    }

    // Initiate Add Account via Pairing Code
    if (data === 'acc_add') {
      await bot.answerCallbackQuery(query.id);
      wizardState.set(chatId, 'AWAITING_ACCOUNT_PHONE', { adminId: fromId });

      const text = `➕ *Link New WhatsApp Account*\n━━━━━━━━━━━━━━━━━━━━\n` +
        `Please send the WhatsApp Phone Number with *Country Code*.\n\n` +
        `*Examples:*\n` +
        `• India: \`919876543210\`\n` +
        `• USA: \`14155552671\`\n\n` +
        `_Note: Do NOT include '+' or spaces._\n` +
        `Type /cancel or click below to abort.`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.cancelAction('menu_accounts')
      });
    }

    // View Connected Accounts Details
    if (data === 'acc_list') {
      await bot.answerCallbackQuery(query.id);
      const accounts = waManager.listAccounts(fromId);

      let text = `📋 *My Connected WhatsApp Accounts*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      if (accounts.length === 0) {
        text += `_No accounts registered under your profile yet._`;
      } else {
        accounts.forEach((a, i) => {
          text += `*Account #${i + 1}*\n`;
          text += `📱 Number: \`+${a.phone}\`\n`;
          text += `👤 Name: *${a.name || 'WhatsApp'}*\n`;
          text += `⚡ Status: ${a.isOnline ? '🟢 Online' : '🔴 Offline'}\n`;
          text += `⭐ Default: ${a.isDefault ? 'Yes' : 'No'}\n`;
          text += `📅 Added: ${a.addedAt ? new Date(a.addedAt).toLocaleDateString() : 'N/A'}\n\n`;
        });
      }

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.accountsMenu()
      });
    }

    // Remove Account Menu
    if (data === 'acc_remove_menu') {
      await bot.answerCallbackQuery(query.id);
      const accounts = getAccountsStore(fromId).getAll();
      if (accounts.length === 0) {
        await bot.sendMessage(chatId, 'No accounts to remove under your profile.', {
          reply_markup: Keyboards.accountsMenu()
        });
        return;
      }

      await bot.sendMessage(chatId, 'Select the WhatsApp account you want to remove:', {
        reply_markup: Keyboards.accountSelection(accounts, 'acc_del:')
      });
    }

    // Handle Account Deletion
    if (data.startsWith('acc_del:')) {
      const phone = data.replace('acc_del:', '');
      await bot.answerCallbackQuery(query.id, { text: `Removing +${phone}...` });

      await waManager.deleteAccount(phone, fromId);

      await bot.sendMessage(chatId, `🗑️ *Account +${phone} removed successfully!*`, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.accountsMenu()
      });
    }
  });

  /**
   * Handle text input when user is in AWAITING_ACCOUNT_PHONE state
   */
  async function handlePhoneInput(msg) {
    const chatId = msg.chat.id;
    const fromId = String(msg.from?.id || chatId);
    const state = wizardState.get(chatId);
    if (!state || state.state !== 'AWAITING_ACCOUNT_PHONE') return false;

    const rawPhone = msg.text ? msg.text.trim() : '';
    const phone = cleanPhone(rawPhone);

    if (!phone || phone.length < 10) {
      await bot.sendMessage(chatId, '⚠️ *Invalid phone number!* Please enter digits with country code (e.g., `919876543210`).', {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.cancelAction('menu_accounts')
      });
      return true;
    }

    wizardState.clear(chatId);

    const statusMsg = await bot.sendMessage(chatId, `⏳ *Connecting to WhatsApp for +${phone}...*\nGenerating 8-digit Pairing Code, please wait 3-5 seconds...`, {
      parse_mode: 'Markdown'
    });

    try {
      await waManager.connectAccount(phone, {
        adminId: fromId,
        requestPairing: true,
        onPairingCode: async (code) => {
          const codeText =
            `🔑 *WhatsApp Pairing Code for +${phone}:*\n\n` +
            `👉 \`${code}\` 👈\n\n` +
            `*(Tap code to copy)*\n\n` +
            `📲 *Steps to link on your phone:*\n` +
            `1. Open *WhatsApp* on your phone\n` +
            `2. Tap *⋮ (Menu)* or *Settings* ⚙️\n` +
            `3. Tap *Linked Devices*\n` +
            `4. Tap *Link a Device*\n` +
            `5. Tap *"Link with phone number instead"* at bottom\n` +
            `6. Enter the 8-digit code shown above!\n\n` +
            `⏳ _Code expires in 2 minutes. Waiting for connection..._`;

          await bot.editMessageText(codeText, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
          }).catch(async () => {
            await bot.sendMessage(chatId, codeText, { parse_mode: 'Markdown' });
          });
        },
        onConnected: async (acc) => {
          await bot.sendMessage(chatId, `🎉 *WhatsApp Account +${acc.phone} linked successfully!*\n\nYou can now use it for Auto-Reply and Broadcasts.`, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.accountsMenu()
          });
        },
        onError: async (err) => {
          await bot.sendMessage(chatId, `❌ *Pairing Error:* ${err.message}\nPlease try again.`, {
            parse_mode: 'Markdown',
            reply_markup: Keyboards.accountsMenu()
          });
        }
      });
    } catch (err) {
      await bot.sendMessage(chatId, `❌ *Failed to start pairing:* ${err.message}`, {
        reply_markup: Keyboards.accountsMenu()
      });
    }

    return true;
  }

  return { handlePhoneInput };
};
