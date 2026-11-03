const { getAutoReplyStore } = require('../../utils/storage');
const { downloadTelegramFile, extractMediaFromTelegramMsg } = require('../../utils/downloader');
const Keyboards = require('../keyboards');
const wizardState = require('../wizardState');

module.exports = function registerAutoReplyHandler(bot) {
  // Main Auto-Reply Dashboard
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const fromId = String(query.from?.id || chatId);
    const data = query.data;

    const autoReplyStore = getAutoReplyStore(fromId);

    // View Auto-Reply Main Menu
    if (data === 'menu_autoreply') {
      await bot.answerCallbackQuery(query.id);
      const config = autoReplyStore.get();
      const slots = config.slots || {};
      const statusIcon = config.enabled ? '🟢 Active' : '🔴 Disabled';
      const modeText = config.triggerMode === 'always' ? 'Every Message' : 'First-time / New User';
      const delaySec = (config.delayBetweenMessagesMs || 1500) / 1000;

      const formatSlotLine = (num) => {
        const s = slots[`step${num}`];
        if (!s) return `⚪ *Step ${num}:* _Not Set (Skipped)_`;
        let icon = '📝';
        if (s.type === 'image' || s.type === 'photo') icon = '🖼️ Photo';
        if (s.type === 'video') icon = '🎥 Video';
        if (s.type === 'apk') icon = '📱 APK';
        if (s.type === 'document') icon = '📦 Doc';
        if (s.type === 'audio') icon = '🎙️ Voice';
        const preview = (s.caption || s.content || s.fileName || '').substring(0, 30);
        return `✅ *Step ${num}:* ${icon} - "${preview}..."`;
      };

      const text =
        `🤖 *My Auto-Reply Control (Steps 1, 2, 3, 4)*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ Status: *${statusIcon}*\n` +
        `🎛️ Trigger: *${modeText}* | ⏱️ Delay: *${delaySec}s*\n\n` +
        `*Slots Status:*\n` +
        `1️⃣ ${formatSlotLine(1)}\n` +
        `2️⃣ ${formatSlotLine(2)}\n` +
        `3️⃣ ${formatSlotLine(3)}\n` +
        `4️⃣ ${formatSlotLine(4)}\n\n` +
        `💡 _Agar koi step set nahi hai to koi baat nahi, jo set hai wahi line-by-line send hoga!_\n\n` +
        `Niche diye gaye button se kisi bhi Step ko set ya edit karein:`;

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: Keyboards.autoReplyMenu(config.enabled, slots)
      }).catch(async () => {
        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.autoReplyMenu(config.enabled, slots)
        });
      });
    }

    // Click on individual slot (Step 1, Step 2, Step 3, Step 4)
    if (data.startsWith('ar_slot:')) {
      const slotNum = parseInt(data.replace('ar_slot:', ''), 10);
      await bot.answerCallbackQuery(query.id);
      const slot = autoReplyStore.getSlot(slotNum);

      let text = `📌 *Step ${slotNum} Details*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      if (!slot) {
        text += `⚡ Status: ⚪ *Not Set / Empty*\n\n` +
          `_Ye step abhi set nahi hai, isliye auto-reply me ye skip ho jayega._\n\n` +
          `Ise set karne ke liye niche *Set Step ${slotNum}* par tap karein.`;
      } else {
        let typeEmoji = '📝';
        if (slot.type === 'image' || slot.type === 'photo') typeEmoji = '🖼️ Photo';
        if (slot.type === 'video') typeEmoji = '🎥 Video';
        if (slot.type === 'apk') typeEmoji = '📱 APK';
        if (slot.type === 'document') typeEmoji = '📦 Document';
        if (slot.type === 'audio') typeEmoji = '🎙️ Voice';

        text += `⚡ Status: ✅ *Configured*\n` +
          `📦 Type: *${typeEmoji}*\n`;
        if (slot.fileName) text += `📁 File: \`${slot.fileName}\`\n`;
        if (slot.content) text += `💬 Text: "${slot.content}"\n`;
        if (slot.caption) text += `💬 Caption: "${slot.caption}"\n`;
        text += `\n_Incoming WhatsApp users ko ye Step ${slotNum} ke roop me deliver hoga._`;
      }

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: Keyboards.stepSlotMenu(slotNum, Boolean(slot))
      }).catch(() => {});
    }

    // Initiate Set / Update Step X
    if (data.startsWith('ar_set_slot:')) {
      const slotNum = parseInt(data.replace('ar_set_slot:', ''), 10);
      await bot.answerCallbackQuery(query.id);
      wizardState.set(chatId, 'AWAITING_AUTOREPLY_SLOT', { slotNumber: slotNum, adminId: fromId });

      const text =
        `✏️ *Set / Update Step ${slotNum}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Send whatever you want to set for *Step ${slotNum}*:\n\n` +
        `• 📝 *Text:* Type and send your text message\n` +
        `• 🖼️ *Photo:* Send any photo (with optional caption)\n` +
        `• 🎥 *Video:* Send any video (with optional caption)\n` +
        `• 📱 *APK / Document:* Send any .apk or document (with optional caption)\n` +
        `• 🎙️ *Audio / Voice:* Send voice note or mp3\n\n` +
        `Type /cancel to abort.`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.cancelAction('menu_autoreply')
      });
    }

    // Clear individual slot
    if (data.startsWith('ar_clear_slot:')) {
      const slotNum = parseInt(data.replace('ar_clear_slot:', ''), 10);
      autoReplyStore.clearSlot(slotNum);
      await bot.answerCallbackQuery(query.id, { text: `Step ${slotNum} cleared!` });

      const config = autoReplyStore.get();
      await bot.sendMessage(chatId, `🗑️ *Step ${slotNum} has been cleared!* (Now skipped in flow)`, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.autoReplyMenu(config.enabled, config.slots)
      });
    }

    // View Active Steps Detail
    if (data === 'ar_view') {
      await bot.answerCallbackQuery(query.id);
      const activeSteps = autoReplyStore.getActiveSteps();
      const config = autoReplyStore.get();

      if (activeSteps.length === 0) {
        await bot.sendMessage(chatId, '📭 *Koi bhi Step set nahi hai!*\nStep 1, 2, 3 ya 4 me se kisi ko set karein.', {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.autoReplyMenu(config.enabled, config.slots)
        });
        return;
      }

      let text = `🤖 *Active Auto-Reply Sequence (${activeSteps.length} of 4 Set)*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      activeSteps.forEach((s, idx) => {
        let typeEmoji = '📝';
        if (s.type === 'image' || s.type === 'photo') typeEmoji = '🖼️ PHOTO';
        if (s.type === 'video') typeEmoji = '🎥 VIDEO';
        if (s.type === 'apk') typeEmoji = '📱 APK';
        if (s.type === 'document') typeEmoji = '📦 DOC';
        if (s.type === 'audio') typeEmoji = '🎙️ VOICE';

        text += `*Position ${idx + 1} [Step ${s.slotNumber} - ${typeEmoji}]*\n`;
        if (s.content) text += `Text: "${s.content.substring(0, 80)}${s.content.length > 80 ? '...' : ''}"\n`;
        if (s.fileName) text += `File: \`${s.fileName}\`\n`;
        if (s.caption) text += `Caption: "${s.caption.substring(0, 80)}${s.caption.length > 80 ? '...' : ''}"\n`;
        text += `\n`;
      });

      text += `⏱️ _Delay between each message: ${(config.delayBetweenMessagesMs || 1500) / 1000}s_\n` +
        `💡 _Unset steps automatically skip ho jayenge._`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.autoReplyMenu(config.enabled, config.slots)
      });
    }

    // Toggle Auto-Reply ON / OFF
    if (data === 'ar_toggle') {
      const newState = autoReplyStore.toggle();
      await bot.answerCallbackQuery(query.id, {
        text: newState ? 'Auto-Reply Enabled!' : 'Auto-Reply Disabled!'
      });

      const config = autoReplyStore.get();
      await bot.editMessageReplyMarkup(Keyboards.autoReplyMenu(config.enabled, config.slots), {
        chat_id: chatId,
        message_id: query.message.message_id
      }).catch(() => {});
    }

    // Clear All Slots
    if (data === 'ar_clear') {
      await bot.answerCallbackQuery(query.id);
      autoReplyStore.clearAllSlots();
      const config = autoReplyStore.get();
      await bot.sendMessage(chatId, '🗑️ *All steps (1, 2, 3, 4) have been cleared!*', {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.autoReplyMenu(config.enabled, config.slots)
      });
    }

    // Change step delay menu
    if (data === 'ar_delay_menu') {
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, 'Select the delay between sequential messages (seconds):', {
        reply_markup: Keyboards.delaySelection('ar')
      });
    }

    // Change trigger mode menu
    if (data === 'ar_mode_menu') {
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, 'Select when Auto-Reply should trigger:', {
        reply_markup: Keyboards.triggerModeSelection()
      });
    }

    // Set trigger mode value
    if (data.startsWith('set_mode:')) {
      const mode = data.replace('set_mode:', '');
      autoReplyStore.save({ triggerMode: mode });
      await bot.answerCallbackQuery(query.id, { text: `Mode updated to: ${mode}` });

      const config = autoReplyStore.get();
      await bot.sendMessage(chatId, `✅ *Trigger mode updated to:* ${mode === 'always' ? 'Every Message' : 'First-time / New Message'}`, {
        parse_mode: 'Markdown',
        reply_markup: Keyboards.autoReplyMenu(config.enabled, config.slots)
      });
    }
  });

  /**
   * Process incoming messages when user is setting a slot
   */
  async function handleAutoReplyInput(msg) {
    const chatId = msg.chat.id;
    const fromId = String(msg.from?.id || chatId);
    const state = wizardState.get(chatId);
    if (!state || (state.state !== 'AWAITING_AUTOREPLY_SLOT' && state.state !== 'AWAITING_AUTOREPLY_STEP')) return false;

    const slotNumber = state.data.slotNumber || 1;
    const adminId = state.data.adminId || fromId;
    const autoReplyStore = getAutoReplyStore(adminId);
    const media = extractMediaFromTelegramMsg(msg);

    if (media) {
      const waitMsg = await bot.sendMessage(chatId, `⏳ *Downloading ${media.type.toUpperCase()} for Step ${slotNumber}...*`, {
        parse_mode: 'Markdown'
      });

      try {
        const fileResult = await downloadTelegramFile(bot, media.fileId, media.fileName);

        autoReplyStore.setSlot(slotNumber, {
          type: media.type,
          filePath: fileResult.filePath,
          fileName: fileResult.fileName,
          mimetype: fileResult.mimetype,
          caption: media.caption || '',
          fileSize: fileResult.size
        });

        wizardState.clear(chatId);
        const config = autoReplyStore.get();

        await bot.editMessageText(
          `✅ *Step ${slotNumber} Set Successfully!* (${media.type.toUpperCase()})\n\n` +
          `📁 File: \`${fileResult.fileName}\`\n` +
          (media.caption ? `💬 Caption: "${media.caption}"\n` : '') +
          `\n💡 _Agar koi doosra step empty hai to tension nahi, sirf configured steps hi WhatsApp user ko jayenge!_`,
          {
            chat_id: chatId,
            message_id: waitMsg.message_id,
            parse_mode: 'Markdown',
            reply_markup: Keyboards.autoReplyMenu(config.enabled, config.slots)
          }
        );
      } catch (err) {
        await bot.sendMessage(chatId, `❌ *Failed to save media:* ${err.message}`, {
          reply_markup: Keyboards.autoReplyMenu(true, autoReplyStore.get().slots)
        });
      }
      return true;
    }

    // Plain text step
    if (msg.text) {
      const textContent = msg.text.trim();
      if (!textContent) return true;

      autoReplyStore.setSlot(slotNumber, {
        type: 'text',
        content: textContent
      });

      wizardState.clear(chatId);
      const config = autoReplyStore.get();

      await bot.sendMessage(
        chatId,
        `✅ *Step ${slotNumber} Set Successfully!* (TEXT)\n\n` +
        `"${textContent}"\n\n` +
        `💡 _Agar baaki steps set nahi hain to wo skip ho jayenge aur sirf set kiye hue steps deliver honge!_`,
        {
          parse_mode: 'Markdown',
          reply_markup: Keyboards.autoReplyMenu(config.enabled, config.slots)
        }
      );
      return true;
    }

    return false;
  }

  return { handleAutoReplyInput };
};
