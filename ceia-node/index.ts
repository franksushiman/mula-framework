import { serve } from "bun";
import { Telegraf } from "telegraf";
import { OpenAI } from "openai";
import { db } from "./db";

const clientesWs = new Set<any>();

// === AUTO-CURA E BUSCA DE CHAVES NO BANCO ===
let config: any = {};
try {
    // As tabelas já são criadas no arquivo db.ts, não é necessário recriá-las aqui.
    
    config = db.query("SELECT * FROM configuracoes LIMIT 1").get() || {};
    if (!config.id) db.run("INSERT INTO configuracoes (nome) VALUES ('')");
} catch (e) { console.error("Erro na auto-cura do banco:", e); }

// Puxa as chaves do seu Painel (Banco de Dados) ou usa padrão se estiver vazio
const TELEGRAM_TOKEN = config.telegram_bot_token;
const OPENAI_API_KEY = config.openai_key;
const EVO_URL = "http://127.0.0.1:8080";
const EVO_INSTANCE = "ceia_zap";
const EVO_APIKEY = "sua_apikey_evolution";

const bot = new Telegraf(TELEGRAM_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function registrarLog(tipo: string, mensagem: string) {
    const hora = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    const logStr = `[${hora}] ${tipo}: ${mensagem}`;
    try { db.run("INSERT INTO logs (tipo, mensagem) VALUES (?, ?)", [tipo, mensagem]); } catch(e){}
    for (const ws of clientesWs) { ws.send(logStr); }
    console.log(logStr);
}

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

async function processarIA(mensagemCliente: string, numeroCliente: string): Promise<string> {
    try {
        const motoboy = db.query("SELECT * FROM motoboys WHERE lat IS NOT NULL ORDER BY ultima_atualizacao DESC LIMIT 1").get() as any;
        let radar = "O motoboy ainda não enviou a localização no Telegram.";
        if (motoboy) {
            const latCliente = -26.2163;
            const lngCliente = -48.6017;
            const dist = calcularDistancia(motoboy.lat, motoboy.lng, latCliente, lngCliente);
            const tempoEstim = Math.round((dist / 30) * 60) + 2; 
            radar = `RADAR LOGÍSTICO: Motoboy ${motoboy.nome} a ${dist.toFixed(1)}km. Chega em aprox ${tempoEstim} min.`;
        }
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "system", content: `Você é a IA de logística CEIA. Responda curto e natural usando os dados do radar: ${radar}` }, { role: "user", content: mensagemCliente }]
        });
        return completion.choices[0].message.content || "Falha ao processar.";
    } catch (e) { return "Calculando rota, um instante..."; }
}

bot.start((ctx) => {
    try {
        db.run("INSERT INTO motoboys (telegram_id, nome, status) VALUES (?, ?, 'ONLINE') ON CONFLICT(telegram_id) DO UPDATE SET status='ONLINE'", [ctx.from.id.toString(), ctx.from.first_name]);
        registrarLog("FROTA", `${ctx.from.first_name} conectou no Telegram.`);
    } catch(e){}
});

bot.on('edited_message', (ctx: any) => {
    if (ctx.editedMessage.location) {
        try { db.run("UPDATE motoboys SET lat = ?, lng = ?, status = 'ONLINE', ultima_atualizacao = CURRENT_TIMESTAMP WHERE telegram_id = ?", [ctx.editedMessage.location.latitude, ctx.editedMessage.location.longitude, ctx.from.id.toString()]); } catch(e){}
    }
});

