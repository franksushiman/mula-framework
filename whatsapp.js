const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');

// Inicializa o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "ceia-delivery"
    }),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Variável para armazenar o QR Code atual
let currentQrCode = null;

// Variável para armazenar o status da conexão
let whatsappStatus = {
    connected: false,
    phone: null,
    readyAt: null
};

// Evento: QR Code recebido
client.on('qr', (qr) => {
    console.log('\n=== QR CODE PARA CONEXÃO DO WHATSAPP ===');
    qrcode.generate(qr, { small: true });
    console.log('Por favor, escaneie o QR Code acima com o WhatsApp da loja.');
    console.log('No celular: WhatsApp → Menu → Aparelhos conectados → Conectar um aparelho\n');
    
    // Emitir evento para o frontend (se necessário)
    // mainWindow.webContents.send('whatsapp-qr', qr);
});

// Evento: Cliente pronto (configurado apenas uma vez)
// Este listener é configurado em setupClientListeners, não aqui

// Evento: Cliente autenticado (configurado apenas uma vez)
// Este listener é configurado em setupClientListeners, não aqui

// Evento: Desconectado
client.on('disconnected', (reason) => {
    console.log(`❌ WhatsApp desconectado: ${reason}`);
    whatsappStatus.connected = false;
    whatsappStatus.phone = null;
});

// Evento: Mensagem recebida (configurado apenas uma vez em setupClientListeners)
// Removido para evitar duplicação

// Importar o serviço de IA
let aiService = null;
try {
    aiService = require('./ai_service');
    console.log('✅ Serviço de IA carregado com sucesso');
} catch (error) {
    console.warn('⚠️  Serviço de IA não disponível:', error.message);
    aiService = {
        gerarRespostaIA: async () => 'Desculpe, o serviço de IA não está disponível no momento.'
    };
}

// Função para enviar mensagem
async function sendWhatsAppMessage(phone, message) {
    try {
        // Formatar número: remover caracteres não numéricos e adicionar @c.us
        const formattedPhone = phone.replace(/\D/g, '');
        
        // Verificar se o número tem código do país
        let finalPhone = formattedPhone;
        if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
            // Adicionar código do Brasil se não tiver
            finalPhone = '55' + formattedPhone;
        }
        
        const chatId = `${finalPhone}@c.us`;
        
        console.log(`📤 Enviando WhatsApp para ${chatId}: ${message.substring(0, 50)}...`);
        
        // Enviar mensagem
        const response = await client.sendMessage(chatId, message);
        
        console.log(`✅ Mensagem enviada com sucesso: ${response.id.id}`);
        return {
            success: true,
            messageId: response.id.id,
            timestamp: response.timestamp,
            to: chatId
        };
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem WhatsApp:', error);
        throw error;
    }
}

// Função para obter status da conexão
function getWhatsAppStatus() {
    // Verificar se o cliente está realmente conectado
    let actuallyConnected = whatsappStatus.connected;
    
    // Se está inicializado e tem readyAt, está conectado
    if (isInitialized && whatsappStatus.readyAt) {
        actuallyConnected = true;
    }
    
    // Determinar status
    let status;
    if (actuallyConnected) {
        status = 'connected';
    } else if (isInitializing) {
        status = 'initializing';
    } else {
        status = 'disconnected';
    }
    
    // Mensagem apropriada
    let message;
    if (actuallyConnected) {
        message = `Conectado como ${whatsappStatus.phone || 'número desconhecido'}`;
    } else if (isInitializing) {
        message = 'Inicializando...';
    } else {
        message = 'Desconectado';
    }
    
    return {
        connected: actuallyConnected,
        phone: whatsappStatus.phone,
        readyAt: whatsappStatus.readyAt,
        isInitialized: isInitialized,
        isInitializing: isInitializing,
        timestamp: new Date(),
        status: status,
        message: message
    };
}

// Variáveis para controlar o estado do WhatsApp
let isInitialized = false;
let isInitializing = false;
let initializationTimeout = null;
let clientListenersConfigured = false;

