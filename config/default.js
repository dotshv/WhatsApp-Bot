const path = require('path');

module.exports = {
  // Localhost Web Server Port
  port: parseInt(process.env.PORT, 10) || 3000,

  // Telegram Bot Token (can also be provided via .env TELEGRAM_BOT_TOKEN)
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',

  // Telegram Admin ID (numeric ID of admin user, or comma-separated IDs)
  // If set, only this Telegram user can control the bot
  adminIds: (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean),

  // Storage paths
  paths: {
    sessionsDir: path.join(__dirname, '..', 'storage', 'sessions'),
    mediaDir: path.join(__dirname, '..', 'storage', 'media'),
    dataDir: path.join(__dirname, '..', 'data'),
    accountsFile: path.join(__dirname, '..', 'data', 'accounts.json'),
    autoreplyFile: path.join(__dirname, '..', 'data', 'autoreply.json'),
    contactsFile: path.join(__dirname, '..', 'data', 'contacts.json'),
    templatesFile: path.join(__dirname, '..', 'data', 'templates.json'),
    settingsFile: path.join(__dirname, '..', 'data', 'settings.json')
  },

  // Defaults for Broadcast
  broadcast: {
    defaultDelayMs: 2500, // Safe delay between messages to avoid bans
    batchSize: 20
  },

  // Defaults for Auto-Reply
  autoreply: {
    defaultStepDelayMs: 1500, // Delay between consecutive messages in a sequence
    defaultTriggerMode: 'first_time', // 'first_time' or 'always'
    replyWindowHours: 24 // Don't re-trigger for same user within 24h in 'first_time' mode
  }
};

