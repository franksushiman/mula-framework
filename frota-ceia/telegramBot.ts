import { Telegraf, Markup } from 'telegraf';
import { upsertFleet, getConfiguracoes } from './database';
import { broadcastLog, processarBaixaPeloTelegram, getRotasMotoboy, rotasAtivas } from './server';
import { enviarMensagemWhatsApp } from './whatsappBot';

type Step = 'NOME' | 'CPF' | 'VINCULO' | 'PIX' | 'VEICULO' | 'CHAT_CLIENTE';

interface UserSession {
    step: Step;
    data: {
        nome?: string; cpf?: string; vinculo?: string; pix?: string; veiculo?: string;
        telefone_cliente?: string; nome_cliente?: string;
    };
}

const userSessions: Record<number, UserSession> = {};
export let bot: Telegraf | null = null;

export async function enviarMensagemTelegram(telegram_id: string, texto: string) {
    if (!bot) return false;
    try {
        await bot.telegram.sendMessage(telegram_id, texto, { parse_mode: 'Markdown' });
        return true;
    } catch (e) { return false; }
}

// NOVO: Envia convite com botões interativos
export async function enviarConviteRotaTelegram(telegram_id: string, texto: string, pacoteId: string) {
    if (!bot) return false;
    try {
        await bot.telegram.sendMessage(telegram_id, texto, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
                Markup.button.callback('✅ Aceitar Rota', `aceitar_${pacoteId}`),
                Markup.button.callback('❌ Recusar', `recusar_${pacoteId}`)
            ])
        });
        return true;
    } catch (e) { return false; }
}

