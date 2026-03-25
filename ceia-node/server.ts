import { serve } from "bun";
import { inicializarBanco, getProfile, updateProfile, getZones, upsertZone, deleteZone, getFleet, getDriverByTelegramId, upsertDriver, updateDriverStatus, updateDriverLocation } from "./core/database";

inicializarBanco();

// State for registration process
const chatStates: { [key:string]: { step: string, data: any } } = {};

// Telegram API Helper
async function sendMessage(token: string, chatId: number, text: string) {
    if (!token) return;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });
    } catch(e) {
        console.error("Erro ao enviar mensagem para o Telegram:", e);
    }
}

// --- Telegram Long Polling Bot ---
let lastUpdateId = 0;

async function startTelegramPolling() {
    console.log("🤖 Iniciando polling do Telegram...");
    // Pequeno delay para garantir que o banco de dados esteja pronto.
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const profile = getProfile() as any;
    const token = profile?.telegram_bot_token;

    if (!token) {
        console.log("⚠️ Token do Telegram não configurado. Polling não será iniciado. Por favor, configure-o no QG Logístico.");
        return;
    }
    console.log("✅ Token do Telegram encontrado. Iniciando bot...");

    while (true) {
        try {
            const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=60`);
            if (!res.ok) {
                console.error(`Erro na API do Telegram: ${res.status} ${res.statusText}`);
                if (res.status === 401) {
                    console.error("O token do bot do Telegram é inválido. Polling interrompido.");
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 30000));
                continue;
            }
            const data = await res.json() as any;

            if (data.ok && data.result.length > 0) {
                for (const update of data.result) {
                    lastUpdateId = update.update_id;
                    const message = update.message;
                    if (!message) continue;

                    const chatId = message.chat.id;
                    const telegramId = message.from.id.toString();
                    
                    if (message.location) {
                        const { latitude, longitude } = message.location;
                        updateDriverLocation(telegramId, latitude, longitude);
                        continue;
                    }

                    if (!message.text) continue;
                    const text: string = message.text;

                    if (text.startsWith('/start')) {
                        const driver = getDriverByTelegramId(telegramId);
                        if (driver) {
                            updateDriverStatus(telegramId, 'ONLINE');
                            await sendMessage(token, chatId, `Olá ${(driver as any).nome}, você está online! Compartilhe sua localização em tempo real aqui.`);
                        } else {
                            const payload = text.split(' ')[1];
                            if (!payload) {
                                await sendMessage(token, chatId, "Bem-vindo! Este bot é para uso exclusivo de motoboys. Use o link de convite do seu restaurante.");
                                continue;
                            }
                            chatStates[telegramId] = { step: 'awaiting_nome', data: { telegram_id: telegramId } };
                            await sendMessage(token, chatId, "Bem-vindo ao CEIA! Vamos começar seu cadastro. Por favor, digite seu NOME COMPLETO:");
                        }
                        continue;
                    }

                    const currentState = chatStates[telegramId];
                    if (currentState) {
                        switch (currentState.step) {
                            case 'awaiting_nome':
                                currentState.data.nome = text;
                                currentState.step = 'awaiting_vinculo';
                                await sendMessage(token, chatId, "Ótimo! Qual seu Vínculo com o restaurante (Responda 'FIXO' ou 'FREELANCER'):");
                                break;
                            case 'awaiting_vinculo':
                                currentState.data.tipo_vinculo = text.toUpperCase() === 'FIXO' ? 'FIXO' : 'FREELANCER';
                                currentState.step = 'awaiting_pix';
                                await sendMessage(token, chatId, "Ok. Para finalizar, qual sua Chave Pix?");
                                break;
                            case 'awaiting_pix':
                                currentState.data.chave_pix = text;
                                upsertDriver(currentState.data);
                                delete chatStates[telegramId];
                                await sendMessage(token, chatId, "Cadastro concluído! Você está online. Compartilhe sua localização em tempo real aqui.");
                                break;
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Erro no polling do Telegram (rede?):", err);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

serve({
    port: 3000,
    async fetch(req) {
        const url = new URL(req.url);
        
        if (req.method === "GET" && url.pathname === "/") return new Response(Bun.file("./public/index.html"), { headers: { "Content-Type": "text/html" } });
        
        if (req.method === "GET" && url.pathname === "/api/profile") return new Response(JSON.stringify(getProfile()), { headers: { "Content-Type": "application/json" } });
        if (req.method === "POST" && url.pathname === "/api/profile") { const body = await req.json(); return new Response(JSON.stringify(updateProfile(body)), { headers: { "Content-Type": "application/json" } }); }
        
        if (req.method === "GET" && url.pathname === "/api/zones") return new Response(JSON.stringify(getZones()), { headers: { "Content-Type": "application/json" } });
        if (req.method === "POST" && url.pathname === "/api/zones") { const body = await req.json(); return new Response(JSON.stringify(upsertZone(body)), { headers: { "Content-Type": "application/json" } }); }
        if (req.method === "DELETE" && url.pathname.startsWith("/api/zones/")) { const id = parseInt(url.pathname.split("/").pop()); return new Response(JSON.stringify(deleteZone(id)), { headers: { "Content-Type": "application/json" } }); }
        
        if (req.method === "GET" && url.pathname === "/api/fleet") return new Response(JSON.stringify(getFleet()), { headers: { "Content-Type": "application/json" } });

        // A ROTA TÁTICA DO CONVITE
        if (req.method === "POST" && url.pathname === "/api/fleet/invite") {
            const body = await req.json();
            const profile = getProfile() as any;
            
            // O carimbo da loja (se não configurou o zap da loja, usa um ID padrão)
            const storeId = profile?.whatsapp ? profile.whatsapp.replace(/\D/g, '') : 'NODE_PENDENTE';
            const motoZap = body.whatsapp_motoboy;
            
            // O Link Carimbado
            const linkTelegram = `https://t.me/FrotaCeiaBot?start=${storeId}_${motoZap}`;
            
            // MOCK: Aqui é onde o motor do WhatsApp (Baileys/Evolution) vai plugar no futuro.
            // Por enquanto, o Nó avisa no terminal que a ordem de disparo foi dada.
            console.log(`\n📦 [NÓ SOBERANO] Ordem de disparo recebida!`);
            console.log(`📱 Destino: ${motoZap}`);
            console.log(`💬 Mensagem: "Você foi convidado para a frota ${profile?.nome || 'do restaurante'}. Conclua seu cadastro clicando aqui: ${linkTelegram}"\n`);
            
            return new Response(JSON.stringify({ success: true, link: linkTelegram }), { headers: { "Content-Type": "application/json" } });
        }

        return new Response("Not Found", { status: 404 });
    }
});
console.log("🚀 Nó MULA Logística rodando liso na porta 3000");
startTelegramPolling();
