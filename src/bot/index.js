const TelegramBot = require('node-telegram-bot-api');
const config = require('../../config/default');
const {
  AdminsStore,
  getAutoReplyStore,
  getContactsStore,
  getSettingsStore
} = require('../utils/storage');
const Keyboards = require('./keyboards');
const wizardState = require('./wizardState');

const registerAccountsHandler = require('./handlers/accountsHandler');
const registerAutoReplyHandler = require('./handlers/autoreplyHandler');
const registerBroadcastHandler = require('./handlers/broadcastHandler');
const registerContactsHandler = require('./handlers/contactsHandler');
const registerAdminsHandler = require('./handlers/adminsHandler');

function initTelegramBot(waManager) {
  const token = process.env.TELEGRAM_BOT_TOKEN || config.telegramBotToken;
  if (!token || token.includes('YOUR_TELEGRAM_BOT_TOKEN')) {
    console.error('❌ ERROR: TELEGRAM_BOT_TOKEN is not set in .env or config.');
    console.log('👉 Please set TELEGRAM_BOT_TOKEN in .env and restart.');
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });

  // Handle polling errors gracefully without crashing
  bot.on('polling_error', (error) => {
    // Suppress transient network aborts
    if (error.code !== 'EFATAL') {
      console.error('[Telegram Polling Warning]:', error.code, error.message);
    }
  });

  // Security middleware: check admin access in AdminsStore
  const isAuthorized = (msgOrQuery) => {
    const fromId = String(msgOrQuery.from?.id || msgOrQuery.chat?.id || '');
    return AdminsStore.isAuthorized(fromId);
  };

  // Helper to render Main Dashboard text per admin
  const getMainDashboardText = (adminId) => {
    const adminObj = AdminsStore.get(adminId) || { name: 'Admin', role: 'admin' };
    const accounts = waManager.listAccounts(adminId);
    const connectedCount = waManager.getConnectedCount(adminId);
    const arStore = getAutoReplyStore(adminId);
    const arConfig = arStore.get();
    const activeCount = arStore.getActiveSteps().length;
    const contactsStore = getContactsStore(adminId);
    const contacts = contactsStore.getList();
    const settingsStore = getSettingsStore(adminId);
    const settings = settingsStore.get();

    const roleBadge = adminObj.role === 'superadmin' ? '⭐ Super Admin' : '👤 Admin';

    return (
      `🤖 *WhatsApp & Telegram Bot Controller*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Profile:* ${adminObj.name || 'Admin'} [${roleBadge}]\n` +
      `📱 *My WhatsApp Accounts:* ${connectedCount}/${accounts.length} Online\n` +
      `🔄 *My Auto-Reply:* ${arConfig.enabled ? '✅ Active' : '❌ Disabled'} (${activeCount}/4 Steps Active)\n` +
      `👥 *My Captured Leads:* ${contacts.length}\n` +
      `⏱️ *Anti-Ban Delay:* ${(settings.broadcastDelayMs || 2500) / 1000}s\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔒 _Your WhatsApp accounts, auto-replies, and leads are 100% private to your profile._\n\n` +
      `👇 *Select an option below to manage:*`
    );
  };

  // Register feature handlers
  const accountsHandler = registerAccountsHandler(bot, waManager);
  const autoReplyHandler = registerAutoReplyHandler(bot);
  const broadcastHandler = registerBroadcastHandler(bot, waManager);
  const adminsHandler = registerAdminsHandler(bot);
  registerContactsHandler(bot);

  // Link WhatsApp notification callback to notify the specific owner admin
  waManager.setNotificationHandler((event, data, targetAdminId) => {
    const recipientIds = targetAdminId ? [String(targetAdminId)] : AdminsStore.getAll().map(a => a.id);

    recipientIds.forEach((adminId) => {
      if (event === 'WA_CONNECTED') {
        bot.sendMessage(
          adminId,
          `🟢 *WhatsApp Account Connected!*\nPhone: \`+${data.phone}\`\nName: *${data.name}*`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      } else if (event === 'WA_LOGGED_OUT') {
        bot.sendMessage(
          adminId,
          `⚠️ *WhatsApp Account Logged Out!*\nPhone: \`+${data.phone}\`\nPlease re-link using pairing code.`,
          { parse_mode: 'Markdown', reply_markup: Keyboards.accountsMenu() }
        ).catch(() => {});
      }
    });
  });

  // /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const fromId = String(msg.from?.id || chatId);

    if (!isAuthorized(msg)) {
      return bot.sendMessage(
        chatId,
        `⛔ *Access Denied!*\nYour Telegram User ID is: \`${fromId}\`\nAsk an authorized admin to add your ID to the bot!`,
        { parse_mode: 'Markdown' }
      );
    }

    wizardState.clear(chatId);
    const isSuper = AdminsStore.isSuperAdmin(fromId);
    await bot.sendMessage(chatId, getMainDashboardText(fromId), {
      parse_mode: 'Markdown',
      reply_markup: Keyboards.mainMenu(isSuper)
    });
  });

  // /myid command
  bot.onText(/\/myid/, async (msg) => {
    const fromId = String(msg.from?.id || msg.chat.id);
    const isSuper = AdminsStore.isSuperAdmin(fromId);
    const isAuth = AdminsStore.isAuthorized(fromId);

    await bot.sendMessage(
      msg.chat.id,
      `🆔 *Your Telegram User ID:* \`${fromId}\`\n` +
      `👤 Username: @${msg.from.username || 'None'}\n` +
      `🔑 Status: ${isSuper ? '⭐ Super Admin' : (isAuth ? '✅ Authorized Admin' : '❌ Unauthorized')}`,
      { parse_mode: 'Markdown' }
    );
  });

  // /cancel command
  bot.onText(/\/cancel/, async (msg) => {
    const chatId = msg.chat.id;
    const fromId = String(msg.from?.id || chatId);
    wizardState.clear(chatId);
    const isSuper = AdminsStore.isSuperAdmin(fromId);
    await bot.sendMessage(chatId, '❌ *Current action cancelled.* Returning to menu.', {
      parse_mode: 'Markdown',
      reply_markup: Keyboards.mainMenu(isSuper)
    });
  });

  // /help command
  bot.onText(/\/help/, async (msg) => {
    const helpText =
      `📖 *Multi-Admin WhatsApp Suite Guide*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `*1. Independent Admin Profiles:*\n` +
      `• Har admin ka WhatsApp accounts, Auto-Reply, aur Leads **100% alag aur private** rehta hai.\n\n` +
      `*2. Link WhatsApp Accounts:*\n` +
      `• Tap *WhatsApp Accounts* > *Link New Account*\n` +
      `• Enter phone number (e.g. \`919876543210\`)\n` +
      `• Enter 8-digit Pairing Code in WhatsApp > Linked Devices\n\n` +
      `*3. Step 1, 2, 3, 4 Auto-Reply:*\n` +
      `• Set Text, Photo, Video, ya APK in any step slot.\n` +
      `• Unset steps automatically skip ho jate hain!\n\n` +
      `*4. Adding Other Admins:*\n` +
      `• Super Admin *Admin Management* button dabakar naye admins add ya remove kar sakte hain.\n\n` +
      `*Commands:*\n` +
      `/start - Open Personal Control Panel\n` +
      `/myid - Get your numeric Telegram ID\n` +
      `/cancel - Abort ongoing action`;

    const fromId = String(msg.from?.id || msg.chat.id);
    const isSuper = AdminsStore.isSuperAdmin(fromId);
    await bot.sendMessage(msg.chat.id, helpText, {
      parse_mode: 'Markdown',
      reply_markup: Keyboards.mainMenu(isSuper)
    });
  });

  // Global Callback Query Router
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const fromId = String(query.from?.id || chatId);
    const data = query.data;

    if (!isAuthorized(query)) {
      await bot.answerCallbackQuery(query.id, { text: 'Unauthorized Access', show_alert: true });
      return;
    }

    const isSuper = AdminsStore.isSuperAdmin(fromId);

    // Navigation: Back to Main Menu
    if (data === 'nav_main') {
      await bot.answerCallbackQuery(query.id);
      wizardState.clear(chatId);
      await bot.editMessageText(getMainDashboardText(fromId), {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: Keyboards.mainMenu(isSuper)
      }).catch(async () => {
        await bot.sendMessage(chatId, getMainDashboardText(fromId), {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.mainMenu(isSuper)
        });
      });
    }

    // Settings Menu
    if (data === 'menu_settings') {
      await bot.answerCallbackQuery(query.id);
      const settings = getSettingsStore(fromId).get();
      const accounts = waManager.listAccounts(fromId);

      let text =
        `⚙️ *My Settings & Delays*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏱️ *Broadcast Delay:* ${(settings.broadcastDelayMs || 2500) / 1000} seconds\n` +
        `🛡️ *Anti-Ban Protection:* Active\n` +
        `📱 *Default Sender Account:* ${accounts.find(a => a.isDefault)?.phone ? '+' + accounts.find(a => a.isDefault).phone : 'Auto'}\n\n` +
        `Use Broadcast or Auto-Reply menus to adjust delays.`;

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: Keyboards.mainMenu(isSuper)
      }).catch(() => {});
    }

    // Help Menu
    if (data === 'menu_help') {
      await bot.answerCallbackQuery(query.id);
      const helpText =
        `❓ *Help & Quick Navigation*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Link WhatsApp:* 8-digit Pairing Code\n` +
        `• *Auto-Reply:* Slots 1, 2, 3, 4 (unconfigured steps skip honge)\n` +
        `• *Broadcast:* Template ({name}, {car}), Single, All\n` +
        `• *Admins:* Super admin can add other admin IDs\n` +
        `• *Cancel:* Send /cancel anytime`;

      await bot.editMessageText(helpText, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: Keyboards.mainMenu(isSuper)
      }).catch(() => {});
    }

    // Cancel Action
    if (data.startsWith('cancel_action:')) {
      const backTo = data.replace('cancel_action:', '');
      wizardState.clear(chatId);
      await bot.answerCallbackQuery(query.id, { text: 'Cancelled' });

      if (backTo === 'menu_accounts') {
        await bot.sendMessage(chatId, 'Action cancelled.', { reply_markup: Keyboards.accountsMenu() });
      } else if (backTo === 'menu_autoreply') {
        const ar = getAutoReplyStore(fromId).get();
        await bot.sendMessage(chatId, 'Action cancelled.', { reply_markup: Keyboards.autoReplyMenu(ar.enabled, ar.slots) });
      } else if (backTo === 'menu_broadcast' || backTo === 'bc_template_menu') {
        await bot.sendMessage(chatId, 'Action cancelled.', { reply_markup: Keyboards.broadcastMenu() });
      } else if (backTo === 'menu_admins') {
        await bot.sendMessage(chatId, 'Action cancelled.', { reply_markup: Keyboards.adminsMenu() });
      } else {
        await bot.sendMessage(chatId, 'Action cancelled.', { reply_markup: Keyboards.mainMenu(isSuper) });
      }
    }
  });

  // Global Message Router
  bot.on('message', async (msg) => {
    // Skip commands (handled by bot.onText)
    if (msg.text && msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    if (!isAuthorized(msg)) return;

    const state = wizardState.get(chatId);
    if (!state) return;

    // Route to appropriate handler based on state
    if (state.state === 'AWAITING_ACCOUNT_PHONE') {
      await accountsHandler.handlePhoneInput(msg);
      return;
    }

    if (state.state === 'AWAITING_AUTOREPLY_STEP' || state.state === 'AWAITING_AUTOREPLY_SLOT') {
      await autoReplyHandler.handleAutoReplyInput(msg);
      return;
    }

    if (
      state.state === 'AWAITING_BROADCAST_ALL_CONTENT' ||
      state.state === 'AWAITING_SINGLE_PHONE' ||
      state.state === 'AWAITING_SINGLE_CONTENT' ||
      state.state === 'AWAITING_NEW_TEMPLATE' ||
      state.state === 'AWAITING_TEMPLATE_DATA'
    ) {
      await broadcastHandler.handleBroadcastInput(msg);
      return;
    }

    if (state.state === 'AWAITING_NEW_ADMIN_ID') {
      await adminsHandler.handleAdminInput(msg);
      return;
    }
  });

  return bot;
}

module.exports = initTelegramBot;
