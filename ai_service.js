// Serviço de Inteligência Artificial para o WhatsApp

const { OpenAI } = require('openai');

// Configurar a instância da OpenAI
let openai = null;

// Função para configurar a OpenAI com a chave do config
function configureOpenAI(apiKey) {
    try {
        if (!apiKey || apiKey.trim() === '') {
            console.warn('⚠️  Chave OpenAI não fornecida');
            openai = null;
            return false;
        }
        
        // Verificar se a chave parece válida
        if (!apiKey.startsWith('sk-')) {
            console.warn('⚠️  Formato de chave OpenAI inválido (deve começar com "sk-")');
            openai = null;
            return false;
        }
        
        openai = new OpenAI({
            apiKey: apiKey.trim(),
            timeout: 30000, // 30 segundos timeout
        });
        
        console.log('✅ OpenAI configurada com sucesso');
        return true;
    } catch (error) {
        console.error('❌ Erro ao configurar OpenAI:', error.message);
        openai = null;
        return false;
    }
}

// Inicializar com chave vazia - será configurada quando necessário
console.log('🤖 Serviço de IA carregado (aguardando configuração)');

/**
 * Gera uma resposta usando IA para mensagens do WhatsApp
 * @param {string} mensagemUsuario - A mensagem recebida do cliente
 * @param {string} contextoLoja - Informações sobre a loja (cardápio, horários, etc.)
 * @param {string} apiKey - Chave da API da OpenAI (opcional, se não fornecida, tenta usar a configurada)
 * @returns {Promise<string>} - Resposta gerada pela IA
 */