// Função para reiniciar a conexão
function restartWhatsApp() {
    console.log('🔄 Reiniciando conexão WhatsApp...');
    return new Promise((resolve, reject) => {
        try {
            // Verificar se o cliente está disponível
            if (!client) {
                reject(new Error('Cliente WhatsApp não disponível'));
                return;
            }
            
            // Tentar destruir o cliente atual
            client.destroy().then(() => {
                console.log('✅ WhatsApp destruído, reinicializando...');
                
                // Resetar o estado
                isInitialized = false;
                whatsappStatus.connected = false;
                whatsappStatus.phone = null;
                whatsappStatus.readyAt = null;
                
                // Aguardar um momento antes de reinicializar
                setTimeout(() => {
                    // Tentar inicializar novamente
                    client.initialize().then(() => {
                        console.log('✅ WhatsApp reinicializado com sucesso!');
                        resolve();
                    }).catch(error => {
                        console.error('❌ Erro ao reinicializar WhatsApp:', error);
                        reject(error);
                    });
                }, 2000);
            }).catch(error => {
                console.error('❌ Erro ao destruir WhatsApp:', error);
                // Mesmo se falhar ao destruir, tentar inicializar
                client.initialize().then(() => {
                    console.log('✅ WhatsApp inicializado após falha na destruição!');
                    resolve();
                }).catch(initError => {
                    console.error('❌ Erro ao inicializar WhatsApp após falha:', initError);
                    reject(initError);
                });
            });
        } catch (error) {
            console.error('❌ Erro ao reiniciar WhatsApp:', error);
            reject(error);
        }
    });
}

