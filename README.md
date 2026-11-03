# 🤖 WhatsApp & Telegram Bot Suite

Ek powerful system jo aapke WhatsApp accounts ko Telegram Bot ke through manage karta hai. Isme WhatsApp accounts ko **Link Code (Pairing Code)** se connect kar sakte hain, **Line-by-Line Auto-Reply** set kar sakte hain (Photo, Video, APK, Document, Voice, Text), aur **Custom Dynamic Broadcast** chala sakte hain (jaise har user ka alag Name, Order ID, etc.).

---

## 🌟 Main Features (Key Highlights)

### 1. 📱 Multi-Account WhatsApp Manager (Via Pairing Code)
- **Link via 8-Digit Pairing Code:** Phone number enter karne par 8-digit link code generate hota hai (e.g. `1234-5678`). QR scan karne ki zaroorat nahi!
- **Multi-Account Support:** Multiple WhatsApp accounts add kar sakte hain.
- **Account Status & List:** Har account ka status (Online/Offline) check karein.
- **Remove / Disconnect:** Kisi bhi account ko ek click me remove ya logout karein.
- **Auto-Reconnect:** Internet disconnect hone par automatic reconnect.

### 2. 🤖 Line-by-Line Auto-Reply System (All Formats & APK Supported)
- **Step-by-Step Flow:** Admin Telegram bot se step 1, step 2, step 3... sequence set kar sakta hai.
- **Sabhi Formats Supported:**
  - 📝 Text message
  - 🖼️ Photo (with caption)
  - 🎥 Video (with caption)
  - 📱 **APK / Android App Installation File**
  - 📦 Document (PDF, ZIP, etc.)
  - 🎙️ Audio / Voice Notes
- **Line-by-Line Delays:** Messages ke beech me natural delay (e.g. 1.5s - 4s) taaki WhatsApp spam flag na kare.
- **Trigger Modes:**
  - `First-time / New User`: Naye user ko ya 24 ghante me ek baar bhejta hai.
  - `Every Message`: Har aane wale message par bhejta hai.

### 3. 📢 Advanced Broadcast Center
- **👥 Broadcast to All:** WhatsApp par message karne wale sabhi saved contacts ko ek sath broadcast.
- **🎯 Single User Direct Message:** Kisi ek specific number par seedha message/media send karein.
- **📑 Dynamic / Personalized Template Broadcast:**
  - Template set karein, jaise:
    ```text
    Namaste {name}! 🙏
    Thanks for your order.

    📦 Order ID: {order_id}
    💰 Total: {amount}
    🚚 Status: {status}
    ```
  - Data Telegram chat me paste karein ya `.csv` file upload karein:
    ```text
    phone,name,order_id,amount,status
    919876543210,Rahul,ORD-101,₹999,Shipped
    919812345678,Aman,ORD-102,₹1499,Processing
    ```
  - Har user ko unke data ke hisaab se customized message deliver hoga!
- **🛡️ Anti-Ban Safeguard:** Messages ke beech me configurable safe delay taaki WhatsApp number ban na ho.

### 4. 👥 Contacts & Leads Database
- Har incoming contact ka phone number, WhatsApp profile name, aur timestamps automatically save hote hain.
- **Export to CSV:** Ek click me `contacts.csv` download karein aur Excel me open karein.

---

## 🚀 Setup & Installation (Kadam-dar-Kadam Guide)

### Step 1: Telegram Bot Token Prapt Karein
1. Telegram open karein aur search karein **@BotFather**.
2. `/newbot` send karein aur apne bot ka naam aur username set karein.
3. BotFather aapko ek **API Token** dega (e.g. `7123456789:AAH...`).

### Step 2: `.env` File Configure Karein
Folder me `.env` file ko kisi bhi text editor (Notepad/VS Code) me kholein:
```env
TELEGRAM_BOT_TOKEN=Aapka_Bot_Token_Yahan_Dalein
ADMIN_IDS=
```
*(Tip: Agar aap chahte hain ki sirf aap hi bot use kar sakein, to apna Telegram User ID `ADMIN_IDS` me daal sakte hain. Apna Telegram ID janne ke liye bot me `/myid` send karein).*

### Step 3: Bot Start Karein
Terminal ya Command Prompt (CMD) me project folder me jakar run karein:
```bash
npm start
```
Aapko console me message dikhega:
```
🚀 System is now online and ready!
👉 Open your Telegram Bot and send /start to open the dashboard.
```

---

## 📖 Telegram Bot Buttons & Usage Guide

Telegram par apne bot ko khol kar `/start` bhejein. Aapke samne Main Menu open hoga:

```
🤖 WhatsApp & Telegram Bot Controller
━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 WhatsApp Accounts: 1/1 Connected
🔄 Auto-Reply: ✅ Active (3 steps)
👥 Contacts Captured: 50
━━━━━━━━━━━━━━━━━━━━━━━━━━
[ 📱 WhatsApp Accounts ]  [ 🤖 Auto-Reply Setup ]
[ 📢 Broadcast Center  ]  [ 👥 Contacts Database ]
[ ⚙️ Settings & Delays ]  [ ❓ Help & Guide     ]
```

