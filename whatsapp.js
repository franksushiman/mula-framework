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
let currentMainConfig = null;
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

// Importar módulos necessários para manipulação de arquivos e sistema operacional
const fs = require('fs');
const path = require('path');
const os = require('os');

// Importar o serviço de IA
let aiService = null;
try {
    aiService = require('./ai_service');
    console.log('✅ Serviço de IA carregado com sucesso');
} catch (error) {
    console.warn('⚠️  Serviço de IA não disponível:', error.message);
    aiService = {
        gerarRespostaIA: async () => 'Desculpe, o serviço de IA não está disponível no momento.',
        transcreverAudio: async () => { throw new Error('Serviço de transcrição não disponível'); }
    };
}

// Função para enviar mensagem
async function sendWhatsAppMessage(phone, message) {
    try {
        // Formatar número: remover caracteres não numéricos
        const formattedPhone = phone.replace(/\D/g, '');
        
        // Verificar se o número tem código do país
        let finalPhone = formattedPhone;
        if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
            // Adicionar código do Brasil se não tiver
            finalPhone = '55' + formattedPhone;
        }
        
        console.log(`📤 Verificando número WhatsApp: ${finalPhone} (original: ${phone})`);
        
        // Verificar se o cliente está pronto
        if (!client.info) {
            throw new Error('Cliente WhatsApp não está pronto');
        }
        
        // Obter o ID do número no WhatsApp
        const numberId = await client.getNumberId(finalPhone);
        
        if (!numberId) {
            throw new Error(`Número ${finalPhone} não registrado no WhatsApp`);
        }
        
        // Usar o ID serializado do número
        const chatId = numberId._serialized;
        
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
            
            // Resetar o estado
            isInitialized = false;
            whatsappStatus.connected = false;
            whatsappStatus.phone = null;
            whatsappStatus.readyAt = null;
            isInitializing = false;
            
            // Tentar destruir o cliente atual
            client.destroy().then(() => {
                console.log('✅ WhatsApp destruído, aguardando 3 segundos antes de reinicializar...');
                
                // Aguardar um momento antes de reinicializar
                setTimeout(() => {
                    // Tentar inicializar novamente
                    client.initialize().then(() => {
                        console.log('✅ WhatsApp reinicializado com sucesso!');
                        resolve();
                    }).catch(error => {
                        console.error('❌ Erro ao reinicializar WhatsApp:', error);
                        
                        // Se for erro de "already running", tentar uma abordagem diferente
                        if (error.message.includes('already running') || error.message.includes('userDataDir')) {
                            console.warn('⚠️  Browser ainda rodando após destruição. Tentando abordagem alternativa...');
                            
                            // Usar uma estratégia mais agressiva: forçar nova sessão
                            const fs = require('fs');
                            const path = require('path');
                            const { app } = require('electron');
                            
                            const sessionPath = path.join(app.getPath('userData'), '.wwebjs_auth', 'session-ceia-delivery');
                            if (fs.existsSync(sessionPath)) {
                                console.log('Removendo sessão antiga:', sessionPath);
                                fs.rmSync(sessionPath, { recursive: true, force: true });
                            }
                            
                            // Aguardar mais tempo e tentar novamente
                            setTimeout(() => {
                                client.initialize().then(() => {
                                    console.log('✅ WhatsApp reinicializado após limpeza de sessão!');
                                    resolve();
                                }).catch(finalError => {
                                    console.error('❌ Erro final ao reinicializar:', finalError);
                                    reject(finalError);
                                });
                            }, 3000);
                        } else {
                            reject(error);
                        }
                    });
                }, 3000);
            }).catch(error => {
                console.error('❌ Erro ao destruir WhatsApp:', error);
                
                // Se não conseguir destruir, tentar inicializar mesmo assim
                console.log('Tentando inicializar mesmo com erro na destruição...');
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
function setupClientListeners(mainConfig) {
    try {
        currentMainConfig = mainConfig;
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
            
            // 2. Verificar o tipo da mensagem para evitar race condition
            // Se for áudio, processar apenas o áudio e não responder com texto
            if (msg.type === 'ptt' || msg.type === 'audio' || msg.hasMedia) {
                console.log(`🎵 Áudio detectado de ${msg.from}. Processando apenas áudio...`);
                
                try {
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
                                setTimeout(() => {
                                    try {
                                        // Enviar notificação para o frontend
                                        if (typeof require !== 'undefined') {
                                            const { BrowserWindow } = require('electron');
                                            BrowserWindow.getAllWindows().forEach(win => {
                                                win.webContents.send('whatsapp-audio-to-process', {
                                                    messageId: msg.id.id,
                                                    audioData: audioData,
                                                    mimeType: mimeType,
                                                    from: msg.from,
                                                    timestamp: msg.timestamp
                                                });
                                            });
                                            
                                            console.log('Áudio enviado para processamento via frontend');
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
                
                // IMPORTANTE: Processar áudio e transcrever
                try {
                    // Baixar a mídia corretamente
                    const media = await msg.downloadMedia();
                                
                    if (!media) {
                        throw new Error('Falha ao baixar mídia');
                    }
                                
                    console.log(`Áudio baixado: ${media.mimetype}, ${media.data.length} bytes`);
                                
                    // Converter Base64 para Buffer
                    const buffer = Buffer.from(media.data, 'base64');
                                
                    // Criar nome único para o arquivo temporário
                    const tempFileName = path.join(__dirname, `temp_${msg.id.id}.ogg`);
                                
                    // Salvar o arquivo temporário no disco
                    fs.writeFileSync(tempFileName, buffer);
                    console.log(`Arquivo salvo em: ${tempFileName}`);
                                
                    try {
                        // Transcrever áudio usando o serviço de IA
                        if (aiService && aiService.transcreverAudio) {
                            console.log('🎤 Enviando para Whisper...');
                                        
                            // Transcrever o áudio
                            const transcricao = await aiService.transcreverAudio(buffer, media.mimetype);
                                        
                            if (transcricao && transcricao.trim()) {
                                console.log(`📝 Transcrição: ${transcricao.substring(0, 100)}...`);
                                            
                                // Simular "Digitando..." para parecer humano
                                const chat = await msg.getChat();
                                await chat.sendStateTyping();
                                            
                                // Contexto da loja - usar a configuração passada ou genérico
                                // Padrão agnóstico caso a config falhe
                                let contextoLoja = "Você é um assistente de um restaurante fictício em um ambiente de teste. Responda às perguntas do cliente com base nas informações a seguir. Restaurante e Delivery. Consulte nosso cardápio e horários.";

                                // Tentar usar informações reais do mainConfig passado
                                if (currentMainConfig) {
                                    const hasRealInfo = currentMainConfig.restaurantAddress || 
                                                   (currentMainConfig.menuItems && currentMainConfig.menuItems.length > 0) ||
                                                   currentMainConfig.storeName;

                                    if (hasRealInfo) {
                                        let contextParts = [];
                                        if (currentMainConfig.storeName && currentMainConfig.storeName !== 'Delivery Manager') {
                                            contextParts.push(`Estabelecimento: ${currentMainConfig.storeName}`);
                                        }
                                        if (currentMainConfig.restaurantAddress) {
                                            contextParts.push(`Endereço: ${currentMainConfig.restaurantAddress}`);
                                        }
                                        if (currentMainConfig.menuItems && currentMainConfig.menuItems.length > 0) {
                                            const menuString = currentMainConfig.menuItems
                                                .filter(item => !item.paused)
                                                .map(item => `${item.name}: R$${(item.price || 0).toFixed(2)}` + (item.description ? ` (${item.description})` : ''))
                                                .join('\n');
                                            contextParts.push(`Cardápio disponível:\n${menuString}`);
                                        }
                                        if (contextParts.length > 0) {
                                            contextoLoja = `Você é um assistente de um restaurante fictício em um ambiente de teste. Responda às perguntas do cliente com base nas informações a seguir. ` + contextParts.join('. ');
                                        }
                                    }
                                }

                                // Chamar a OpenAI para gerar resposta baseada na transcrição
                                let respostaIA;
                                if (aiService && aiService.gerarRespostaIA) {
                                    // Usar a chave do mainConfig
                                    let openAIKey = currentMainConfig ? (currentMainConfig.openAIKey || currentMainConfig.openaiKey) : null;
                                    respostaIA = await aiService.gerarRespostaIA(transcricao, contextoLoja, openAIKey);
                                } else {
                                    const nomeLoja = (currentMainConfig && currentMainConfig.storeName) ? currentMainConfig.storeName : "nosso restaurante";
                                    respostaIA = `Olá! Recebi sua mensagem de áudio, mas nosso sistema de IA está em manutenção. Por favor, envie uma mensagem de texto.`;
                                }
                                            
                                // Responder
                                await msg.reply(respostaIA);
                                await chat.clearState(); // Para de digitar
                                            
                                console.log(`✅ Resposta enviada para ${msg.from}: ${respostaIA.substring(0, 50)}...`);
                            } else {
                                console.log('⚠️  Transcrição vazia ou inválida');
                                await msg.reply("Olá! Recebi sua mensagem de áudio, mas não consegui entender o que foi dito. Pode repetir por texto, por favor?");
                            }
                        } else {
                            console.log('⚠️  Serviço de transcrição não disponível');
                            await msg.reply("Olá! Recebi sua mensagem de áudio, mas nosso sistema de transcrição não está disponível no momento. Pode enviar por texto?");
                        }
                    } catch (transcriptionError) {
                        console.error('❌ Erro ao processar transcrição:', transcriptionError);
                        await msg.reply("Desculpe, tive um problema ao processar seu áudio. Pode enviar sua mensagem por texto?");
                    } finally {
                        // Limpeza: Apagar arquivo temporário
                        try {
                            if (fs.existsSync(tempFileName)) {
                                fs.unlinkSync(tempFileName);
                                console.log(`Arquivo temporário removido: ${tempFileName}`);
                            }
                        } catch (cleanupError) {
                            console.warn('⚠️  Não foi possível remover arquivo temporário:', cleanupError.message);
                        }
                    }
                } catch (mediaError) {
                    console.error('❌ Erro ao processar mídia de áudio:', mediaError);
                    await msg.reply("Desculpe, tive um problema ao baixar seu áudio. Pode enviar sua mensagem por texto?");
                }
                
                // IMPORTANTE: Retornar aqui para não processar como texto novamente
                return;
            }
            
            // 3. Verificar se é uma mensagem de localização
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
                            setTimeout(() => {
                                try {
                                    // Enviar notificação para o frontend
                                    if (typeof require !== 'undefined') {
                                        const { BrowserWindow } = require('electron');
                                        BrowserWindow.getAllWindows().forEach(win => {
                                            win.webContents.send('whatsapp-location-to-process', {
                                                messageId: msg.id.id,
                                                latitude: latitude,
                                                longitude: longitude,
                                                contextMessage: contextMessage,
                                                from: msg.from,
                                                timestamp: msg.timestamp
                                            });
                                        });
                                        
                                        console.log('Localização enviada para processamento via frontend');
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
                
                // IMPORTANTE: Retornar aqui para não processar como texto
                return;
            }
            
            // 4. A partir daqui, apenas mensagens de texto são processadas
            try {
                // Simular "Digitando..." para parecer humano
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                
                // Contexto da loja - usar a configuração passada ou genérico
                // Padrão agnóstico caso a config falhe
                let contextoLoja = "Você é um assistente de um restaurante fictício em um ambiente de teste. Responda às perguntas do cliente com base nas informações a seguir. Restaurante e Delivery. Consulte nosso cardápio e horários.";
                
                // Tentar usar informações reais do mainConfig passado
                if (currentMainConfig) {
                    const hasRealInfo = currentMainConfig.restaurantAddress || 
                                   (currentMainConfig.menuItems && currentMainConfig.menuItems.length > 0) ||
                                   currentMainConfig.storeName;

                    if (hasRealInfo) {
                        let contextParts = [];
                        if (currentMainConfig.storeName && currentMainConfig.storeName !== 'Delivery Manager') {
                            contextParts.push(`Estabelecimento: ${currentMainConfig.storeName}`);
                        }
                        if (currentMainConfig.restaurantAddress) {
                            contextParts.push(`Endereço: ${currentMainConfig.restaurantAddress}`);
                        }
                        if (currentMainConfig.menuItems && currentMainConfig.menuItems.length > 0) {
                            const menuString = currentMainConfig.menuItems
                                .filter(item => !item.paused)
                                .map(item => `${item.name}: R$${(item.price || 0).toFixed(2)}` + (item.description ? ` (${item.description})` : ''))
                                .join('\n');
                            contextParts.push(`Cardápio disponível:\n${menuString}`);
                        }
                        if (contextParts.length > 0) {
                            contextoLoja = `Você é um assistente de um restaurante fictício em um ambiente de teste. Responda às perguntas do cliente com base nas informações a seguir. ` + contextParts.join('. ');
                        }
                    }
                }
                
                // Chamar a OpenAI para gerar resposta
                let respostaIA;
                if (aiService && aiService.gerarRespostaIA) {
                    // Usar a chave do mainConfig
                    let openAIKey = currentMainConfig ? (currentMainConfig.openAIKey || currentMainConfig.openaiKey) : null;
                    respostaIA = await aiService.gerarRespostaIA(msg.body, contextoLoja, openAIKey);
                } else {
                    const nomeLoja = (currentMainConfig && currentMainConfig.storeName && currentMainConfig.storeName !== 'Delivery Manager') ? currentMainConfig.storeName : "nosso restaurante";
                    respostaIA = `Olá! Sou o assistente virtual do ${nomeLoja}. No momento nosso sistema de IA está em manutenção. Para fazer um pedido, envie 'cardápio' ou fale com nosso atendente humano.`;
                }
                
                // Responder
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
        });
        
        clientListenersConfigured = true;
        console.log('Listeners do WhatsApp configurados com sucesso');
    } catch (error) {
        console.error('Erro ao configurar listeners do WhatsApp:', error);
    }
}

// Função para inicializar o WhatsApp manualmente
function initializeWhatsApp(config) {
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

            // Configurar listeners primeiro (apenas uma vez), passando a config
            setupClientListeners(config);
            
            // Verificar se há sessão corrompida antes de tentar inicializar
            const checkAndCleanSession = () => {
                return new Promise((resolveClean) => {
                    // Verificar se o erro de "already running" pode ser prevenido
                    // Não fazemos limpeza preventiva aqui, apenas se ocorrer erro
                    resolveClean();
                });
            };
            
            checkAndCleanSession().then(() => {
                // Inicializar o cliente
                console.log('Chamando client.initialize()...');
                
                // Aguardar o evento 'ready' ou timeout
                const readyTimeout = setTimeout(() => {
                    isInitializing = false;
                    console.error('Timeout ao inicializar WhatsApp (90 segundos)');
                    reject(new Error('Timeout ao inicializar WhatsApp (90 segundos)'));
                }, 90000);
                
                // Tentar inicializar o cliente
                client.initialize().then(() => {
                    console.log('client.initialize() chamado com sucesso');
                }).catch(error => {
                    isInitializing = false;
                    clearTimeout(readyTimeout);
                    
                    // Verificar se é o erro de "browser já rodando"
                    if (error.message.includes('already running') || error.message.includes('userDataDir')) {
                        console.warn('⚠️  Browser já está rodando. Tentando abordagem de recuperação...');
                        
                        // Tentar uma abordagem mais agressiva: limpar sessão e tentar novamente
                        try {
                            const fs = require('fs');
                            const path = require('path');
                            const { app } = require('electron');
                            
                            const sessionPath = path.join(app.getPath('userData'), '.wwebjs_auth', 'session-ceia-delivery');
                            if (fs.existsSync(sessionPath)) {
                                console.log('Removendo sessão corrompida:', sessionPath);
                                fs.rmSync(sessionPath, { recursive: true, force: true });
                            }
                        } catch (cleanError) {
                            console.warn('Não foi possível limpar sessão:', cleanError.message);
                        }
                        
                        // Tentar destruir e reinicializar
                        client.destroy().then(() => {
                            console.log('✅ Browser anterior destruído. Aguardando 3 segundos...');
                            
                            // Aguardar um momento antes de tentar novamente
                            setTimeout(() => {
                                console.log('Tentando reinicializar após limpeza...');
                                client.initialize().then(() => {
                                    console.log('✅ WhatsApp reinicializado com sucesso após limpeza!');
                                    // O evento 'ready' será disparado normalmente
                                }).catch(retryError => {
                                    console.error('❌ Erro ao reinicializar após limpeza:', retryError);
                                    reject(new Error('Erro ao reinicializar WhatsApp: ' + retryError.message));
                                });
                            }, 3000);
                        }).catch(destroyError => {
                            console.error('❌ Erro ao destruir browser:', destroyError);
                            reject(new Error('Erro ao destruir browser: ' + destroyError.message));
                        });
                    } else {
                        console.error('Erro ao chamar client.initialize():', error);
                        reject(new Error('Erro ao inicializar cliente: ' + error.message));
                    }
                });
                
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
                
            }).catch(cleanError => {
                isInitializing = false;
                console.error('Erro na verificação de sessão:', cleanError);
                reject(new Error('Erro na verificação de sessão: ' + cleanError.message));
            });
            
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

// Função para atualizar a configuração em tempo real
function updateConfig(newConfig) {
    console.log('🔄 Configuração do WhatsApp atualizada com novo cardápio e dados.');
    currentMainConfig = newConfig;
}

// Função para limpar sessão manualmente
function clearWhatsAppSession() {
    try {
        const fs = require('fs');
        const path = require('path');
        const { app } = require('electron');
        
        const sessionPath = path.join(app.getPath('userData'), '.wwebjs_auth', 'session-ceia-delivery');
        if (fs.existsSync(sessionPath)) {
            console.log('Limpando sessão WhatsApp:', sessionPath);
            fs.rmSync(sessionPath, { recursive: true, force: true });
            return true;
        }
        return false;
    } catch (error) {
        console.error('Erro ao limpar sessão:', error);
        return false;
    }
}

// Exportar funções
module.exports = {
    sendWhatsAppMessage,
    getWhatsAppStatus,
    restartWhatsApp,
    initializeWhatsApp,
    isWhatsAppInitialized,
    resetInitialization,
    clearWhatsAppSession,
    updateConfig,
    client
};
