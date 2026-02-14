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
            const startPayload = ctx.startPayload; // Parâmetro após /start
            console.log(`Novo entregador ${ctx.from.id} iniciou com payload: ${startPayload}`);
            
            // Lógica de cadastro (pode ser integrada com o sistema existente)
            ctx.reply('👋 Bem-vindo à frota Ceia Delivery! Para começar, compartilhe sua localização para ficar online.');
        });
        
        // Comando /help
        bot.help((ctx) => {
            ctx.reply(
                'Comandos disponíveis:\n' +
                '/start - Iniciar cadastro\n' +
                '/online - Ficar disponível para corridas\n' +
                '/offline - Sair do radar\n' +
                '/pix - Configurar chave PIX\n' +
                '\nPara compartilhar localização em tempo real, toque no clipe 📎 e selecione "Localização" → "Compartilhar localização em tempo real".'
            );
        });
        
        // Comando /online (check-in manual)
        bot.command('online', (ctx) => {
            ctx.reply('Para ficar online, compartilhe sua localização (fixa ou em tempo real). Toque no clipe 📎 e selecione "Localização".');
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
