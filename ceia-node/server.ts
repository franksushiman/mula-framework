import { serve } from "bun";
import OpenAI from "openai";
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { db, inicializarBanco, getProfile, updateProfile, getZones, upsertZone, deleteZone, getFleet, getDriverByTelegramId, getDriverById, upsertDriver, updateDriverStatus, updateDriverLocation, updateDriver, deleteDriver, sweepInactiveDrivers, getDriverHistory } from "./core/database";

inicializarBanco();

let waClient: any = null;
let currentQR: string = '';
let waStatus: string = 'DISCONNECTED';
let realBotUsername = '';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calcularTaxa(latDestino: number, lngDestino: number): number {
    const zones = getZones() as any[];
    if (!zones || zones.length === 0) return 0;

    const ponto = { lat: latDestino, lng: lngDestino };

    for (const zona of zones) {
        try {
            const coords = JSON.parse(zona.coordenadas);
            
            if (zona.tipo === 'circle') {
                const distanciaKm = haversineDistance(ponto.lat, ponto.lng, coords.center.lat, coords.center.lng);
                if (distanciaKm * 1000 <= coords.radius) {
                    return zona.valor;
                }
            } else if (zona.tipo === 'polygon') {
                let dentro = false;
                for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
                    const xi = coords[i].lng, yi = coords[i].lat;
                    const xj = coords[j].lng, yj = coords[j].lat;

                    const intersect = ((yi > ponto.lat) !== (yj > ponto.lat))
                        && (ponto.lng < (xj - xi) * (ponto.lat - yi) / (yj - yi) + xi);
                    if (intersect) dentro = !dentro;
                }
                if (dentro) {
                    return zona.valor;
                }
            }
        } catch(e) {
            console.error(`Erro ao processar zona ${zona.id}:`, e);
            continue;
        }
    }
    return 0; // Fallback se não encontrar zona
}

