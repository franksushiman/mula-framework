import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDatabase, getConfiguracoes, updateConfiguracoes, registrarLog, getFleet, limparRadarInativo, deletarMotoboy, atualizarMotoboy, getExtratoFinanceiro, zerarAcertoFinanceiro, registrarEntrega } from './database';
import { conectarEvolutionAPI, qrCodeBase64, sessionStatus, handleWhatsAppWebhook, enviarMensagemWhatsApp } from './whatsappBot';
import { iniciarTelegram, enviarConviteRotaTelegram } from './telegramBot';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app: FastifyInstance = Fastify({ logger: false });

export const rotasAtivas: any[] = [];

export function getRotasMotoboy(telegram_id: string) {
    return rotasAtivas.filter(r => r.telegram_id === telegram_id);
}

export const broadcastLog = async (tipo: string, mensagem: string, dadosExtras: any = {}) => {
    const payload = JSON.stringify({ tipo, mensagem, data: new Date().toISOString(), ...dadosExtras });
    await registrarLog(tipo, mensagem);
    if (app.websocketServer && app.websocketServer.clients) {
        app.websocketServer.clients.forEach(function (client: any) {
            if (client.readyState === 1) client.send(payload);
        });
    }
    console.log(`[${tipo}] ${mensagem}`);
};

export async function processarBaixaPeloTelegram(telegram_id: string, codigo: string): Promise<boolean> {
    const idx = rotasAtivas.findIndex(r => r.telegram_id === telegram_id && r.pedido.codigo_entrega === codigo);
    if (idx > -1) {
        const rota = rotasAtivas[idx];
        await registrarEntrega(telegram_id, rota.pedido.taxa);
        rotasAtivas.splice(idx, 1);

        const payload = JSON.stringify({ tipo: 'BAIXA_PEDIDO', mensagem: 'Baixa pelo App', pedidoId: rota.pedido.id, data: new Date().toISOString() });
        if (app.websocketServer && app.websocketServer.clients) {
            app.websocketServer.clients.forEach((client: any) => {
                if (client.readyState === 1) client.send(payload);
            });
        }

        await registrarLog('FINANCEIRO', `Motoboy confirmou entrega via Telegram (Cod: ${codigo}).`);
        return true;
    }
    return false;
}

