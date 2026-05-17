import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    downloadMediaMessage
} from '@whiskeysockets/baileys'
import pino from 'pino'
import fs from 'fs'

const OWNER_NUMBER = "923200060103"
const CONFIG_FILE = './config.json'

// Load config
let config = {
    targetGroup: null,
    viewOnceTrigger: "😭"
}
if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE))
}

function saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config))
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        markOnlineOnConnect: false,
        syncFullHistory: false
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
            if (shouldReconnect) startBot()
        } else if (connection === 'open') {
            console.log('✅ Bot Connected!')
            await sock.sendPresenceUpdate('unavailable')
        }

        if (!sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(OWNER_NUMBER)
                    console.log(`\n\n========== PAIRING CODE ==========\n ${code}\n=================================\n\n`)
                    console.log('WhatsApp > Linked Devices > Link with phone number me daalo')
                } catch (e) {
                    console.log('Pairing code error:', e)
                }
            }, 3000)
        }
    })

    // Always offline
    sock.ev.on('presence.update', async () => {
        await sock.sendPresenceUpdate('unavailable')
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const isGroup = from.endsWith('@g.us')
        const sender = msg.key.participant || msg.key.remoteJid
        const ownerJid = OWNER_NUMBER + '@s.whatsapp.net'
        const msgText = msg.message.conversation || msg.message.extendedTextMessage?.text || ""

        // 1. SET TARGET GROUP - Sirf owner kar sakta hai
        if (isGroup && msgText.toLowerCase() === '.update' && sender === ownerJid) {
            config.targetGroup = from
            saveConfig()
            await sock.sendMessage(from, { text: `✅ Target group set ho gaya\nCurrent trigger: ${config.viewOnceTrigger}` })
            return
        }

        // 2. CHANGE TRIGGER EMOJI/TEXT
        if (isGroup && msgText.toLowerCase().startsWith('.antivv ') && sender === ownerJid) {
            const newTrigger = msgText.split(' ')[1]
            if (newTrigger) {
                config.viewOnceTrigger = newTrigger
                saveConfig()
                await sock.sendMessage(from, { text: `✅ ViewOnce trigger set to: ${newTrigger}` })
            } else {
                await sock.sendMessage(from, { text: 'Usage:.antivv 😍' })
            }
            return
        }

        // Agar target group set nahi hai to kuch mat karo
        if (!config.targetGroup) return

        const sendTo = config.targetGroup

        // 3. Anti-Delete
        if (msg.message.protocolMessage?.type === 0) {
            await sock.sendMessage(sendTo, {
                text: `🗑️ *Message Deleted*\n\n*From:* ${sender.split('@')[0]}\n*Chat:* ${from.split('@')[0]}\n*Time:* ${new Date().toLocaleString('en-IN')}`
            })
        }

        // 4. Anti-Edit
        if (msg.message.protocolMessage?.type === 14) {
            await sock.sendMessage(sendTo, {
                text: `✏️ *Message Edited*\n\n*From:* ${sender.split('@')[0]}\n*Chat:* ${from.split('@')[0]}\n*Time:* ${new Date().toLocaleString('en-IN')}`
            })
        }

        // 5. Anti-ViewOnce
        if (msgText.includes(config.viewOnceTrigger)) {
            const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
            if (quotedMsg) {
                try {
                    const msgType = Object.keys(quotedMsg)[0]
                    const buffer = await downloadMediaMessage(
                        { message: quotedMsg },
                        'buffer',
                        {},
                        { logger: pino({ level: 'silent' }) }
                    )

                    await sock.sendMessage(sendTo, {
                        [msgType.includes('image')? 'image' : msgType.includes('video')? 'video' : 'audio']: buffer,
                        caption: `👁️ *View Once Saved*\n\n*From:* ${sender.split('@')[0]}\n*Chat:* ${from.split('@')[0]}\n*Trigger:* ${config.viewOnceTrigger}`
                    })
                } catch (e) {
                    console.log('ViewOnce error:', e)
                }
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: `View once message ko reply karke ${config.viewOnceTrigger} bhejo` })
            }
        }
    })

    console.log('Bot is running...')
}

startBot()