function startWhatsApp() {
    if (waClient) return;
    waClient = new Client({ authStrategy: new LocalAuth({ dataPath: './wa_session' }) });
    waClient.on('qr', async (qr: string) => {
        currentQR = await qrcode.toDataURL(qr);
        waStatus = 'WAITING_QR';
    });
    waClient.on('ready', () => {
        currentQR = '';
        waStatus = 'CONNECTED';
        console.log('✅ WhatsApp Conectado e Pronto!');
    });

    waClient.on('message', async (msg: any) => {
        try {
            const profile = getProfile() as any;
            if (!profile || !profile.openai_key) {
                console.log("⚠️ Chave da OpenAI não configurada. Ignorando mensagem do WhatsApp.");
                return;
            }

            const openai = new OpenAI({ apiKey: profile.openai_key });
            let messageText = msg.body;

            // PRE-CHECK: Confirmação de entrega do cliente
            if (messageText && ['sim', 'ok', 's', 'recebido', 'confirmo'].includes(messageText.trim().toLowerCase())) {
                const clienteTelefone = msg.from.replace('@c.us', '');
                const dispatch = db.query("SELECT * FROM active_dispatches WHERE cliente_telefone LIKE ? AND status = 'AGUARDANDO_CONFIRMACAO' ORDER BY id DESC LIMIT 1").get(`%${clienteTelefone}%`) as any;

                if (dispatch) {
                    db.query("UPDATE active_dispatches SET status = 'FINALIZADO', finalizado_em = CURRENT_TIMESTAMP WHERE id = ?").run(dispatch.id);
                    
                    const driver = getDriverById(dispatch.motoboy_id) as any;
                    if (driver && driver.tipo_vinculo === 'FREELANCER') {
                        db.query("UPDATE fleet SET saldo = COALESCE(saldo, 0) + ? WHERE id = ?").run(dispatch.valor_corrida, driver.id);
                    }

                    await msg.reply('Obrigado por confirmar! 👍');

                    const remainingDeliveries = db.query("SELECT COUNT(*) as count FROM active_dispatches WHERE motoboy_id = ? AND status IN ('ACEITO', 'EM_ROTA', 'AGUARDANDO_CONFIRMACAO')").get(dispatch.motoboy_id) as any;
                    if (remainingDeliveries.count === 0) {
                        updateDriverStatus(driver.telegram_id, 'ONLINE');
                        if (profile && profile.telegram_bot_token && driver.chat_id) {
                            await sendMessage(profile.telegram_bot_token, driver.chat_id, "🏁 Todas as entregas foram confirmadas pelos clientes! Você está ONLINE novamente.");
                        }
                    }
                    return; // Finaliza o processamento aqui
                }
            }

            // PRE-CHECK 2: Encaminhar mensagem do cliente para o motoboy
            const clienteTelefoneCheck = msg.from.replace('@c.us', '');
            const activeDispatchForCustomer = db.query("SELECT * FROM active_dispatches WHERE cliente_telefone LIKE ? AND status = 'EM_ROTA' ORDER BY id DESC LIMIT 1").get(`%${clienteTelefoneCheck}%`) as any;

            if (activeDispatchForCustomer) {
                const driver = getDriverById(activeDispatchForCustomer.motoboy_id) as any;
                if (driver && driver.chat_id && profile && profile.telegram_bot_token) {
                    const msgParaMotoboy = `[MENSAGEM DO CLIENTE]:\n\n${msg.body}`;
                    await sendMessage(profile.telegram_bot_token, driver.chat_id, msgParaMotoboy);
                    return; // Mensagem encaminhada, interrompe o fluxo para não ir para IA
                }
            }

            // a) Tratamento de Áudio
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                if (media && (media.mimetype.startsWith('audio/ogg') || media.mimetype.startsWith('audio/mpeg') || media.mimetype.startsWith('audio/mp4'))) {
                    console.log("🎤 Transcrevendo áudio...");
                    const audioBuffer = Buffer.from(media.data, 'base64');
                    const audioFile = new File([audioBuffer], "audio.ogg", { type: media.mimetype });
                    
                    const transcription = await openai.audio.transcriptions.create({
                        model: "whisper-1",
                        file: audioFile,
                    });
                    messageText = transcription.text;
                    console.log(`📝 Transcrição: "${messageText}"`);
                }
            }

            if (!messageText || messageText.trim() === '') return;

            // b) Classificação (GPT-4o-mini)
            const classificationResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "Você é o classificador de intenções da logística. Responda APENAS com uma destas duas palavras:\n- MENU: se o cliente pedir cardápio, quiser comprar, ou disser oi/bom dia.\n- STATUS: se o cliente perguntar onde está a comida, se já saiu, ou tempo de entrega.\nSe não for nenhum dos dois, responda NADA." },
                    { role: "user", content: messageText }
                ],
                max_tokens: 10,
            });

            const intent = classificationResponse.choices[0].message.content?.trim().toUpperCase();
            console.log(`🧠 Intenção detectada: ${intent}`);

            // c) Regra "MENU"
            if (intent === 'MENU') {
                const chat = await msg.getChat();
                await chat.sendSeen();

                if (profile.link_cardapio) {
                    await msg.reply(`Olá! Faça seu pedido rapidamente pelo nosso cardápio digital: ${profile.link_cardapio}`);
                } else {
                    await msg.reply('Olá! No momento nosso cardápio online não está configurado. Por favor, envie seu pedido que anotaremos para você.');
                }
            }
            // d) Regra "STATUS"
            else if (intent === 'STATUS') {
                const clienteTelefone = msg.from.replace('@c.us', '');
                const dispatch = db.query("SELECT * FROM active_dispatches WHERE cliente_telefone LIKE ? ORDER BY id DESC LIMIT 1").get(`%${clienteTelefone}%`) as any;

                if (!dispatch) {
                    return; // Silêncio
                }

                const motoboy = getDriverById(dispatch.motoboy_id) as any;
                if (motoboy && motoboy.lat && motoboy.lng && dispatch.lat_destino && dispatch.lng_destino) {
                    const distance = haversineDistance(motoboy.lat, motoboy.lng, dispatch.lat_destino, dispatch.lng_destino);
                    const etaMinutes = Math.round((distance / 30) * 60); // Assumindo 30km/h
                    
                    let landmark = '';
                    if (profile.google_maps_key) {
                        try {
                            const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${motoboy.lat},${motoboy.lng}&radius=150&rankby=prominence&key=${profile.google_maps_key}`;
                            const placesRes = await fetch(placesUrl);
                            const placesData = await placesRes.json();
                            if (placesData.status === 'OK' && placesData.results.length > 0) {
                                landmark = placesData.results[0].name;
                            }
                        } catch(e) { console.error("Erro ao buscar Places:", e); }
                    }

                    let replyMessage = `🛵 Seu pedido já está com o entregador! Ele está a caminho e a previsão de chegada é em aproximadamente ${etaMinutes} minutos.`;
                    if (landmark) {
                        replyMessage = `🛵 Seu pedido já está com o entregador! Ele está passando perto de *${landmark}* e a previsão de chegada é em aproximadamente ${etaMinutes} minutos.`;
                    }
                    
                    await msg.reply(replyMessage);
                }
            }
        } catch (error) {
            console.error("❌ Erro ao processar mensagem do WhatsApp com IA:", error);
        }
    });

    waClient.initialize();
}

// State for registration process
const chatStates: { [key:string]: { step: string, data: any } } = {};

// Telegram API Helper
async function sendMessage(token: string, chatId: number, text: string, extraParams: any = {}) {
    if (!token) return;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, ...extraParams })
        });
    } catch(e) {
        console.error("Erro ao enviar mensagem para o Telegram:", e);
    }
}

async function editMessageText(token: string, chatId: number, messageId: number, text: string) {
    if (!token) return;
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text })
        });
    } catch(e) {
        console.error("Erro ao editar mensagem para o Telegram:", e);
    }
}

async function sendVenue(token: string, chatId: number, latitude: number, longitude: number, title: string, address: string, extraParams: any = {}) {
    if (!token) return;
    const url = `https://api.telegram.org/bot${token}/sendVenue`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, latitude, longitude, title, address, ...extraParams })
        });
    } catch(e) {
        console.error("Erro ao enviar venue para o Telegram:", e);
    }
}