// Função para configurar listeners do cliente (apenas uma vez)
function setupClientListeners() {
    try {
        // Verificar se os listeners já foram configurados
        if (clientListenersConfigured) {
            console.log('Listeners do WhatsApp já configurados');
            return;
        }
        
        console.log('Configurando listeners do WhatsApp...');
        
        // Configurar os listeners padrão
        client.on('qr', (qr) => {
            console.log('\n=== QR CODE PARA CONEXÃO DO WHATSAPP ===');
            try {
                qrcode.generate(qr, { small: true });
            } catch (error) {
                console.log('QR Code recebido (não foi possível gerar visualização):', qr.substring(0, 50) + '...');
            }
            console.log('Por favor, escaneie o QR Code acima com o WhatsApp da loja.');
            console.log('No celular: WhatsApp → Menu → Aparelhos conectados → Conectar um aparelho\n');
            
            // Converter QR para imagem
            QRCode.toDataURL(qr, (err, url) => {
                if (err) {
                    console.error('Erro ao converter QR Code:', err);
                    return;
                }
                currentQrCode = url;
                console.log('QR Code convertido para imagem');
                
                // Enviar para todas as janelas do Electron
                if (typeof require !== 'undefined') {
                    const { BrowserWindow } = require('electron');
                    BrowserWindow.getAllWindows().forEach(win => {
                        win.webContents.send('whatsapp-qr-updated', { qrImage: url });
                    });
                }
            });
        });
        
        client.on('ready', () => {
            console.log('✅ WhatsApp está pronto!');
            
            // Limpar timeout de inicialização
            if (initializationTimeout) {
                clearTimeout(initializationTimeout);
                initializationTimeout = null;
            }
            
            whatsappStatus.connected = true;
            whatsappStatus.readyAt = new Date();
            isInitialized = true;
            isInitializing = false;
            
            // Obter informações do número conectado
            client.getState().then(state => {
                console.log(`Estado: ${state}`);
            }).catch(error => {
                console.error('Erro ao obter estado:', error);
            });
            
            client.info.then(info => {
                whatsappStatus.phone = info.wid.user;
                console.log(`📱 Conectado como: ${whatsappStatus.phone}`);
            }).catch(error => {
                console.error('Erro ao obter info:', error);
            });
        });
        
        client.on('authenticated', () => {
            console.log('🔐 WhatsApp autenticado!');
        });
        
        client.on('auth_failure', (error) => {
            console.error('❌ Falha na autenticação do WhatsApp:', error);
            whatsappStatus.connected = false;
            isInitialized = false;
            isInitializing = false;
            
            // Limpar timeout
            if (initializationTimeout) {
                clearTimeout(initializationTimeout);
                initializationTimeout = null;
            }
        });
        
        client.on('disconnected', (reason) => {
            console.log(`❌ WhatsApp desconectado: ${reason}`);
            whatsappStatus.connected = false;
            whatsappStatus.phone = null;
            isInitialized = false;
            isInitializing = false;
            
            // Limpar timeout
            if (initializationTimeout) {
                clearTimeout(initializationTimeout);
                initializationTimeout = null;
            }
        });
        
        client.on('message', async (msg) => {
            // 1. Filtro de Segurança: Ignorar mensagens de grupos e do próprio bot
            if (msg.from.includes('@g.us') || msg.fromMe) return;
            
            console.log(`📩 Mensagem recebida de ${msg.from}: ${msg.body?.substring(0, 100) || 'sem corpo'}...`);
            
            try {
                // 2. Simular "Digitando..." para parecer humano
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                
                // 3. Contexto da loja (placeholder - pode ser melhorado)
                const contextoLoja = "Restaurante Ceia Delivery. Cardápio: Pizza (R$ 45), Hamburguer (R$ 35), Sushi (R$ 60). Horário: 18h-23h. Entrega: R$ 10.";
                
                // 4. Chamar a OpenAI para gerar resposta
                let respostaIA;
                if (aiService && aiService.gerarRespostaIA) {
                    // Tentar obter a chave OpenAI do config (se disponível)
                    let openAIKey = null;
                    try {
                        // Se estivermos no contexto do Electron, podemos acessar o config
                        if (typeof require !== 'undefined') {
                            const fs = require('fs');
                            const path = require('path');
                            const { app } = require('electron');
                            
                            const configPath = path.join(app.getPath('userData'), 'data', 'config.json');
                            if (fs.existsSync(configPath)) {
                                const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                                openAIKey = configData.openAIKey || configData.openaiKey || null;
                            }
                        }
                    } catch (configError) {
                        console.warn('⚠️  Não foi possível ler a chave OpenAI do config:', configError.message);
                    }
                    
                    // Chamar a função com a chave (se encontrada)
                    respostaIA = await aiService.gerarRespostaIA(msg.body, contextoLoja, openAIKey);
                } else {
                    respostaIA = "Olá! Sou o assistente virtual do Ceia Delivery. No momento nosso sistema de IA está em manutenção. Para fazer um pedido, envie 'cardápio' ou fale com nosso atendente humano.";
                }
                
                // 5. Responder
                await msg.reply(respostaIA);
                await chat.clearState(); // Para de digitar
                
                console.log(`✅ Resposta enviada para ${msg.from}: ${respostaIA.substring(0, 50)}...`);
                
            } catch (erro) {
                console.error('❌ Erro ao processar mensagem com IA:', erro);
                
                // Tentar enviar uma mensagem de fallback
                try {
                    await msg.reply("Desculpe, tive um problema ao processar sua mensagem. Por favor, tente novamente ou ligue para nosso restaurante.");
                } catch (fallbackError) {
                    console.error('❌ Erro ao enviar mensagem de fallback:', fallbackError);
                }
            }
            
            // Processamento de mídia (áudio, localização) continua funcionando em paralelo
            // Verificar se é uma mensagem de áudio
            if (msg.hasMedia) {
                try {
                    console.log(`🎵 Mensagem de áudio detectada de ${msg.from}`);
                    
                    // Baixar a mídia
                    const media = await msg.downloadMedia();
                    
                    if (media) {
                        console.log(`Áudio baixado: ${media.mimetype}, ${media.data.length} bytes`);
                        
                        // Preparar dados para processamento
                        const audioData = media.data; // Base64
                        const mimeType = media.mimetype;
                        
                        // Enviar para processamento via IPC (se estiver no contexto do Electron)
                        if (typeof require !== 'undefined') {
                            try {
                                const { ipcMain } = require('electron');
                                
                                // Notificar o frontend sobre o áudio recebido
                                const { BrowserWindow } = require('electron');
                                BrowserWindow.getAllWindows().forEach(win => {
                                    win.webContents.send('whatsapp-audio-received', {
                                        from: msg.from,
                                        messageId: msg.id.id,
                                        timestamp: msg.timestamp,
                                        mimeType: mimeType,
                                        dataSize: audioData.length
                                    });
                                });
                                
                                // Processar o áudio em segundo plano
                                setTimeout(async () => {
                                    try {
                                        // Chamar o handler de processamento de áudio
                                        const result = await ipcMain.handle('whatsapp-process-audio-message', 
                                            { messageId: msg.id.id, audioData, mimeType });
                                        
                                        console.log(`Resultado do processamento de áudio: ${result.success ? 'Sucesso' : 'Falha'}`);
                                        
                                        // Se for um pedido, notificar o sistema
                                        if (result.success && result.analysis && result.analysis.intent === 'pedido') {
                                            console.log(`🎯 Pedido detectado no áudio: ${result.analysis.transcription.substring(0, 100)}...`);
                                            
                                            // Notificar o frontend sobre o pedido detectado
                                            BrowserWindow.getAllWindows().forEach(win => {
                                                win.webContents.send('whatsapp-order-detected', {
                                                    from: msg.from,
                                                    messageId: msg.id.id,
                                                    analysis: result.analysis,
                                                    transcription: result.transcription
                                                });
                                            });
                                        }
                                        
                                    } catch (processError) {
                                        console.error('Erro ao processar áudio em segundo plano:', processError);
                                    }
                                }, 1000);
                                
                            } catch (ipcError) {
                                console.error('Erro ao enviar áudio para processamento IPC:', ipcError);
                            }
                        }
                    }
                } catch (mediaError) {
                    console.error('Erro ao processar mídia de áudio:', mediaError);
                }
            }
            
            // Verificar se é uma mensagem de localização
            if (msg.type === 'location') {
                try {
                    console.log(`📍 Mensagem de localização detectada de ${msg.from}`);
                    
                    // Extrair coordenadas
                    const location = msg.location;
                    if (location) {
                        const latitude = location.latitude;
                        const longitude = location.longitude;
                        const contextMessage = msg.body || '';
                        
                        console.log(`Coordenadas: ${latitude}, ${longitude}`);
                        
                        // Enviar para processamento via IPC (se estiver no contexto do Electron)
                        if (typeof require !== 'undefined') {
                            const { ipcMain } = require('electron');
                            
                            // Notificar o frontend sobre a localização recebida
                            const { BrowserWindow } = require('electron');
                            BrowserWindow.getAllWindows().forEach(win => {
                                win.webContents.send('whatsapp-location-received', {
                                    from: msg.from,
                                    messageId: msg.id.id,
                                    timestamp: msg.timestamp,
                                    latitude: latitude,
                                    longitude: longitude,
                                    contextMessage: contextMessage
                                });
                            });
                            
                            // Processar a localização em segundo plano
                            setTimeout(async () => {
                                try {
                                    // Chamar o handler de processamento de localização
                                    const result = await ipcMain.handle('whatsapp-process-location-message', 
                                        { messageId: msg.id.id, latitude, longitude, contextMessage });
                                    
                                    console.log(`Resultado do processamento de localização: ${result.success ? 'Sucesso' : 'Falha'}`);
                                    
                                    // Se for um endereço de entrega, notificar o sistema
                                    if (result.success && result.analysis && result.analysis.interpreted_as === 'endereco_entrega') {
                                        console.log(`🎯 Endereço de entrega detectado: ${result.analysis.address_guess || 'sem endereço'}`);
                                        
                                        // Notificar o frontend sobre o endereço detectado
                                        BrowserWindow.getAllWindows().forEach(win => {
                                            win.webContents.send('whatsapp-delivery-address-detected', {
                                                from: msg.from,
                                                messageId: msg.id.id,
                                                analysis: result.analysis,
                                                coordinates: { latitude, longitude }
                                            });
                                        });
                                    }
                                    
                                } catch (processError) {
                                    console.error('Erro ao processar localização em segundo plano:', processError);
                                }
                            }, 1000);
                        }
                    }
                } catch (locationError) {
                    console.error('Erro ao processar localização:', locationError);
                }
            }
        });
        
        clientListenersConfigured = true;
        console.log('Listeners do WhatsApp configurados com sucesso');
    } catch (error) {
        console.error('Erro ao configurar listeners do WhatsApp:', error);
    }
}

