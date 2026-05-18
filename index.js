import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    downloadMediaMessage
} from '@whiskeysockets/baileys'

import pino from 'pino'
import fs from 'fs'

const OWNER_NUMBER = '923356331700'

const TARGET_GROUP_FILE = './target.json'
const EMOJI_FILE = './emoji.json'

let MESSAGE_STORE = {}

let TRIGGER_EMOJI = '😭😭'

if (fs.existsSync(EMOJI_FILE)) {
    try {
        const data = JSON.parse(
            fs.readFileSync(EMOJI_FILE)
        )
        TRIGGER_EMOJI = data.emoji
    } catch {}
}

let targetGroupId = null

if (fs.existsSync(TARGET_GROUP_FILE)) {
    try {
        const data = JSON.parse(
            fs.readFileSync(TARGET_GROUP_FILE)
        )
        targetGroupId = data.id
    } catch {}
}

async function startBot() {

    const { state, saveCreds } =
        await useMultiFileAuthState('./auth')

    const { version } =
        await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: state,

        logger: pino({
            level: 'silent'
        }),

        browser: [
            'Mini-MD',
            'Chrome',
            '1.0.0'
        ],

        printQRInTerminal: false,

        markOnlineOnConnect: false,

        syncFullHistory: false
    })

    // PAIR CODE
    if (!state.creds.registered) {

        setTimeout(async () => {

            try {

                const code =
                    await sock.requestPairingCode(
                        OWNER_NUMBER
                    )

                console.log(`
╔══════════════════╗
     PAIR CODE
      ${code}
╚══════════════════╝
`)

            } catch (err) {

                console.log(
                    'Pair Error:',
                    err
                )
            }

        }, 3000)
    }

    sock.ev.on(
        'creds.update',
        saveCreds
    )

    // CONNECTION
    sock.ev.on(
        'connection.update',
        (update) => {

            const {
                connection,
                lastDisconnect
            } = update

            if (connection === 'close') {

                const shouldReconnect =
                    lastDisconnect?.error
                        ?.output?.statusCode !==
                    DisconnectReason.loggedOut

                console.log(
                    '❌ Connection Closed'
                )

                if (shouldReconnect) {
                    startBot()
                }

            } else if (
                connection === 'open'
            ) {

                console.log(
                    '✅ Bot Connected'
                )
            }
        }
    )

    // MESSAGE HANDLER
    sock.ev.on(
        'messages.upsert',
        async ({ messages }) => {

            try {

                const msg = messages[0]

                if (!msg.message) return

                const from =
                    msg.key.remoteJid

                const sender =
                    msg.key.participant ||
                    msg.key.remoteJid ||
                    ''

                const text =
                    msg.message.conversation ||
                    msg.message
                        .extendedTextMessage
                        ?.text ||
                    ''

                // SAVE MESSAGE
                MESSAGE_STORE[msg.key.id] =
                    msg

                // OWNER COMMANDS
                if (
                    sender.includes(
                        OWNER_NUMBER
                    )
                ) {

                    // UPDATE TARGET
                    if (
                        text === '.update'
                    ) {

                        targetGroupId = from

                        fs.writeFileSync(
                            TARGET_GROUP_FILE,
                            JSON.stringify({
                                id: from
                            })
                        )

                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    '✅ Target Updated'
                            }
                        )

                        return
                    }

                    // CHANGE EMOJI
                    if (
                        text.startsWith(
                            '.antivv '
                        )
                    ) {

                        const emoji =
                            text.split(' ')[1]

                        if (emoji) {

                            TRIGGER_EMOJI =
                                emoji

                            fs.writeFileSync(
                                EMOJI_FILE,
                                JSON.stringify({
                                    emoji
                                })
                            )

                            await sock.sendMessage(
                                from,
                                {
                                    text:
`✅ Emoji Changed: ${emoji}`
                                }
                            )
                        }

                        return
                    }
                }

                // PRIVATE FORWARD
                if (
                    targetGroupId &&
                    from !== targetGroupId
                ) {

                    const type =
                        Object.keys(
                            msg.message
                        )[0]

                    // ANTI VIEWONCE
                    if (
                        type ===
                            'viewOnceMessage' ||
                        type ===
                            'viewOnceMessageV2'
                    ) {

                        try {

                            const mediaMsg =
                                msg.message
                                    .viewOnceMessage
                                    ?.message ||
                                msg.message
                                    .viewOnceMessageV2
                                    ?.message

                            const mediaType =
                                Object.keys(
                                    mediaMsg
                                )[0]

                            const media =
                                await downloadMediaMessage(
                                    {
                                        message:
                                            mediaMsg
                                    },
                                    'buffer',
                                    {},
                                    {}
                                )

                            if (
                                mediaType ===
                                'imageMessage'
                            ) {

                                await sock.sendMessage(
                                    targetGroupId,
                                    {
                                        image:
                                            media,

                                        caption:
`${TRIGGER_EMOJI} Anti ViewOnce

👤 ${sender.split('@')[0]}`
                                    }
                                )
                            }

                            if (
                                mediaType ===
                                'videoMessage'
                            ) {

                                await sock.sendMessage(
                                    targetGroupId,
                                    {
                                        video:
                                            media,

                                        caption:
`${TRIGGER_EMOJI} Anti ViewOnce

👤 ${sender.split('@')[0]}`
                                    }
                                )
                            }

                        } catch (err) {

                            console.log(
                                'ViewOnce Error:',
                                err
                            )
                        }
                    }

                    // ANTI DELETE
                    if (
                        type ===
                        'protocolMessage'
                    ) {

                        const protocol =
                            msg.message
                                .protocolMessage

                        if (
                            protocol.type === 0
                        ) {

                            const deleted =
                                MESSAGE_STORE[
                                    protocol.key?.id
                                ]

                            const deletedText =
                                deleted?.message
                                    ?.conversation ||
                                deleted?.message
                                    ?.extendedTextMessage
                                    ?.text ||
                                'Media Message'

                            await sock.sendMessage(
                                targetGroupId,
                                {
                                    text:
`🗑️ Message Deleted

👤 ${sender.split('@')[0]}

📩 ${deletedText}`
                                }
                            )
                        }
                    }
                }

            } catch (err) {

                console.log(
                    'Message Error:',
                    err
                )
            }
        }
    )
}

