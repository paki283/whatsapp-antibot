const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    downloadContentFromMessage 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('⚡ SILENT Hacker Bot Connected Successfully!');
        }
    });

    // Messages Aur Events Handler
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message) return;
            
            const from = msg.key.remoteJid;
            const type = Object.keys(msg.message)[0];
            
            // 1. ANTI VIEW-ONCE LOGIC
            if (config.antiViewOnce && (type === 'viewOnceMessage' || type === 'viewOnceMessageV2')) {
                const viewOnceData = msg.message[type].message;
                const mediaType = Object.keys(viewOnceData)[0];
                
                // Content type change karke normal message bana dena
                viewOnceData[mediaType].viewOnce = false;
                
                // Caption ke sath custom emoji lagana
                let caption = viewOnceData[mediaType].caption || "";
                caption = `${config.viewOnceEmoji} *[ANTI-VIEW ONCE RECOVERED]*\n\n${caption}`;
                viewOnceData[mediaType].caption = caption;

                await sock.sendMessage(from, { forward: msg }, { quoted: msg });
                return;
            }

            // Command Processing
            const body = (type === 'conversation') ? msg.message.conversation : 
                         (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : 
                         (type === 'imageMessage') ? msg.message.imageMessage.caption : 
                         (type === 'videoMessage') ? msg.message.videoMessage.caption : '';
                         
            if (!body.startsWith(config.prefix)) return;
            const command = body.slice(config.prefix.length).trim().split(/ +/).shift().toLowerCase();

            // 2. MENU COMMAND
            if (command === 'menu') {
                const menuText = `❖ ── ✦ 𝗦𝗜𝗟𝗘𝗡𝗧 𝙃𝙖𝙘𝙠𝙚𝙧𝙨 ✦ ── ❖
 
 👤 𝗢𝘄𝗻𝗲𝗿: ${config.ownerName}
 ⚙️ 𝗠𝗼𝗱𝗲: ${config.mode.toUpperCase()}
 ⚡ 𝗣𝗿𝗲𝗳𝗶𝘅: [ ${config.prefix} ]

 ╭── ✦ [ 𝗬𝗢𝗨𝗧𝗨𝗕𝗘 𝗠𝗘𝗡𝗨 ] ✦ ──╮
 │ 
 │ ➭ *${config.prefix}play / ${config.prefix}song* [name]
 │    _Direct HQ Audio Download_
 │ ➭ *${config.prefix}video* [name]
 │    _Direct HD Video Download_
 │ ➭ *${config.prefix}yt* [link]
 │    _Download YT Video/Audio_
 │ ➭ *${config.prefix}yts* [query]
 │    _Search YouTube Videos_
 │
 ╰──────────────────────╯

 ╭── ✦ [ 𝗧𝗜𝗞𝗧𝗢𝗞 𝗠𝗘𝗡𝗨 ] ✦ ──╮
 │ 
 │ ➭ *${config.prefix}tt* [link]
 │    _No-Watermark TT Video_
 │ ➭ *${config.prefix}tt audio* [link]
 │    _Extract TikTok Sound_
 │ ➭ *${config.prefix}tts* [query]
 │    _Search TikTok Trends_
 │
 ╰──────────────────────╯

 ╭── ✦ [ 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗔𝗟 𝗠𝗘𝗗𝗜𝗔 ] ✦ ──╮
 │ 
 │ ➭ *${config.prefix}fb / ${config.prefix}facebook* [link]
 │    _FB High-Quality Videos_
 │ ➭ *${config.prefix}ig / ${config.prefix}insta* [link]
 │    _Instagram Reels/IGTV_
 │ ➭ *${config.prefix}tw / ${config.prefix}x* [link]
 │    _X/Twitter Media Extract_
 │ ➭ *${config.prefix}snap* [link]
 │    _Snapchat Spotlights_
 │ ➭ *${config.prefix}threads* [link]
 │    _Threads Video Download_
 │ ➭ *${config.prefix}pin* [link]
 │    _Pinterest Video/Images_
 │ ➭ *${config.prefix}reddit* [link]
 │    _Reddit Videos & GIFs_
 │
 ╰──────────────────────╯

 ╭── ✦ [ 🧠 𝗔𝗜 𝗠𝗔𝗦𝗧𝗘𝗥𝗠𝗜𝗡𝗗𝗦 ] ──╮
 │ 
 │ ➭ *${config.prefix}ai / ${config.prefix}ask* [text]
 │    _Faisalabadi Smart AI_
 │ ➭ *${config.prefix}gpt / ${config.prefix}chatgpt* [text]
 │    _ChatGPT 4o Persona_
 │ ➭ *${config.prefix}gemini* [text]
 │    _Google Gemini Pro_
 │ ➭ *${config.prefix}claude* [text]
 │    _Anthropic Claude 3_
 │ ➭ *${config.prefix}llama / ${config.prefix}groq* [text]
 │    _Meta Llama 3 Fast Engine_
 │
 ╰──────────────────────╯

 ╭── ✦ [ 𝗢𝗪𝗡𝗘𝗥 𝗠𝗘𝗡𝗨 ] ✦ ──╮
 │ 
 │ ➭ *${config.prefix}setprefix* [symbol]
 │    _Change Bot Prefix_
 │ ➭ *${config.prefix}mode* [public/private/admin]
 │    _Change Bot Work Mode_
 │ ➭ *${config.prefix}alwaysonline* [on/off]
 │    _Force Online Status_
 │ ➭ *${config.prefix}autoread* [on/off]
 │    _Auto Seen Messages_
 │ ➭ *${config.prefix}autoreact* [on/off]
 │    _Auto Like Messages_
 │ ➭ *${config.prefix}autostatus* [on/off]
 │    _Auto View Status_
 │ ➭ *${config.prefix}statusreact* [on/off]
 │    _Auto Like Status_
 │ ➭ *${config.prefix}listbots*
 │    _Show Active Sessions_
 │ ➭ *${config.prefix}stats*
 │    _Check System Power_
 │ ➭ *${config.prefix}pair* [number]
 │    _Connect New Bot Session_
 │
 ╰──────────────────────╯
 
 ╭── ✦ [ 🛡️ 𝗚𝗥𝗢𝗨𝗣 𝗠𝗘𝗡𝗨 🛡️ ] ──╮
 │ 
 │ ➭ *${config.prefix}antilink* [on/off]
 │    _Block Links in Group_
 │ ➭ *${config.prefix}antipic* [on/off]
 │    _Block Image Sharing_
 │ ➭ *${config.prefix}antivideo* [on/off]
 │    _Block Video Sharing_
 │ ➭ *${config.prefix}antisticker* [on/off]
 │    _Block Sticker Sharing_
 │ ➭ *${config.prefix}welcome* [on/off]
 │    _Welcome New Members_
 │ ➭ *${config.prefix}antidelete* [on/off]
 │    _Anti Delete Messages_
 │ ➭ *${config.prefix}kick* [@tag/reply]
 │    _Remove Member_
 │ ➭ *${config.prefix}add* [number]
 │    _Add New Member_
 │ ➭ *${config.prefix}promote* [@tag/reply]
 │    _Make Group Admin_
 │ ➭ *${config.prefix}demote* [@tag/reply]
 │    _Remove Admin Role_
 │ ➭ *${config.prefix}tagall* [text]
 │    _Mention All Members_
 │ ➭ *${config.prefix}hidetag* [text]
 │    _Silent Tag All Members_
 │ ➭ *${config.prefix}group* [open/close]
 │    _Change Group Settings_
 │ ➭ *${config.prefix}del* [reply]
 │    _Delete For Everyone_
 │ 
 ╰──────────────────────╯

 ╭── ✦ [ 🛠️ 𝗨𝗧𝗜𝗟𝗜𝗧𝗬 ] ──╮
 │ 
 │ ➭ *${config.prefix}vv* [reply to media]
 │    _Anti View-Once Media Extract_
 │ ➭ *${config.prefix}id*
 │    _Get Your Chat ID_
 │ ➭ *${config.prefix}vc* [Reply Voice] + [nmbr]
 │    _change your voice_
 │ 
 ╰──────────────────────╯
 
 ╭── ✦ [ ☠️ 𝗗𝗔𝗡𝗚𝗘𝗥𝗢𝗨𝗦 𝗭𝗢𝗡𝗘 ] ──╮
 │ 
 │ ➭ *${config.prefix}antidelete* [on/off]
 │    _Auto Recover Deleted Msgs_
 │ ➭ *${config.prefix}antivv* [on/off]
 │    _Auto Save View-Once Media_
 │ ➭ *${config.prefix}anticall* [on/off]
 │    _Auto Block Incoming Calls_
 │ ➭ *${config.prefix}antidm* [on/off]
 │    _Auto Block Unsaved DMs_
 │ 
 ╰──────────────────────╯
 
 ╭── ✦ [ 🎨 𝗘𝗗𝗜𝗧𝗜𝗡𝗚 𝗭𝗢𝗡𝗘 🎨 ] ──╮
 │ 
 │ ➭ *${config.prefix}s* / *${config.prefix}sticker* [reply image]
 │    _Convert Image to Sticker_
 │ ➭ *${config.prefix}toimg* [reply sticker]
 │    _Convert Sticker to Image_
 │ ➭ *${config.prefix}togif* [reply sticker]
 │    _Convert Sticker to GIF_
 │ ➭ *${config.prefix}tovideo* [reply sticker]
 │    _Convert Sticker to Video_
 │ ➭ *${config.prefix}tourl* [reply media]
 │    _Upload Media to Link_
 │ ➭ *${config.prefix}toptt* [reply audio]
 │    _Convert Text to Voice Note_
 │ ➭ *${config.prefix}fancy* [text]
 │    _Generate Fancy Fonts_
 │ 
 ╰──────────────────────╯
 
 ╭── ✦ [ ✨ 𝗔𝗜 𝗧𝗢𝗢𝗟𝗦 ✨ ] ──╮
 │ 
 │ ➭ *${config.prefix}img* [prompt]
 │    _Generate AI Image_
 │ ➭ *${config.prefix}remini* [reply img]
 │    _Enhance Image Quality_
 │ ➭ *${config.prefix}removebg* [reply img]
 │    _Remove Background_
 │ ➭ *${config.prefix}tr* [lang] [text]
 │    _Translate Text_
 │ ➭ *${config.prefix}ss* [website link]
 │    _Take Website Screenshot_
 │ ➭ *${config.prefix}google* [query]
 │    _Search on Google_
 │ ➭ *${config.prefix}weather* [city]
 │    _Check City Weather_
 │ 
 ╰──────────────────────╯`;
                
                await sock.sendMessage(from, { text: menuText }, { quoted: msg });
            }
        } catch (err) {
            console.log(err);
        }
    });

    // 3. ANTI-DELETE AUR ANTI-EDIT UPDATE HANDLER
    sock.ev.on('messages.update', async (chatUpdate) => {
        for (const { key, update } of chatUpdate) {
            if (update.messageStubType === 68 && config.antiDelete) { 
                // Message Delete Hone Par Signal (StubType 68)
                console.log("A message was deleted!");
                // Note: Complete deletion logging ke liye database ya memory storage ki zaroorat hoti hai jahan purana message pehle se saved ho.
            }
            
            if (update.editedMessage && config.antiEdit) {
                // Message Edit hone par purana chat aur naya text detect karna
                const from = key.remoteJid;
                const editedText = update.editedMessage.conversation || update.editedMessage.extendedTextMessage?.text;
                await sock.sendMessage(from, { text: `⚠️ *[ANTI-EDIT DETECTED]*\n\nUser ne message edit kiya hai.\n*Naya Text:* ${editedText}` }, { reference: key });
            }
        }
    });
}

startBot();