async function editMessageReplyMarkup(token: string, chatId: number, messageId: number, replyMarkup: any) {
    if (!token) return;
    const url = `https://api.telegram.org/bot${token}/editMessageReplyMarkup`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: replyMarkup ? JSON.stringify(replyMarkup) : '' })
        });
    } catch(e) {
        console.error("Erro ao editar reply markup:", e);
    }
}

async function answerCallbackQuery(token: string, callbackQueryId: string) {
    if (!token) return;
    const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQueryId })
        });
    } catch(e) {
        console.error("Erro ao responder callback query:", e);
    }
}

async function sendRouteDashboard(token: string, motoboy_id: number, chatId: number) {
    const deliveries = db.query("SELECT * FROM active_dispatches WHERE motoboy_id = ? AND status IN ('AGUARDANDO_COLETA', 'EM_ROTA', 'CONCLUIDO') ORDER BY id").all(motoboy_id) as any[];
    if (deliveries.length === 0) return;

    const rota_id = deliveries[0].rota_id;
    const rotaCompleta = db.query("SELECT * FROM active_dispatches WHERE rota_id = ? ORDER BY id").all(rota_id) as any[];

    let text = "🎒 *SUA ROTA ATUAL:*\n\n";
    const keyboard = [];

    for (const delivery of rotaCompleta) {
        if (delivery.status === 'CONCLUIDO') {
            text += `✅ *[CONCLUÍDO]* ${delivery.endereco}\n`;
        } else if (delivery.status_coleta === 'COLETADO') {
            text += `📦 *[EM ROTA]* ${delivery.endereco}\n`;
        } else {
            text += `⏳ *[NA BASE]* ${delivery.endereco}\n`;
        }
    }

    text += "\nSelecione uma ação:\n";

    const aguardandoColeta = rotaCompleta.filter(d => d.status_coleta === 'AGUARDANDO');
    for (const delivery of aguardandoColeta) {
        keyboard.push([{ text: `Coletar: ${delivery.endereco.substring(0, 25)}...`, callback_data: `collect_ride_${delivery.id}` }]);
    }

    const emRotaParaConcluir = rotaCompleta.filter(d => d.status === 'EM_ROTA' && d.status !== 'CONCLUIDO');
    for (const delivery of emRotaParaConcluir) {
        keyboard.push([{ text: `Concluir: ${delivery.endereco.substring(0, 25)}...`, callback_data: `complete_ride_${delivery.id}` }]);
    }

    await sendMessage(token, chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: JSON.stringify({ inline_keyboard: keyboard })
    });
}

function getAngle(p1: {lat: number, lng: number}, p2: {lat: number, lng: number}): number {
    const angle = Math.atan2(p2.lat - p1.lat, p2.lng - p1.lng) * 180 / Math.PI;
    return angle < 0 ? angle + 360 : angle;
}

// --- Telegram Long Polling Bot ---
let lastUpdateId = 0;

const msgInstrucaoGPS = "📍 *Como ficar ONLINE para receber corridas:*\n\n1. Clique no ícone de clipe de papel 📎 ao lado do chat.\n2. Escolha a opção 'Localização'.\n3. Clique em **'Compartilhar Localização em Tempo Real'** (recomendado: 8 horas).\n\n⏳ Assim que o radar captar seu sinal, você estará ONLINE na base!";

