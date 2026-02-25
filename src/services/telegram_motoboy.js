const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Token chumado diretamente no código, conforme solicitado.
const token = '8462218325:AAEnzRDQV3xw3JmBvK6_Uz0VjtYMKFuTqeI';
const API_ENDPOINT = 'http://localhost:8000/api/motoboys';

// Cria o bot
const bot = new TelegramBot(token, { polling: true });

// Armazena o estado do chat para saber se estamos esperando um nome
const chatStates = {};

console.log('🤖 Bot de motoboys do Telegram iniciado...');

// Lida com o comando /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    chatStates[chatId] = 'awaiting_name';
    bot.sendMessage(chatId, 'Bem-vindo ao Ceia Entregas. Digite seu nome para registrar e fazer login.');
});

// Lida com as mensagens de texto (para capturar o nome)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignora mensagens que não são texto ou que são comandos
    if (!text || text.startsWith('/')) {
        return;
    }

    // Verifica se estamos esperando o nome do motoboy
    if (chatStates[chatId] === 'awaiting_name') {
        const motoboyName = text;
        
        console.log(`[Telegram] Recebido nome '${motoboyName}' para o chat ID ${chatId}. Registrando...`);

        try {
            // Faz o POST para a API para registrar o motoboy
            await axios.post(API_ENDPOINT, {
                name: motoboyName,
                telegram_chat_id: String(chatId)
            });

            // Responde com sucesso e limpa o estado
            bot.sendMessage(chatId, 'Login confirmado. Aguarde as corridas.');
            delete chatStates[chatId];
            console.log(`[Telegram] Motoboy '${motoboyName}' (ID: ${chatId}) registrado com sucesso.`);

        } catch (error) {
            console.error(`[ERRO] Falha ao registrar motoboy ${motoboyName}:`, error.response ? error.response.data : error.message);
            bot.sendMessage(chatId, 'Ocorreu um erro ao fazer seu registro. Tente novamente mais tarde.');
        }
    }
});