### 1️⃣ WhatsApp Account Add Karna (Via Link Code):
1. **📱 WhatsApp Accounts** button par tap karein.
2. **➕ Link New Account (Pairing Code)** par tap karein.
3. Apna WhatsApp number country code ke sath bhejein (jaise: `919876543210`).
4. Bot aapko 8-digit ka Pairing Code dega: `ABCD-1234`.
5. Apne phone me WhatsApp open karein:
   - **Settings** > **Linked Devices** > **Link a Device**
   - Niche **"Link with phone number instead"** par click karein
   - Bot ka diya hua 8-digit code dalein.
6. WhatsApp connect hote hi Telegram bot par confirmation message aa jayega! 🎉

### 2️⃣ Auto-Reply (Line-by-Line) Set Karna:
1. **🤖 Auto-Reply Setup** par tap karein.
2. **➕ Add Step** par tap karein.
3. Telegram chat me:
   - Koi bhi **Text message** type karke bhejein, YA
   - **Photo** bhejein, YA
   - **Video** bhejein, YA
   - **APK file / Document** bhejein (caption ke sath ya bina caption ke).
4. Bot use download karke sequence me add kar lega!
5. Aap isi tarah Step 1 (Text), Step 2 (Photo), Step 3 (APK) add kar sakte hain.
6. **👁️ View Current Sequence** daba kar aap pura sequence dekh sakte hain.
7. WhatsApp par jab bhi koi user message karega, usko ye sabhi messages ek ke baad ek delay ke sath receive honge!

### 3️⃣ Broadcast Karna:
- **👥 Broadcast to All:** Sabhi purane contacts ko photo, video, APK ya text message ek sath broadcast karein.
- **🎯 Single User Direct Msg:** Kisi ek phone number par seedha message bhejein.
- **📑 Template / Personalized Broadcast (Customer Order Format):**
  1. **📝 Set / Edit Message Template** par tap karein aur format set karein:
     ```text
     Namaste {name}!
     Aapka Order ID {order_id} confirm ho chuka hai.
     Amount: {amount}
     ```
  2. **🚀 Start Personalized Broadcast** par tap karein.
  3. Data text me paste karein ya `.csv` file upload karein:
     ```text
     phone,name,order_id,amount
     919876543210,Rahul,ORD-101,₹499
     919812345678,Vikram,ORD-102,₹899
     ```
  4. Bot aapko Row #1 ka **Live Preview** dikhayega.
  5. **🚀 Confirm & Start Broadcast** par tap karte hi safe anti-ban delay ke sath sabhi ko custom data deliver ho jayega!

---

## 📁 Project Folder Structure

```
├── config/
│   └── default.js             # Configuration settings
├── data/                      # Persistent databases (JSON)
│   ├── accounts.json          # Registered WhatsApp accounts
│   ├── autoreply.json         # Auto-reply sequence & steps
│   ├── contacts.json          # Captured WhatsApp leads
│   └── templates.json         # Broadcast message templates
├── storage/
│   ├── sessions/              # WhatsApp Baileys multi-file auth credentials
│   └── media/                 # Downloaded media files (APK, photos, videos)
├── src/
│   ├── bot/                   # Telegram Bot UI & logic
│   │   ├── index.js           # Telegram bot main entry & event routing
│   │   ├── keyboards.js       # All interactive inline keyboards
│   │   ├── wizardState.js     # Admin conversational state machine
│   │   └── handlers/          # Feature handlers
│   │       ├── accountsHandler.js   # Pairing code & account management
│   │       ├── autoreplyHandler.js  # Multi-media sequential auto-reply
│   │       ├── broadcastHandler.js  # All, Single & Template Broadcasts
│   │       └── contactsHandler.js   # Stats & CSV export
│   ├── whatsapp/              # WhatsApp engine (@whiskeysockets/baileys)
│   │   ├── manager.js         # Multi-account lifecycle & connection
│   │   ├── sender.js          # Unified message & APK/media sender
│   │   └── listener.js        # Incoming messages & auto-reply trigger
│   ├── utils/
│   │   ├── downloader.js      # Telegram media downloader
│   │   ├── formatter.js       # Phone & template dynamic placeholder engine
│   │   └── storage.js         # Safe JSON read/write helpers
│   └── index.js               # Application launcher
├── .env                       # Environment variables (Bot Token, Admin IDs)
├── package.json
└── README.md
```

---

## 🛡️ Anti-Ban & Safety Tips
- WhatsApp naye numbers par mass broadcast detect na kare, isliye system me default safe delay (2.5 - 4 seconds) rakha gaya hai.
- Aap **Broadcast Safe Delay** button se delay badha bhi sakte hain.
- Pehle din 20-50 messages se shuru karein aur dheere-dheere volume badhayein.

