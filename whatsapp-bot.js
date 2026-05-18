/**
 * ╔════════════════════════════════════════════════════════════╗
 * ║         WHATSAPP BOT v2.0 - URDU/HINDI EDITION             ║
 * ║                                                            ║
 * ║  ✅ Anti Delete Messages                                   ║
 * ║  ✅ Anti Edit Messages                                     ║
 * ║  ✅ Anti View Once (Save & Resend)                         ║
 * ║  ✅ 😭 Emoji Trigger (Custom)                             ║
 * ║  ✅ All Messages to Inbox                                  ║
 * ║  ✅ Last Seen Always OFF                                   ║
 * ║  ✅ Private Bot Mode                                       ║
 * ║                                                            ║
 * ╚════════════════════════════════════════════════════════════╝
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const fs = require("fs");
const path = require("path");

// ════════════════════════════════════════════════════════════════════════════
// ⚙️  CONFIGURATION - APNA SETUP KARO YE
// ════════════════════════════════════════════════════════════════════════════

const BOT_CONFIG = {
  // 📱 Bot Owner Number (country code ke saath, bina +)
  // Example: 923001234567 (Pakistan), 919876543210 (India)
  OWNER_PHONE: "923356331700",

  // 🔐 Bot ke liye Password (optional, sirf admin access ke liye)
  BOT_PASSWORD: "bot123",

  // 💬 Bot ke Messages sabko inbox mein bhejne ke liye
  INBOX_JID: "", // Apna number daalo: "923356331700@s.whatsapp.net"

  // 📍 Features Toggle
  FEATURES: {
    ANTI_DELETE: true,        // Delete hone wale messages dikhao
    ANTI_EDIT: true,          // Edit hone wale messages dikhao
    ANTI_VIEW_ONCE: true,     // View-once media ko save aur resend karo
    EMOJI_TRIGGERS: true,     // Emoji based triggers
    HIDE_LAST_SEEN: true,     // Last seen hamesha OFF rakho
    PRIVATE_MODE: true,       // Sirf owner ko access
    AUTO_REPLY: false,        // Auto reply on/off
  },

  // 😭 Emoji Triggers - customize karo jo chahiye
  EMOJI_TRIGGERS: {
    "😭": ["rona", "sad", "ro", "udas", "pain", "hurt", "cry"],
    "😂": ["haha", "lol", "funny", "mazak", "joke"],
    "❤️": ["love", "pyar", "sweet", "dhanyavaad"],
    "🔥": ["fire", "nice", "awesome", "cool", "great"],
    "👍": ["ok", "theek", "sahi", "good", "yes"],
  },

  // 📝 Command Prefix
  PREFIX: "/",

  // 📧 Log bottan dekh sakte ho (optional)
  ENABLE_LOGGING: true,
};

// ════════════════════════════════════════════════════════════════════════════
// 🗄️  MESSAGE STORAGE
// ════════════════════════════════════════════════════════════════════════════

class MessageStorage {
  constructor() {
    this.messages = new Map();      // All messages cache
    this.deletedMessages = new Map(); // Deleted messages log
    this.editedMessages = new Map();  // Edited messages log
    this.viewOnceMedia = new Map();   // View-once media cache
  }

  saveMessage(jid, msgId, messageData) {
    if (!this.messages.has(jid)) {
      this.messages.set(jid, new Map());
    }
    this.messages.get(jid).set(msgId, {
      ...messageData,
      timestamp: new Date(),
    });
  }

  getDeletedMessages(jid) {
    return this.deletedMessages.get(jid) || [];
  }

  getEditedMessages(jid) {
    return this.editedMessages.get(jid) || [];
  }

  addDeletedMessage(jid, message) {
    if (!this.deletedMessages.has(jid)) {
      this.deletedMessages.set(jid, []);
    }
    this.deletedMessages.get(jid).push({
      ...message,
      deletedAt: new Date(),
    });
  }

  addEditedMessage(jid, original, edited) {
    if (!this.editedMessages.has(jid)) {
      this.editedMessages.set(jid, []);
    }
    this.editedMessages.get(jid).push({
      original,
      edited,
      editedAt: new Date(),
    });
  }

  saveViewOnceMedia(msgId, mediaData) {
    this.viewOnceMedia.set(msgId, {
      ...mediaData,
      savedAt: new Date(),
    });
  }

  getViewOnceMedia(msgId) {
    return this.viewOnceMedia.get(msgId);
  }
}

const storage = new MessageStorage();

// ════════════════════════════════════════════════════════════════════════════
// 🛠️  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

const Utils = {
  // Format phone number
  formatPhone(jid) {
    return jid ? jid.split("@")[0] : "Unknown";
  },

  // Check if group
  isGroup(jid) {
    return jid?.endsWith("@g.us");
  },

  // Check if owner
  isOwner(jid) {
    const senderJid = jid ? jid.split("@")[0] : "";
    return senderJid === BOT_CONFIG.OWNER_PHONE;
  },

  // Get current time (Pakistan/India)
  getTime() {
    return new Date().toLocaleString("en-PK", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  },

  // Get message content
  getMessageText(msg) {
    const m = msg.message;
    if (!m) return null;

    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.audioMessage?.caption ||
      null
    );
  },

  // Get message type
  getMessageType(msg) {
    const m = msg.message;
    if (!m) return "unknown";
    if (m.conversation) return "text";
    if (m.imageMessage) return "image";
    if (m.videoMessage) return "video";
    if (m.audioMessage) return "audio";
    if (m.documentMessage) return "document";
    if (m.stickerMessage) return "sticker";
    return Object.keys(m)[0];
  },

  // Log karo
  log(title, message) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.log(
      `\x1b[36m[${this.getTime()}]\x1b[0m \x1b[33m${title}\x1b[0m: ${message}`
    );
  },

  // Error log
  error(title, error) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.error(
      `\x1b[36m[${this.getTime()}]\x1b[0m \x1b[31m[ERROR] ${title}\x1b[0m:`,
      error.message
    );
  },
};

// ════════════════════════════════════════════════════════════════════════════
// 🔐 PRIVATE BOT MODE
// ════════════════════════════════════════════════════════════════════════════

async function checkPrivateMode(sock, msg, senderJid) {
  if (!BOT_CONFIG.FEATURES.PRIVATE_MODE) return true;

  const isOwner = Utils.isOwner(senderJid);
  if (!isOwner) {
    // Owner ko message do privacy ke baare mein
    if (Utils.isOwner(msg.key.participant || msg.key.remoteJid)) {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "🔐 *Private Bot Mode Enabled*\n\nBot sirf owner ke liye hai. Doosre se messages nahin hain.",
      });
    }
    return false;
  }

  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// 👁️  ANTI VIEW-ONCE
// ════════════════════════════════════════════════════════════════════════════

async function handleViewOnceMessage(sock, msg) {
  if (!BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE) return;

  const message = msg.message;
  if (!message) return;

  // Check for view-once messages
  const viewOnce =
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message;

  if (!viewOnce) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const sender = Utils.formatPhone(senderJid);
  const jid = msg.key.remoteJid;

  Utils.log("ANTI-VIEW-ONCE", `Detected from ${sender}`);

  try {
    // Media type determine karo
    let mediaType = null;
    let mediaMsg = null;

    if (viewOnce.imageMessage) {
      mediaType = "image";
      mediaMsg = viewOnce.imageMessage;
    } else if (viewOnce.videoMessage) {
      mediaType = "video";
      mediaMsg = viewOnce.videoMessage;
    } else if (viewOnce.audioMessage) {
      mediaType = "audio";
      mediaMsg = viewOnce.audioMessage;
    }

    if (!mediaMsg) return;

    // Media download karo
    const buffer = await downloadMediaMessage(
      { ...msg, message: viewOnce },
      "buffer",
      {},
      {
        logger: pino({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    // Save karo storage mein
    storage.saveViewOnceMedia(msg.key.id, {
      sender,
      mediaType,
      buffer,
      caption: mediaMsg.caption || "View Once Media",
    });

    // Inbox mein bhejo
    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const caption = `👁️ *Anti View-Once Alert*\n\n📱 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📌 Type: ${mediaType.toUpperCase()}\n\n✅ Media saved successfully!`;

    if (mediaType === "image") {
      await sock.sendMessage(inboxJid, {
        image: buffer,
        caption,
      });
    } else if (mediaType === "video") {
      await sock.sendMessage(inboxJid, {
        video: buffer,
        caption,
      });
    } else if (mediaType === "audio") {
      await sock.sendMessage(inboxJid, {
        audio: buffer,
        mimetype: "audio/mpeg",
        caption,
      });
    }

    Utils.log("VIEW-ONCE-SAVED", `Media saved and sent to inbox`);
  } catch (error) {
    Utils.error("VIEW-ONCE", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🗑️  ANTI DELETE
// ════════════════════════════════════════════════════════════════════════════

async function handleDeletedMessage(sock, deletedKey) {
  if (!BOT_CONFIG.FEATURES.ANTI_DELETE) return;

  const jid = deletedKey.remoteJid;
  const msgId = deletedKey.id;

  // Deleted message ko cache se nikaal sakte hain
  const originalMsg = storage.messages.get(jid)?.get(msgId);
  if (!originalMsg) return;

  const sender = Utils.formatPhone(originalMsg.senderJid);
  const text = originalMsg.text || "[Media Message]";
  const msgType = originalMsg.type;

  Utils.log("ANTI-DELETE", `Message deleted by ${sender}`);

  try {
    storage.addDeletedMessage(jid, {
      sender,
      text,
      type: msgType,
    });

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message = `🗑️ *Anti-Delete Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📋 Type: ${msgType}\n\n💬 *Message:*\n${text}`;

    await sock.sendMessage(inboxJid, { text: message });

    Utils.log("ANTI-DELETE-SAVED", `Alert sent to inbox`);
  } catch (error) {
    Utils.error("ANTI-DELETE", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ✏️  ANTI EDIT
// ════════════════════════════════════════════════════════════════════════════

async function handleEditedMessage(sock, msg) {
  if (!BOT_CONFIG.FEATURES.ANTI_EDIT) return;

  const message = msg.message;
  if (!message) return;

  // Check for edited messages
  const editedMsg =
    message.editedMessage ||
    (message.protocolMessage?.type === 14 && message.protocolMessage?.editedMessage);

  if (!editedMsg) return;

  const jid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const sender = Utils.formatPhone(senderJid);
  const msgId = msg.key.id;

  // Original text
  const originalMsg = storage.messages.get(jid)?.get(msgId);
  const originalText = originalMsg?.text || "[Not in cache]";

  // New text
  const newText =
    editedMsg.conversation ||
    editedMsg.extendedTextMessage?.text ||
    editedMsg.message?.conversation ||
    "[Unknown]";

  Utils.log("ANTI-EDIT", `Message edited by ${sender}`);

  try {
    storage.addEditedMessage(jid, originalText, newText);

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message_text = `✏️ *Anti-Edit Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n\n📝 *Original Message:*\n${originalText}\n\n🔄 *Edited To:*\n${newText}`;

    await sock.sendMessage(inboxJid, { text: message_text });

    Utils.log("ANTI-EDIT-SAVED", `Alert sent to inbox`);
  } catch (error) {
    Utils.error("ANTI-EDIT", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 😭 EMOJI TRIGGERS
// ════════════════════════════════════════════════════════════════════════════

async function handleEmojiTriggers(sock, msg) {
  if (!BOT_CONFIG.FEATURES.EMOJI_TRIGGERS) return;

  const text = Utils.getMessageText(msg);
  if (!text) return;

  const lowerText = text.toLowerCase();

  try {
    for (const [emoji, keywords] of Object.entries(BOT_CONFIG.EMOJI_TRIGGERS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          // React with emoji
          await sock.sendMessage(msg.key.remoteJid, {
            react: {
              text: emoji,
              key: msg.key,
            },
          });

          Utils.log("EMOJI-TRIGGER", `${emoji} triggered by keyword "${keyword}"`);
          return; // Only one emoji per message
        }
      }
    }
  } catch (error) {
    Utils.error("EMOJI-TRIGGER", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 💬 MESSAGE COMMANDS
// ════════════════════════════════════════════════════════════════════════════

async function handleCommands(sock, msg) {
  const text = Utils.getMessageText(msg);
  if (!text) return;
  if (!text.startsWith(BOT_CONFIG.PREFIX)) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;

  // Check owner
  if (!Utils.isOwner(senderJid)) {
    return; // Silently ignore for non-owners
  }

  const [cmd, ...args] = text.slice(BOT_CONFIG.PREFIX.length).trim().split(" ");
  const command = cmd.toLowerCase();
  const jid = msg.key.remoteJid;

  Utils.log("COMMAND", `/${command} by owner`);

  try {
    switch (command) {
      case "ping":
        await sock.sendMessage(jid, {
          text: "🏓 *Pong!* Bot is alive and running.",
        });
        break;

      case "status":
        const features = BOT_CONFIG.FEATURES;
        const status = `
🤖 *Bot Status*

✅ Anti Delete: ${features.ANTI_DELETE ? "ON" : "OFF"}
✅ Anti Edit: ${features.ANTI_EDIT ? "ON" : "OFF"}
✅ Anti View Once: ${features.ANTI_VIEW_ONCE ? "ON" : "OFF"}
✅ Emoji Triggers: ${features.EMOJI_TRIGGERS ? "ON" : "OFF"}
✅ Last Seen: ALWAYS OFF 🕐
✅ Private Mode: ${features.PRIVATE_MODE ? "ON" : "OFF"}

🕐 Time: ${Utils.getTime()}
📱 Owner: ${BOT_CONFIG.OWNER_PHONE}
`;
        await sock.sendMessage(jid, { text: status });
        break;

      case "antidelete":
        BOT_CONFIG.FEATURES.ANTI_DELETE = !BOT_CONFIG.FEATURES.ANTI_DELETE;
        await sock.sendMessage(jid, {
          text: `🗑️ Anti-Delete is now *${BOT_CONFIG.FEATURES.ANTI_DELETE ? "ON" : "OFF"}*`,
        });
        break;

      case "antiedit":
        BOT_CONFIG.FEATURES.ANTI_EDIT = !BOT_CONFIG.FEATURES.ANTI_EDIT;
        await sock.sendMessage(jid, {
          text: `✏️ Anti-Edit is now *${BOT_CONFIG.FEATURES.ANTI_EDIT ? "ON" : "OFF"}*`,
        });
        break;

      case "antiviewonce":
        BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE = !BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE;
        await sock.sendMessage(jid, {
          text: `👁️ Anti-View-Once is now *${BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE ? "ON" : "OFF"}*`,
        });
        break;

      case "emoji":
        BOT_CONFIG.FEATURES.EMOJI_TRIGGERS = !BOT_CONFIG.FEATURES.EMOJI_TRIGGERS;
        await sock.sendMessage(jid, {
          text: `😭 Emoji Triggers are now *${BOT_CONFIG.FEATURES.EMOJI_TRIGGERS ? "ON" : "OFF"}*`,
        });
        break;

      case "help":
        const help = `
╔════════════════════════════════════╗
║       🤖 BOT COMMANDS              ║
╚════════════════════════════════════╝

${BOT_CONFIG.PREFIX}ping - Check bot status
${BOT_CONFIG.PREFIX}status - View all features
${BOT_CONFIG.PREFIX}antidelete - Toggle anti-delete
${BOT_CONFIG.PREFIX}antiedit - Toggle anti-edit
${BOT_CONFIG.PREFIX}antiviewonce - Toggle anti-view-once
${BOT_CONFIG.PREFIX}emoji - Toggle emoji triggers
${BOT_CONFIG.PREFIX}logs - View recent logs
${BOT_CONFIG.PREFIX}help - This message
`;
        await sock.sendMessage(jid, { text: help });
        break;

      case "logs":
        const deletedCount = storage.deletedMessages.size;
        const editedCount = storage.editedMessages.size;
        const logs = `
📊 *Bot Logs*

🗑️ Deleted Messages Captured: ${deletedCount}
✏️ Edited Messages Captured: ${editedCount}
👁️ View-Once Media Saved: ${storage.viewOnceMedia.size}

🕐 Time: ${Utils.getTime()}
`;
        await sock.sendMessage(jid, { text: logs });
        break;

      default:
        await sock.sendMessage(jid, {
          text: `❌ Unknown command: ${BOT_CONFIG.PREFIX}${command}\n\nType ${BOT_CONFIG.PREFIX}help for commands.`,
        });
    }
  } catch (error) {
    Utils.error("COMMAND", error);
    await sock.sendMessage(jid, {
      text: `❌ Error: ${error.message}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🔌 BOT CONNECTION
// ════════════════════════════════════════════════════════════════════════════

async function startBot() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         🤖 WHATSAPP BOT v2.0 - Starting...               ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const { state, saveCreds } = await useMultiFileAuthState("./bot_session");

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.0.0"],
    syncFullHistory: false,
    shouldIgnoreJid: () => false,
  });

  // Connection updates
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 QR Code - Scan with WhatsApp:\n");
    }

    if (connection === "connecting") {
      console.log(`⏳ Connecting...`);
    }

    if (connection === "open") {
      console.log(`\n✅ BOT CONNECTED SUCCESSFULLY!\n`);
      console.log(`🕐 Time: ${Utils.getTime()}`);
      console.log(`📱 Owner: ${BOT_CONFIG.OWNER_PHONE}`);
      console.log(`🔐 Private Mode: ${BOT_CONFIG.FEATURES.PRIVATE_MODE ? "ON" : "OFF"}`);
      console.log(`\n🟢 Bot is live and running!\n`);

      // Hide last seen
      try {
        await sock.sendPresenceUpdate("unavailable");
      } catch (e) {
        // Ignore
      }
    }

    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log(
        `❌ Connection closed. Code: ${lastDisconnect?.error?.output?.statusCode}`
      );

      if (shouldReconnect) {
        console.log(`🔄 Reconnecting in 5 seconds...`);
        setTimeout(startBot, 5000);
      } else {
        console.log(`🔐 Logged out. Delete ./bot_session and restart.`);
        process.exit(0);
      }
    }
  });

  // Save credentials
  sock.ev.on("creds.update", saveCreds);

  // Handle messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const text = Utils.getMessageText(msg);

      // Check private mode
      if (BOT_CONFIG.FEATURES.PRIVATE_MODE && !Utils.isOwner(senderJid)) {
        continue;
      }

      // Save message to cache
      storage.saveMessage(jid, msg.key.id, {
        senderJid,
        text,
        type: Utils.getMessageType(msg),
      });

      // Handle view-once
      if (type === "notify") {
        await handleViewOnceMessage(sock, msg);
      }

      // Handle emoji triggers
      if (type === "notify") {
        await handleEmojiTriggers(sock, msg);
      }

      // Handle commands
      if (type === "notify") {
        await handleCommands(sock, msg);
      }
    }
  });

  // Handle deleted messages
  sock.ev.on("messages.delete", async (item) => {
    if (item.keys) {
      for (const key of item.keys) {
        await handleDeletedMessage(sock, key);
      }
    }
  });

  // Handle edited messages
  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      if (update.update?.message) {
        await handleEditedMessage(sock, {
          key: update.key,
          message: update.update.message,
        });
      }
    }
  });

  return sock;
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀 START BOT
// ════════════════════════════════════════════════════════════════════════════

startBot().catch(console.error);

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Bot shutting down...");
  process.exit(0);
});
  // 📧 Logging
  ENABLE_LOGGING: true,
};

// ════════════════════════════════════════════════════════════════════════════
// 🗄️  MESSAGE STORAGE
// ════════════════════════════════════════════════════════════════════════════

class MessageStorage {
  constructor() {
    this.messages = new Map();
    this.deletedMessages = new Map();
    this.editedMessages = new Map();
    this.viewOnceMedia = new Map();
  }

  saveMessage(jid, msgId, messageData) {
    if (!this.messages.has(jid)) {
      this.messages.set(jid, new Map());
    }
    this.messages.get(jid).set(msgId, {
      ...messageData,
      timestamp: new Date(),
    });
  }

  getDeletedMessages(jid) {
    return this.deletedMessages.get(jid) || [];
  }

  getEditedMessages(jid) {
    return this.editedMessages.get(jid) || [];
  }

  addDeletedMessage(jid, message) {
    if (!this.deletedMessages.has(jid)) {
      this.deletedMessages.set(jid, []);
    }
    this.deletedMessages.get(jid).push({
      ...message,
      deletedAt: new Date(),
    });
  }

  addEditedMessage(jid, original, edited) {
    if (!this.editedMessages.has(jid)) {
      this.editedMessages.set(jid, []);
    }
    this.editedMessages.get(jid).push({
      original,
      edited,
      editedAt: new Date(),
    });
  }

  saveViewOnceMedia(msgId, mediaData) {
    this.viewOnceMedia.set(msgId, {
      ...mediaData,
      savedAt: new Date(),
    });
  }

  getViewOnceMedia(msgId) {
    return this.viewOnceMedia.get(msgId);
  }
}

const storage = new MessageStorage();

// ════════════════════════════════════════════════════════════════════════════
// 🛠️  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

const Utils = {
  formatPhone(jid) {
    return jid ? jid.split("@")[0] : "Unknown";
  },

  isGroup(jid) {
    return jid?.endsWith("@g.us");
  },

  isOwner(jid) {
    const senderJid = jid ? jid.split("@")[0] : "";
    return senderJid === BOT_CONFIG.OWNER_PHONE;
  },

  getTime() {
    return new Date().toLocaleString("en-PK", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  },

  getMessageText(msg) {
    const m = msg.message;
    if (!m) return null;

    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.audioMessage?.caption ||
      null
    );
  },

  getMessageType(msg) {
    const m = msg.message;
    if (!m) return "unknown";
    if (m.conversation) return "text";
    if (m.imageMessage) return "image";
    if (m.videoMessage) return "video";
    if (m.audioMessage) return "audio";
    if (m.documentMessage) return "document";
    if (m.stickerMessage) return "sticker";
    return Object.keys(m)[0];
  },

  log(title, message) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.log(
      `\x1b[36m[${this.getTime()}]\x1b[0m \x1b[33m${title}\x1b[0m: ${message}`
    );
  },

  error(title, error) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.error(
      `\x1b[36m[${this.getTime()}]\x1b[0m \x1b[31m[ERROR] ${title}\x1b[0m:`,
      error.message
    );
  },
};

// ════════════════════════════════════════════════════════════════════════════
// 👁️  ANTI VIEW-ONCE
// ════════════════════════════════════════════════════════════════════════════

async function handleViewOnceMessage(sock, msg) {
  if (!BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE) return;

  const message = msg.message;
  if (!message) return;

  const viewOnce =
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message;

  if (!viewOnce) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const sender = Utils.formatPhone(senderJid);
  const jid = msg.key.remoteJid;

  Utils.log("ANTI-VIEW-ONCE", `Detected from ${sender}`);

  try {
    let mediaType = null;
    let mediaMsg = null;

    if (viewOnce.imageMessage) {
      mediaType = "image";
      mediaMsg = viewOnce.imageMessage;
    } else if (viewOnce.videoMessage) {
      mediaType = "video";
      mediaMsg = viewOnce.videoMessage;
    } else if (viewOnce.audioMessage) {
      mediaType = "audio";
      mediaMsg = viewOnce.audioMessage;
    }

    if (!mediaMsg) return;

    const buffer = await downloadMediaMessage(
      { ...msg, message: viewOnce },
      "buffer",
      {},
      {
        logger: pino({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    storage.saveViewOnceMedia(msg.key.id, {
      sender,
      mediaType,
      buffer,
      caption: mediaMsg.caption || "View Once Media",
    });

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const caption = `👁️ *Anti View-Once Alert*\n\n📱 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📌 Type: ${mediaType.toUpperCase()}\n\n✅ Media saved!`;

    if (mediaType === "image") {
      await sock.sendMessage(inboxJid, {
        image: buffer,
        caption,
      });
    } else if (mediaType === "video") {
      await sock.sendMessage(inboxJid, {
        video: buffer,
        caption,
      });
    } else if (mediaType === "audio") {
      await sock.sendMessage(inboxJid, {
        audio: buffer,
        mimetype: "audio/mpeg",
        caption,
      });
    }

    Utils.log("VIEW-ONCE-SAVED", `Media saved and sent`);
  } catch (error) {
    Utils.error("VIEW-ONCE", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🗑️  ANTI DELETE
// ════════════════════════════════════════════════════════════════════════════

async function handleDeletedMessage(sock, deletedKey) {
  if (!BOT_CONFIG.FEATURES.ANTI_DELETE) return;

  const jid = deletedKey.remoteJid;
  const msgId = deletedKey.id;

  const originalMsg = storage.messages.get(jid)?.get(msgId);
  if (!originalMsg) return;

  const sender = Utils.formatPhone(originalMsg.senderJid);
  const text = originalMsg.text || "[Media Message]";
  const msgType = originalMsg.type;

  Utils.log("ANTI-DELETE", `Message deleted by ${sender}`);

  try {
    storage.addDeletedMessage(jid, {
      sender,
      text,
      type: msgType,
    });

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message = `🗑️ *Anti-Delete Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📋 Type: ${msgType}\n\n💬 *Message:*\n${text}`;

    await sock.sendMessage(inboxJid, { text: message });

    Utils.log("ANTI-DELETE-SAVED", `Alert sent`);
  } catch (error) {
    Utils.error("ANTI-DELETE", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ✏️  ANTI EDIT
// ════════════════════════════════════════════════════════════════════════════

async function handleEditedMessage(sock, msg) {
  if (!BOT_CONFIG.FEATURES.ANTI_EDIT) return;

  const message = msg.message;
  if (!message) return;

  const editedMsg =
    message.editedMessage ||
    (message.protocolMessage?.type === 14 && message.protocolMessage?.editedMessage);

  if (!editedMsg) return;

  const jid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const sender = Utils.formatPhone(senderJid);
  const msgId = msg.key.id;

  const originalMsg = storage.messages.get(jid)?.get(msgId);
  const originalText = originalMsg?.text || "[Not in cache]";

  const newText =
    editedMsg.conversation ||
    editedMsg.extendedTextMessage?.text ||
    editedMsg.message?.conversation ||
    "[Unknown]";

  Utils.log("ANTI-EDIT", `Message edited by ${sender}`);

  try {
    storage.addEditedMessage(jid, originalText, newText);

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message_text = `✏️ *Anti-Edit Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n\n📝 *Original:*\n${originalText}\n\n🔄 *Edited To:*\n${newText}`;

    await sock.sendMessage(inboxJid, { text: message_text });

    Utils.log("ANTI-EDIT-SAVED", `Alert sent`);
  } catch (error) {
    Utils.error("ANTI-EDIT", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 😭 EMOJI TRIGGERS
// ════════════════════════════════════════════════════════════════════════════

async function handleEmojiTriggers(sock, msg) {
  if (!BOT_CONFIG.FEATURES.EMOJI_TRIGGERS) return;

  const text = Utils.getMessageText(msg);
  if (!text) return;

  const lowerText = text.toLowerCase();

  try {
    for (const [emoji, keywords] of Object.entries(BOT_CONFIG.EMOJI_TRIGGERS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          await sock.sendMessage(msg.key.remoteJid, {
            react: {
              text: emoji,
              key: msg.key,
            },
          });

          Utils.log("EMOJI-TRIGGER", `${emoji} by "${keyword}"`);
          return;
        }
      }
    }
  } catch (error) {
    Utils.error("EMOJI-TRIGGER", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 💬 MESSAGE COMMANDS
// ════════════════════════════════════════════════════════════════════════════

async function handleCommands(sock, msg) {
  const text = Utils.getMessageText(msg);
  if (!text) return;
  if (!text.startsWith(BOT_CONFIG.PREFIX)) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!Utils.isOwner(senderJid)) {
    return;
  }

  const [cmd, ...args] = text.slice(BOT_CONFIG.PREFIX.length).trim().split(" ");
  const command = cmd.toLowerCase();
  const jid = msg.key.remoteJid;

  Utils.log("COMMAND", `/${command} by owner`);

  try {
    switch (command) {
      case "ping":
        await sock.sendMessage(jid, {
          text: "🏓 *Pong!* Bot is alive.",
        });
        break;

      case "status":
        const features = BOT_CONFIG.FEATURES;
        const status = `
🤖 *Bot Status*

✅ Anti Delete: ${features.ANTI_DELETE ? "ON" : "OFF"}
✅ Anti Edit: ${features.ANTI_EDIT ? "ON" : "OFF"}
✅ Anti View Once: ${features.ANTI_VIEW_ONCE ? "ON" : "OFF"}
✅ Emoji Triggers: ${features.EMOJI_TRIGGERS ? "ON" : "OFF"}
✅ Last Seen: ALWAYS OFF 🕐
✅ Private Mode: ${features.PRIVATE_MODE ? "ON" : "OFF"}

🕐 Time: ${Utils.getTime()}
📱 Owner: ${BOT_CONFIG.OWNER_PHONE}
`;
        await sock.sendMessage(jid, { text: status });
        break;

      case "antidelete":
        BOT_CONFIG.FEATURES.ANTI_DELETE = !BOT_CONFIG.FEATURES.ANTI_DELETE;
        await sock.sendMessage(jid, {
          text: `🗑️ Anti-Delete: *${BOT_CONFIG.FEATURES.ANTI_DELETE ? "ON" : "OFF"}*`,
        });
        break;

      case "antiedit":
        BOT_CONFIG.FEATURES.ANTI_EDIT = !BOT_CONFIG.FEATURES.ANTI_EDIT;
        await sock.sendMessage(jid, {
          text: `✏️ Anti-Edit: *${BOT_CONFIG.FEATURES.ANTI_EDIT ? "ON" : "OFF"}*`,
        });
        break;

      case "antiviewonce":
        BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE = !BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE;
        await sock.sendMessage(jid, {
          text: `👁️ Anti-View-Once: *${BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE ? "ON" : "OFF"}*`,
        });
        break;

      case "emoji":
        BOT_CONFIG.FEATURES.EMOJI_TRIGGERS = !BOT_CONFIG.FEATURES.EMOJI_TRIGGERS;
        await sock.sendMessage(jid, {
          text: `😭 Emoji Triggers: *${BOT_CONFIG.FEATURES.EMOJI_TRIGGERS ? "ON" : "OFF"}*`,
        });
        break;

      case "help":
        const help = `
╔════════════════════════════════════╗
║       🤖 BOT COMMANDS              ║
╚════════════════════════════════════╝

${BOT_CONFIG.PREFIX}ping - Check status
${BOT_CONFIG.PREFIX}status - All features
${BOT_CONFIG.PREFIX}antidelete - Toggle
${BOT_CONFIG.PREFIX}antiedit - Toggle
${BOT_CONFIG.PREFIX}antiviewonce - Toggle
${BOT_CONFIG.PREFIX}emoji - Toggle
${BOT_CONFIG.PREFIX}logs - Captured count
${BOT_CONFIG.PREFIX}help - This message
`;
        await sock.sendMessage(jid, { text: help });
        break;

      case "logs":
        const deletedCount = storage.deletedMessages.size;
        const editedCount = storage.editedMessages.size;
        const logs = `
📊 *Bot Logs*

🗑️ Deleted: ${deletedCount}
✏️ Edited: ${editedCount}
👁️ View-Once: ${storage.viewOnceMedia.size}

🕐 Time: ${Utils.getTime()}
`;
        await sock.sendMessage(jid, { text: logs });
        break;

      default:
        await sock.sendMessage(jid, {
          text: `❌ Unknown: ${BOT_CONFIG.PREFIX}${command}\n\nUse ${BOT_CONFIG.PREFIX}help`,
        });
    }
  } catch (error) {
    Utils.error("COMMAND", error);
    await sock.sendMessage(jid, {
      text: `❌ Error: ${error.message}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🔌 BOT CONNECTION - LINK-BASED PAIRING (NO QR)
// ════════════════════════════════════════════════════════════════════════════

async function startBot() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║    🤖 WHATSAPP BOT v2.1 - Link Pairing - Starting...      ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const { state, saveCreds } = await useMultiFileAuthState("./bot_session");

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    // ❌ Removed printQRInTerminal: true - NO QR CODE
    // ✅ Link pairing enabled by default in modern Baileys
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.0.0"],
    syncFullHistory: false,
    shouldIgnoreJid: () => false,
    defaultQueryTimeoutMs: 0,
    retryRequestDelayMs: 100,
    maxMsgsInMemory: 100,
    fireInitQueries: false,
    emitOwnEvents: true,
    markOnlineOnConnect: true,
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 🔗 LINK-BASED PAIRING HANDLER
  // ════════════════════════════════════════════════════════════════════════════
  
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update;

    // 🔗 Link pairing code (NEW - replaces QR)
    if (update.qr || update.type === "qr") {
      console.log("\n🔗 Link-based pairing is ready!");
      console.log("📱 Go to: https://web.whatsapp.com");
      console.log("✅ The bot will automatically connect...\n");
    }

    // Alternative: Check for new login to show pairing message
    if (isNewLogin === true) {
      console.log("\n🔗 NEW DEVICE PAIRING DETECTED!");
      console.log("📱 Scan the link with your WhatsApp device");
      console.log("⏳ Waiting for connection confirmation...\n");
    }

    if (connection === "connecting") {
      console.log(`⏳ Connecting...`);
    }

    if (connection === "open") {
      console.log(`\n✅ BOT CONNECTED!\n`);
      console.log(`🕐 Time: ${Utils.getTime()}`);
      console.log(`📱 Owner: ${BOT_CONFIG.OWNER_PHONE}`);
      console.log(`✅ Private Mode: ON`);
      console.log(`✅ Last Seen: OFF`);
      console.log(`🔗 Link Pairing: ACTIVE`);
      console.log(`\n🟢 BOT IS LIVE!\n`);

      try {
        await sock.sendPresenceUpdate("unavailable");
      } catch (e) {
        //
      }
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log(
        `⚠️ Connection closed. Code: ${lastDisconnect?.error?.output?.statusCode}`
      );

      if (shouldReconnect) {
        console.log(`🔄 Reconnecting in 10 seconds...`);
        setTimeout(startBot, 10000);
      } else {
        console.log(`🔐 Logged out. Delete ./bot_session and restart.`);
        process.exit(0);
      }
    }
  });

  // Save credentials
  sock.ev.on("creds.update", saveCreds);

  // Handle messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const text = Utils.getMessageText(msg);

      if (BOT_CONFIG.FEATURES.PRIVATE_MODE && !Utils.isOwner(senderJid)) {
        continue;
      }

      storage.saveMessage(jid, msg.key.id, {
        senderJid,
        text,
        type: Utils.getMessageType(msg),
      });

      if (type === "notify") {
        await handleViewOnceMessage(sock, msg);
        await handleEmojiTriggers(sock, msg);
        await handleCommands(sock, msg);
      }
    }
  });

  // Handle deleted messages
  sock.ev.on("messages.delete", async (item) => {
    if (item.keys) {
      for (const key of item.keys) {
        await handleDeletedMessage(sock, key);
      }
    }
  });

  // Handle edited messages
  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      if (update.update?.message) {
        await handleEditedMessage(sock, {
          key: update.key,
          message: update.update.message,
        });
      }
    }
  });

  return sock;
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀 START
// ════════════════════════════════════════════════════════════════════════════

startBot().catch(console.error);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Bot shutting down...");
  process.exit(0);
});
  // 📧 Logging
  ENABLE_LOGGING: true,
};

// ════════════════════════════════════
// 🗄️ MESSAGE STORAGE
// ════════════

class MessageStorage {
  constructor() {
    this.messages = new Map();
    this.deletedMessages = new Map();
    this.editedMessages = new Map();
    this.viewOnceMedia = new Map();
  }

  saveMessage(jid, msgId, messageData) {
    if (!this.messages.has(jid)) {
      this.messages.set(jid, new Map());
    }
    this.messages.get(jid).set(msgId, {
     ...messageData,
      timestamp: new Date(),
    });
  }

  getDeletedMessages(jid) {
    return this.deletedMessages.get(jid) || [];
  }

  getEditedMessages(jid) {
    return this.editedMessages.get(jid) || [];
  }

  addDeletedMessage(jid, message) {
    if (!this.deletedMessages.has(jid)) {
      this.deletedMessages.set(jid, []);
    }
    this.deletedMessages.get(jid).push({
     ...message,
      deletedAt: new Date(),
    });
  }

  addEditedMessage(jid, original, edited) {
    if (!this.editedMessages.has(jid)) {
      this.editedMessages.set(jid, []);
    }
    this.editedMessages.get(jid).push({
      original,
      edited,
      editedAt: new Date(),
    });
  }

  saveViewOnceMedia(msgId, mediaData) {
    this.viewOnceMedia.set(msgId, {
     ...mediaData,
      savedAt: new Date(),
    });
  }

  getViewOnceMedia(msgId) {
    return this.viewOnceMedia.get(msgId);
  }
}

const storage = new MessageStorage();

// ════════════
// 🛠️ UTILITY FUNCTIONS
// ════════════

const Utils = {
  formatPhone(jid) {
    return jid? jid.split("@")[0] : "Unknown";
  },

  isGroup(jid) {
    return jid?.endsWith("@g.us");
  },

  isOwner(jid) {
    const senderJid = jid? jid.split("@")[0] : "";
    return senderJid === BOT_CONFIG.OWNER_PHONE;
  },

  getTime() {
    return new Date().toLocaleString("en-PK", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  },

  getMessageText(msg) {
    const m = msg.message;
    if (!m) return null;

    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.audioMessage?.caption ||
      null
    );
  },

  getMessageType(msg) {
    const m = msg.message;
    if (!m) return "unknown";
    if (m.conversation) return "text";
    if (m.imageMessage) return "image";
    if (m.videoMessage) return "video";
    if (m.audioMessage) return "audio";
    if (m.documentMessage) return "document";
    if (m.stickerMessage) return "sticker";
    return Object.keys(m)[0];
  },

  log(title, message) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.log(
      `\x1b[36m[${this.getTime()}]\x1b[0m \x1b[33m${title}\x1b[0m: ${message}`
    );
  },

  error(title, error) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.error(
      `\x1b[36m[${this.getTime()}]\x1b[0m \x1b[31m[ERROR] ${title}\x1b[0m:`,
      error.message
    );
  },
};

// ════════════
// 👁️ ANTI VIEW-ONCE
// ════════════

async function handleViewOnceMessage(sock, msg) {
  if (!BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE) return;

  const message = msg.message;
  if (!message) return;

  const viewOnce =
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message;

  if (!viewOnce) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const sender = Utils.formatPhone(senderJid);
  const jid = msg.key.remoteJid;

  Utils.log("ANTI-VIEW-ONCE", `Detected from ${sender}`);

  try {
    let mediaType = null;
    let mediaMsg = null;

    if (viewOnce.imageMessage) {
      mediaType = "image";
      mediaMsg = viewOnce.imageMessage;
    } else if (viewOnce.videoMessage) {
      mediaType = "video";
      mediaMsg = viewOnce.videoMessage;
    } else if (viewOnce.audioMessage) {
      mediaType = "audio";
      mediaMsg = viewOnce.audioMessage;
    }

    if (!mediaMsg) return;

    const buffer = await downloadMediaMessage(
      {...msg, message: viewOnce },
      "buffer",
      {},
      {
        logger: pino({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    storage.saveViewOnceMedia(msg.key.id, {
      sender,
      mediaType,
      buffer,
      caption: mediaMsg.caption || "View Once Media",
    });

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const caption = `👁️ *Anti View-Once Alert*\n\n📱 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📌 Type: ${mediaType.toUpperCase()}\n\n✅ Media saved!`;

    if (mediaType === "image") {
      await sock.sendMessage(inboxJid, {
        image: buffer,
        caption,
      });
    } else if (mediaType === "video") {
      await sock.sendMessage(inboxJid, {
        video: buffer,
        caption,
      });
    } else if (mediaType === "audio") {
      await sock.sendMessage(inboxJid, {
        audio: buffer,
        mimetype: "audio/mpeg",
        caption,
      });
    }

    Utils.log("VIEW-ONCE-SAVED", `Media saved and sent`);
  } catch (error) {
    Utils.error("VIEW-ONCE", error);
  }
}

// ════════════
// 🗑️ ANTI DELETE
// ════════════

async function handleDeletedMessage(sock, deletedKey) {
  if (!BOT_CONFIG.FEATURES.ANTI_DELETE) return;

  const jid = deletedKey.remoteJid;
  const msgId = deletedKey.id;

  const originalMsg = storage.messages.get(jid)?.get(msgId);
  if (!originalMsg) return;

  const sender = Utils.formatPhone(originalMsg.senderJid);
  const text = originalMsg.text || "[Media Message]";
  const msgType = originalMsg.type;

  Utils.log("ANTI-DELETE", `Message deleted by ${sender}`);

  try {
    storage.addDeletedMessage(jid, {
      sender,
      text,
      type: msgType,
    });

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message = `🗑️ *Anti-Delete Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📋 Type: ${msgType}\n\n💬 *Message:*\n${text}`;

    await sock.sendMessage(inboxJid, { text: message });

    Utils.log("ANTI-DELETE-SAVED", `Alert sent`);
  } catch (error) {
    Utils.error("ANTI-DELETE", error);
  }
}

// ════════════
// ✏️ ANTI EDIT
// ════════════════════════════════════════════════════════════════════════════

async function handleEditedMessage(sock, msg) {
  if (!BOT_CONFIG.FEATURES.ANTI_EDIT) return;

  const message = msg.message;
  if (!message) return;

  const editedMsg =
    message.editedMessage ||
    (message.protocolMessage?.type === 14 && message.protocolMessage?.editedMessage);

  if (!editedMsg) return;

  const jid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const sender = Utils.formatPhone(senderJid);
  const msgId = msg.key.id;

  const originalMsg = storage.messages.get(jid)?.get(msgId);
  const originalText = originalMsg?.text || "[Not in cache]";

  const newText =
    editedMsg.conversation ||
    editedMsg.extendedTextMessage?.text ||
    editedMsg.message?.conversation ||
    "[Unknown]";

  Utils.log("ANTI-EDIT", `Message edited by ${sender}`);

  try {
    storage.addEditedMessage(jid, originalText, newText);

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message_text = `✏️ *Anti-Edit Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n\n📝 *Original:*\n${originalText}\n\n🔄 *Edited To:*\n${newText}`;

    await sock.sendMessage(inboxJid, { text: message_text });

    Utils.log("ANTI-EDIT-SAVED", `Alert sent`);
  } catch (error) {
    Utils.error("ANTI-EDIT", error);
  }
}

// ════════════
// 😭 EMOJI TRIGGERS
// ════════════

async function handleEmojiTriggers(sock, msg) {
  if (!BOT_CONFIG.FEATURES.EMOJI_TRIGGERS) return;

  const text = Utils.getMessageText(msg);
  if (!text) return;

  const lowerText = text.toLowerCase();

  try {
    for (const [emoji, keywords] of Object.entries(BOT_CONFIG.EMOJI_TRIGGERS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          await sock.sendMessage(msg.key.remoteJid, {
            react: {
              text: emoji,
              key: msg.key,
            },
          });

          Utils.log("EMOJI-TRIGGER", `${emoji} by "${keyword}"`);
          return;
        }
      }
    }
  } catch (error) {
    Utils.error("EMOJI-TRIGGER", error);
  }
}

// ════════════
// 💬 MESSAGE COMMANDS
// ════════════════════════════════════════════════════════════

async function handleCommands(sock, msg) {
  const text = Utils.getMessageText(msg);
  if (!text) return;
  if (!text.startsWith(BOT_CONFIG.PREFIX)) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!Utils.isOwner(senderJid)) {
    return;
  }

  const [cmd,...args] = text.slice(BOT_CONFIG.PREFIX.length).trim().split(" ");
  const command = cmd.toLowerCase();
  const jid = msg.key.remoteJid;

  Utils.log("COMMAND", `/${command} by owner`);

  try {
    switch (command) {
      case "ping":
        await sock.sendMessage(jid, {
          text: "🏓 *Pong!* Bot is alive.",
        });
        break;

      case "status":
        const features = BOT_CONFIG.FEATURES;
        const status = `
🤖 *Bot Status*

✅ Anti Delete: ${features.ANTI_DELETE? "ON" : "OFF"}
✅ Anti Edit: ${features.ANTI_EDIT? "ON" : "OFF"}
✅ Anti View Once: ${features.ANTI_VIEW_ONCE? "ON" : "OFF"}
✅ Emoji Triggers: ${features.EMOJI_TRIGGERS? "ON" : "OFF"}
✅ Last Seen: ALWAYS OFF 🕐
✅ Private Mode: ${features.PRIVATE_MODE? "ON" : "OFF"}

🕐 Time: ${Utils.getTime()}
📱 Owner: ${BOT_CONFIG.OWNER_PHONE}
`;
        await sock.sendMessage(jid, { text: status });
        break;

      case "antidelete":
        BOT_CONFIG.FEATURES.ANTI_DELETE =!BOT_CONFIG.FEATURES.ANTI_DELETE;
        await sock.sendMessage(jid, {
          text: `🗑️ Anti-Delete: *${BOT_CONFIG.FEATURES.ANTI_DELETE? "ON" : "OFF"}*`,
        });
        break;

      case "antiedit":
        BOT_CONFIG.FEATURES.ANTI_EDIT =!BOT_CONFIG.FEATURES.ANTI_EDIT;
        await sock.sendMessage(jid, {
          text: `✏️ Anti-Edit: *${BOT_CONFIG.FEATURES.ANTI_EDIT? "ON" : "OFF"}*`,
        });
        break;

      case "antiviewonce":
        BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE =!BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE;
        await sock.sendMessage(jid, {
          text: `👁️ Anti-View-Once: *${BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE? "ON" : "OFF"}*`,
        });
        break;

      case "emoji":
        BOT_CONFIG.FEATURES.EMOJI_TRIGGERS =!BOT_CONFIG.FEATURES.EMOJI_TRIGGERS;
        await sock.sendMessage(jid, {
          text: `😭 Emoji Triggers: *${BOT_CONFIG.FEATURES.EMOJI_TRIGGERS? "ON" : "OFF"}*`,
        });
        break;

      case "help":
        const help = `
╔════════════╗
║ 🤖 BOT COMMANDS ║
╚════════════╝

${BOT_CONFIG.PREFIX}ping - Check status
${BOT_CONFIG.PREFIX}status - All features
${BOT_CONFIG.PREFIX}antidelete - Toggle
${BOT_CONFIG.PREFIX}antiedit - Toggle
${BOT_CONFIG.PREFIX}antiviewonce - Toggle
${BOT_CONFIG.PREFIX}emoji - Toggle
${BOT_CONFIG.PREFIX}logs - Captured count
${BOT_CONFIG.PREFIX}help - This message
`;
        await sock.sendMessage(jid, { text: help });
        break;

      case "logs":
        const deletedCount = storage.deletedMessages.size;
        const editedCount = storage.editedMessages.size;
        const logs = `
📊 *Bot Logs*

🗑️ Deleted: ${deletedCount}
✏️ Edited: ${editedCount}
👁️ View-Once: ${storage.viewOnceMedia.size}

🕐 Time: ${Utils.getTime()}
`;
        await sock.sendMessage(jid, { text: logs });
        break;

      default:
        await sock.sendMessage(jid, {
          text: `❌ Unknown: ${BOT_CONFIG.PREFIX}${command}\n\nUse ${BOT_CONFIG.PREFIX}help`,
        });
    }
  } catch (error) {
    Utils.error("COMMAND", error);
    await sock.sendMessage(jid, {
      text: `❌ Error: ${error.message}`,
    });
  }
}

// ════════════
// 🔌 BOT CONNECTION - PAIRING CODE VERSION
// ════════════

async function startBot() {
  console.log("\n");
  console.log("╔════════════╗");
  console.log("║ 🤖 WHATSAPP BOT v2.1 - Starting... ║");
  console.log("╚════════════╝\n");

  const { state, saveCreds } = await useMultiFileAuthState("./bot_session");

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.0.0"],
    syncFullHistory: false,
    shouldIgnoreJid: () => false,
    defaultQueryTimeoutMs: 0,
    retryRequestDelayMs: 100,
    maxMsgsInMemory: 100,
    fireInitQueries: false,
    emitOwnEvents: true,
    markOnlineOnConnect: true,
  });

  // PAIRING CODE LOGIN
  if (!sock.authState.creds.registered) {
    const rl = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const question = (text) => new Promise((resolve) => rl.question(text, resolve));

    const phoneNumber = await question("Enter your number with country code [923xx...]: ");
    rl.close();

    const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ""));
    console.log(`\n✅ Pairing Code: ${code}\n`);
    console.log("WhatsApp > Linked Devices > Link with phone number > Enter this code\n");
  }

  // Connection updates
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      console.log(`⏳ Connecting...`);
    }

    if (connection === "open") {
      console.log(`\n✅ BOT CONNECTED!\n`);
      console.log(`🕐 Time: ${Utils.getTime()}`);
      console.log(`📱 Owner: ${BOT_CONFIG.OWNER_PHONE}`);
      console.log(`✅ Private Mode: ON`);
      console.log(`✅ Last Seen: OFF`);
      console.log(`\n🟢 BOT IS LIVE!\n`);

      try {
        await sock.sendPresenceUpdate("unavailable");
      } catch (e) {}
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;

      console.log(
        `⚠️ Connection closed. Code: ${lastDisconnect?.error?.output?.statusCode}`
      );

      if (shouldReconnect) {
        console.log(`🔄 Reconnecting in 10 seconds...`);
        setTimeout(startBot, 10000);
      } else {
        console.log(`🔐 Logged out. Delete./bot_session and restart.`);
        process.exit(0);
      }
    }
  });

  // Save credentials
  sock.ev.on("creds.update", saveCreds);

  // Handle messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const text = Utils.getMessageText(msg);

      if (BOT_CONFIG.FEATURES.PRIVATE_MODE &&!Utils.isOwner(senderJid)) {
        continue;
      }

      storage.saveMessage(jid, msg.key.id, {
        senderJid,
        text,
        type: Utils.getMessageType(msg),
      });

      if (type === "notify") {
        await handleViewOnceMessage(sock, msg);
        await handleEmojiTriggers(sock, msg);
        await handleCommands(sock, msg);
      }
    }
  });

  // Handle deleted messages
  sock.ev.on("messages.delete", async (item) => {
    if (item.keys) {
      for (const key of item.keys) {
        await handleDeletedMessage(sock, key);
      }
    }
  });

  // Handle edited messages
  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      if (update.update?.message) {
        await handleEditedMessage(sock, {
          key: update.key,
          message: update.update.message,
        });
      }
    }
  });

  return sock;
}

// ════════════
// 🚀 START
// ════════════

startBot().catch(console.error);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Bot shutting down...");
  process.exit(0);
});
// ════════════════════════════════════════════════════════════════════════════
// 🗄️  MESSAGE STORAGE
// ════════════════════════════════════════════════════════════════════════════

class MessageStorage {
  constructor() {
    this.messages = new Map();
    this.deletedMessages = new Map();
    this.editedMessages = new Map();
    this.viewOnceMedia = new Map();
  }

  saveMessage(jid, msgId, messageData) {
    if (!this.messages.has(jid)) {
      this.messages.set(jid, new Map());
    }
    this.messages.get(jid).set(msgId, {
      ...messageData,
      timestamp: new Date(),
    });
  }

  addDeletedMessage(jid, message) {
    if (!this.deletedMessages.has(jid)) {
      this.deletedMessages.set(jid, []);
    }
    this.deletedMessages.get(jid).push({
      ...message,
      deletedAt: new Date(),
    });
  }

  addEditedMessage(jid, original, edited) {
    if (!this.editedMessages.has(jid)) {
      this.editedMessages.set(jid, []);
    }
    this.editedMessages.get(jid).push({
      original,
      edited,
      editedAt: new Date(),
    });
  }

  saveViewOnceMedia(msgId, mediaData) {
    this.viewOnceMedia.set(msgId, {
      ...mediaData,
      savedAt: new Date(),
    });
  }
}

const storage = new MessageStorage();

// ════════════════════════════════════════════════════════════════════════════
// 🛠️  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

const Utils = {
  formatPhone(jid) {
    return jid ? jid.split("@")[0] : "Unknown";
  },

  isOwner(jid) {
    const senderJid = jid ? jid.split("@")[0] : "";
    return senderJid === BOT_CONFIG.OWNER_PHONE;
  },

  getTime() {
    return new Date().toLocaleString("en-PK", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  },

  getMessageText(msg) {
    const m = msg.message;
    if (!m) return null;
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.audioMessage?.caption ||
      null
    );
  },

  getMessageType(msg) {
    const m = msg.message;
    if (!m) return "unknown";
    if (m.conversation) return "text";
    if (m.imageMessage) return "image";
    if (m.videoMessage) return "video";
    if (m.audioMessage) return "audio";
    return Object.keys(m)[0] || "unknown";
  },

  log(title, message) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.log(
      `\x1b[36m[${this.getTime()}]\x1b[0m \x1b[33m${title}\x1b[0m: ${message}`
    );
  },

  error(title, error) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.error(
      `\x1b[36m[${this.getTime()}]\x1b[0m \x1b[31m[ERROR] ${title}\x1b[0m:`,
      error.message
    );
  },
};

// ════════════════════════════════════════════════════════════════════════════
// 👁️  ANTI VIEW-ONCE
// ════════════════════════════════════════════════════════════════════════════

async function handleViewOnceMessage(sock, msg) {
  if (!BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE) return;

  const message = msg.message;
  if (!message) return;

  const viewOnce =
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message;

  if (!viewOnce) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const sender = Utils.formatPhone(senderJid);
  const jid = msg.key.remoteJid;

  Utils.log("ANTI-VIEW-ONCE", `Detected from ${sender}`);

  try {
    let mediaType = null;
    let mediaMsg = null;

    if (viewOnce.imageMessage) {
      mediaType = "image";
      mediaMsg = viewOnce.imageMessage;
    } else if (viewOnce.videoMessage) {
      mediaType = "video";
      mediaMsg = viewOnce.videoMessage;
    } else if (viewOnce.audioMessage) {
      mediaType = "audio";
      mediaMsg = viewOnce.audioMessage;
    }

    if (!mediaMsg) return;

    const buffer = await downloadMediaMessage(
      { ...msg, message: viewOnce },
      "buffer",
      {},
      {
        logger: pino({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    storage.saveViewOnceMedia(msg.key.id, {
      sender,
      mediaType,
      buffer,
    });

    const inboxJid = BOT_CONFIG.INBOX_JID;
    const caption = `👁️ *Anti View-Once Alert*\n\n📱 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📌 Type: ${mediaType.toUpperCase()}\n\n✅ Media saved!`;

    if (mediaType === "image") {
      await sock.sendMessage(inboxJid, {
        image: buffer,
        caption,
      });
    } else if (mediaType === "video") {
      await sock.sendMessage(inboxJid, {
        video: buffer,
        caption,
      });
    } else if (mediaType === "audio") {
      await sock.sendMessage(inboxJid, {
        audio: buffer,
        mimetype: "audio/mpeg",
        caption,
      });
    }

    Utils.log("VIEW-ONCE-SAVED", `Media saved`);
  } catch (error) {
    Utils.error("VIEW-ONCE", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🗑️  ANTI DELETE
// ════════════════════════════════════════════════════════════════════════════

async function handleDeletedMessage(sock, deletedKey) {
  if (!BOT_CONFIG.FEATURES.ANTI_DELETE) return;

  const jid = deletedKey.remoteJid;
  const msgId = deletedKey.id;

  const originalMsg = storage.messages.get(jid)?.get(msgId);
  if (!originalMsg) return;

  const sender = Utils.formatPhone(originalMsg.senderJid);
  const text = originalMsg.text || "[Media Message]";
  const msgType = originalMsg.type;

  Utils.log("ANTI-DELETE", `Message deleted by ${sender}`);

  try {
    storage.addDeletedMessage(jid, { sender, text, type: msgType });

    const inboxJid = BOT_CONFIG.INBOX_JID;
    const message = `🗑️ *Anti-Delete Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📋 Type: ${msgType}\n\n💬 *Message:*\n${text}`;

    await sock.sendMessage(inboxJid, { text: message });

    Utils.log("ANTI-DELETE-SAVED", `Alert sent`);
  } catch (error) {
    Utils.error("ANTI-DELETE", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ✏️  ANTI EDIT
// ════════════════════════════════════════════════════════════════════════════

async function handleEditedMessage(sock, msg) {
  if (!BOT_CONFIG.FEATURES.ANTI_EDIT) return;

  const message = msg.message;
  if (!message) return;

  const editedMsg =
    message.editedMessage ||
    (message.protocolMessage?.type === 14 && message.protocolMessage?.editedMessage);

  if (!editedMsg) return;

  const jid = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const sender = Utils.formatPhone(senderJid);
  const msgId = msg.key.id;

  const originalMsg = storage.messages.get(jid)?.get(msgId);
  const originalText = originalMsg?.text || "[Not in cache]";

  const newText =
    editedMsg.conversation ||
    editedMsg.extendedTextMessage?.text ||
    editedMsg.message?.conversation ||
    "[Unknown]";

  Utils.log("ANTI-EDIT", `Message edited by ${sender}`);

  try {
    storage.addEditedMessage(jid, originalText, newText);

    const inboxJid = BOT_CONFIG.INBOX_JID;
    const message_text = `✏️ *Anti-Edit Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n\n📝 *Original:*\n${originalText}\n\n🔄 *Edited To:*\n${newText}`;

    await sock.sendMessage(inboxJid, { text: message_text });

    Utils.log("ANTI-EDIT-SAVED", `Alert sent`);
  } catch (error) {
    Utils.error("ANTI-EDIT", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 😭 EMOJI TRIGGERS
// ════════════════════════════════════════════════════════════════════════════

async function handleEmojiTriggers(sock, msg) {
  if (!BOT_CONFIG.FEATURES.EMOJI_TRIGGERS) return;

  const text = Utils.getMessageText(msg);
  if (!text) return;

  const lowerText = text.toLowerCase();

  try {
    for (const [emoji, keywords] of Object.entries(BOT_CONFIG.EMOJI_TRIGGERS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          await sock.sendMessage(msg.key.remoteJid, {
            react: {
              text: emoji,
              key: msg.key,
            },
          });

          Utils.log("EMOJI-TRIGGER", `${emoji} by "${keyword}"`);
          return;
        }
      }
    }
  } catch (error) {
    Utils.error("EMOJI-TRIGGER", error);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 💬 MESSAGE COMMANDS
// ════════════════════════════════════════════════════════════════════════════

async function handleCommands(sock, msg) {
  const text = Utils.getMessageText(msg);
  if (!text) return;
  if (!text.startsWith(BOT_CONFIG.PREFIX)) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!Utils.isOwner(senderJid)) {
    return;
  }

  const [cmd, ...args] = text.slice(BOT_CONFIG.PREFIX.length).trim().split(" ");
  const command = cmd.toLowerCase();
  const jid = msg.key.remoteJid;

  Utils.log("COMMAND", `/${command} by owner`);

  try {
    switch (command) {
      case "ping":
        await sock.sendMessage(jid, {
          text: "🏓 *Pong!* Bot is alive.",
        });
        break;

      case "status":
        const features = BOT_CONFIG.FEATURES;
        const status = `
🤖 *Bot Status*

✅ Anti Delete: ${features.ANTI_DELETE ? "ON" : "OFF"}
✅ Anti Edit: ${features.ANTI_EDIT ? "ON" : "OFF"}
✅ Anti View Once: ${features.ANTI_VIEW_ONCE ? "ON" : "OFF"}
✅ Emoji Triggers: ${features.EMOJI_TRIGGERS ? "ON" : "OFF"}
✅ Last Seen: ALWAYS OFF 🕐
✅ Private Mode: ${features.PRIVATE_MODE ? "ON" : "OFF"}

🕐 Time: ${Utils.getTime()}
📱 Owner: 923356331700
`;
        await sock.sendMessage(jid, { text: status });
        break;

      case "antidelete":
        BOT_CONFIG.FEATURES.ANTI_DELETE = !BOT_CONFIG.FEATURES.ANTI_DELETE;
        await sock.sendMessage(jid, {
          text: `🗑️ Anti-Delete: *${BOT_CONFIG.FEATURES.ANTI_DELETE ? "ON" : "OFF"}*`,
        });
        break;

      case "antiedit":
        BOT_CONFIG.FEATURES.ANTI_EDIT = !BOT_CONFIG.FEATURES.ANTI_EDIT;
        await sock.sendMessage(jid, {
          text: `✏️ Anti-Edit: *${BOT_CONFIG.FEATURES.ANTI_EDIT ? "ON" : "OFF"}*`,
        });
        break;

      case "antiviewonce":
        BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE = !BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE;
        await sock.sendMessage(jid, {
          text: `👁️ Anti-View-Once: *${BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE ? "ON" : "OFF"}*`,
        });
        break;

      case "emoji":
        BOT_CONFIG.FEATURES.EMOJI_TRIGGERS = !BOT_CONFIG.FEATURES.EMOJI_TRIGGERS;
        await sock.sendMessage(jid, {
          text: `😭 Emoji Triggers: *${BOT_CONFIG.FEATURES.EMOJI_TRIGGERS ? "ON" : "OFF"}*`,
        });
        break;

      case "help":
        const help = `
╔════════════════════════════════════╗
║       🤖 BOT COMMANDS              ║
╚════════════════════════════════════╝

${BOT_CONFIG.PREFIX}ping - Check status
${BOT_CONFIG.PREFIX}status - All features
${BOT_CONFIG.PREFIX}antidelete - Toggle
${BOT_CONFIG.PREFIX}antiedit - Toggle
${BOT_CONFIG.PREFIX}antiviewonce - Toggle
${BOT_CONFIG.PREFIX}emoji - Toggle
${BOT_CONFIG.PREFIX}logs - Captured count
${BOT_CONFIG.PREFIX}help - This message
`;
        await sock.sendMessage(jid, { text: help });
        break;

      case "logs":
        const deletedCount = storage.deletedMessages.size;
        const editedCount = storage.editedMessages.size;
        const logs = `
📊 *Bot Logs*

🗑️ Deleted: ${deletedCount}
✏️ Edited: ${editedCount}
👁️ View-Once: ${storage.viewOnceMedia.size}

🕐 Time: ${Utils.getTime()}
`;
        await sock.sendMessage(jid, { text: logs });
        break;

      default:
        await sock.sendMessage(jid, {
          text: `❌ Unknown: ${BOT_CONFIG.PREFIX}${command}\n\nUse ${BOT_CONFIG.PREFIX}help`,
        });
    }
  } catch (error) {
    Utils.error("COMMAND", error);
    await sock.sendMessage(jid, {
      text: `❌ Error: ${error.message}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🔌 BOT CONNECTION
// ════════════════════════════════════════════════════════════════════════════

async function startBot() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         🤖 WHATSAPP BOT v2.1 - 923356331700              ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const { state, saveCreds } = await useMultiFileAuthState("./bot_session");

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.0.0"],
    syncFullHistory: false,
    shouldIgnoreJid: () => false,
    defaultQueryTimeoutMs: 0,
    retryRequestDelayMs: 100,
    maxMsgsInMemory: 100,
    fireInitQueries: false,
    emitOwnEvents: true,
    markOnlineOnConnect: true,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 QR Code - Scan with WhatsApp:\n");
    }

    if (connection === "connecting") {
      console.log(`⏳ Connecting...`);
    }

    if (connection === "open") {
      console.log(`\n✅ BOT CONNECTED!\n`);
      console.log(`🕐 Time: ${Utils.getTime()}`);
      console.log(`📱 Owner: 923356331700`);
      console.log(`✅ Private Mode: ON`);
      console.log(`✅ Last Seen: OFF`);
      console.log(`\n🟢 BOT IS LIVE!\n`);

      try {
        await sock.sendPresenceUpdate("unavailable");
      } catch (e) {
        //
      }
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log(
        `⚠️ Connection closed. Code: ${lastDisconnect?.error?.output?.statusCode}`
      );

      if (shouldReconnect) {
        console.log(`🔄 Reconnecting in 10 seconds...`);
        setTimeout(startBot, 10000);
      } else {
        console.log(`🔐 Logged out. Delete ./bot_session and restart.`);
        process.exit(0);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const text = Utils.getMessageText(msg);

      if (BOT_CONFIG.FEATURES.PRIVATE_MODE && !Utils.isOwner(senderJid)) {
        continue;
      }

      storage.saveMessage(jid, msg.key.id, {
        senderJid,
        text,
        type: Utils.getMessageType(msg),
      });

      if (type === "notify") {
        await handleViewOnceMessage(sock, msg);
        await handleEmojiTriggers(sock, msg);
        await handleCommands(sock, msg);
      }
    }
  });

  sock.ev.on("messages.delete", async (item) => {
    if (item.keys) {
      for (const key of item.keys) {
        await handleDeletedMessage(sock, key);
      }
    }
  });

  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      if (update.update?.message) {
        await handleEditedMessage(sock, {
          key: update.key,
          message: update.update.message,
        });
      }
    }
  });

  return sock;
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀 START
// ════════════════════════════════════════════════════════════════════════════

startBot().catch(console.error);

process.on("SIGINT", () => {
  console.log("\n\n👋 Bot shutting down...");
  process.exit(0);
});
