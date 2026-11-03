require('dotenv').config();
const waManager = require('./whatsapp/manager');
const initTelegramBot = require('./bot');
const initWebServer = require('./server');

async function main() {
  console.log('========================================================');
  console.log('🤖 WhatsApp + Telegram Bot + Localhost Web Dashboard');
  console.log('   - Multi-Account WhatsApp (Pairing Code Linking)');
  console.log('   - Line-by-Line Multi-Media Auto-Reply (APK, Video, Photo, Text)');
  console.log('   - Broadcast Center (Template, Single User, All Contacts)');
  console.log('   - Localhost Web Panel at: http://localhost:' + (process.env.PORT || 3000));
  console.log('========================================================\n');

  // Check if .env has Telegram Token
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    console.warn('⚠️ WARNING: TELEGRAM_BOT_TOKEN is not configured in .env file!');
    console.warn('👉 Please set TELEGRAM_BOT_TOKEN in .env and restart.\n');
  }

  // 1. Initialize Telegram Bot
  console.log('[System] Initializing Telegram Bot...');
  initTelegramBot(waManager);

  // 2. Initialize Localhost Web Server (http://localhost:3000)
  console.log('[System] Initializing Localhost Web Server...');
  initWebServer(waManager);

  // 3. Initialize saved WhatsApp accounts
  console.log('[System] Initializing WhatsApp Accounts...');
  try {
    await waManager.initAllAccounts();
  } catch (err) {
    console.error('[System] Error initializing WhatsApp accounts:', err.message);
  }

  const port = process.env.PORT || 3000;
  console.log('\n🚀 ALL SYSTEMS ONLINE AND RUNNING!');
  console.log(`🌐 Localhost Dashboard : http://localhost:${port}`);
  console.log('📱 Telegram Bot         : Send /start to your bot\n');

  // Graceful shutdown
  const handleExit = async (signal) => {
    console.log(`\n[System] Received ${signal}. Shutting down gracefully...`);
    for (const [phone, sock] of waManager.sockets.entries()) {
      try {
        console.log(`[System] Closing socket for +${phone}...`);
        sock.end(undefined);
      } catch (_) {}
    }
    process.exit(0);
  };

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));
}

main().catch(err => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
