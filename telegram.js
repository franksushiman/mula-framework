const { Telegraf } = require('telegraf');
const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');

let bot = null;

// Gestão de estado para cadastro de entregadores
const userSessions = {};
const USER_STEPS = {
    WAITING_NAME: 'WAITING_NAME',
    WAITING_PIX: 'WAITING_PIX',
    WAITING_TYPE: 'WAITING_TYPE',
    WAITING_PLATE: 'WAITING_PLATE',
    WAITING_CONTACT: 'WAITING_CONTACT'
};

// Inicializar bot Telegram
async function initializeTelegramBot(config) {
    try {
        if (!config) {
            console.error('❌ [Telegram] Configuração não fornecida para inicialização.');
            return null;
        }

        console.log('🤖 [Telegram] Inicializando com configuração recebida...');
        const token = config.telegramToken || config.telegramClientToken;

        if (!token || token.trim() === '') {
            console.warn('⚠️ [Telegram] Token Telegram vazio na configuração.');
            return null;
        }

        console.log('🤖 [Telegram] Inicializando bot Telegram com token (primeiros 5 chars):', token.substring(0, 5) + '...');
        bot = new Telegraf(token);

        // Adicionar listeners de erro para o bot
        bot.catch((err, ctx) => {
            console.error(`❌ [Telegram] Erro para ${ctx.updateType} no chat ${ctx.chat?.id}:`, err);
            // Tentar enviar uma mensagem de erro para o usuário se possível
            if (ctx.chat?.id) {
                ctx.reply('Desculpe, tive um problema ao processar sua solicitação. Por favor, tente novamente mais tarde.').catch(replyErr => {
                    console.error('❌ [Telegram] Erro ao enviar mensagem de erro para o usuário:', replyErr);
                });
            }
        });
        
        // Listener para mensagens editadas (Live Location)
        bot.on('edited_message', async (ctx) => {
            console.log(`[Telegram] Recebida edited_message de ${ctx.chat.id}`);
            const msg = ctx.editedMessage;
            const chatId = msg.chat.id;
            
            // Verificar se a mensagem editada contém localização
            if (msg.location) {
                const lat = msg.location.latitude;
                const lng = msg.location.longitude;
                
                console.log(`[Telegram][RASTREAMENTO] Entregador ${chatId} moveu-se para ${lat}, ${lng}`);
                
                // Buscar informações do entregador (pode ser armazenado em um mapa local)
                // Aqui você pode buscar o phone/vulgo do entregador a partir do chatId
                // Por enquanto, usaremos o chatId como identificador
                
                // Atualizar via IPC para o frontend
                BrowserWindow.getAllWindows().forEach(win => {
                    win.webContents.send('driver-pos', {
                        phone: `telegram_${chatId}`, // Identificador temporário
                        lat,
                        lng,
                        vulgo: `Entregador ${chatId}`,
                        liveTracking: true,
                        timestamp: Date.now()
                    });
                });
                
                // Atualizar no backend (main.js) via IPC se necessário
                // ipcMain.emit('update-driver-live-location', ...)
            }
        });
        
        // Listener para mensagens de localização (fixa ou live)
        bot.on('location', async (ctx) => {
            console.log(`[Telegram] Recebida location de ${ctx.chat.id}`);
            const msg = ctx.message;
            const chatId = msg.chat.id;
            const location = msg.location;
            const lat = location.latitude;
            const lng = location.longitude;
            
            // Verificar se é Live Location (tem live_period)
            const isLiveLocation = location.live_period !== undefined;
            
            if (isLiveLocation) {
                console.log(`[Telegram][LIVE] Entregador ${chatId} iniciou compartilhamento em tempo real`);
                
                // Responder confirmando
                ctx.reply('Rastreamento iniciado! 🛰️ Estamos te acompanhando no mapa.').catch(err => console.error('❌ [Telegram] Erro ao responder live location:', err));
                
                // Registrar como rastreamento ativo
                // (Poderia armazenar em um mapa de activeLiveSessions)
            } else {
                // Localização fixa (check-in)
                console.log(`[Telegram][CHECK-IN] Entregador ${chatId} enviou localização fixa: ${lat}, ${lng}`);
                
                // Responder conforme lógica existente
                ctx.reply('Localização recebida! ✅ Agora você está online no radar.').catch(err => console.error('❌ [Telegram] Erro ao responder check-in location:', err));
            }
            
            // Atualizar no sistema (mesmo para fixa e live)
            BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('driver-pos', {
                    phone: `telegram_${chatId}`,
                    lat,
                    lng,
                    vulgo: `Entregador ${chatId}`,
                    liveTracking: isLiveLocation,
                    timestamp: Date.now()
                });
            });
        });
        
        // Comando /start para novos entregadores
        bot.start((ctx) => {
            console.log(`[Telegram] Recebido comando /start de ${ctx.from.id}`);
            const chatId = ctx.chat.id;
            const startPayload = ctx.startPayload; // Parâmetro após /start (o "carimbo")
            console.log(`[Telegram] Novo entregador ${ctx.from.id} iniciou com payload: ${startPayload}`);

            // Lógica de Apresentação (White Label vs Agnostic)
            let presentationName = "Ceia Delivery"; // Nome agnóstico padrão (Site)
            
            // Se tiver payload (link carimbado), tenta usar o nome da loja específica
            if (startPayload && startPayload.trim() !== '') {
                if (config && config.storeName && config.storeName !== 'Delivery Manager') {
                    presentationName = config.storeName;
                } else {
                    presentationName = "Loja Parceira"; // Fallback se config não tiver nome
                }
            }

            // Limpar sessão anterior se existir
            delete userSessions[chatId];

            // Iniciar novo cadastro salvando o código de convite
            userSessions[chatId] = {
                step: USER_STEPS.WAITING_NAME,
                data: {},
                inviteCode: startPayload || null // Salvar o carimbo
            };

            ctx.reply(`👋 Bem-vindo à frota **${presentationName}**! Vamos fazer seu cadastro.\n\nPrimeiro, qual é seu **Nome Completo**?`).catch(err => console.error('❌ [Telegram] Erro ao responder /start:', err));
        });
        
        // Listener para mensagens de texto (respostas do wizard)
        bot.on('text', async (ctx) => {
            console.log(`[Telegram] Recebida mensagem de texto de ${ctx.chat.id}: "${ctx.message.text.substring(0, 50)}..."`);
            const chatId = ctx.chat.id;
            const text = ctx.message.text;
            
            // Verificar se é comando /cancelar
            if (text.toLowerCase() === '/cancelar') {
                delete userSessions[chatId];
                ctx.reply('Cadastro cancelado. Use /start para começar novamente.').catch(err => console.error('❌ [Telegram] Erro ao responder /cancelar:', err));
                return;
            }
            
            // Verificar se o usuário está em um fluxo de cadastro
            const session = userSessions[chatId];
            if (!session) {
                // Se não está em cadastro, tratar como mensagem normal
                console.log(`[Telegram] Chat ${chatId} não está em sessão de cadastro. Ignorando.`);
                return;
            }
            
            const step = session.step;
            const userData = session.data;
            
            try {
                switch (step) {
                    case USER_STEPS.WAITING_NAME:
                        // Salvar nome
                        userData.name = text.trim();
                        session.step = USER_STEPS.WAITING_PIX;
                        ctx.reply(`Prazer, ${userData.name}! Qual sua chave **PIX** para pagamentos?`).catch(err => console.error('❌ [Telegram] Erro ao pedir PIX:', err));
                        break;
                        
                    case USER_STEPS.WAITING_PIX:
                        // Salvar PIX
                        userData.pixKey = text.trim();
                        session.step = USER_STEPS.WAITING_TYPE;
                        
                        // Perguntar tipo de trabalho com botões
                        ctx.reply('Certo! Como você vai trabalhar com a gente?', {
                            reply_markup: {
                                keyboard: [
                                    ['💼 Fixo'],
                                    ['🛵 Freelancer']
                                ],
                                resize_keyboard: true,
                                one_time_keyboard: true
                            }
                        }).catch(err => console.error('❌ [Telegram] Erro ao pedir tipo de trabalho:', err));
                        break;
                        
                    case USER_STEPS.WAITING_TYPE:
                        // Verificar se a resposta é válida
                        const normalizedText = text.trim().toLowerCase();
                        let driverType = null;
                        
                        if (normalizedText.includes('fixo') || normalizedText === '💼 fixo') {
                            driverType = 'FIXO';
                        } else if (normalizedText.includes('freelancer') || normalizedText === '🛵 freelancer') {
                            driverType = 'FREELANCER';
                        }
                        
                        if (driverType) {
                            // Salvar tipo
                            userData.type = driverType;
                            session.step = USER_STEPS.WAITING_PLATE;
                            
                            // Remover teclado e perguntar placa/modelo
                            ctx.reply(`Anotado. Qual a **Placa e Modelo** da sua moto?\n\nExemplo: "ABC-1234 | Honda CG 160"`, {
                                reply_markup: {
                                    remove_keyboard: true
                                }
                            }).catch(err => console.error('❌ [Telegram] Erro ao pedir placa/modelo:', err));
                        } else {
                            // Resposta inválida, repetir pergunta
                            ctx.reply('Por favor, escolha uma das opções abaixo:', {
                                reply_markup: {
                                    keyboard: [
                                        ['💼 Fixo'],
                                        ['🛵 Freelancer']
                                    ],
                                    resize_keyboard: true,
                                    one_time_keyboard: true
                                }
                            }).catch(err => console.error('❌ [Telegram] Erro ao repetir tipo de trabalho:', err));
                        }
                        break;
                        
                    case USER_STEPS.WAITING_PLATE:
                        // Salvar placa e modelo
                        userData.vehicle = text.trim();
                        session.step = USER_STEPS.WAITING_CONTACT;
                        
                        // Solicitar contato via botão
                        ctx.reply('Quase lá! Toque no botão abaixo para confirmar seu número de celular.', {
                            reply_markup: {
                                keyboard: [
                                    [{
                                        text: '📱 Compartilhar meu número',
                                        request_contact: true
                                    }]
                                ],
                                resize_keyboard: true,
                                one_time_keyboard: true
                            }
                        }).catch(err => console.error('❌ [Telegram] Erro ao pedir contato:', err));
                        break;
                        
                    default:
                        // Estado não reconhecido
                        console.warn(`[Telegram] Estado de cadastro não reconhecido para ${chatId}: ${step}`);
                        delete userSessions[chatId];
                        ctx.reply('Ocorreu um erro no cadastro. Use /start para começar novamente.').catch(err => console.error('❌ [Telegram] Erro ao responder estado desconhecido:', err));
                        break;
                }
            } catch (error) {
                console.error(`❌ [Telegram] Erro no processamento do wizard para ${chatId}:`, error);
                delete userSessions[chatId];
                ctx.reply('Ocorreu um erro. Use /start para tentar novamente.').catch(err => console.error('❌ [Telegram] Erro ao responder erro no wizard:', err));
            }
        });
        
        // Listener para contatos (compartilhamento de número)
        bot.on('contact', async (ctx) => {
            console.log(`[Telegram] Recebido contato de ${ctx.chat.id}`);
            const chatId = ctx.chat.id;
            const contact = ctx.message.contact;
            const session = userSessions[chatId];
            
            // Verificar se estamos esperando contato
            if (!session || session.step !== USER_STEPS.WAITING_CONTACT) {
                console.warn(`[Telegram] Contato recebido fora do fluxo de cadastro para ${chatId}. Ignorando.`);
                return;
            }
            
            // Verificar se o contato pertence ao usuário que enviou a mensagem
            if (contact.user_id !== ctx.from.id) {
                ctx.reply('Por favor, compartilhe seu próprio número de telefone.').catch(err => console.error('❌ [Telegram] Erro ao pedir próprio número:', err));
                return;
            }
            
            // Salvar telefone
            session.data.phone = contact.phone_number;
            
            // Formatar número (remover + se presente)
            let phoneNumber = session.data.phone;
            if (phoneNumber.startsWith('+')) {
                phoneNumber = phoneNumber.substring(1);
            }
            
            // Finalizar cadastro
            try {
                const userData = session.data;
                
                // Enviar dados para o backend via IPC
                const driverData = {
                    chatId: chatId,
                    name: userData.name,
                    pixKey: userData.pixKey,
                    type: userData.type || 'FREELANCER',
                    vehicle: userData.vehicle,
                    phone: phoneNumber,
                    telegramUserId: ctx.from.id,
                    username: ctx.from.username,
                    registeredAt: Date.now(),
                    inviteCode: session.inviteCode, // Envia o carimbo para o backend decidir
                    status: session.inviteCode ? 'active' : 'pending' // Ativo se tiver carimbo, pendente se for site-only
                };
                console.log('📤 [Telegram] Enviando driver-registered para main.js:', driverData);
                BrowserWindow.getAllWindows().forEach(win => {
                    win.webContents.send('driver-registered', driverData);
                });
                
                // Limpar sessão
                delete userSessions[chatId];
                
                // Mensagem de sucesso
                const typeDisplay = userData.type === 'FIXO' ? '💼 Fixo' : '🛵 Freelancer';
                ctx.reply(
                    `✅ Cadastro Concluído! 🚀\n\n` +
                    `Nome: ${userData.name}\n` +
                    `PIX: ${userData.pixKey}\n` +
                    `Tipo: ${typeDisplay}\n` +
                    `Moto: ${userData.vehicle}\n` +
                    `Telefone: ${phoneNumber}\n\n` +
                    `Agora você pode ficar online para receber corridas.`,
                    {
                        reply_markup: {
                            keyboard: [
                                [{
                                    text: '📍 Ficar Online',
                                    request_location: true
                                }]
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: false
                        }
                    }
                ).catch(err => console.error('❌ [Telegram] Erro ao enviar mensagem de sucesso de cadastro:', err));
                
                console.log(`✅ [Telegram] Novo entregador cadastrado: ${userData.name} (${phoneNumber})`);
                
            } catch (error) {
                console.error(`❌ [Telegram] Erro ao finalizar cadastro para ${chatId}:`, error);
                delete userSessions[chatId];
                ctx.reply('Erro ao salvar cadastro. Use /start para tentar novamente.').catch(err => console.error('❌ [Telegram] Erro ao responder erro ao salvar cadastro:', err));
            }
        });
        
        // Comando /help
        bot.help((ctx) => {
            console.log(`[Telegram] Recebido comando /help de ${ctx.from.id}`);
            ctx.reply(
                'Comandos disponíveis:\n' +
                '/start - Iniciar cadastro\n' +
                '/online - Ficar disponível para corridas\n' +
                '/offline - Sair do radar\n' +
                '/cancelar - Cancelar cadastro em andamento\n' +
                '\nPara compartilhar localização em tempo real, toque no clipe 📎 e selecione "Localização" → "Compartilhar localização em tempo real".'
            ).catch(err => console.error('❌ [Telegram] Erro ao responder /help:', err));
        });
        
        // Comando /online (check-in manual)
        bot.command('online', (ctx) => {
            console.log(`[Telegram] Recebido comando /online de ${ctx.from.id}`);
            ctx.reply('Para ficar online, compartilhe sua localização (fixa ou em tempo real). Toque no clipe 📎 e selecione "Localização".').catch(err => console.error('❌ [Telegram] Erro ao responder /online:', err));
        });
        
        // Comando /cancelar - Cancelar cadastro em andamento
        bot.command('cancelar', (ctx) => {
            console.log(`[Telegram] Recebido comando /cancelar de ${ctx.from.id}`);
            const chatId = ctx.chat.id;
            if (userSessions[chatId]) {
                delete userSessions[chatId];
                ctx.reply('Cadastro cancelado. Use /start para começar novamente.').catch(err => console.error('❌ [Telegram] Erro ao responder /cancelar (em andamento):', err));
            } else {
                ctx.reply('Não há cadastro em andamento para cancelar.').catch(err => console.error('❌ [Telegram] Erro ao responder /cancelar (sem andamento):', err));
            }
        });
        
        // Comando /offline
        bot.command('offline', (ctx) => {
            console.log(`[Telegram] Recebido comando /offline de ${ctx.from.id}`);
            // Remover do radar
            BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('driver-offline', {
                    phone: `telegram_${ctx.chat.id}`
                });
            });
            ctx.reply('Você saiu do radar. Para voltar, envie /online e compartilhe sua localização.').catch(err => console.error('❌ [Telegram] Erro ao responder /offline:', err));
        });
        
        // Iniciar bot
        console.log('🤖 [Telegram] Lançando bot...');
        await bot.launch(); // Aguarda o lançamento do bot
        console.log('✅ [Telegram] Bot Telegram iniciado com sucesso');
        
        // Configurar graceful shutdown
        process.once('SIGINT', () => {
            console.log('SIGINT recebido, parando bot Telegram...');
            bot && bot.stop('SIGINT');
        });
        process.once('SIGTERM', () => {
            console.log('SIGTERM recebido, parando bot Telegram...');
            bot && bot.stop('SIGTERM');
        });
        
        return bot;
    } catch (error) {
        console.error('❌ [Telegram] Erro fatal ao inicializar bot Telegram:', error);
        bot = null; // Garante que bot seja null se o lançamento falhar
        return null;
    }
}

// Exportar funções
module.exports = {
    initializeTelegramBot,
    getBot: () => bot
};