// Função para inicializar o WhatsApp manualmente
function initializeWhatsApp() {
    // Se já está inicializado e conectado, retornar sucesso imediatamente
    if (isInitialized && whatsappStatus.connected) {
        console.log('WhatsApp já está inicializado e conectado');
        return Promise.resolve();
    }
    
    // Se está inicializando, retornar uma promessa que aguarda o resultado
    if (isInitializing) {
        console.log('WhatsApp já está em processo de inicialização, aguardando...');
        return new Promise((resolve, reject) => {
            // Verificar periodicamente se já está pronto
            const checkInterval = setInterval(() => {
                if (isInitialized && whatsappStatus.connected) {
                    clearInterval(checkInterval);
                    console.log('WhatsApp conectado após espera!');
                    resolve();
                }
                // Timeout após 30 segundos
            }, 1000);
            
            // Timeout após 30 segundos
            setTimeout(() => {
                clearInterval(checkInterval);
                if (isInitialized && whatsappStatus.connected) {
                    resolve();
                } else {
                    reject(new Error('Timeout ao aguardar inicialização do WhatsApp'));
                }
            }, 30000);
        });
    }
    
    console.log('🚀 Inicializando WhatsApp Web...');
    return new Promise((resolve, reject) => {
        try {
            isInitializing = true;
            
            // Configurar listeners primeiro (apenas uma vez)
            setupClientListeners();
            
            // Inicializar o cliente
            console.log('Chamando client.initialize()...');
            client.initialize().catch(error => {
                isInitializing = false;
                console.error('Erro ao chamar client.initialize():', error);
                reject(new Error('Erro ao inicializar cliente: ' + error.message));
            });
            
            // Aguardar o evento 'ready' ou timeout
            const readyTimeout = setTimeout(() => {
                isInitializing = false;
                console.error('Timeout ao inicializar WhatsApp (60 segundos)');
                reject(new Error('Timeout ao inicializar WhatsApp (60 segundos)'));
            }, 60000);
            
            // Usar listeners permanentes em vez de once(), já que setupClientListeners
            // já configurou os listeners permanentes
            // Apenas precisamos monitorar quando o ready acontece
            const checkReady = setInterval(() => {
                if (isInitialized && whatsappStatus.connected) {
                    clearInterval(checkReady);
                    clearTimeout(readyTimeout);
                    isInitializing = false;
                    console.log('✅ WhatsApp inicializado com sucesso!');
                    resolve();
                }
            }, 500);
            
        } catch (error) {
            isInitializing = false;
            console.error('Erro na função initializeWhatsApp:', error);
            reject(new Error('Erro ao inicializar WhatsApp: ' + error.message));
        }
    });
}


// Função para verificar se está inicializado
function isWhatsAppInitialized() {
    return isInitialized && whatsappStatus.connected;
}

// Função para resetar o estado de inicialização
function resetInitialization() {
    isInitialized = false;
    whatsappStatus.connected = false;
    whatsappStatus.phone = null;
    whatsappStatus.readyAt = null;
}

// Exportar funções
module.exports = {
    sendWhatsAppMessage,
    getWhatsAppStatus,
    restartWhatsApp,
    initializeWhatsApp,
    isWhatsAppInitialized,
    resetInitialization,
    client
};
