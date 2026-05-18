import pkg from '@whiskeysockets/baileys'
const {
    makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    downloadMediaMessage
} = pkg

import pino from 'pino'
import fs from 'fs'

// === SETTINGS ===
const OWNER_NUMBER = '923001234567' // Apna WhatsApp number yahan daalo with country code, no +
const TARGET_GROUP_FILE = 'target.json'
const EMOJI_FILE = 'emoji.json'

// Default emoji
let TRIGGER_EMOJI = '👁️'
if (fs.existsSync(EMOJI_FILE)) {
    TRIGGER_EMOJI = JSON.parse(fs.readFileSync(EMOJI_FILE)).emoji
}

// Load target group
let targetGroupId = null
if (fs.existsSync(TARGET_GROUP_FILE)) {
    targetGroupId = JSON.parse(fs.readFileSync(TARGET_GROUP_FILE)).id
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth')

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Personal AntiBot', 'Chrome', '1.0.0']
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode!== DisconnectReason.loggedOut
            if (shouldReconnect) startBot()
        } else if (connection === 'open') {
            console.log('✅ Bot Connected!')
        }
        if (qr) {
            console.log('\n========== PAIRING CODE ==========')
            console.log('WhatsApp > Linked Devices > Link with phone number')
            console.log('==================================\n')
        }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return
        const sender = msg.key.participant || msg.key.remoteJid
        const from = msg.key.remoteJid
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

        // Owner commands
        if (sender.includes(OWNER_NUMBER)) {

            // Set target group
            if (text === '.update') {
                targetGroupId = from
                fs.writeFileSync(TARGET_GROUP_FILE, JSON.stringify({ id: from }))
                await sock.sendMessage(from, { text: '✅ Target group set ho gaya' })
                return
            }

            // Change trigger emoji
            if (text.startsWith('.antivv ')) {
                const newEmoji = text.trim().split(' ')[1]
                if (newEmoji) {
                    TRIGGER_EMOJI = newEmoji
                    fs.writeFileSync(EMOJI_FILE, JSON.stringify({ emoji: newEmoji }))
                    await sock.sendMessage(from, { text: `✅ Trigger emoji set: ${newEmoji}` })
                }
                return
            }
        }

        // Forward deleted, edited, viewonce messages to target group
        if (targetGroupId && from!== targetGroupId) {
            const messageType = Object.keys(msg.message)[0]

            // Anti-delete
            if (messageType === 'protocolMessage' && msg.message.protocolMessage.type === 0) {
                await sock.sendMessage(targetGroupId, {
                    text: `🗑️ *Message Deleted*\nFrom: ${sender.split('@')[0]}\nTime: ${new Date().toLocaleTimeString()}`
                })
            }

            // Anti-viewonce
            if (messageType === 'viewOnceMessage' || messageType === 'viewOnceMessageV2') {
                try {
                    const mediaMsg = msg.message.viewOnceMessage?.message || msg.message.viewOnceMessageV2?.message
                    const mediaType = Object.keys(mediaMsg)[0]
                    const media = await downloadMediaMessage({ message: mediaMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) })

                    if (mediaType === 'imageMessage') {
                        await sock.sendMessage(targetGroupId, {
                            image: media,
                            caption: `👁️ *ViewOnce Image*\nFrom: ${sender.split('@')[0]}`
                        })
                    } else if (mediaType === 'videoMessage') {
                        await sock.sendMessage(targetGroupId, {
                            video: media,
                            caption: `👁️ *ViewOnce Video*\nFrom: ${sender.split('@')[0]}`
                        })
                    }
                } catch (e) {
                    console.log('ViewOnce error:', e)
                }
            }
        }
    })
}

startBot()        } else if (connection === 'open') {
            console.log('✅ Bot Connected!')
        }
        if (qr) {
            console.log('\n========== PAIRING CODE ==========')
            console.log('WhatsApp > Linked Devices > Link with phone number')
            console.log('Code will appear here in 10-20 sec')
            console.log('==================================\n')
        }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return
        const sender = msg.key.participant || msg.key.remoteJid
        const from = msg.key.remoteJid

        // Owner commands
        if (sender.includes(OWNER_NUMBER)) {
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

            if (text === '.update') {
                targetGroupId = from
                fs.writeFileSync(TARGET_GROUP_FILE, JSON.stringify({ id: from }))
                await sock.sendMessage(from, { text: '✅ Target group set ho gaya' })
                return
            }

            if (text.startsWith('.antivv ')) {
                const newEmoji = text.split(' ')[1]
                if (newEmoji) {
                    fs.writeFileSync('emoji.json', JSON.stringify({ emoji: newEmoji }))
                    await sock.sendMessage(from, { text: `✅ Trigger emoji set: ${newEmoji}` })
                }
                return
            }
        }

        // Forward deleted, edited, viewonce messages
        if (targetGroupId && from!== targetGroupId) {
            const messageType = Object.keys(msg.message)[0]

            if (messageType === 'protocolMessage' && msg.message.protocolMessage.type === 0) {
                const deletedMsg = msg.message.protocolMessage.key
                await sock.sendMessage(targetGroupId, {
                    text: `🗑️ Message deleted by ${sender.split('@')[0]}\nTime: ${new Date().toLocaleTimeString()}`
                })
            }

            if (messageType === 'viewOnceMessage' || messageType === 'viewOnceMessageV2') {
                try {
                    const media = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) })
                    await sock.sendMessage(targetGroupId, {
                        image: media,
                        caption: `👁️ ViewOnce image from ${sender.split('@')[0]}`
                    })
                } catch (e) {}
            }
        }
    })
}

startBot()
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