export async function startServer() {
    await initDatabase();

    await app.register(cors, { origin: '*' });
    await app.register(websocket);

    app.get('/', async (request, reply) => {
        const htmlPath = path.join(__dirname, 'index.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        return reply.type('text/html').send(htmlContent);
    });

    app.get('/api/profile', async (request, reply) => {
        console.log('📡 [TELA] Solicitou os dados do QG Logístico...');
        const config = await getConfiguracoes();
        console.log('📦 [SISTEMA] Devolvendo chaves e horários para a tela.');
        return reply.code(200).type('application/json; charset=utf-8').send(config || {});
    });

    app.post('/api/profile', async (request: any, reply) => {
        console.log('💾 [TELA] Pediu para gravar novas configurações...');
        await updateConfiguracoes(request.body);
        await broadcastLog('SUCCESS', 'Configurações atualizadas via Painel');
        iniciarTelegram();
        console.log('🟢 [SISTEMA] Banco SQLite atualizado com sucesso!');
        return reply.code(200).type('application/json; charset=utf-8').send({ status: 'success' });
    });

    app.get('/api/fleet', async (request, reply) => {
        const frota = await getFleet();
        return reply.code(200).type('application/json; charset=utf-8').send(frota);
    });

    app.delete('/api/fleet/:id', async (request: any, reply) => {
        await deletarMotoboy(request.params.id);
        await broadcastLog('FROTA', 'Perfil de motoboy e histórico excluídos.');
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.put('/api/fleet/:id', async (request: any, reply) => {
        const { veiculo, vinculo } = request.body;
        await atualizarMotoboy(request.params.id, veiculo, vinculo);
        await broadcastLog('FROTA', 'Perfil de motoboy atualizado.');
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.get('/api/financeiro/:id', async (request: any, reply) => {
        const extrato = await getExtratoFinanceiro(request.params.id);
        return reply.code(200).type('application/json; charset=utf-8').send(extrato);
    });

    app.post('/api/financeiro/pagar/:id', async (request: any, reply) => {
        await zerarAcertoFinanceiro(request.params.id);
        await broadcastLog('FINANCEIRO', 'Acerto de motoboy liquidado com sucesso.');
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.post('/api/operacao/despachar', async (request: any, reply) => {
        const { pacoteId, motoboy, pedidos } = request.body;

        const config = await getConfiguracoes();
        if (!config.openai_key) {
            return reply.code(500).type('application/json; charset=utf-8').send({ error: 'Chave OpenAI não configurada no QG Logístico.' });
        }

        let resumoBairros;
        try {
            const allEnderecos = pedidos.map((p: any) => p.endereco).join('\n');
            const resOpenAI = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.openai_key}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: `Resuma os bairros destes endereços em no máximo 4 palavras:\n\n${allEnderecos}` }],
                    max_tokens: 20
                })
            });
            if (!resOpenAI.ok) throw new Error('Falha na API OpenAI');
            const data = await resOpenAI.json();
            resumoBairros = data.choices[0].message.content.trim();
        } catch (e) {
            console.error("FALHA NA OPENAI:", e);
            return reply.code(500).type('application/json; charset=utf-8').send({ error: 'A IA não conseguiu analisar os endereços desta rota.' });
        }

        pedidos.forEach((p: any) => {
            rotasAtivas.push({ pacoteId, telegram_id: motoboy.telegram_id, pedido: p });
        });

        const totalTaxa = pedidos.reduce((acc: number, p: any) => acc + (p.taxa || 0), 0);
        const msgMotoboy = `🚀 *NOVA ROTA DE ENTREGA!*\n\n*Setor:* ${resumoBairros}\n*Qtd:* ${pedidos.length} entregas\n*Total a Faturar:* R$ ${totalTaxa.toFixed(2)}`;

        await enviarConviteRotaTelegram(motoboy.telegram_id, msgMotoboy, pacoteId);

        for (const p of pedidos) {
            const num = p.telefone.replace(/\D/g, '');
            if (num.length >= 10) {
                const msgCliente = `Olá, ${p.nomeCliente.split(' ')[0]}! O seu pedido acabou de sair para entrega com o parceiro *${motoboy.nome}* (${motoboy.veiculo}). 🛵💨\n\n⚠️ *Atenção:* Para a segurança da sua entrega, informe o código *${p.codigo_entrega}* ao motoboy quando ele chegar.`;
                await enviarMensagemWhatsApp('55' + num, msgCliente);
            }
        }

        await broadcastLog('SISTEMA', `Convite de rota enviado para ${motoboy.nome}. Aguardando aceite.`);
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.post('/api/operacao/sos/reply', async (request: any, reply) => {
        const { telegram_id, texto } = request.body;
        console.log("[DEBUG SOS] O Painel tentou enviar mensagem para o ID:", request.body.telegram_id, "| Texto:", request.body.texto);
        await enviarMensagemTelegram(telegram_id, texto);
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.post('/api/operacao/baixa', async (request: any, reply) => {
        const { pedidoId } = request.body;
        const idx = rotasAtivas.findIndex(r => r.pedido.id === pedidoId);
        if (idx > -1) {
            const rota = rotasAtivas[idx];
            await registrarEntrega(rota.telegram_id, rota.pedido.taxa);
            rotasAtivas.splice(idx, 1);
            await broadcastLog('FINANCEIRO', `Baixa manual concluída. Taxa de R$${rota.pedido.taxa.toFixed(2)} faturada.`);
        }
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.get('/api/whatsapp/start', async (request, reply) => {
        await conectarEvolutionAPI();
        return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
    });

    app.get('/api/whatsapp/status', async (request, reply) => {
        return reply.code(200).type('application/json; charset=utf-8').send({ qr: qrCodeBase64, status: sessionStatus });
    });

    app.post('/api/whatsapp/webhook', async (request: any, reply) => {
        await handleWhatsAppWebhook(request.body);
        return reply.code(200).type('application/json; charset=utf-8').send({ recebido: true });
    });

    app.post('/api/whatsapp/send', async (request: any, reply) => {
        const { numero, texto } = request.body;
        const sucesso = await enviarMensagemWhatsApp(numero, texto);
        if (sucesso) {
            return reply.code(200).type('application/json; charset=utf-8').send({ ok: true });
        }
        return reply.code(500).type('application/json; charset=utf-8').send({ error: 'Falha no disparo via API' });
    });

    app.register(async (instance) => {
        instance.get('/ws/logs', { websocket: true }, (connection) => {
            connection.send(JSON.stringify({ tipo: 'SYSTEM', mensagem: 'Conectado ao terminal de Logs.', data: new Date().toISOString() }));
        });
    });

    setInterval(async () => {
        try {
            const derrubados = await limparRadarInativo();
            if (derrubados > 0) {
                await broadcastLog('FROTA', `Radar: ${derrubados} motoboy(s) ficaram OFFLINE por perda de sinal GPS.`);
            }
        } catch (e) {
            console.error(e);
        }
    }, 60000);

    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 SERVIDOR CEIA NO AR: Aceda a http://localhost:3000 no navegador');
    console.log('✅ Tudo pronto e operando!');

    iniciarTelegram();
}
