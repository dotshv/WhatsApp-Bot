#!/bin/bash
# ==========================================
# 24/7 Auto-Setup & Launcher Script for VPS
# ==========================================

echo "🚀 Updating system and installing dependencies..."
sudo apt update && sudo apt install -y curl git ufw

# Install Node.js 20 if not installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Install PM2 globally
echo "📦 Installing PM2 globally..."
sudo npm install -g pm2

# Install project dependencies
echo "📦 Installing npm dependencies..."
npm install --omit=dev

# Open port 3000 for Web Dashboard
sudo ufw allow 3000/tcp > /dev/null 2>&1
sudo ufw allow 22/tcp > /dev/null 2>&1

# Stop any previous instance
pm2 delete whatsapp-bot > /dev/null 2>&1 || true

# Start 24/7 with PM2
echo "🚀 Starting WhatsApp Bot 24/7..."
pm2 start src/index.js --name "whatsapp-bot" --time

# Save state so it auto-starts on VPS reboot
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

echo ""
echo "========================================================"
echo "✅ BOT 24/7 RUNNING IN BACKGROUND!"
echo "👉 Status check : pm2 status"
echo "👉 Live logs    : pm2 logs whatsapp-bot"
echo "👉 Web Panel    : http://$(curl -s ifconfig.me):3000"
echo "========================================================"

