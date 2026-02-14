const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

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

// Evento: Cliente pronto
client.on('ready', () => {
    console.log('✅ WhatsApp está pronto!');
    whatsappStatus.connected = true;
    whatsappStatus.readyAt = new Date();
    
    // Obter informações do número conectado
    client.getState().then(state => {
        console.log(`Estado: ${state}`);
    });
    
    client.info.then(info => {
        whatsappStatus.phone = info.wid.user;
        console.log(`📱 Conectado como: ${whatsappStatus.phone}`);
    });
});

// Evento: Cliente autenticado
client.on('authenticated', () => {
    console.log('🔐 WhatsApp autenticado!');
});

// Evento: Desconectado
client.on('disconnected', (reason) => {
    console.log(`❌ WhatsApp desconectado: ${reason}`);
    whatsappStatus.connected = false;
    whatsappStatus.phone = null;
});

// Evento: Mensagem recebida (opcional para logs)
client.on('message', async (msg) => {
    // Log apenas de mensagens que não são do próprio sistema
    if (!msg.fromMe) {
        console.log(`📩 Mensagem recebida de ${msg.from}: ${msg.body.substring(0, 50)}...`);
    }
});

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
    return {
        ...whatsappStatus,
        timestamp: new Date()
    };
}

// Função para reiniciar a conexão
function restartWhatsApp() {
    console.log('🔄 Reiniciando conexão WhatsApp...');
    client.destroy().then(() => {
        client.initialize();
    });
}

// Variável para controlar se o WhatsApp foi inicializado
let isInitialized = false;

// Função para inicializar o WhatsApp manualmente
function initializeWhatsApp() {
    if (isInitialized) {
        console.log('WhatsApp já está inicializado');
        return Promise.resolve();
    }
    
    console.log('🚀 Inicializando WhatsApp Web...');
    return new Promise((resolve, reject) => {
        client.initialize();
        
        // Aguardar o evento 'ready' ou timeout
        const readyTimeout = setTimeout(() => {
            reject(new Error('Timeout ao inicializar WhatsApp'));
        }, 30000);
        
        const onReady = () => {
            clearTimeout(readyTimeout);
            isInitialized = true;
            console.log('✅ WhatsApp inicializado com sucesso!');
            client.off('ready', onReady);
            client.off('auth_failure', onAuthFailure);
            resolve();
        };
        
        const onAuthFailure = (error) => {
            clearTimeout(readyTimeout);
            client.off('ready', onReady);
            client.off('auth_failure', onAuthFailure);
            reject(new Error('Falha na autenticação: ' + error));
        };
        
        client.once('ready', onReady);
        client.once('auth_failure', onAuthFailure);
    });
}

// Função para verificar se está inicializado
function isWhatsAppInitialized() {
    return isInitialized;
}

// Função para resetar o estado de inicialização
function resetInitialization() {
    isInitialized = false;
}

// Exportar funções
module.exports = {
    sendWhatsAppMessage,
    getWhatsAppStatus,
    restartWhatsApp,
    initializeWhatsApp,
    isWhatsAppInitialized,
    client
};
