import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from '@whiskeysockets/baileys'
import pino from 'pino'

const msgStore = new Map()
const TRIGGER_WORD = "😭"
const OWNER_JID = "66647963631@s.whatsapp.net"

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    markOnlineOnConnect: false,
    syncFullHistory: false
  })

  // Save private messages only
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    if (msg.key.remoteJid.endsWith('@g.us')) return

    const key = msg.key.id
    msgStore.set(key, msg)

    // Anti-viewonce triggered by 😭
    if (msg.message.conversation?.trim() === TRIGGER_WORD) {
      const chats = Array.from(msgStore.values()).reverse()
      const viewonceMsg = chats.find(m => m.message?.viewOnceMessageV2 && m.key.remoteJid === msg.key.remoteJid)

      if (viewonceMsg) {
        const mediaMsg = viewonceMsg.message.viewOnceMessageV2.message
        await sock.sendMessage(OWNER_JID, {
          text: `👀 *Viewonce Opened*\nFrom: @${viewonceMsg.key.remoteJid.split('@')[0]}`,
          mentions: [viewonceMsg.key.remoteJid]
        })
        await sock.sendMessage(OWNER_JID, {...mediaMsg, viewOnce: false })
      }
    }
  })

  // Anti-delete & Anti-edit for private chats only
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      if (update.key.remoteJid.endsWith('@g.us')) continue

      const key = update.key.id
      const savedMsg = msgStore.get(key)
      if (!savedMsg) continue

      // Message deleted
      if (update.update.message === null) {
        const sender = savedMsg.key.remoteJid
        const text = savedMsg.message?.conversation || savedMsg.message?.extendedTextMessage?.text || '[Media]'
        await sock.sendMessage(OWNER_JID, {
          text: `🗑️ *Deleted Message*\nFrom: @${sender.split('@')[0]}\n\n${text}`,
          mentions: [sender]
        })
        if (savedMsg.message?.imageMessage || savedMsg.message?.videoMessage || savedMsg.message?.audioMessage) {
          await sock.sendMessage(OWNER_JID, {...savedMsg.message })
        }
      }

      // Message edited
      if (update.update.message?.editedMessage) {
        const sender = savedMsg.key.remoteJid
        const newText = update.update.message.editedMessage.message?.extendedTextMessage?.text
        const oldText = savedMsg.message?.extendedTextMessage?.text || savedMsg.message?.conversation
        await sock.sendMessage(OWNER_JID, {
          text: `✏️ *Edited Message*\nFrom: @${sender.split('@')[0]}\nOld: ${oldText}\nNew: ${newText}`,
          mentions: [sender]
        })
      }
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect.error?.output?.statusCode!== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    }
    if (connection === 'open') console.log('Bot Connected ✅ Offline Mode')
  })
}

startBot()