startBot()
async function startBot() {

    const { state, saveCreds } =
        await useMultiFileAuthState('./auth')

    const { version } =
        await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: state,

        logger: pino({
            level: 'silent'
        }),

        browser: [
            'Mini-MD',
            'Chrome',
            '1.0.0'
        ],

        printQRInTerminal: false,

        markOnlineOnConnect: false,

        syncFullHistory: false,

        generateHighQualityLinkPreview: false,

        defaultQueryTimeoutMs: 0
    })

    // PAIR CODE
    if (!state.creds.registered) {

        setTimeout(async () => {

            try {

                const code =
                    await sock.requestPairingCode(
                        OWNER_NUMBER
                    )

                console.log(`
╔════════════════════╗
      PAIR CODE
       ${code}
╚════════════════════╝
`)

            } catch (err) {

                console.log(
                    'Pair Code Error:',
                    err
                )
            }

        }, 3000)
    }

    sock.ev.on(
        'creds.update',
        saveCreds
    )

    // CONNECTION
    sock.ev.on(
        'connection.update',
        async (update) => {

            const {
                connection,
                lastDisconnect
            } = update

            if (connection === 'close') {

                const shouldReconnect =
                    lastDisconnect?.error
                        ?.output?.statusCode !==
                    DisconnectReason.loggedOut

                console.log(
                    '❌ Connection Closed'
                )

                if (shouldReconnect) {
                    startBot()
                }

            } else if (
                connection === 'open'
            ) {

                console.log(
                    '✅ Bot Connected'
                )
            }
        }
    )

    // MESSAGE HANDLER
    sock.ev.on(
        'messages.upsert',
        async ({ messages }) => {

            try {

                const msg = messages[0]

                if (!msg.message) return

                const from =
                    msg.key.remoteJid

                const sender =
                    msg.key.participant ||
                    msg.key.remoteJid ||
                    ''

                const text =
                    msg.message.conversation ||
                    msg.message
                        .extendedTextMessage
                        ?.text ||
                    ''

                // SAVE MESSAGE
                MESSAGE_STORE[msg.key.id] =
                    msg

                // OWNER COMMANDS
                if (
                    sender.includes(
                        OWNER_NUMBER
                    )
                ) {

                    // UPDATE TARGET
                    if (
                        text === '.update'
                    ) {

                        targetGroupId = from

                        fs.writeFileSync(
                            TARGET_GROUP_FILE,
                            JSON.stringify({
                                id: from
                            })
                        )

                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    '✅ Target Updated'
                            }
                        )

                        return
                    }

                    // CHANGE EMOJI
                    if (
                        text.startsWith(
                            '.antivv '
                        )
                    ) {

                        const emoji =
                            text.split(' ')[1]

                        if (emoji) {

                            TRIGGER_EMOJI =
                                emoji

                            fs.writeFileSync(
                                EMOJI_FILE,
                                JSON.stringify({
                                    emoji
                                })
                            )

                            await sock.sendMessage(
                                from,
                                {
                                    text:
`✅ Trigger Emoji Changed To ${emoji}`
                                }
                            )
                        }

                        return
                    }
                }

                // PRIVATE FORWARD SYSTEM
                if (
                    targetGroupId &&
                    from !== targetGroupId
                ) {

                    const type =
                        Object.keys(
                            msg.message
                        )[0]

                    // ===================
                    // ANTI VIEWONCE
                    // ===================

                    if (
                        type ===
                            'viewOnceMessage' ||
                        type ===
                            'viewOnceMessageV2'
                    ) {

                        try {

                            const mediaMsg =
                                msg.message
                                    .viewOnceMessage
                                    ?.message ||
                                msg.message
                                    .viewOnceMessageV2
                                    ?.message

                            const mediaType =
                                Object.keys(
                                    mediaMsg
                                )[0]

                            const media =
                                await downloadMediaMessage(
                                    {
                                        message:
                                            mediaMsg
                                    },
                                    'buffer',
                                    {},
                                    {}
                                )

                            if (
                                mediaType ===
                                'imageMessage'
                            ) {

                                await sock.sendMessage(
                                    targetGroupId,
                                    {
                                        image:
                                            media,

                                        caption:
`${TRIGGER_EMOJI} Anti ViewOnce

👤 ${sender.split('@')[0]}`
                                    }
                                )
                            }

                            if (
                                mediaType ===
                                'videoMessage'
                            ) {

                                await sock.sendMessage(
                                    targetGroupId,
                                    {
                                        video:
                                            media,

                                        caption:
`${TRIGGER_EMOJI} Anti ViewOnce

👤 ${sender.split('@')[0]}`
                                    }
                                )
                            }

                        } catch (err) {

                            console.log(
                                'ViewOnce Error:',
                                err
                            )
                        }
                    }

                    // ===================
                    // ANTI DELETE
                    // ===================

                    if (
                        type ===
                        'protocolMessage'
                    ) {

                        const protocol =
                            msg.message
                                .protocolMessage

                        if (
                            protocol.type === 0
                        ) {

                            const deleted =
                                MESSAGE_STORE[
                                    protocol.key?.id
                                ]

                            const deletedText =
                                deleted?.message
                                    ?.conversation ||
                                deleted?.message
                                    ?.extendedTextMessage
                                    ?.text ||
                                'Media Message'

                            await sock.sendMessage(
                                targetGroupId,
                                {
                                    text:
`🗑️ Message Deleted

👤 ${sender.split('@')[0]}

📩 ${deletedText}`
                                }
                            )
                        }
                    }
                }

            } catch (err) {

                console.log(
                    'Message Error:',
                    err
                )
            }
        }
    )
}

