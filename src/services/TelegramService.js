const { Telegraf } = require('telegraf');
const EventEmitter = require('events');

class TelegramService extends EventEmitter {
    /**
     * @param {string} token - O token do bot do Telegram.
     */
    constructor(token) {
        super();
        if (!token) {
            throw new Error('TelegramService: O token do bot é obrigatório.');
        }
        this.bot = new Telegraf(token);
    }

    /**
     * Inicia o bot e configura os handlers de comando e eventos.
     */
    start() {
        // Comando /start
        this.bot.start((ctx) => {
            ctx.reply('Bem-vindo ao CeiaBot! Envie sua localização para começar a receber corridas.');
        });

        // Comando /help
        this.bot.help((ctx) => {
            ctx.reply('Envie sua localização para ficar online. Use o comando /start para ver a mensagem de boas-vindas.');
        });

        // Handler para localização
        this.bot.on('location', (ctx) => {
            console.log(`Localização recebida de ${ctx.from.id}`);
            // Emite um evento 'location' para ser capturado por outros serviços
            this.emit('location', ctx);
        });

        // Inicia o bot
        this.bot.launch().then(() => {
            console.log('Telegram Bot iniciado com sucesso.');
        }).catch(err => {
            console.error('Erro ao iniciar o Telegram Bot:', err);
        });

        // Garante que o bot pare de forma graciosa
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
}

module.exports = TelegramService;
