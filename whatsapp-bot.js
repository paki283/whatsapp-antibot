/**
 * WHATSAPP BOT v2.2 - CLEAN FIXED VERSION
 * Owner: 923356331700
 * Features: Anti-Delete, Anti-Edit, Anti-View-Once, Emoji Triggers, Pairing Code Login
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

const pino = require("pino");

// ════════════════════════════════════════════════════════════════════════════
// ⚙️  CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

const BOT_CONFIG = {
  OWNER_PHONE: "923356331700",
  INBOX_JID: "923356331700@s.whatsapp.net",
  PAIRING_NUMBER: process.env.PAIRING_NUMBER || "923356331700",

  FEATURES: {
    ANTI_DELETE: true,
    ANTI_EDIT: true,
    ANTI_VIEW_ONCE: true,
    EMOJI_TRIGGERS: true,
    HIDE_LAST_SEEN: true,
    PRIVATE_MODE: true,
  },

  EMOJI_TRIGGERS: {
    "😭": ["rona", "sad", "ro", "udas", "pain"],
    "😂": ["haha", "lol", "funny", "mazak"],
    "❤️": ["love", "pyar", "sweet"],
    "🔥": ["fire", "nice", "awesome"],
    "👍": ["ok", "theek", "good"],
  },

  PREFIX: "/",
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

  error(title, err) {
    if (!BOT_CONFIG.ENABLE_LOGGING) return;
    console.error(
      `\x1b[36m[${this.getTime()}]\x1b[0m \x1b[31m[ERROR] ${title}\x1b[0m:`,
      err.message
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
      await sock.sendMessage(inboxJid, { image: buffer, caption });
    } else if (mediaType === "video") {
      await sock.sendMessage(inboxJid, { video: buffer, caption });
    } else if (mediaType === "audio") {
      await sock.sendMessage(inboxJid, { audio: buffer, mimetype: "audio/mpeg" });
    }

    Utils.log("VIEW-ONCE-SAVED", "Media saved and forwarded to inbox");
  } catch (err) {
    Utils.error("VIEW-ONCE", err);
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

    const inboxJid = BOT_CONFIG.INBOX_JID || jid;
    const alertText = `🗑️ *Anti-Delete Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n📋 Type: ${msgType}\n\n💬 *Message:*\n${text}`;

    await sock.sendMessage(inboxJid, { text: alertText });
    Utils.log("ANTI-DELETE-SAVED", "Alert sent to inbox");
  } catch (err) {
    Utils.error("ANTI-DELETE", err);
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
    const alertText = `✏️ *Anti-Edit Alert*\n\n👤 From: @${sender}\n🕐 Time: ${Utils.getTime()}\n\n📝 *Original:*\n${originalText}\n\n🔄 *Edited To:*\n${newText}`;

    await sock.sendMessage(inboxJid, { text: alertText });
    Utils.log("ANTI-EDIT-SAVED", "Alert sent to inbox");
  } catch (err) {
    Utils.error("ANTI-EDIT", err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 😭  EMOJI TRIGGERS
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
            react: { text: emoji, key: msg.key },
          });
          Utils.log("EMOJI-TRIGGER", `${emoji} triggered by "${keyword}"`);
          return;
        }
      }
    }
  } catch (err) {
    Utils.error("EMOJI-TRIGGER", err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 💬  COMMANDS
// ════════════════════════════════════════════════════════════════════════════

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
        await sock.sendMessage(jid, { text: "🏓 *Pong!* Bot is alive." });
        break;

      case "status": {
        const f = BOT_CONFIG.FEATURES;
        const statusText = `🤖 *Bot Status v2.2*

✅ Anti Delete:    ${f.ANTI_DELETE ? "ON ✅" : "OFF ❌"}
✅ Anti Edit:      ${f.ANTI_EDIT ? "ON ✅" : "OFF ❌"}
✅ Anti View Once: ${f.ANTI_VIEW_ONCE ? "ON ✅" : "OFF ❌"}
✅ Emoji Triggers: ${f.EMOJI_TRIGGERS ? "ON ✅" : "OFF ❌"}
✅ Private Mode:   ${f.PRIVATE_MODE ? "ON ✅" : "OFF ❌"}
✅ Last Seen:      HIDDEN 🕐

🕐 Time: ${Utils.getTime()}
📱 Owner: ${BOT_CONFIG.OWNER_PHONE}`;
        await sock.sendMessage(jid, { text: statusText });
        break;
      }

      case "help": {
        const helpText = `╔════════════════════════════════════╗
║       🤖 BOT COMMANDS v2.2         ║
╚════════════════════════════════════╝

${BOT_CONFIG.PREFIX}ping          - Check if bot is alive
${BOT_CONFIG.PREFIX}status        - View all feature states
${BOT_CONFIG.PREFIX}antidelete    - Toggle Anti-Delete
${BOT_CONFIG.PREFIX}antiedit      - Toggle Anti-Edit
${BOT_CONFIG.PREFIX}antiviewonce  - Toggle Anti-View-Once
${BOT_CONFIG.PREFIX}emoji         - Toggle Emoji Triggers
${BOT_CONFIG.PREFIX}logs          - View capture counts
${BOT_CONFIG.PREFIX}help          - Show this menu`;
        await sock.sendMessage(jid, { text: helpText });
        break;
      }

      case "antidelete":
        BOT_CONFIG.FEATURES.ANTI_DELETE = !BOT_CONFIG.FEATURES.ANTI_DELETE;
        await sock.sendMessage(jid, {
          text: `🗑️ Anti-Delete: *${BOT_CONFIG.FEATURES.ANTI_DELETE ? "ON ✅" : "OFF ❌"}*`,
        });
        break;

      case "antiedit":
        BOT_CONFIG.FEATURES.ANTI_EDIT = !BOT_CONFIG.FEATURES.ANTI_EDIT;
        await sock.sendMessage(jid, {
          text: `✏️ Anti-Edit: *${BOT_CONFIG.FEATURES.ANTI_EDIT ? "ON ✅" : "OFF ❌"}*`,
        });
        break;

      case "antiviewonce":
        BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE = !BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE;
        await sock.sendMessage(jid, {
          text: `👁️ Anti-View-Once: *${BOT_CONFIG.FEATURES.ANTI_VIEW_ONCE ? "ON ✅" : "OFF ❌"}*`,
        });
        break;

      case "emoji":
        BOT_CONFIG.FEATURES.EMOJI_TRIGGERS = !BOT_CONFIG.FEATURES.EMOJI_TRIGGERS;
        await sock.sendMessage(jid, {
          text: `😭 Emoji Triggers: *${BOT_CONFIG.FEATURES.EMOJI_TRIGGERS ? "ON ✅" : "OFF ❌"}*`,
        });
        break;

      case "logs": {
        const logsText = `📊 *Bot Capture Logs*

🗑️ Deleted messages: ${storage.deletedMessages.size}
✏️ Edited messages:  ${storage.editedMessages.size}
👁️ View-Once media:  ${storage.viewOnceMedia.size}

🕐 Time: ${Utils.getTime()}`;
        await sock.sendMessage(jid, { text: logsText });
        break;
      }

      default:
        await sock.sendMessage(jid, {
          text: `❌ Unknown command: *${BOT_CONFIG.PREFIX}${command}*\n\nUse *${BOT_CONFIG.PREFIX}help* to see all commands.`,
        });
    }
  } catch (err) {
    Utils.error("COMMAND", err);
    await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🔌  BOT CONNECTION
// ════════════════════════════════════════════════════════════════════════════

async function startBot() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     🤖 WHATSAPP BOT v2.2 - 923356331700 - STARTING        ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  try {
    const { state, saveCreds } = await useMultiFileAuthState("./bot_session");

    const sock = makeWASocket({
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      browser: ["Ubuntu", "Chrome", "22.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      defaultQueryTimeoutMs: 0,
    });

    // ── Pairing Code Login ──────────────────────────────────────────────────
    if (!sock.authState.creds.registered) {
      const phoneNumber = BOT_CONFIG.PAIRING_NUMBER;

      if (!phoneNumber) {
        console.log("❌ PAIRING_NUMBER not set!");
        console.log("Set env variable: PAIRING_NUMBER=923356331700");
        process.exit(1);
      }

      // Small delay so socket is ready before requesting code
      await new Promise((r) => setTimeout(r, 3000));

      const code = await sock.requestPairingCode(
        phoneNumber.replace(/[^0-9]/g, "")
      );
      console.log(`\n╔════════════════════════════════════╗`);
      console.log(`║  ✅ PAIRING CODE: ${code.padEnd(18)}║`);
      console.log(`╚════════════════════════════════════╝`);
      console.log(
        "\nWhatsApp > Linked Devices > Link with phone number > Enter code\n"
      );
    }

    // ── Connection Updates ──────────────────────────────────────────────────
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "connecting") {
        console.log("⏳ Connecting to WhatsApp...");
      }

      if (connection === "open") {
        console.log("\n✅ ✅ ✅  BOT CONNECTED!  ✅ ✅ ✅\n");
        console.log(`📱 Owner  : ${BOT_CONFIG.OWNER_PHONE}`);
        console.log(`🕐 Time   : ${Utils.getTime()}`);
        console.log(`🔐 Private: ON | Last Seen: HIDDEN`);
        console.log(`\n🟢 BOT IS LIVE AND RUNNING!\n`);

        try {
          await sock.sendPresenceUpdate("unavailable");
        } catch (_) {
          // ignore
        }
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;

        console.log(`⚠️  Connection closed. Code: ${code}`);

        if (shouldReconnect) {
          console.log("🔄 Reconnecting in 10 seconds...");
          setTimeout(startBot, 10000);
        } else {
          console.log("🔐 Logged out. Delete ./bot_session folder and restart.");
          process.exit(0);
        }
      }
    });

    // ── Save Credentials ────────────────────────────────────────────────────
    sock.ev.on("creds.update", saveCreds);

    // ── Incoming Messages ───────────────────────────────────────────────────
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      for (const msg of messages) {
        if (!msg.message) continue;

        const jid = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const text = Utils.getMessageText(msg);

        // Save all messages for anti-delete/edit (before private mode filter)
        storage.saveMessage(jid, msg.key.id, {
          senderJid,
          text,
          type: Utils.getMessageType(msg),
        });

        // Private mode: only process owner's messages for commands/emoji
        if (BOT_CONFIG.FEATURES.PRIVATE_MODE && !Utils.isOwner(senderJid)) {
          continue;
        }

        if (type === "notify") {
          await handleViewOnceMessage(sock, msg);
          await handleEmojiTriggers(sock, msg);
          await handleCommands(sock, msg);
        }
      }
    });

    // ── Deleted Messages ────────────────────────────────────────────────────
    sock.ev.on("messages.delete", async (item) => {
      if (item.keys) {
        for (const key of item.keys) {
          await handleDeletedMessage(sock, key);
        }
      }
    });

    // ── Edited Messages ─────────────────────────────────────────────────────
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
  } catch (err) {
    Utils.error("BOT-START", err);
    console.log("🔄 Retrying in 5 seconds...");
    setTimeout(startBot, 5000);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀  START
// ════════════════════════════════════════════════════════════════════════════

startBot().catch(console.error);

process.on("SIGINT", () => {
  console.log("\n\n👋 Bot shutting down gracefully...");
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});