startBot()
                        TRIGGER_EMOJI =
                            emoji

                        fs.writeFileSync(
                            EMOJI_FILE,
                            JSON.stringify({
                                emoji
                            })
                        )

                        await sock.sendMessage(
                            from,
                            {
                                text:
`✅ Trigger Emoji Changed To ${emoji}`
                            }
                        )
                    }

                    return
                }
            }

            if (
                targetGroupId &&
                from !== targetGroupId
            ) {

                const type =
                    Object.keys(
                        msg.message
                    )[0]

                // VIEWONCE
                if (
                    type ===
                        'viewOnceMessage' ||
                    type ===
                        'viewOnceMessageV2'
                ) {

                    try {

                        const mediaMsg =
                            msg.message
                                .viewOnceMessage
                                ?.message ||
                            msg.message
                                .viewOnceMessageV2
                                ?.message

                        const mediaType =
                            Object.keys(
                                mediaMsg
                            )[0]

                        const media =
                            await downloadMediaMessage(
                                {
                                    message:
                                        mediaMsg
                                },
                                'buffer',
                                {},
                                {}
                            )

                        if (
                            mediaType ===
                            'imageMessage'
                        ) {

                            await sock.sendMessage(
                                targetGroupId,
                                {
                                    image:
                                        media,

                                    caption:
`${TRIGGER_EMOJI} Anti ViewOnce

👤 ${sender.split('@')[0]}`
                                }
                            )
                        }

                        if (
                            mediaType ===
                            'videoMessage'
                        ) {

                            await sock.sendMessage(
                                targetGroupId,
                                {
                                    video:
                                        media,

                                    caption:
`${TRIGGER_EMOJI} Anti ViewOnce

👤 ${sender.split('@')[0]}`
                                }
                            )
                        }

                    } catch (err) {

                        console.log(
                            'ViewOnce Error:',
                            err
                        )
                    }
                }
            }

        } catch (err) {

            console.log(
                'Message Handler Error:',
                err
            )
        }
    }
)        syncFullHistory: false,

        generateHighQualityLinkPreview: false,

        defaultQueryTimeoutMs: 0
    })

    // PAIR CODE
    if (!state.creds.registered) {

        setTimeout(async () => {

            try {

                const code =
                    await sock.requestPairingCode(
                        OWNER_NUMBER
                    )

                console.log(`
╔════════════════════╗
      PAIR CODE
       ${code}
╚════════════════════╝
`)

            } catch (err) {

                console.log(
                    'Pair Code Error:',
                    err
                )
            }

        }, 3000)
    }

    sock.ev.on(
        'creds.update',
        saveCreds
    )

    sock.ev.on(
        'connection.update',
        async (update) => {

            const {
                connection,
                lastDisconnect
            } = update

            if (connection === 'close') {

                const statusCode =
                    lastDisconnect?.error
                        ?.output?.statusCode

                const shouldReconnect =
                    statusCode !==
                    DisconnectReason.loggedOut

                console.log(
                    '❌ Connection Closed'
                )

                if (shouldReconnect) {
                    startBot()
                }

            } else if (
                connection === 'open'
            ) {

                console.log(
                    '✅ Bot Connected'
                )
            }
        }
    )

    sock.ev.on(
        'messages.upsert',
        async ({ messages }) => {

            try {

                const msg = messages[0]

                if (!msg.message) return

                const from =
                    msg.key.remoteJid

                const sender =
                    msg.key.participant ||
                    msg.key.remoteJid ||
                    ''

                const text =
                    msg.message.conversation ||
                    msg.message
                        .extendedTextMessage
                        ?.text ||
                    ''

                // SAVE MESSAGE
                MESSAGE_STORE[msg.key.id] =                    TRIGGER_EMOJI = newEmoji
                    fs.writeFileSync(EMOJI_FILE, JSON.stringify({ emoji: newEmoji }))
                    await sock.sendMessage(from, { text: `✅ Trigger emoji set: ${newEmoji}` })
                }
                return
            }
        }

        // Anti-delete and Anti-viewonce
        if (targetGroupId && from!== targetGroupId) {
            const messageType = Object.keys(msg.message)[0]

            if (messageType === 'protocolMessage' && msg.message.protocolMessage.type === 0) {
                await sock.sendMessage(targetGroupId, {
                    text: `🗑️ *Message Deleted*\nFrom: ${sender.split('@')[0]}\nTime: ${new Date().toLocaleTimeString()}`
                })
            }

            if (messageType === 'viewOnceMessage' || messageType === 'viewOnceMessageV2') {
                try {
                    const mediaMsg = msg.message.viewOnceMessage?.message || msg.message.viewOnceMessageV2?.message
                    const mediaType = Object.keys(mediaMsg)[0]
                    const media = await downloadMediaMessage({ message: mediaMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) })

                    if (mediaType === 'imageMessage') {
                        await sock.sendMessage(targetGroupId, {
                            image: media,
                            caption: `${TRIGGER_EMOJI} *ViewOnce Image*\nFrom: ${sender.split('@')[0]}`
                        })
                    } else if (mediaType === 'videoMessage') {
                        await sock.sendMessage(targetGroupId, {
                            video: media,
                            caption: `${TRIGGER_EMOJI} *ViewOnce Video*\nFrom: ${sender.split('@')[0]}`
                        })
                    }
                } catch (e) {
                    console.log('ViewOnce error:', e)
                }
            }
        }
    })
}

startBot()
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