async function gerarRespostaIA(mensagemUsuario, contextoLoja, apiKey = null) {
    try {
        // Se uma chave foi fornecida, configurar a OpenAI com ela
        if (apiKey && apiKey.trim() !== '' && apiKey.startsWith('sk-')) {
            configureOpenAI(apiKey);
        }
        
        // Verificar se a OpenAI está configurada
        if (!openai) {
            throw new Error('OpenAI não configurada. Configure a chave na aba de Configurações.');
        }
        
        // Verificar se o contexto da loja é apenas placeholder ou está vazio
        const isContextoPlaceholder = contextoLoja.includes("Restaurante Ceia Delivery") && 
                                     contextoLoja.includes("Cardápio: Pizza (R$ 45), Hamburguer (R$ 35), Sushi (R$ 60)");
        
        // System Prompt: Definir o comportamento da IA
        let systemPrompt;
        
        if (isContextoPlaceholder) {
            // Contexto placeholder - responder de forma genérica
            systemPrompt = `Você é um Assistente Virtual de Atendimento ao Cliente.
            Seu papel é ser útil, educado e direto.
            
            DIRETRIZES:
            1. Seja breve e direto (máximo 3 frases)
            2. Não mencione cardápio, preços ou itens específicos, pois não foram configurados
            3. Para pedidos, peça que o cliente entre em contato com o atendimento humano
            4. Para dúvidas sobre horário, peça que verifiquem com o estabelecimento
            5. Se não souber algo, diga que vai consultar e sugira falar com atendente humano
            6. Use emojis moderadamente (máximo 1 por resposta)
            7. Nunca invente informações
            
            FORMATAÇÃO:
            - Use quebras de linha para separar ideias
            - Seja caloroso mas profissional
            - Não assuma que representa um restaurante específico`;
        } else {
            // Contexto real configurado
            systemPrompt = `Você é um Atendente Virtual do estabelecimento.
            Seu papel é ser curto, educado e focado em ajudar.
            
            CONTEXTO DA LOJA:
            ${contextoLoja}
            
            DIRETRIZES:
            1. Seja breve e direto (máximo 3 frases)
            2. Use as informações do contexto para responder
            3. Para pedidos, peça detalhes: item, quantidade, endereço de entrega
            4. Para dúvidas sobre horário, responda com os horários disponíveis no contexto
            5. Para preços, consulte as informações do contexto
            6. Se não souber algo, diga que vai consultar e sugira falar com atendente humano
            7. Use emojis moderadamente (máximo 2 por resposta)
            8. Nunca invente informações que não estão no contexto
            
            FORMATAÇÃO:
            - Use quebras de linha para separar ideias
            - Destaque preços se mencionados no contexto
            - Seja caloroso mas profissional`;
        }
        
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
        
        // Verificar se o contexto é placeholder
        const isContextoPlaceholder = contextoLoja.includes("Restaurante Ceia Delivery") && 
                                     contextoLoja.includes("Cardápio: Pizza (R$ 45), Hamburguer (R$ 35), Sushi (R$ 60)");
        
        if (isContextoPlaceholder) {
            // Respostas genéricas para contexto placeholder
            if (mensagemLower.includes('oi') || mensagemLower.includes('olá') || mensagemLower.includes('ola')) {
                return `Olá! 👋 Sou um assistente virtual. Como posso ajudar?`;
            }
            
            if (mensagemLower.includes('cardápio') || mensagemLower.includes('cardapio') || mensagemLower.includes('menu')) {
                return `📋 O cardápio ainda não foi configurado. Por favor, entre em contato com o atendimento para mais informações.`;
            }
            
            if (mensagemLower.includes('preço') || mensagemLower.includes('preco') || mensagemLower.includes('valor')) {
                return `💰 As informações de preços ainda não foram configuradas. Entre em contato com o atendimento para consultar valores.`;
            }
            
            if (mensagemLower.includes('horário') || mensagemLower.includes('horario') || mensagemLower.includes('aberto')) {
                return `⏰ Os horários de funcionamento ainda não foram configurados. Entre em contato com o atendimento para verificar.`;
            }
            
            if (mensagemLower.includes('pedido') || mensagemLower.includes('comprar') || mensagemLower.includes('quero')) {
                return `🎉 Para fazer um pedido, entre em contato com nosso atendimento humano. Eles poderão ajudar com todas as informações necessárias.`;
            }
            
            if (mensagemLower.includes('entrega') || mensagemLower.includes('delivery') || mensagemLower.includes('frete')) {
                return `🚚 As informações de entrega ainda não foram configuradas. Entre em contato com o atendimento para verificar disponibilidade.`;
            }
            
            // Resposta padrão para contexto placeholder
            return `Olá! Sou um assistente virtual. 😊\n\nNo momento, as informações detalhadas ainda não foram configuradas. Para melhor atendimento, entre em contato com nosso atendimento humano.`;
        } else {
            // Respostas específicas para contexto configurado
            if (mensagemLower.includes('oi') || mensagemLower.includes('olá') || mensagemLower.includes('ola')) {
                return `Olá! 👋 Bem-vindo!\n\nComo posso ajudar você hoje?`;
            }
            
            if (mensagemLower.includes('cardápio') || mensagemLower.includes('cardapio') || mensagemLower.includes('menu')) {
                return `📋 CARDÁPIO:\n\nConsulte nosso atendimento para informações atualizadas sobre o cardápio.`;
            }
            
            if (mensagemLower.includes('preço') || mensagemLower.includes('preco') || mensagemLower.includes('valor')) {
                return `💰 PREÇOS:\n\nEntre em contato com nosso atendimento para consultar os valores atualizados.`;
            }
            
            if (mensagemLower.includes('horário') || mensagemLower.includes('horario') || mensagemLower.includes('aberto')) {
                return `⏰ HORÁRIO:\n\nVerifique com nosso atendimento os horários de funcionamento.`;
            }
            
            if (mensagemLower.includes('pedido') || mensagemLower.includes('comprar') || mensagemLower.includes('quero')) {
                return `🎉 Ótimo! Para fazer seu pedido, entre em contato com nosso atendimento. Eles poderão ajudar com todas as informações necessárias.`;
            }
            
            if (mensagemLower.includes('entrega') || mensagemLower.includes('delivery') || mensagemLower.includes('frete')) {
                return `🚚 ENTREGA:\n\nConsulte nosso atendimento para informações sobre entrega e frete.`;
            }
            
            // Resposta padrão para contexto configurado
            return `Olá! Sou o assistente virtual. 😊\n\nComo posso ajudar você hoje?`;
        }
    }
}

// Exportar funções
module.exports = {
    gerarRespostaIA,
    configureOpenAI
};