serve({
    port: 3000,
    async fetch(req, server) {
        const url = new URL(req.url);

        if (url.pathname === "/ws") {
            if (server.upgrade(req)) return;
            return new Response("Upgrade falhou", { status: 500 });
        }
        
        if (req.method === "GET" && url.pathname === "/") {
            return new Response(Bun.file("./public/index.html"), { headers: { "Content-Type": "text/html" } });
        }

        if (url.pathname === "/api/profile") {
            if (req.method === "GET") {
                try {
                    const cfg = db.query("SELECT * FROM configuracoes LIMIT 1").get();
                    return new Response(JSON.stringify(cfg || {}), { headers: { "Content-Type": "application/json" } });
                } catch(e) { return new Response("{}", { status: 200 }); }
            }
            if (req.method === "POST") {
                try {
                    const b = await req.json();
                    db.run(`UPDATE configuracoes SET nome=?, endereco=?, whatsapp=?, link_cardapio=?, google_maps_key=?, openai_key=?, meta_api_token=?, telegram_bot_token=?, lat=?, lng=? WHERE id = (SELECT id FROM configuracoes LIMIT 1)`, 
                    [b.nome, b.endereco, b.whatsapp, b.link_cardapio, b.google_maps_key, b.openai_key, b.meta_api_token, b.telegram_bot_token, b.lat, b.lng]);
                    return new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });
                } catch(e) { return new Response("{}", { status: 500 }); }
            }
        }

        if (url.pathname === "/api/zones") {
            if (req.method === "GET") {
                try { const z = db.query("SELECT * FROM zonas").all(); return new Response(JSON.stringify(z), { headers: { "Content-Type": "application/json" } }); } catch(e) { return new Response("[]", { status: 200 }); }
            }
            if (req.method === "POST") {
                try {
                    const b = await req.json();
                    if (b.id) db.run("UPDATE zonas SET nome=?, valor=? WHERE id=?", [b.nome, b.valor, b.id]);
                    else db.run("INSERT INTO zonas (nome, valor, tipo, coordenadas) VALUES (?, ?, ?, ?)", [b.nome, b.valor, b.tipo, b.coordenadas]);
                    return new Response(JSON.stringify({ok: true}), { headers: { "Content-Type": "application/json" } });
                } catch(e) { return new Response("{}", { status: 500 }); }
            }
        }
        
        if (req.method === "DELETE" && url.pathname.startsWith("/api/zones/")) {
            try {
                const id = url.pathname.split("/").pop();
                db.run("DELETE FROM zonas WHERE id=?", [id]);
                return new Response("{}", { status: 200 });
            } catch(e) { return new Response("{}", { status: 500 }); }
        }

        if (req.method === "GET" && url.pathname === "/api/fleet") {
            try {
                const frota = db.query("SELECT * FROM motoboys").all();
                return new Response(JSON.stringify(frota), { headers: { "Content-Type": "application/json" } });
            } catch (e) { return new Response("[]", { status: 200 }); }
        }

        if (req.method === "GET" && url.pathname === "/api/dispatch/fleet") {
            try {
                const frota = db.query("SELECT * FROM motoboys WHERE status = 'ONLINE'").all() as any[];
                const disponiveis = frota.map(m => ({ id: m.id, nome: m.nome, distance: m.lat ? 2.5 : 0 }));
                return new Response(JSON.stringify(disponiveis), { headers: { "Content-Type": "application/json" } });
            } catch (e) { return new Response("[]", { status: 200 }); }
        }

        if (req.method === "GET" && url.pathname === "/api/rotas-ativas") {
            try { return new Response("[]", { headers: { "Content-Type": "application/json" } }); } catch (e) { return new Response("[]", { status: 200 }); }
        }

        if (req.method === "GET" && url.pathname === "/api/pending-dispatches") {
            return new Response("[]", { headers: { "Content-Type": "application/json" } });
        }

        if (req.method === "GET" && url.pathname === "/api/whatsapp/start") {
            registrarLog("SISTEMA", "Iniciando processo de conexão com WhatsApp...");
            return new Response(JSON.stringify({ status: "Iniciando conexão..." }), { headers: { "Content-Type": "application/json" } });
        }

        if (req.method === "GET" && url.pathname === "/api/whatsapp/status") {
            return new Response(JSON.stringify({ status: "CONNECTED" }), { headers: { "Content-Type": "application/json" } });
        }

        if (req.method === "POST" && url.pathname === "/api/mula-broadcast") {
            try {
                const body = await req.json();
                const qgLat = parseFloat(body.qg_lat);
                const qgLng = parseFloat(body.qg_lng);
                const enderecoColeta = body.endereco_coleta || "Base do Restaurante";
                let taxaBase = 0;
                let enderecoEntrega = "Endereço do Cliente";

                if (body.bag && body.bag.length > 0) {
                    taxaBase = parseFloat(body.bag[0].valor) || 0;
                    enderecoEntrega = body.bag[0].address || "Endereço do Cliente";
                }

                registrarLog("REDE MULA", `Iniciando busca em cascata para ${enderecoEntrega}`);

                const motoboys = db.query("SELECT telegram_id, nome, lat, lng FROM motoboys WHERE lat IS NOT NULL AND status = 'ONLINE'").all() as any[];

                if (motoboys.length === 0) {
                    registrarLog("REDE MULA", "Nenhum motoboy online na rede externa.");
                    return new Response(JSON.stringify({ error: "Nenhum motoboy online com localização ativa." }), { status: 400 });
                }

                let disparosFeitos = 0;
                for (const mb of motoboys) {
                    if (mb.telegram_id && mb.lat && mb.lng) {
                        const distRestaurante = calcularDistancia(parseFloat(mb.lat), parseFloat(mb.lng), qgLat, qgLng);
                        const adicionalBusca = distRestaurante * 1.80;
                        const valorTotalOfertado = taxaBase + adicionalBusca;
                        const linkMapsColeta = `https://www.google.com/maps/dir/?api=1&destination=$${qgLat},${qgLng}`;

                        const msgTelegram = `🚨 *NOVA OFERTA - REDE MULA* 🚨\n\n📍 *Coleta:* ${enderecoColeta}\n[🧭 Abrir GPS da Coleta](${linkMapsColeta})\n\n🎯 *Entrega:* ${enderecoEntrega}\n\n💰 *Valor Total Ofertado: R$ ${valorTotalOfertado.toFixed(2)}*\n_(Taxa: R$ ${taxaBase.toFixed(2)} + Deslocamento: R$ ${adicionalBusca.toFixed(2)})_\n\nResponda *ACEITO* para pegar a corrida.`;

                        try {
                            await bot.telegram.sendMessage(mb.telegram_id, msgTelegram, { parse_mode: 'Markdown', disable_web_page_preview: true });
                            disparosFeitos++;
                            registrarLog("REDE MULA", `Oferta enviada para ${mb.nome}`);
                        } catch (err) {}
                    }
                }
                return new Response(JSON.stringify({ status: "sucesso", disparos: disparosFeitos }), { status: 200, headers: { "Content-Type": "application/json" } });
            } catch (e) { return new Response(JSON.stringify({ error: "Erro interno no servidor" }), { status: 500 }); }
        }

        if (req.method === "POST" && url.pathname === "/webhook/evolution") {
            try {
                const body = await req.json();
                const mensagem = body?.data?.message?.conversation || body?.data?.message?.extendedTextMessage?.text;
                const remoteJid = body?.data?.key?.remoteJid || ""; 
                const fromMe = body?.data?.key?.fromMe;
                const numeroCliente = remoteJid.split('@')[0];

                if (mensagem && !remoteJid.includes('@g.us') && !remoteJid.includes('@broadcast') && !fromMe) {
                    registrarLog("WHATSAPP", `[${numeroCliente}] Cliente: "${mensagem}"`);
                    const respostaIA = await processarIA(mensagem, numeroCliente);
                    registrarLog("IA CEIA", `Respondendo: "${respostaIA}"`);

                    try {
                        await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
                            method: "POST", headers: { "Content-Type": "application/json", "apikey": EVO_APIKEY }, body: JSON.stringify({ number: numeroCliente, options: { delay: 1200, presence: "composing" }, textMessage: { text: respostaIA } })
                        });
                    } catch (err) {}
                }
                return new Response("OK", { status: 200 });
            } catch (e) { return new Response("Erro", { status: 500 }); }
        }

        return new Response("Not Found", { status: 404 });
    },
    websocket: {
        open(ws) { clientesWs.add(ws); },
        message(ws, message) {},
        close(ws) { clientesWs.delete(ws); },
    },
});

// ==========================================
// VARREDURA E STARTUP DO SISTEMA
// ==========================================
console.log("----------------------------------------");
console.log("🚀 NÓ CEIA INICIANDO...");
console.log("🔌 Porta: 3000");

if (TELEGRAM_TOKEN.length > 10 && TELEGRAM_TOKEN !== "COLOQUE_SEU_TOKEN_AQUI") {
    bot.launch().then(() => {
        console.log("✅ Bot Telegram: CONECTADO E OUVINDO (Chave do Banco de Dados)");
    }).catch(err => {
        console.log("❌ Bot Telegram: FALHA NA CONEXÃO (Token inválido no painel)");
    });
} else {
    console.log("⚠️ Bot Telegram: IGNORADO (Aguardando preenchimento no QG Logístico)");
}

console.log("----------------------------------------");
