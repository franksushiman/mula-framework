// Serviço de Inteligência Artificial para o WhatsApp

const { OpenAI } = require('openai');

// Configurar a instância da OpenAI
let openai;
try {
    // Carregar chave da API do ambiente ou usar fallback
    const apiKey = process.env.OPENAI_API_KEY || '';
    
    if (!apiKey) {
        console.warn('⚠️  OPENAI_API_KEY não encontrada nas variáveis de ambiente');
        // Usar uma chave vazia, mas a função terá fallback
    }
    
    openai = new OpenAI({
        apiKey: apiKey,
        timeout: 30000, // 30 segundos timeout
    });
    
    console.log('✅ OpenAI configurada com sucesso');
} catch (error) {
    console.error('❌ Erro ao configurar OpenAI:', error.message);
    openai = null;
}

/**
 * Gera uma resposta usando IA para mensagens do WhatsApp
 * @param {string} mensagemUsuario - A mensagem recebida do cliente
 * @param {string} contextoLoja - Informações sobre a loja (cardápio, horários, etc.)
 * @returns {Promise<string>} - Resposta gerada pela IA
 */
async function gerarRespostaIA(mensagemUsuario, contextoLoja) {
    try {
        // Verificar se a OpenAI está configurada
        if (!openai) {
            throw new Error('OpenAI não configurada');
        }
        
        // System Prompt: Definir o comportamento da IA
        const systemPrompt = `Você é um Atendente Virtual do Restaurante "Ceia Delivery". 
        Seu papel é ser curto, educado e focado em vender.
        
        CONTEXTO DA LOJA:
        ${contextoLoja}
        
        DIRETRIZES:
        1. Seja breve e direto (máximo 3 frases)
        2. Sempre tente vender ou sugerir itens do cardápio
        3. Para pedidos, peça detalhes: item, quantidade, endereço de entrega
        4. Para dúvidas sobre horário, responda com os horários disponíveis
        5. Para preços, consulte o cardápio no contexto
        6. Se não souber algo, diga que vai consultar e sugira falar com atendente humano
        7. Use emojis moderadamente (máximo 2 por resposta)
        8. Nunca invente informações que não estão no contexto
        
        FORMATAÇÃO:
        - Use quebras de linha para separar ideias
        - Destaque preços com R$
        - Seja caloroso mas profissional`;
        
        // Chamar a API da OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Modelo rápido e econômico
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: mensagemUsuario
                }
            ],
            temperature: 0.7, // Criatividade controlada
            max_tokens: 150, // Respostas curtas
        });
        
        // Extrair a resposta
        const resposta = completion.choices[0]?.message?.content?.trim();
        
        if (!resposta) {
            throw new Error('Resposta vazia da OpenAI');
        }
        
        console.log(`🤖 IA: Resposta gerada (${resposta.length} caracteres)`);
        return resposta;
        
    } catch (error) {
        console.error('❌ Erro ao gerar resposta com IA:', error.message);
        
        // Fallback: respostas pré-definidas baseadas em palavras-chave
        const mensagemLower = mensagemUsuario.toLowerCase();
        
        if (mensagemLower.includes('oi') || mensagemLower.includes('olá') || mensagemLower.includes('ola')) {
            return `Olá! 👋 Bem-vindo ao Ceia Delivery!\n\nTemos pizza, hambúrguer e sushi no cardápio hoje. Gostaria de fazer um pedido?`;
        }
        
        if (mensagemLower.includes('cardápio') || mensagemLower.includes('cardapio') || mensagemLower.includes('menu')) {
            return `📋 NOSSO CARDÁPIO:\n\n• Pizza - R$ 45\n• Hamburguer - R$ 35\n• Sushi - R$ 60\n\nEntrega: R$ 10\nHorário: 18h às 23h\n\nO que vai pedir hoje?`;
        }
        
        if (mensagemLower.includes('preço') || mensagemLower.includes('preco') || mensagemLower.includes('valor')) {
            return `💰 PREÇOS:\n\nPizza: R$ 45\nHamburguer: R$ 35\nSushi: R$ 60\n\nEntrega: R$ 10\n\nTodos os pedidos acima de R$ 80 têm frete grátis!`;
        }
        
        if (mensagemLower.includes('horário') || mensagemLower.includes('horario') || mensagemLower.includes('aberto')) {
            return `⏰ HORÁRIO DE FUNCIONAMENTO:\n\nTerça a Domingo: 18h às 23h\nSegunda: FECHADO\n\nFaça seu pedido!`;
        }
        
        if (mensagemLower.includes('pedido') || mensagemLower.includes('comprar') || mensagemLower.includes('quero')) {
            return `🎉 Ótimo! Para fazer seu pedido, me informe:\n\n1. O que você gostaria?\n2. Quantidade?\n3. Endereço de entrega?\n\nAssim que confirmar, enviaremos seu pedido!`;
        }
        
        if (mensagemLower.includes('entrega') || mensagemLower.includes('delivery') || mensagemLower.includes('frete')) {
            return `🚚 ENTREGA:\n\n• Taxa: R$ 10\n• Frete grátis: Pedidos acima de R$ 80\n• Tempo médio: 40-60 minutos\n\nQual seu endereço?`;
        }
        
        // Resposta padrão
        return `Olá! Sou o assistente virtual do Ceia Delivery. 😊\n\nPara ver o cardápio, digite "cardápio".\nPara fazer um pedido, digite "quero pedir".\nPara horários, digite "horário".\n\nComo posso ajudar?`;
    }
}

// Exportar a função principal
module.exports = {
    gerarRespostaIA
};