export async function iniciarTelegram() {
    try {
        if (bot) {
            bot.stop('RELOAD');
            bot = null;
        }
        const config = await getConfiguracoes();
        const token = config.telegram_bot_token;

        if (!token) {
            broadcastLog('TELEGRAM', 'Token não configurado. Adicione no painel QG Logístico.');
            return;
        }

        bot = new Telegraf(token);

        bot.catch((err, ctx) => {
            console.error(`[TELEGRAM ERROR] Falha ao processar requisição para ${ctx.updateType}:`, err);
        });

        const updateProgress = async (chatId: number, field: keyof UserSession['data'], value: string, nextStep?: Step) => {
            try {
                await upsertFleet({ telegram_id: chatId.toString(), [field]: value, status: 'CADASTRANDO' });
                if (userSessions[chatId]) {
                    userSessions[chatId].data[field] = value;
                    if (nextStep) userSessions[chatId].step = nextStep;
                }
            } catch (error) {}
        };

        const defaultKeyboard = Markup.keyboard([
            ['🆘 Pedir Ajuda (SOS)', '💬 Falar com Cliente']
        ]).resize();

        bot.start(async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                userSessions[chatId] = { step: 'NOME', data: {} };
                await ctx.reply(`Olá! Bem-vindo à frota da CEIA.\nVamos iniciar o seu registo. Por favor, digite o seu **Nome Completo**:`, Markup.removeKeyboard());
            } catch (e) {}
        });

        bot.hears('🆘 Pedir Ajuda (SOS)', async (ctx) => {
            const nome = ctx.from.first_name;
            userSessions[ctx.chat.id] = { step: 'SOS_CHAT', data: {} };
            broadcastLog('SOS', `O motoboy ${nome} acionou o ALARME DE EMERGÊNCIA!`, { telegram_id: ctx.chat.id.toString() });
            await ctx.reply('🚨 O seu sinal de emergência foi enviado para a base. Aguarde, a loja entrará em contacto consigo imediatamente.\n\n_(Para encerrar a conversa, digite /cancelar)_');
        });

        // ==========================================
        // PROXY: CHAT BLINDADO COM O CLIENTE
        // ==========================================
        bot.hears('💬 Falar com Cliente', async (ctx) => {
            const chatId = ctx.chat.id.toString();
            const rotas = getRotasMotoboy(chatId);
            
            if (rotas.length === 0) return ctx.reply('Não tem nenhuma rota ativa de momento.');

            const botoes = rotas.map(r => [Markup.button.callback(`Falar com ${r.pedido.nomeCliente.split(' ')[0]}`, `chat_${r.pedido.id}`)]);
            await ctx.reply('Com qual cliente precisa de falar?', Markup.inlineKeyboard(botoes));
        });

        bot.action(/^chat_(.+)$/, async (ctx) => {
            const pedidoId = ctx.match[1];
            const chatId = ctx.chat.id;
            const rota = getRotasMotoboy(chatId.toString()).find(r => r.pedido.id === pedidoId);
            
            if (!rota) return ctx.answerCbQuery('Pedido não encontrado ou já finalizado.');
            
            userSessions[chatId] = { step: 'CHAT_CLIENTE', data: { telefone_cliente: rota.pedido.telefone, nome_cliente: rota.pedido.nomeCliente } };
            
            await ctx.editMessageText(`Aberta linha direta com *${rota.pedido.nomeCliente.split(' ')[0]}*.\n\nDigite a mensagem abaixo e eu enviarei para o WhatsApp do cliente de forma oculta.\n\n_(Para encerrar a conversa, digite /cancelar)_`, { parse_mode: 'Markdown' });
            await ctx.answerCbQuery();
        });

        // ==========================================
        // HANDLERS DOS BOTÕES DA ROTA
        // ==========================================
        bot.action(/^aceitar_(.+)$/, async (ctx) => {
            const pacoteId = ctx.match[1];
            broadcastLog('ACEITE_ROTA', `Motoboy confirmou a rota ${pacoteId}`, { pacoteId });
            await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n✅ *ROTA ACEITE!* Pode iniciar o deslocamento.', { parse_mode: 'Markdown', disable_web_page_preview: true });
            await ctx.answerCbQuery('Rota Aceite!');

            const rotasDoPacote = rotasAtivas.filter(r => r.pacoteId === pacoteId);
            if (rotasDoPacote.length > 0) {
                let detalheMsg = '📝 *DETALHES DA ROTA:*\n\n';
                rotasDoPacote.forEach((rota, index) => {
                    const p = rota.pedido;
                    const wazeLink = `https://waze.com/ul?q=${encodeURIComponent(p.endereco)}`;
                    const mapsLink = `https://maps.google.com/?q=${encodeURIComponent(p.endereco)}`;
                    detalheMsg += `*Cliente ${index + 1}: ${p.nomeCliente}*\n`;
                    detalheMsg += `📍 ${p.endereco}\n`;
                    detalheMsg += `[🗺️ Waze](${wazeLink}) | [📍 Maps](${mapsLink})\n\n`;
                });
                detalheMsg += `💡 Ao chegar, peça o *código de 4 dígitos* ao cliente e digite aqui para dar baixa.`;
                await ctx.reply(detalheMsg, { parse_mode: 'Markdown', disable_web_page_preview: true });
            }
        });

        bot.action(/^recusar_(.+)$/, async (ctx) => {
            const pacoteId = ctx.match[1];
            
            // Remove da memória para impedir que ele dê baixa
            const rotasParaRemover = getRotasMotoboy(ctx.from.id.toString()).filter(r => r.pacoteId === pacoteId);
            rotasParaRemover.forEach(r => {
                const idx = rotasAtivas.indexOf(r);
                if (idx > -1) rotasAtivas.splice(idx, 1);
            });
            
            broadcastLog('RECUSA_ROTA', `O motoboy ${ctx.from.first_name} RECUSOU o Pacote #${pacoteId.split('_')[1].substring(6)}.`, { pacoteId });
            await ctx.editMessageText('❌ *ROTA RECUSADA*. Foi devolvida para a base.', { parse_mode: 'Markdown' });
            await ctx.answerCbQuery('Rota Recusada');
        });

        // ==========================================
        // LEITOR DE CÓDIGO DE BAIXA
        // ==========================================
        bot.hears(/^\d{4}$/, async (ctx) => {
            const chatId = ctx.chat.id.toString();
            const codigo = ctx.message.text;
            const sucesso = await processarBaixaPeloTelegram(chatId, codigo);
            if (sucesso) {
                // Se ele estiver a meio de um chat com o cliente que acabou de dar baixa, fecha o chat.
                if (userSessions[ctx.chat.id]?.step === 'CHAT_CLIENTE') delete userSessions[ctx.chat.id];
                await ctx.reply(`✅ Código aceite! A entrega foi confirmada e o valor lançado no seu extrato.`);
            } else {
                await ctx.reply(`❌ Código inválido ou a entrega já se encontra finalizada.`);
            }
        });

        bot.on('location', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const { latitude, longitude } = ctx.message.location;

                if (ctx.message.location.live_period) {
                    await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: 'ONLINE' });
                    broadcastLog('FROTA', `Motoboy [${ctx.from.first_name}] bateu o ponto e está ONLINE 🟢`);
                    await ctx.reply('🟢 Ponto registado! Encontra-se ONLINE no radar da loja.\n\nFique atento às novas rotas. (Para desligar, pare de partilhar a localização ou digite /offline)', defaultKeyboard);
                } else {
                    await ctx.reply('⚠️ Atenção: Enviou uma localização fixa. Precisa de partilhar a **Localização em Tempo Real**.');
                }
            } catch (e) {}
        });

        bot.on('edited_message', async (ctx) => {
            try {
                if ('location' in ctx.editedMessage) {
                    const chatId = ctx.editedMessage.chat.id;
                    const { latitude, longitude } = ctx.editedMessage.location;
                    await upsertFleet({ telegram_id: chatId.toString(), latitude, longitude, status: 'ONLINE' });
                }
            } catch (e) {}
        });

        bot.command('offline', async (ctx) => {
            const chatId = ctx.chat.id;
            await upsertFleet({ telegram_id: chatId.toString(), status: 'OFFLINE' });
            broadcastLog('FROTA', `Motoboy [${ctx.from.first_name}] encerrou o expediente via comando 🔴`);
            await ctx.reply('🔴 Expediente encerrado.', Markup.removeKeyboard());
        });

        bot.command('cancelar', async (ctx) => {
            delete userSessions[ctx.chat.id];
            await ctx.reply('✅ Conversa encerrada. Você voltou ao menu principal.', defaultKeyboard);
        });

        bot.on('text', async (ctx) => {
            try {
                const chatId = ctx.chat.id;
                const session = userSessions[chatId];
                const text = ctx.message.text;

                if (text.startsWith('/')) return;
                
                if (session?.step === 'SOS_CHAT') {
                    broadcastLog("SOS_MSG", text, { telegram_id: chatId.toString() });
                    return;
                }

                // MODO CHAT COM O CLIENTE ATIVO
                if (session?.step === 'CHAT_CLIENTE') {
                    const num = session.data.telefone_cliente?.replace(/\D/g, '');
                    if (num) {
                        const msgCliente = `*[Mensagem do Entregador]*\n${text}\n\n_(Pode responder a esta mensagem)_`;
                        await enviarMensagemWhatsApp('55' + num, msgCliente);
                        await ctx.reply('✅ Mensagem enviada de forma oculta ao cliente!');
                    }
                    return; 
                }

                if (!session) return;

                switch (session.step) {
                    case 'NOME':
                        await updateProgress(chatId, 'nome', text, 'CPF');
                        await ctx.reply('Perfeito! Agora, qual é o seu **CPF**?');
                        break;
                    case 'CPF':
                        await updateProgress(chatId, 'cpf', text, 'VINCULO');
                        await ctx.reply('Qual o seu **Vínculo** com a empresa?', Markup.keyboard([['Fixo', 'Freelancer']]).oneTime().resize());
                        break;
                    case 'VINCULO':
                        if (text !== 'Fixo' && text !== 'Freelancer') return ctx.reply('Por favor, selecione "Fixo" ou "Freelancer".');
                        await updateProgress(chatId, 'vinculo', text, 'PIX');
                        await ctx.reply('Qual a sua **Chave PIX** para recebimentos?', Markup.removeKeyboard());
                        break;
                    case 'PIX':
                        await updateProgress(chatId, 'pix', text, 'VEICULO');
                        await ctx.reply('Qual é o seu **Veículo**? (Ex: Scooter, Carro)');
                        break;
                    case 'VEICULO':
                        await upsertFleet({ telegram_id: chatId.toString(), veiculo: text, status: 'OFFLINE' });
                        const nomeFinal = session.data.nome || ctx.from.first_name;
                        broadcastLog('FROTA', `Novo registo finalizado: ${nomeFinal} (${text})`);
                        delete userSessions[chatId];
                        await ctx.reply('✅ Registo concluído com sucesso!\n\nEncontra-se **OFFLINE** no momento.\n\nPara iniciar o expediente, partilhe a sua **Localização em Tempo Real** comigo.', defaultKeyboard);
                        break;
                }
            } catch (e) {}
        });

        bot.launch();
        broadcastLog('TELEGRAM', 'Conectado aos servidores. Rádio da frota operante!');

        process.once('SIGINT', () => bot?.stop('SIGINT'));
        process.once('SIGTERM', () => bot?.stop('SIGTERM'));

    } catch (error) { broadcastLog('ERROR', 'Falha ao iniciar o rádio da frota.'); }
}
