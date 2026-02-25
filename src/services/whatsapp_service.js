const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const { VertexAI } = require('@google-cloud/vertexai');

// --- Configuração ---
const VERTEX_PROJECT_ID = 'ceia-os';
const VERTEX_LOCATION = 'us-central1';
const VERTEX_MODEL = 'gemini-1.5-flash-001'; // O modelo 'gemini-2.5-flash' não existe, usando '1.5-flash'.
const API_ENDPOINT = 'http://localhost:8000/api/orders';

// --- Inicialização dos Serviços ---

// Inicializa o Vertex AI
const vertex_ai = new VertexAI({ project: VERTEX_PROJECT_ID, location: VERTEX_LOCATION });
const generativeModel = vertex_ai.getGenerativeModel({
    model: VERTEX_MODEL,
    generationConfig: {
        "temperature": 0.1,
        "responseMimeType": "application/json", // Força a saída em JSON
    },
});

// Inicializa o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "ceia-os-whatsapp" })
});

// --- Lógica do WhatsApp ---

client.on('qr', (qr) => {
    console.log('QR Code recebido, escaneie com seu celular:');
    qrcode.generate(qr, { small: true });
    fs.writeFileSync('whatsapp_qr.txt', qr);
});

client.on('ready', () => {
    console.log('✅ Cliente do WhatsApp está pronto!');
    if (fs.existsSync('whatsapp_qr.txt')) {
        fs.unlinkSync('whatsapp_qr.txt');
    }
});

client.on('message', async (message) => {
    // Ignora mensagens que são de grupos, status, ou do próprio bot
    if (message.fromMe || message.isStatus) {
        return;
    }
    const chat = await message.getChat();
    if (chat.isGroup) {
        return;
    }

    // A transcrição de áudio deve ocorrer antes, aqui recebemos apenas o texto.
    const messageBody = message.body;
    if (!messageBody || message.type !== 'chat') {
        return;
    }

    const customerName = message._data.notifyName || 'Cliente';
    console.log(`[WhatsApp] Mensagem de ${customerName}: "${messageBody}"`);

    try {
        // 1. Chamar a IA para extrair o pedido em formato JSON
        const orderJson = await extractOrderFromMessage(messageBody, customerName);

        // 2. Enviar o pedido para a API do backend
        await postOrderToApi(orderJson);

        // 3. Responder ao cliente com a confirmação
        const confirmationMessage = `Olá ${customerName}, seu pedido foi recebido e já está na cozinha! 👍`;
        await message.reply(confirmationMessage);
        console.log(`[API] Pedido criado e confirmado para ${customerName}.`);

    } catch (error) {
        console.error('[ERRO] Falha ao processar pedido:', error.message);
        await message.reply('Desculpe, não consegui processar seu pedido. Por favor, tente novamente.');
    }
});

/**
 * Usa o Vertex AI para extrair um pedido de uma mensagem de texto.
 * @param {string} messageBody O texto da mensagem do cliente.
 * @param {string} customerName O nome do cliente.
 * @returns {Promise<object>} O objeto JSON do pedido.
 */
async function extractOrderFromMessage(messageBody, customerName) {
    const prompt = `
        Você é um assistente de restaurante para extrair pedidos de texto.
        Sua única tarefa é converter o texto do pedido em um objeto JSON estrito, sem nenhuma palavra ou caractere adicional.
        O nome do cliente é: "${customerName}".

        O JSON de saída DEVE seguir estritamente este schema:
        {
          "customer_name": "string",
          "items": [
            {
              "name": "string",
              "quantity": "integer",
              "price": "float",
              "obs": "string (opcional, se houver)"
            }
          ]
        }

        - Use o nome do cliente fornecido.
        - Se o cliente pedir "dois temakis", o item deve ter quantity: 2.
        - O campo 'price' deve ser 0.0 se não for possível determinar o preço a partir do texto.
        - O campo 'obs' deve conter detalhes como "sem arroz", "com cream cheese extra".

        Texto do pedido do cliente:
        "${messageBody}"

        Retorne APENAS o objeto JSON. Não inclua explicações, markdown (como \`\`\`json), ou qualquer texto antes ou depois do JSON.
    `;

    console.log('[VertexAI] Enviando prompt para extração do pedido...');
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const jsonText = response.candidates[0].content.parts[0].text;
        
        console.log('[VertexAI] Resposta recebida:', jsonText);
        
        const orderData = JSON.parse(jsonText);
        return orderData;
    } catch (e) {
        console.error("[VertexAI] Erro ao gerar ou parsear conteúdo da IA:", e);
        throw new Error("A IA não retornou um JSON válido.");
    }
}

/**
 * Envia o pedido formatado para a API do backend.
 * @param {object} orderData O objeto JSON do pedido.
 * @returns {Promise<object>} A resposta da API.
 */
async function postOrderToApi(orderData) {
    console.log(`[API] Enviando pedido para ${API_ENDPOINT}:`, JSON.stringify(orderData, null, 2));
    try {
        const response = await axios.post(API_ENDPOINT, orderData);
        console.log('[API] Resposta recebida:', response.data);
        return response.data;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[API] Erro ao enviar pedido: ${errorMessage}`);
        throw new Error(`Falha ao comunicar com a API do restaurante.`);
    }
}


// --- Inicialização ---
console.log('[WhatsApp] Inicializando serviço...');
client.initialize();

module.exports = {
    client
};
