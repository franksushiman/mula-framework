const { Telegraf } = require('telegraf');
const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');

// Carregar configuração
function loadConfig() {
    const fs = require('fs-extra');
    const dataDir = path.join(require('electron').app.getPath('userData'), 'data');
    const configPath = path.join(dataDir, 'config.json');
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (err) {
        console.error('Erro ao carregar config:', err);
    }
    return {};
}

let bot = null;
let config = null;

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
function initializeTelegramBot() {
    try {
        config = loadConfig();
        const token = config.telegramToken || config.telegramClientToken;
        
        if (!token || token.trim() === '') {
            console.warn('Token do Telegram não configurado. Configure na aba de Configurações.');
            return null;
        }
        
        console.log('Inicializando bot Telegram...');
        bot = new Telegraf(token);
        
        // Listener para mensagens editadas (Live Location)
        bot.on('edited_message', async (ctx) => {
            const msg = ctx.editedMessage;
            const chatId = msg.chat.id;
            
            // Verificar se a mensagem editada contém localização
            if (msg.location) {
                const lat = msg.location.latitude;
                const lng = msg.location.longitude;
                
                console.log(`[RASTREAMENTO] Entregador ${chatId} moveu-se para ${lat}, ${lng}`);
                
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
            const msg = ctx.message;
            const chatId = msg.chat.id;
            const location = msg.location;
            const lat = location.latitude;
            const lng = location.longitude;
            
            // Verificar se é Live Location (tem live_period)
            const isLiveLocation = location.live_period !== undefined;
            
            if (isLiveLocation) {
                console.log(`[LIVE] Entregador ${chatId} iniciou compartilhamento em tempo real`);
                
                // Responder confirmando
                ctx.reply('Rastreamento iniciado! 🛰️ Estamos te acompanhando no mapa.');
                
                // Registrar como rastreamento ativo
                // (Poderia armazenar em um mapa de activeLiveSessions)
            } else {
                // Localização fixa (check-in)
                console.log(`[CHECK-IN] Entregador ${chatId} enviou localização fixa: ${lat}, ${lng}`);
                
                // Responder conforme lógica existente
                ctx.reply('Localização recebida! ✅ Agora você está online no radar.');
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
            const chatId = ctx.chat.id;
            const startPayload = ctx.startPayload; // Parâmetro após /start
            console.log(`Novo entregador ${ctx.from.id} iniciou com payload: ${startPayload}`);
            
            // Verificar se o usuário já está cadastrado
            // Aqui você pode integrar com o sistema existente para verificar se o chatId já está na frota
            // Por enquanto, vamos sempre iniciar o cadastro para novos usuários
            
            // Limpar sessão anterior se existir
            delete userSessions[chatId];
            
            // Iniciar novo cadastro
            userSessions[chatId] = {
                step: USER_STEPS.WAITING_NAME,
                data: {}
            };
            
            ctx.reply('👋 Bem-vindo à frota Ceia Delivery! Vamos fazer seu cadastro.\n\nPrimeiro, qual é seu **Nome Completo**?');
        });
        
        // Listener para mensagens de texto (respostas do wizard)
        bot.on('text', async (ctx) => {
            const chatId = ctx.chat.id;
            const text = ctx.message.text;
            
            // Verificar se é comando /cancelar
            if (text.toLowerCase() === '/cancelar') {
                delete userSessions[chatId];
                ctx.reply('Cadastro cancelado. Use /start para começar novamente.');
                return;
            }
            
            // Verificar se o usuário está em um fluxo de cadastro
            const session = userSessions[chatId];
            if (!session) {
                // Se não está em cadastro, tratar como mensagem normal
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
                        ctx.reply(`Prazer, ${userData.name}! Qual sua chave **PIX** para pagamentos?`);
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
                        });
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
                            });
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
                            });
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
                        });
                        break;
                        
                    default:
                        // Estado não reconhecido
                        delete userSessions[chatId];
                        ctx.reply('Ocorreu um erro no cadastro. Use /start para começar novamente.');
                        break;
                }
            } catch (error) {
                console.error('Erro no processamento do wizard:', error);
                delete userSessions[chatId];
                ctx.reply('Ocorreu um erro. Use /start para tentar novamente.');
            }
        });
        
        // Listener para contatos (compartilhamento de número)
        bot.on('contact', async (ctx) => {
            const chatId = ctx.chat.id;
            const contact = ctx.message.contact;
            const session = userSessions[chatId];
            
            // Verificar se estamos esperando contato
            if (!session || session.step !== USER_STEPS.WAITING_CONTACT) {
                return;
            }
            
            // Verificar se o contato pertence ao usuário que enviou a mensagem
            if (contact.user_id !== ctx.from.id) {
                ctx.reply('Por favor, compartilhe seu próprio número de telefone.');
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
                BrowserWindow.getAllWindows().forEach(win => {
                    win.webContents.send('driver-registered', {
                        chatId: chatId,
                        name: userData.name,
                        pixKey: userData.pixKey,
                        type: userData.type || 'FREELANCER', // Incluir tipo
                        vehicle: userData.vehicle,
                        phone: phoneNumber,
                        telegramUserId: ctx.from.id,
                        username: ctx.from.username
                    });
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
                );
                
                console.log(`✅ Novo entregador cadastrado: ${userData.name} (${phoneNumber})`);
                
            } catch (error) {
                console.error('Erro ao finalizar cadastro:', error);
                delete userSessions[chatId];
                ctx.reply('Erro ao salvar cadastro. Use /start para tentar novamente.');
            }
        });
        
        // Comando /help
        bot.help((ctx) => {
            ctx.reply(
                'Comandos disponíveis:\n' +
                '/start - Iniciar cadastro\n' +
                '/online - Ficar disponível para corridas\n' +
                '/offline - Sair do radar\n' +
                '/cancelar - Cancelar cadastro em andamento\n' +
                '\nPara compartilhar localização em tempo real, toque no clipe 📎 e selecione "Localização" → "Compartilhar localização em tempo real".'
            );
        });
        
        // Comando /online (check-in manual)
        bot.command('online', (ctx) => {
            ctx.reply('Para ficar online, compartilhe sua localização (fixa ou em tempo real). Toque no clipe 📎 e selecione "Localização".');
        });
        
        // Comando /cancelar - Cancelar cadastro em andamento
        bot.command('cancelar', (ctx) => {
            const chatId = ctx.chat.id;
            if (userSessions[chatId]) {
                delete userSessions[chatId];
                ctx.reply('Cadastro cancelado. Use /start para começar novamente.');
            } else {
                ctx.reply('Não há cadastro em andamento para cancelar.');
            }
        });
        
        // Comando /offline
        bot.command('offline', (ctx) => {
            // Remover do radar
            BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('driver-offline', {
                    phone: `telegram_${ctx.chat.id}`
                });
            });
            ctx.reply('Você saiu do radar. Para voltar, envie /online e compartilhe sua localização.');
        });
        
        // Iniciar bot
        bot.launch().then(() => {
            console.log('✅ Bot Telegram iniciado com sucesso');
        }).catch(err => {
            console.error('❌ Erro ao iniciar bot Telegram:', err);
        });
        
        // Configurar graceful shutdown
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
        
        return bot;
    } catch (error) {
        console.error('Erro ao inicializar bot Telegram:', error);
        return null;
    }
}

// Exportar funções
module.exports = {
    initializeTelegramBot,
    getBot: () => bot
};
