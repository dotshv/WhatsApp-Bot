/**
 * Telegram Bot Keyboard Layouts
 */

const Keyboards = {
  // Main Dashboard Menu
  mainMenu(isSuperAdmin = true) {
    const rows = [
      [
        { text: '📱 WhatsApp Accounts', callback_data: 'menu_accounts' },
        { text: '🤖 Auto-Reply Setup', callback_data: 'menu_autoreply' }
      ],
      [
        { text: '📢 Broadcast Center', callback_data: 'menu_broadcast' },
        { text: '👥 Contacts Database', callback_data: 'menu_contacts' }
      ],
      [
        { text: '⚙️ Settings & Delays', callback_data: 'menu_settings' },
        { text: '❓ Help & Guide', callback_data: 'menu_help' }
      ]
    ];

    if (isSuperAdmin) {
      rows.push([
        { text: '👑 Admin Management', callback_data: 'menu_admins' }
      ]);
    }

    return { inline_keyboard: rows };
  },

  // Admin Management Submenu
  adminsMenu() {
    return {
      inline_keyboard: [
        [
          { text: '➕ Add New Admin ID', callback_data: 'adm_add' },
          { text: '📋 View All Admins', callback_data: 'adm_list' }
        ],
        [
          { text: '🗑️ Remove Admin ID', callback_data: 'adm_remove_menu' }
        ],
        [
          { text: '🔙 Back to Main Menu', callback_data: 'nav_main' }
        ]
      ]
    };
  },

  // Admin list for removal
  adminSelection(admins) {
    const buttons = admins
      .filter(a => a.role !== 'superadmin')
      .map(a => [
        { text: `❌ ${a.name || 'Admin'} (${a.id})`, callback_data: `adm_del:${a.id}` }
      ]);
    buttons.push([{ text: '🔙 Back to Admins', callback_data: 'menu_admins' }]);
    return { inline_keyboard: buttons };
  },

  // WhatsApp Accounts Submenu
  accountsMenu() {
    return {
      inline_keyboard: [
        [
          { text: '➕ Link New Account (Pairing Code)', callback_data: 'acc_add' }
        ],
        [
          { text: '📋 View Connected Accounts', callback_data: 'acc_list' },
          { text: '🗑️ Remove Account', callback_data: 'acc_remove_menu' }
        ],
        [
          { text: '🔙 Back to Main Menu', callback_data: 'nav_main' }
        ]
      ]
    };
  },

  // Auto-Reply Submenu (Slots: Step 1, Step 2, Step 3, Step 4)
  autoReplyMenu(isEnabled = true, slots = {}) {
    const s1Icon = slots.step1 ? '✅' : '⚪';
    const s2Icon = slots.step2 ? '✅' : '⚪';
    const s3Icon = slots.step3 ? '✅' : '⚪';
    const s4Icon = slots.step4 ? '✅' : '⚪';

    return {
      inline_keyboard: [
        [
          { text: `${s1Icon} 1️⃣ Step 1`, callback_data: 'ar_slot:1' },
          { text: `${s2Icon} 2️⃣ Step 2`, callback_data: 'ar_slot:2' }
        ],
        [
          { text: `${s3Icon} 3️⃣ Step 3`, callback_data: 'ar_slot:3' },
          { text: `${s4Icon} 4️⃣ Step 4`, callback_data: 'ar_slot:4' }
        ],
        [
          { text: '👁️ View Active Steps', callback_data: 'ar_view' },
          { text: isEnabled ? '🟢 Status: Active' : '🔴 Status: Disabled', callback_data: 'ar_toggle' }
        ],
        [
          { text: '⏱️ Step Delay', callback_data: 'ar_delay_menu' },
          { text: '🎛️ Trigger Mode', callback_data: 'ar_mode_menu' }
        ],
        [
          { text: '🗑️ Clear All Steps', callback_data: 'ar_clear' },
          { text: '🔙 Main Menu', callback_data: 'nav_main' }
        ]
      ]
    };
  },

  // Individual Step Slot Submenu
  stepSlotMenu(slotNumber, isSet = false) {
    const rows = [
      [
        { text: isSet ? `✏️ Update Step ${slotNumber}` : `➕ Set Step ${slotNumber}`, callback_data: `ar_set_slot:${slotNumber}` }
      ]
    ];
    if (isSet) {
      rows.push([
        { text: `🗑️ Clear Step ${slotNumber}`, callback_data: `ar_clear_slot:${slotNumber}` }
      ]);
    }
    rows.push([
      { text: '🔙 Back to Auto-Reply', callback_data: 'menu_autoreply' }
    ]);
    return { inline_keyboard: rows };
  },

  // Broadcast Submenu
  broadcastMenu() {
    return {
      inline_keyboard: [
        [
          { text: '👥 Broadcast to All Contacts', callback_data: 'bc_all' }
        ],
        [
          { text: '🎯 Single User Direct Msg', callback_data: 'bc_single' },
          { text: '📑 Template / Custom Broadcast', callback_data: 'bc_template_menu' }
        ],
        [
          { text: '⏱️ Broadcast Safe Delay', callback_data: 'bc_delay_menu' },
          { text: '🔙 Back to Main Menu', callback_data: 'nav_main' }
        ]
      ]
    };
  },

  // Template Broadcast Submenu
  templateMenu() {
    return {
      inline_keyboard: [
        [
          { text: '🚀 Start Personalized Broadcast', callback_data: 'tpl_start' }
        ],
        [
          { text: '📝 Set / Edit Message Template', callback_data: 'tpl_edit' },
          { text: '👁️ View Active Template', callback_data: 'tpl_view' }
        ],
        [
          { text: '🔙 Back to Broadcast Menu', callback_data: 'menu_broadcast' }
        ]
      ]
    };
  },

  // Contacts Submenu
  contactsMenu() {
    return {
      inline_keyboard: [
        [
          { text: '📊 View Statistics', callback_data: 'ct_stats' },
          { text: '📤 Export Contacts (CSV)', callback_data: 'ct_export' }
        ],
        [
          { text: '🗑️ Clear All Contacts', callback_data: 'ct_clear' },
          { text: '🔙 Back to Main Menu', callback_data: 'nav_main' }
        ]
      ]
    };
  },

  // Cancel Button
  cancelAction(backTo = 'nav_main') {
    return {
      inline_keyboard: [
        [
          { text: '❌ Cancel', callback_data: `cancel_action:${backTo}` }
        ]
      ]
    };
  },

  // Confirmation Button
  confirmBroadcast(actionKey) {
    return {
      inline_keyboard: [
        [
          { text: '🚀 Confirm & Start Broadcast', callback_data: `confirm_bc:${actionKey}` },
          { text: '❌ Cancel', callback_data: 'menu_broadcast' }
        ]
      ]
    };
  },

  // Accounts list for removal
  accountSelection(accounts, prefix = 'acc_del:') {
    const buttons = accounts.map(a => [
      { text: `+${a.phone} (${a.name || 'Account'})`, callback_data: `${prefix}${a.phone}` }
    ]);
    buttons.push([{ text: '🔙 Back to Accounts', callback_data: 'menu_accounts' }]);
    return { inline_keyboard: buttons };
  },

  // Steps list for removal
  stepsSelection(steps) {
    const buttons = steps.map(s => [
      { text: `Step ${s.order}: ${s.type.toUpperCase()} (${(s.caption || s.content || s.fileName || '').substring(0, 20)}...)`, callback_data: `ar_del:${s.id}` }
    ]);
    buttons.push([{ text: '🔙 Back to Auto-Reply', callback_data: 'menu_autoreply' }]);
    return { inline_keyboard: buttons };
  },

  // Delay selection
  delaySelection(target = 'bc') {
    return {
      inline_keyboard: [
        [
          { text: '1.5 Seconds', callback_data: `set_delay:${target}:1500` },
          { text: '2.5 Seconds', callback_data: `set_delay:${target}:2500` }
        ],
        [
          { text: '4.0 Seconds', callback_data: `set_delay:${target}:4000` },
          { text: '6.0 Seconds (Safer)', callback_data: `set_delay:${target}:6000` }
        ],
        [
          { text: '🔙 Back', callback_data: target === 'bc' ? 'menu_broadcast' : 'menu_autoreply' }
        ]
      ]
    };
  },

  // Trigger mode selection
  triggerModeSelection() {
    return {
      inline_keyboard: [
        [
          { text: '🆕 Only for First-Time / New Message', callback_data: 'set_mode:first_time' }
        ],
        [
          { text: '🔁 For Every Incoming Message', callback_data: 'set_mode:always' }
        ],
        [
          { text: '🔙 Back to Auto-Reply', callback_data: 'menu_autoreply' }
        ]
      ]
    };
  }
};

module.exports = Keyboards;

