import { serve } from "bun";
import { inicializarBanco, getProfile, updateProfile, getZones, upsertZone, deleteZone, getFleet, getDriverByTelegramId, createDriver, updateDriverStatus, updateDriverLocation } from "./core/database";

inicializarBanco();

// State for registration process
const userRegistrationState: { [key:string]: { step: string, data: any } } = {};

// Telegram API Helper
async function sendMessage(chatId: number, text: string) {
    const token = process.env.TELEGRAM_TOKEN;
    if (!token) {
        console.error("TELEGRAM_TOKEN não configurado nas variáveis de ambiente.");
        return;
    }
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

async function handleTelegramWebhook(req: Request) {
    try {
        const body = await req.json() as any;
        const message = body.message;
        
        if (!message) return new Response("OK");

        const chatId = message.chat.id;
        const telegramId = message.from.id.toString();

        // Location updates
        if (message.location) {
            const { latitude, longitude } = message.location;
            updateDriverLocation(telegramId, latitude, longitude);
            return new Response("OK");
        }

        if (!message.text) return new Response("OK");
        const text:string = message.text;

        // Command /start
        if (text.startsWith('/start')) {
            const driver = getDriverByTelegramId(telegramId);
            if (driver) {
                updateDriverStatus(telegramId, 'ONLINE');
                await sendMessage(chatId, `Olá ${(driver as any).nome}, você está online! Por favor, compartilhe sua localização para começar a receber corridas.`);
            } else {
                const payload = text.split(' ')[1];
                if (!payload) {
                    await sendMessage(chatId, "Bem-vindo! Este bot é para uso exclusivo de motoboys. Por favor, use o link de convite do seu restaurante.");
                    return new Response("OK");
                }
                userRegistrationState[telegramId] = { step: 'awaiting_nome', data: { telegram_id: telegramId } };
                await sendMessage(chatId, "Bem-vindo ao CEIA! Vamos começar seu cadastro. Por favor, digite seu NOME COMPLETO:");
            }
            return new Response("OK");
        }
        
        // Registration conversation
        const currentState = userRegistrationState[telegramId];
        if (currentState) {
            switch (currentState.step) {
                case 'awaiting_nome':
                    currentState.data.nome = text;
                    currentState.step = 'awaiting_cpf';
                    await sendMessage(chatId, "Ótimo! Agora, seu CPF:");
                    break;
                case 'awaiting_cpf':
                    currentState.data.cpf = text;
                    currentState.step = 'awaiting_pix';
                    await sendMessage(chatId, "Ok. Qual sua Chave Pix?");
                    break;
                case 'awaiting_pix':
                    currentState.data.chave_pix = text;
                    currentState.step = 'awaiting_vinculo';
                    await sendMessage(chatId, "Vínculo com o restaurante (Responda com 'FIXO' ou 'FREELANCER'):");
                    break;
                case 'awaiting_vinculo':
                    currentState.data.tipo_vinculo = text.toUpperCase() === 'FIXO' ? 'FIXO' : 'FREELANCER';
                    currentState.step = 'awaiting_veiculo';
                    await sendMessage(chatId, "Perfeito. E para fechar, qual sua moto? (Ex: Honda Biz 125)");
                    break;
                case 'awaiting_veiculo':
                    currentState.data.veiculo = text;
                    createDriver(currentState.data);
                    delete userRegistrationState[telegramId]; // Clean up state
                    await sendMessage(chatId, "Cadastro concluído! Você está online. Por favor, compartilhe sua localização para começar a receber corridas.");
                    break;
            }
        }
    } catch(err) {
        console.error("Erro no webhook do Telegram:", err);
    }

    return new Response("OK");
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

        if (req.method === "POST" && url.pathname === "/api/telegram/webhook") {
            return handleTelegramWebhook(req);
        }

        return new Response("Not Found", { status: 404 });
    }
});
console.log("🚀 Nó MULA Logística rodando liso na porta 3000");