async function startTelegramPolling() {
    console.log("🤖 Iniciando polling do Telegram...");
    // Pequeno delay para garantir que o banco de dados esteja pronto.
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const profile = getProfile() as any;
    const token = profile?.telegram_bot_token;

    if (!token) {
        console.log("⚠️ Token do Telegram não configurado. Polling não será iniciado. Por favor, configure-o no QG Logístico.");
        return;
    }

    try {
        const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const meData = await meRes.json();
        if (meData.ok) {
            realBotUsername = meData.result.username;
            console.log(`🤖 Nome real do Bot do Telegram descoberto: @${realBotUsername}`);
        }
    } catch(e) {
        console.error("Erro ao buscar o nome do bot:", e);
    }

    console.log("✅ Token do Telegram encontrado. Iniciando bot...");

    while (true) {
        try {
            const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=60`);
            if (!res.ok) {
                console.error(`Erro na API do Telegram: ${res.status} ${res.statusText}`);
                if (res.status === 401) {
                    console.error("O token do bot do Telegram é inválido. Polling interrompido.");
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 30000));
                continue;
            }
            const data = await res.json() as any;

            if (data.ok && data.result.length > 0) {
                for (const update of data.result) {
                    lastUpdateId = update.update_id;

                    if (update.callback_query) {
                        const cb = update.callback_query;
                        const telegramId = cb.from.id.toString();
                        const [action, type, idStr] = cb.data.split('_');
                        const dispatchId = parseInt(idStr);
                        const driver = getDriverByTelegramId(telegramId) as any;

                        if (action === 'collect' && type === 'ride' && !isNaN(dispatchId)) {
                            db.query("UPDATE active_dispatches SET status_coleta = 'COLETADO' WHERE id = ?").run(dispatchId);
                            const dispatch = db.query("SELECT rota_id, cliente_telefone, pin_entrega FROM active_dispatches WHERE id = ?").get(dispatchId) as any;
                            db.query("UPDATE active_dispatches SET status = 'EM_ROTA' WHERE rota_id = ? AND status = 'AGUARDANDO_COLETA'").run(dispatch.rota_id);
                            
                            if (waClient && waStatus === 'CONNECTED' && dispatch) {
                                const numeroCliente = `${dispatch.cliente_telefone}@c.us`;
                                const msgPin = `🛵 Seu pedido saiu para entrega! O motoboy já coletou o pacote.\n\n🔑 *Seu Código de Entrega é: ${dispatch.pin_entrega}*.\n\nInforme este código ao entregador para receber seu pedido.`;
                                await waClient.sendMessage(numeroCliente, msgPin);
                            }
                            await sendRouteDashboard(token, driver.id, cb.message.chat.id);
                        } else if (action === 'complete' && type === 'ride' && !isNaN(dispatchId)) {
                            chatStates[telegramId] = { step: 'awaiting_pin', data: { dispatch_id: dispatchId } };
                            await sendMessage(token, cb.message.chat.id, "Digite o PIN de 4 dígitos informado pelo cliente:");
                        } else if (action === 'message' && type === 'customer' && !isNaN(dispatchId)) {
                            chatStates[telegramId] = { step: 'awaiting_customer_message', data: { dispatch_id: dispatchId } };
                            await sendMessage(token, cb.message.chat.id, "Digite a mensagem para o cliente:");
                        }
                        
                        await answerCallbackQuery(token, cb.id);
                        continue;
                    }

                    const message = update.message || update.edited_message;
                    if (!message) continue;
                    
                    const telegramId = message.from.id.toString();
                    const chatId = message.chat.id;

                    if (message.location) {
                        db.query("UPDATE fleet SET lat = $lat, lng = $lng, status = 'ONLINE', last_location_time = $time WHERE telegram_id = $telegramId").run({ 
                            $lat: message.location.latitude, 
                            $lng: message.location.longitude, 
                            $time: Date.now(), 
                            $telegramId: telegramId 
                        });

                        const driver = getDriverByTelegramId(telegramId) as any;
                        if (driver) {
                            const entregasAtivas = db.query("SELECT * FROM active_dispatches WHERE motoboy_id = $id AND status = 'EM_ROTA' AND aviso_chegada_enviado = 0").all({ $id: driver.id }) as any[];
                            
                            for (const entrega of entregasAtivas) {
                                if (entrega.lat_destino && entrega.lng_destino) {
                                    const distanciaKm = haversineDistance(message.location.latitude, message.location.longitude, entrega.lat_destino, entrega.lng_destino);
                                    
                                    if (distanciaKm <= 0.3) {
                                        db.query("UPDATE active_dispatches SET aviso_chegada_enviado = 1 WHERE id = $id").run({ $id: entrega.id });
                                        
                                        const msgAviso = `*Aviso de Entrega:*\n\nSeu pedido está se aproximando do endereço de destino.\n\nPor favor, dirija-se ao portão ou recepção para agilizar o recebimento. Agradecemos a preferência.`;
                                        const numeroCliente = `${entrega.cliente_telefone}@c.us`;
                                        
                                        if (waClient && waStatus === 'CONNECTED') {
                                            try {
                                                await waClient.sendMessage(numeroCliente, msgAviso);
                                                console.log(`🚀 Aviso de aproximação enviado para ${entrega.cliente_telefone}`);
                                            } catch(err) {
                                                console.error(`❌ Erro ao enviar aviso de aproximação para ${entrega.cliente_telefone}:`, err);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        continue;
                    }
                    
                    if (!message.text) continue;
                    const text: string = message.text;

                    if (text.startsWith('/start')) {
                        const driver = getDriverByTelegramId(telegramId) as any;
                        if (driver) {
                            if (driver.status === 'ONLINE') {
                                await sendMessage(token, chatId, "✅ Você está **ONLINE** e visível no radar da base!\n\n🏍️ Fique atento, as corridas chegarão por aqui.", { parse_mode: 'Markdown' });
                            } else { // OFFLINE ou qualquer outro
                                await sendMessage(token, chatId, `❌ Você está **OFFLINE** na base.\n\n${msgInstrucaoGPS}`, { parse_mode: 'Markdown' });
                            }
                        } else {
                            const payload = text.split(' ')[1];
                            if (!payload) {
                                await sendMessage(token, chatId, "Bem-vindo! Este bot é para uso exclusivo de motoboys. Use o link de convite do seu restaurante.");
                                continue;
                            }
                            chatStates[telegramId] = { step: 'awaiting_nome', data: { telegram_id: telegramId, chat_id: chatId } };
                            await sendMessage(token, chatId, "Bem-vindo ao CEIA! Vamos começar seu cadastro. Por favor, digite seu NOME COMPLETO:");
                        }
                        continue;
                    }

                    const currentState = chatStates[telegramId];
                    if (currentState) {
                        switch (currentState.step) {
                            case 'awaiting_pin':
                                const pinDispatchId = currentState.data.dispatch_id;
                                const dispatchPin = db.query("SELECT * FROM active_dispatches WHERE id = ?").get(pinDispatchId) as any;
                                const driverPin = getDriverById(dispatchPin.motoboy_id) as any;
                                
                                if (dispatchPin && text.trim() === dispatchPin.pin_entrega) {
                                    db.query("UPDATE active_dispatches SET status = 'CONCLUIDO' WHERE id = ?").run(pinDispatchId);
                                    await sendMessage(token, chatId, "✅ PIN correto! Entrega concluída.");
                                    
                                    const remainingDeliveries = db.query("SELECT COUNT(*) as count FROM active_dispatches WHERE rota_id = ? AND status != 'CONCLUIDO'").get(dispatchPin.rota_id) as any;
                                    if (remainingDeliveries.count === 0) {
                                        updateDriverStatus(telegramId, 'ONLINE');
                                        await sendMessage(token, chatId, "🏁 Todas as entregas da rota foram concluídas! Você está ONLINE novamente.");
                                    } else {
                                        await sendRouteDashboard(token, driverPin.id, chatId);
                                    }
                                } else {
                                    await sendMessage(token, chatId, "❌ PIN incorreto. Tente novamente.");
                                }
                                delete chatStates[telegramId];
                                break;
                            case 'awaiting_customer_message':
                                const dispatchId = currentState.data.dispatch_id;
                                const dispatch = db.query("SELECT * FROM active_dispatches WHERE id = ?").get(dispatchId) as any;
                                if (dispatch && dispatch.cliente_telefone && waClient && waStatus === 'CONNECTED') {
                                    const numeroCliente = `${dispatch.cliente_telefone}@c.us`;
                                    const msgParaCliente = `[MENSAGEM DO ENTREGADOR]:\n\n${text}`;
                                    await waClient.sendMessage(numeroCliente, msgParaCliente);
                                    await sendMessage(token, chatId, "✅ Mensagem enviada ao cliente!");
                                } else {
                                    await sendMessage(token, chatId, "❌ Não foi possível enviar a mensagem.");
                                }
                                delete chatStates[telegramId];
                                break;
                            case 'awaiting_nome':
                                currentState.data.nome = text;
                                currentState.step = 'awaiting_cpf';
                                await sendMessage(token, chatId, "Ótimo! Agora, por favor, digite seu CPF:");
                                break;
                            case 'awaiting_cpf':
                                currentState.data.cpf = text;
                                currentState.step = 'awaiting_vinculo';
                                await sendMessage(token, chatId, "Qual o seu vínculo com o restaurante?", { reply_markup: JSON.stringify({ keyboard: [[{text: "FREELANCER"}, {text: "FIXO"}]], resize_keyboard: true, one_time_keyboard: true }) });
                                break;
                            case 'awaiting_vinculo':
                                currentState.data.tipo_vinculo = text;
                                currentState.step = 'awaiting_veiculo';
                                await sendMessage(token, chatId, "Qual o seu veículo?", { reply_markup: JSON.stringify({ keyboard: [[{text: "MOTO"}, {text: "CARRO"}], [{text: "BIKE / PATINETE"}]], resize_keyboard: true, one_time_keyboard: true }) });
                                break;
                            case 'awaiting_veiculo':
                                currentState.data.veiculo_tipo = text;
                                currentState.step = 'awaiting_veiculo_id';
                                await sendMessage(token, chatId, "Digite a PLACA (se moto/carro) ou uma DESCRIÇÃO (se bike/patinete):", { reply_markup: JSON.stringify({ remove_keyboard: true }) });
                                break;
                            case 'awaiting_veiculo_id':
                                currentState.data.veiculo_id = text;
                                currentState.step = 'awaiting_pix';
                                await sendMessage(token, chatId, "Ok. Para finalizar, qual sua Chave Pix?");
                                break;
                            case 'awaiting_pix':
                                currentState.data.chave_pix = text;
                                upsertDriver(currentState.data);
                                delete chatStates[telegramId];
                                const finalMsg = "✅ Cadastro concluído!\n\n🔴 *Você está OFFLINE*.\n\nPara ficar ONLINE e receber corridas, toque no clipe (📎) e envie sua **Localização em Tempo Real**.";
                                await sendMessage(token, chatId, finalMsg, { parse_mode: 'Markdown' });
                                break;
                        }
                    }
                }
            }
        } catch (err) {
            console.error("⚠️ Erro de rede no polling do Telegram. Tentando novamente em 5s...", err);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

serve({
    port: 3000,
    async fetch(req) {
        const url = new URL(req.url);
        
        if (req.method === "GET" && url.pathname === "/") return new Response(Bun.file("./public/index.html"), { headers: { "Content-Type": "text/html" } });
        
        if (req.method === 'GET' && url.pathname === '/api/whatsapp/start') {
            startWhatsApp();
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (req.method === 'GET' && url.pathname === '/api/whatsapp/status') {
            return new Response(JSON.stringify({ status: waStatus, qr: currentQR }), { headers: { 'Content-Type': 'application/json' } });
        }
        
        if (req.method === 'GET' && url.pathname === '/api/profile') {
            try {
                const profile = db.query("SELECT * FROM node_profile WHERE id = 1").get();
                return new Response(JSON.stringify(profile || {}), { headers: { 'Content-Type': 'application/json' } });
            } catch (err) {
                console.error("Erro ao ler perfil:", err);
                return new Response(JSON.stringify({}), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }
        if (req.method === "POST" && url.pathname === "/api/profile") { const body = await req.json(); return new Response(JSON.stringify(updateProfile(body)), { headers: { "Content-Type": "application/json" } }); }
        
        if (req.method === "GET" && url.pathname === "/api/zones") return new Response(JSON.stringify(getZones()), { headers: { "Content-Type": "application/json" } });
        if (req.method === 'POST' && url.pathname === '/api/zones') {
            const body = await req.json();
            db.query("INSERT INTO delivery_zones (nome, tipo, coordenadas, valor) VALUES ($n, $t, $c, $v)").run({ $n: body.nome, $t: body.tipo, $c: body.coordenadas, $v: body.valor });
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' }});
        }
        if (req.method === "DELETE" && url.pathname.startsWith("/api/zones/")) { const id = parseInt(url.pathname.split("/").pop()); return new Response(JSON.stringify(deleteZone(id)), { headers: { "Content-Type": "application/json" } }); }
        
        if (req.method === "GET" && url.pathname === "/api/fleet") return new Response(JSON.stringify(getFleet()), { headers: { "Content-Type": "application/json" } });
        if (req.method === 'PUT' && url.pathname.startsWith('/api/fleet/')) {
            const id = url.pathname.split('/').pop();
            const body = await req.json();
            db.query(`UPDATE fleet SET nome = $nome, cpf = $cpf, tipo_vinculo = $tipo_vinculo, chave_pix = $chave_pix WHERE id = $id`)
              .run({ $nome: body.nome || '', $cpf: body.cpf || '', $tipo_vinculo: body.tipo_vinculo || '', $chave_pix: body.chave_pix || '', $id: id });
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (req.method === "DELETE" && url.pathname.startsWith("/api/fleet/")) {
            const id = parseInt(url.pathname.split("/").pop() || '0');
            if (id) {
                return new Response(JSON.stringify(deleteDriver(id)), { headers: { "Content-Type": "application/json" } });
            }
        }
        if (req.method === 'POST' && url.pathname.match(/^\/api\/fleet\/(\d+)\/alert$/)) {
            const id = url.pathname.split('/')[3];
            const motoboy = db.query("SELECT * FROM fleet WHERE id = $id").get({ $id: id }) as any;
            const profile = getProfile() as any;
            
            if (motoboy && motoboy.chat_id && profile?.telegram_bot_token) {
                const msg = "🔔 *O QG ESTÁ CHAMANDO!*\n\nPrecisamos de você *ONLINE*. Por favor, ative a sua **Localização em Tempo Real** agora mesmo pelo clipe (📎).";
                sendMessage(profile.telegram_bot_token, motoboy.chat_id, msg, { parse_mode: 'Markdown' });
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ error: 'Motoboy não encontrado ou sem Telegram' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        if (req.method === 'GET' && url.pathname.match(/^\/api\/fleet\/(\d+)\/history$/)) {
            const id = parseInt(url.pathname.split('/')[3]);
            return new Response(JSON.stringify(getDriverHistory(id)), { headers: { "Content-Type": "application/json" } });
        }

        if (req.method === 'POST' && url.pathname.match(/^\/api\/dispatches\/(\d+)\/force-complete$/)) {
            const id = parseInt(url.pathname.split('/')[3]);
            const dispatch = db.query("SELECT * FROM active_dispatches WHERE id = ?").get(id) as any;

            if (dispatch && dispatch.motoboy_id) {
                // DELETA a rota travada em vez de finalizar.
                db.query("DELETE FROM active_dispatches WHERE id = ?").run(id);

                const driver = getDriverById(dispatch.motoboy_id) as any;
                // Nenhum pagamento é feito, pois a rota foi deletada.

                const remainingDeliveries = db.query("SELECT COUNT(*) as count FROM active_dispatches WHERE motoboy_id = ? AND status IN ('ACEITO', 'EM_ROTA', 'AGUARDANDO_CONFIRMACAO')").get(dispatch.motoboy_id) as any;
                if (driver && remainingDeliveries.count === 0) {
                    updateDriverStatus(driver.telegram_id, 'ONLINE');
                }

                return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
            }
            return new Response(JSON.stringify({ error: 'Entrega não encontrada ou sem motoboy associado.' }), { status: 404, headers: { 'Content-Type': 'application/json' }});
        }

        if (req.method === 'POST' && url.pathname === '/api/geocode') {
            const { endereco } = await req.json();
            const profile = getProfile() as any;
            if (profile.google_maps_key && endereco) {
                try {
                    const searchRadius = 20000;
                    const locationBias = (profile.lat && profile.lng) ? `&location=${profile.lat}%2C${profile.lng}&radius=${searchRadius}` : '';
                    const geoUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(endereco)}&key=${profile.google_maps_key}${locationBias}`;
                    const geoRes = await fetch(geoUrl);
                    const geoData = await geoRes.json();
                    if (geoData.status === 'OK' && geoData.results.length > 0) {
                        return new Response(JSON.stringify(geoData.results[0].geometry.location), { headers: { "Content-Type": "application/json" } });
                    }
                } catch (e) { /* ignore */ }
            }
            return new Response(JSON.stringify({ error: 'Geocoding failed' }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        if (req.method === 'POST' && url.pathname === '/api/route-check') {
            const { coordinates } = await req.json();
            const profile = getProfile() as any;
            const restaurant = { lat: profile.lat || -26.244, lng: profile.lng || -48.625 };

            if (coordinates.length > 1) {
                for (let i = 0; i < coordinates.length; i++) {
                    for (let j = i + 1; j < coordinates.length; j++) {
                        const p1 = coordinates[i];
                        const p2 = coordinates[j];

                        // Verifica distância entre os pontos de entrega
                        if (haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng) > 5) {
                            return new Response(JSON.stringify({ alerta: "⚠️ ROTA OPOSTA DETECTADA! Os endereços divergem muito." }), { headers: { "Content-Type": "application/json" } });
                        }

                        // Verifica o ângulo a partir do restaurante
                        const angle1 = getAngle(restaurant, p1);
                        const angle2 = getAngle(restaurant, p2);
                        let angleDiff = Math.abs(angle1 - angle2);
                        if (angleDiff > 180) angleDiff = 360 - angleDiff;

                        if (angleDiff > 90) {
                            return new Response(JSON.stringify({ alerta: "⚠️ ROTA OPOSTA DETECTADA! Os endereços divergem muito." }), { headers: { "Content-Type": "application/json" } });
                        }
                    }
                }
            }
            return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } });
        }

        // ROTA PARA FROTA DE DESPACHO (RADAR)
        if (req.method === 'GET' && url.pathname === '/api/dispatch/fleet') {
            const profile = getProfile() as any;
            const restaurantLat = profile?.lat || -26.244;
            const restaurantLng = profile?.lng || -48.625;
            
            const availableFleet = db.query(`
                SELECT 
                    f.*,
                    (SELECT COUNT(*) FROM active_dispatches WHERE motoboy_id = f.id AND status = 'EM_ROTA') as entregas_ativas
                FROM fleet f
                WHERE f.status = 'ONLINE' AND f.lat IS NOT NULL AND f.lng IS NOT NULL
            `).all() as any[];

            const fleetWithDistance = availableFleet.map(driver => {
                const distance = haversineDistance(restaurantLat, restaurantLng, driver.lat, driver.lng);
                return { ...driver, distance: distance };
            });

            fleetWithDistance.sort((a, b) => a.distance - b.distance);
            
            return new Response(JSON.stringify(fleetWithDistance), { headers: { "Content-Type": "application/json" } });
        }

        // ROTA DE DESPACHO
        if (req.method === 'POST' && url.pathname === '/api/dispatch') {
            const { motoboy_id, bag } = await req.json();
            const motoboy = db.query("SELECT * FROM fleet WHERE id = $id").get({ $id: motoboy_id }) as any;
            const profile = getProfile() as any;

            if (!motoboy || !motoboy.chat_id || !profile?.telegram_bot_token) {
                return new Response(JSON.stringify({ error: 'Motoboy inválido ou sem Telegram configurado.' }), { status: 400 });
            }

            const rota_id = Date.now().toString();
            updateDriverStatus(motoboy.telegram_id, 'OCUPADO');

            for (const item of bag) {
                const valor = calcularTaxa(item.coords.lat, item.coords.lng);
                const pin = Math.floor(1000 + Math.random() * 9000).toString();
                
                db.query(`
                    INSERT INTO active_dispatches (motoboy_id, rota_id, cliente_telefone, endereco, lat_destino, lng_destino, status, pin_entrega, valor_corrida) 
                    VALUES (?, ?, ?, ?, ?, ?, 'AGUARDANDO_COLETA', ?, ?)
                `).run(motoboy_id, rota_id, item.phone, item.address, item.coords.lat, item.coords.lng, pin, valor);
            }

            await sendRouteDashboard(profile.telegram_bot_token, motoboy.id, parseInt(motoboy.chat_id));
            
            return new Response(JSON.stringify({ success: true, rota_id: rota_id }), { headers: { 'Content-Type': 'application/json' }});
        }

        // A ROTA TÁTICA DO CONVITE
        if (req.method === "POST" && url.pathname === "/api/fleet/invite") {
            const body = await req.json();
            const profile = getProfile() as any;
            
            // O carimbo da loja (se não configurou o zap da loja, usa um ID padrão)
            const storeId = profile?.whatsapp ? profile.whatsapp.replace(/\D/g, '') : 'NODE_PENDENTE';
            const motoZap = body.whatsapp_motoboy;
            
            // O Link Carimbado
            const linkTelegram = `https://t.me/FrotaCeiaBot?start=${storeId}_${motoZap}`;
            let mensagem = `Você foi convidado para a frota ${profile?.nome || 'do restaurante'}. Conclua seu cadastro clicando aqui: ${linkTelegram}`;

            console.log(`\n📦 [NÓ SOBERANO] Ordem de disparo recebida!`);
            console.log(`📱 Destino: ${motoZap}`);
            console.log(`💬 Mensagem: "${mensagem}"\n`);

            try {
                if (waClient && waStatus === 'CONNECTED') {
                    const numeroLimpo = motoZap.replace(/\D/g, '');
                    const numeroComDDI = numeroLimpo.startsWith('55') ? numeroLimpo : `55${numeroLimpo}`;
                    
                    console.log(`🔍 Buscando ID real no WhatsApp para: ${numeroComDDI}...`);
                    const contato = await waClient.getNumberId(numeroComDDI);
                    
                    if (contato) {
                        mensagem = mensagem.replace('FrotaCeiaBot', realBotUsername || 'SeuBot');
                        await waClient.sendMessage(contato._serialized, mensagem);
                        console.log('✅ Convite real disparado com sucesso para:', contato._serialized);
                    } else {
                        console.log(`❌ Erro: O número ${numeroComDDI} não está registrado no WhatsApp.`);
                    }
                } else {
                    console.log('⚠️ WhatsApp Não Oficial desconectado. O envio real falhou.');
                }
            } catch (error) {
                console.error('❌ Erro ao enviar mensagem no WhatsApp:', error);
            }
            
            return new Response(JSON.stringify({ success: true, link: linkTelegram }), { headers: { "Content-Type": "application/json" } });
        }

        return new Response("Not Found", { status: 404 });
    }
});
console.log("🚀 Nó MULA Logística rodando liso na porta 3000");
startTelegramPolling().catch(err => console.error("Erro fatal no Telegram Polling:", err));
startWhatsApp();

// --- Varredor de Radar ---
setInterval(() => {
    try {
        const limiteTempo = Date.now() - 30000; // 30 segundos de tolerância
        const stmt = db.query("UPDATE fleet SET status = 'OFFLINE' WHERE status = 'ONLINE' AND (last_location_time < $tempo OR last_location_time IS NULL)");
        const result = stmt.run({ $tempo: limiteTempo });
        
        if (result.changes > 0) {
            console.log(`🧹 [VARREDOR DE RADAR] Derrubou ${result.changes} motoboy(s) para OFFLINE por inatividade de GPS.`);
        }
    } catch (e) {
        console.error("Erro no Varredor de Radar:", e);
    }
}, 10000);

// --- Monitor de Ofertas de Despacho foi removido em favor da montagem de Rota Manual ---
