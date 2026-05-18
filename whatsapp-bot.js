/**
 * ╔════════╗
 * ║ WHATSAPP BOT v2.1 - PAIRING CODE VERSION ║
 * ║ ✅ Anti Delete | Anti Edit | Anti View Once | Emoji Triggers ║
 * ║ ✅ Private Mode | Pairing Code Login ║
 * ╚════════╝
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const crypto = require("crypto");

// ════════════
// ⚙️ CONFIGURATION
// ════════════

const BOT_CONFIG = {
  OWNER_PHONE: process.env.OWNER_PHONE || "923356331700",
  INBOX_JID: process.env.INBOX_JID || "923356331700@s.whatsapp.net",
  PAIRING_NUMBER: process.env.PAIRING_NUMBER || null,

  FEATURES: {
    ANTI_DELETE: true,
    ANTI_EDIT: true,
    ANTI_VIEW_ONCE: true,
    EMOJI_TRIGGERS: true,
    HIDE_LAST_SEEN: true,
    PRIVATE_MODE: true,
  },

  EMOJI_TRIGGERS: {
    "😭": ["rona", "sad", "ro", "udas", "pain", "hurt", "cry", "roona"],
    "😂": ["haha", "lol", "funny", "mazak", "joke", "hasna"],
    "❤️": ["love", "pyar", "sweet", "dhanyavaad", "shukria"],
    "🔥": ["fire", "nice", "awesome", "cool", "great", "bahut"],
    "👍": ["ok", "theek", "sahi", "good", "yes", "bilkul"],
  },

  PREFIX: "/",
  ENABLE_LOGGING: true,
};

// ════════════
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

// ════════════
// 🛠️ UTILITY FUNCTIONS
// ════════════

const Utils = {
  formatPhone(jid) {
    return jid? jid.split("@")[0] : "Unknown";
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
    console.log(`\x1b[36m[${this.getTime()}]\x1b[0m \x1b[33m${title}\x1b[0m: ${message}`);
  },

  error(title, error) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.error(`\x1b[36m[${this.getTime()}]\x1b[0m \x1b[31m[ERROR] ${title}\x1b[0m:`, error.message);
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
      { logger: pino({ level: "silent" }), reuploadRequest: sock.updateMediaMessage }
    );

    storage.saveViewOnceMedia(msg.key.id, {
      sender,
      mediaType,
      buffer,
      caption: mediaMsg.caption || "View Once Media",
    });

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const caption = `👁️ *Anti View-Once Alert*\n\n📱 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📌 Type: ${mediaType.toUpperCase()}`;

    if (mediaType === "image") {
      await sock.sendMessage(inboxJid, { image: buffer, caption });
    } else if (mediaType === "video") {
      await sock.sendMessage(inboxJid, { video: buffer, caption });
    } else if (mediaType === "audio") {
      await sock.sendMessage(inboxJid, { audio: buffer, mimetype: "audio/mpeg", caption });
    }
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
    storage.addDeletedMessage(jid, { sender, text, type: msgType });
    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message = `🗑️ *Anti-Delete Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n💬 *Message:*\n${text}`;
    await sock.sendMessage(inboxJid, { text: message });
  } catch (error) {
    Utils.error("ANTI-DELETE", error);
  }
}

// ════════════
// ✏️ ANTI EDIT
// ════════════

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
  const newText = editedMsg.conversation || editedMsg.extendedTextMessage?.text || "[Unknown]";

  Utils.log("ANTI-EDIT", `Message edited by ${sender}`);
  try {
    storage.addEditedMessage(jid, originalText, newText);
    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message_text = `✏️ *Anti-Edit Alert*\n\n👤 From: @${sender}\n📝 *Original:*\n${originalText}\n\n🔄 *Edited To:*\n${newText}`;
    await sock.sendMessage(inboxJid, { text: message_text });
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
            react: { text: emoji, key: msg.key },
          });
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
// ════════════

async function handleCommands(sock, msg) {
  const text = Utils.getMessageText(msg);
  if (!text) return;
  if (!text.startsWith(BOT_CONFIG.PREFIX)) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  if (!Utils.isOwner(senderJid)) return;

  const [cmd] = text.slice(BOT_CONFIG.PREFIX.length).trim().split(" ");
  const command = cmd.toLowerCase();
  const jid = msg.key.remoteJid;

  Utils.log("COMMAND", `/${command} by owner`);

  try {
    switch (command) {
      case "ping":
        await sock.sendMessage(jid, { text: "🏓 Pong! Bot is alive." });
        break;
      case "status":
        const features = BOT_CONFIG.FEATURES;
        const status = `🤖 *Bot Status*\n\n✅ Anti Delete: ${features.ANTI_DELETE? "ON" : "OFF"}\n✅ Anti Edit: ${features.ANTI_EDIT? "ON" : "OFF"}\n✅ Anti View Once: ${features.ANTI_VIEW_ONCE? "ON" : "OFF"}\n🕐 Time: ${Utils.getTime()}`;
        await sock.sendMessage(jid, { text: status });
        break;
      case "help":
        const help = `🤖 *Commands*\n${BOT_CONFIG.PREFIX}ping\n${BOT_CONFIG.PREFIX}status\n${BOT_CONFIG.PREFIX}help`;
        await sock.sendMessage(jid, { text: help });
        break;
      default:
        await sock.sendMessage(jid, { text: `❌ Unknown: ${BOT_CONFIG.PREFIX}${command}` });
    }
  } catch (error) {
    Utils.error("COMMAND", error);
  }
}

// ════════════
// 🔌 BOT CONNECTION - PAIRING CODE
// ════════════

async function startBot() {
  console.log("\n╔════════╗");
  console.log("║ 🤖 WHATSAPP BOT v2.1 - Starting... ║");
  console.log("╚════════╝\n");

  const { state, saveCreds } = await useMultiFileAuthState("./bot_session");

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.0.0"],
    syncFullHistory: false,
  });

  if (!sock.authState.creds.registered) {
    const phoneNumber = BOT_CONFIG.PAIRING_NUMBER;

    if (!phoneNumber) {
      console.log("❌ PAIRING_NUMBER env variable set nahi hai!");
      console.log("Railway > Variables me PAIRING_NUMBER=923356331700 add karo");
      process.exit(1);
    }

    const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ""));
    console.log(`\n✅ PAIRING CODE: ${code}\n`);
    console.log("WhatsApp > Linked Devices > Link with phone number > Code enter karo\n");
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      console.log("⏳ Connecting...");
    }

    if (connection === "open") {
      console.log(`\n✅ BOT CONNECTED!\n`);
      console.log(`🕐 Time: ${Utils.getTime()}`);
      console.log(`📱 Owner: ${BOT_CONFIG.OWNER_PHONE}`);
      console.log("\n🟢 BOT IS LIVE!\n");
      await sock.sendPresenceUpdate("unavailable");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;

      console.log(`⚠️ Connection closed. Code: ${lastDisconnect?.error?.output?.statusCode}`);

      if (shouldReconnect) {
        console.log("🔄 Reconnecting in 10s...");
        setTimeout(startBot, 10000);
      } else {
        console.log("🔐 Logged out. Delete./bot_session and restart.");
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

startBot().catch(console.error);

process.on("SIGINT", () => {
  console.log("\n\n👋 Bot shutting down...");
  process.exit(0);
});     ...messageData,
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

// ════════════
// 🛠️ UTILITY FUNCTIONS
// ════════════

const Utils = {
  formatPhone(jid) {
    return jid? jid.split("@")[0] : "Unknown";
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
    console.log(`\x1b[36m[${this.getTime()}]\x1b[0m \x1b[33m${title}\x1b[0m: ${message}`);
  },

  error(title, error) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.error(`\x1b[36m[${this.getTime()}]\x1b[0m \x1b[31m[ERROR] ${title}\x1b[0m:`, error.message);
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
      { logger: pino({ level: "silent" }), reuploadRequest: sock.updateMediaMessage }
    );

    storage.saveViewOnceMedia(msg.key.id, {
      sender,
      mediaType,
      buffer,
      caption: mediaMsg.caption || "View Once Media",
    });

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const caption = `👁️ *Anti View-Once Alert*\n\n📱 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📌 Type: ${mediaType.toUpperCase()}`;

    if (mediaType === "image") {
      await sock.sendMessage(inboxJid, { image: buffer, caption });
    } else if (mediaType === "video") {
      await sock.sendMessage(inboxJid, { video: buffer, caption });
    } else if (mediaType === "audio") {
      await sock.sendMessage(inboxJid, { audio: buffer, mimetype: "audio/mpeg", caption });
    }
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
    storage.addDeletedMessage(jid, { sender, text, type: msgType });
    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message = `🗑️ *Anti-Delete Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n💬 *Message:*\n${text}`;
    await sock.sendMessage(inboxJid, { text: message });
  } catch (error) {
    Utils.error("ANTI-DELETE", error);
  }
}

// ════════════
// ✏️ ANTI EDIT
// ════════════

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
  const newText = editedMsg.conversation || editedMsg.extendedTextMessage?.text || "[Unknown]";

  Utils.log("ANTI-EDIT", `Message edited by ${sender}`);
  try {
    storage.addEditedMessage(jid, originalText, newText);
    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message_text = `✏️ *Anti-Edit Alert*\n\n👤 From: @${sender}\n📝 *Original:*\n${originalText}\n\n🔄 *Edited To:*\n${newText}`;
    await sock.sendMessage(inboxJid, { text: message_text });
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
            react: { text: emoji, key: msg.key },
          });
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
// ════════════

async function handleCommands(sock, msg) {
  const text = Utils.getMessageText(msg);
  if (!text) return;
  if (!text.startsWith(BOT_CONFIG.PREFIX)) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  if (!Utils.isOwner(senderJid)) return;

  const [cmd] = text.slice(BOT_CONFIG.PREFIX.length).trim().split(" ");
  const command = cmd.toLowerCase();
  const jid = msg.key.remoteJid;

  Utils.log("COMMAND", `/${command} by owner`);

  try {
    switch (command) {
      case "ping":
        await sock.sendMessage(jid, { text: "🏓 Pong! Bot is alive." });
        break;
      case "status":
        const features = BOT_CONFIG.FEATURES;
        const status = `🤖 *Bot Status*\n\n✅ Anti Delete: ${features.ANTI_DELETE? "ON" : "OFF"}\n✅ Anti Edit: ${features.ANTI_EDIT? "ON" : "OFF"}\n✅ Anti View Once: ${features.ANTI_VIEW_ONCE? "ON" : "OFF"}\n🕐 Time: ${Utils.getTime()}`;
        await sock.sendMessage(jid, { text: status });
        break;
      case "help":
        const help = `🤖 *Commands*\n${BOT_CONFIG.PREFIX}ping\n${BOT_CONFIG.PREFIX}status\n${BOT_CONFIG.PREFIX}help`;
        await sock.sendMessage(jid, { text: help });
        break;
      default:
        await sock.sendMessage(jid, { text: `❌ Unknown: ${BOT_CONFIG.PREFIX}${command}` });
    }
  } catch (error) {
    Utils.error("COMMAND", error);
  }
}

// ════════════
// 🔌 BOT CONNECTION - PAIRING CODE
// ════════════

async function startBot() {
  console.log("\n╔════════╗");
  console.log("║ 🤖 WHATSAPP BOT v2.1 - Starting... ║");
  console.log("╚════════╝\n");

  const { state, saveCreds } = await useMultiFileAuthState("./bot_session");

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.0.0"],
    syncFullHistory: false,
  });

  // PAIRING CODE LOGIN
  if (!sock.authState.creds.registered) {
    const phoneNumber = BOT_CONFIG.PAIRING_NUMBER;

    if (!phoneNumber) {
      console.log("❌ PAIRING_NUMBER env variable set nahi hai!");
      console.log("Railway > Variables me PAIRING_NUMBER=923356331700 add karo");
      process.exit(1);
    }

    const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ""));
    console.log(`\n✅ PAIRING CODE: ${code}\n`);
    console.log("WhatsApp > Linked Devices > Link with phone number > Code enter karo\n");
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      console.log("⏳ Connecting...");
    }

    if (connection === "open") {
      console.log(`\n✅ BOT CONNECTED!\n`);
      console.log(`🕐 Time: ${Utils.getTime()}`);
      console.log(`📱 Owner: ${BOT_CONFIG.OWNER_PHONE}`);
      console.log("\n🟢 BOT IS LIVE!\n");
      await sock.sendPresenceUpdate("unavailable");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;

      console.log(`⚠️ Connection closed. Code: ${lastDisconnect?.error?.output?.statusCode}`);

      if (shouldReconnect) {
        console.log("🔄 Reconnecting in 10s...");
        setTimeout(startBot, 10000);
      } else {
        console.log("🔐 Logged out. Delete./bot_session and restart.");
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

startBot().catch(console.error);

process.on("SIGINT", () => {
  console.log("\n\n👋 Bot shutting down...");
  process.exit(0);
});    ...messageData,
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

// ════════════
// 🛠️ UTILITY FUNCTIONS
// ════════════

const Utils = {
  formatPhone(jid) {
    return jid? jid.split("@")[0] : "Unknown";
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
    console.log(`\x1b[36m[${this.getTime()}]\x1b[0m \x1b[33m${title}\x1b[0m: ${message}`);
  },

  error(title, error) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.error(`\x1b[36m[${this.getTime()}]\x1b[0m \x1b[31m[ERROR] ${title}\x1b[0m:`, error.message);
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
      { logger: pino({ level: "silent" }), reuploadRequest: sock.updateMediaMessage }
    );

    storage.saveViewOnceMedia(msg.key.id, {
      sender,
      mediaType,
      buffer,
      caption: mediaMsg.caption || "View Once Media",
    });

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const caption = `👁️ *Anti View-Once Alert*\n\n📱 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📌 Type: ${mediaType.toUpperCase()}`;

    if (mediaType === "image") {
      await sock.sendMessage(inboxJid, { image: buffer, caption });
    } else if (mediaType === "video") {
      await sock.sendMessage(inboxJid, { video: buffer, caption });
    } else if (mediaType === "audio") {
      await sock.sendMessage(inboxJid, { audio: buffer, mimetype: "audio/mpeg", caption });
    }
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
    storage.addDeletedMessage(jid, { sender, text, type: msgType });
    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message = `🗑️ *Anti-Delete Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n💬 *Message:*\n${text}`;
    await sock.sendMessage(inboxJid, { text: message });
  } catch (error) {
    Utils.error("ANTI-DELETE", error);
  }
}

// ════════════
// ✏️ ANTI EDIT
// ════════════

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
  const newText = editedMsg.conversation || editedMsg.extendedTextMessage?.text || "[Unknown]";

  Utils.log("ANTI-EDIT", `Message edited by ${sender}`);
  try {
    storage.addEditedMessage(jid, originalText, newText);
    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const message_text = `✏️ *Anti-Edit Alert*\n\n👤 From: @${sender}\n📝 *Original:*\n${originalText}\n\n🔄 *Edited To:*\n${newText}`;
    await sock.sendMessage(inboxJid, { text: message_text });
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
            react: { text: emoji, key: msg.key },
          });
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
// ════════════

async function handleCommands(sock, msg) {
  const text = Utils.getMessageText(msg);
  if (!text) return;
  if (!text.startsWith(BOT_CONFIG.PREFIX)) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  if (!Utils.isOwner(senderJid)) return;

  const [cmd] = text.slice(BOT_CONFIG.PREFIX.length).trim().split(" ");
  const command = cmd.toLowerCase();
  const jid = msg.key.remoteJid;

  Utils.log("COMMAND", `/${command} by owner`);

  try {
    switch (command) {
      case "ping":
        await sock.sendMessage(jid, { text: "🏓 Pong! Bot is alive." });
        break;
      case "status":
        const features = BOT_CONFIG.FEATURES;
        const status = `🤖 *Bot Status*\n\n✅ Anti Delete: ${features.ANTI_DELETE? "ON" : "OFF"}\n✅ Anti Edit: ${features.ANTI_EDIT? "ON" : "OFF"}\n✅ Anti View Once: ${features.ANTI_VIEW_ONCE? "ON" : "OFF"}\n🕐 Time: ${Utils.getTime()}`;
        await sock.sendMessage(jid, { text: status });
        break;
      case "help":
        const help = `🤖 *Commands*\n${BOT_CONFIG.PREFIX}ping\n${BOT_CONFIG.PREFIX}status\n${BOT_CONFIG.PREFIX}help`;
        await sock.sendMessage(jid, { text: help });
        break;
      default:
        await sock.sendMessage(jid, { text: `❌ Unknown: ${BOT_CONFIG.PREFIX}${command}` });
    }
  } catch (error) {
    Utils.error("COMMAND", error);
  }
}

// ════════════
// 🔌 BOT CONNECTION - PAIRING CODE
// ════════════

async function startBot() {
  console.log("\n╔════════╗");
  console.log("║ 🤖 WHATSAPP BOT v2.1 - Starting... ║");
  console.log("╚════════╝\n");

  const { state, saveCreds } = await useMultiFileAuthState("./bot_session");

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.0.0"],
    syncFullHistory: false,
  });

  // PAIRING CODE LOGIN
  if (!sock.authState.creds.registered) {
    const phoneNumber = BOT_CONFIG.PAIRING_NUMBER;

    if (!phoneNumber) {
      console.log("❌ PAIRING_NUMBER env variable set nahi hai!");
      console.log("Railway > Variables me PAIRING_NUMBER=923356331700 add karo");
      process.exit(1);
    }

    const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ""));
    console.log(`\n✅ PAIRING CODE: ${code}\n`);
    console.log("WhatsApp > Linked Devices > Link with phone number > Code enter karo\n");
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      console.log("⏳ Connecting...");
    }

    if (connection === "open") {
      console.log(`\n✅ BOT CONNECTED!\n`);
      console.log(`🕐 Time: ${Utils.getTime()}`);
      console.log(`📱 Owner: ${BOT_CONFIG.OWNER_PHONE}`);
      console.log("\n🟢 BOT IS LIVE!\n");
      await sock.sendPresenceUpdate("unavailable");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;

      console.log(`⚠️ Connection closed. Code: ${lastDisconnect?.error?.output?.statusCode}`);

      if (shouldReconnect) {
        console.log("🔄 Reconnecting in 10s...");
        setTimeout(startBot, 10000);
      } else {
        console.log("🔐 Logged out. Delete./bot_session and restart.");
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

startBot().catch(console.error);

process.on("SIGINT", () => {
  console.log("\n\n👋 Bot shutting down...");
  process.exit(0);
});
