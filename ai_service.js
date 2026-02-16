// Serviço de Inteligência Artificial para o WhatsApp

const { OpenAI } = require('openai');

// Não manter estado global da instância OpenAI
// Cada chamada deve receber a chave explicitamente ou falhar

/**
 * Cria uma instância do cliente OpenAI com a chave fornecida
 * @param {string} apiKey - Chave da API da OpenAI
 * @returns {OpenAI} - Instância configurada
 * @throws {Error} - Se a chave for inválida
 */
function createOpenAIClient(apiKey) {
    if (!apiKey || apiKey.trim() === '') {
        throw new Error('Chave OpenAI não fornecida');
    }
    
    if (!apiKey.startsWith('sk-')) {
        throw new Error('Formato de chave OpenAI inválido (deve começar com "sk-")');
    }
    
    return new OpenAI({
        apiKey: apiKey.trim(),
        timeout: 30000, // 30 segundos timeout
    });
}

console.log('🤖 Serviço de IA carregado (sem estado global)');

/**
 * Gera uma resposta usando IA para mensagens do WhatsApp
 * @param {string} mensagemUsuario - A mensagem recebida do cliente
 * @param {string} contextoLoja - Informações sobre a loja (cardápio, horários, etc.)
 * @param {string|object} apiKeyOrConfig - Chave da API da OpenAI ou objeto de configuração com tech.openai_api_key
 * @returns {Promise<string>} - Resposta gerada pela IA
 */
async function gerarRespostaIA(mensagemUsuario, contextoLoja, apiKeyOrConfig = null) {
    try {
        // Extrair a chave da API do parâmetro
        let apiKey = null;
        
        if (typeof apiKeyOrConfig === 'string') {
            apiKey = apiKeyOrConfig;
        } else if (apiKeyOrConfig && apiKeyOrConfig.tech && apiKeyOrConfig.tech.openai_api_key) {
            apiKey = apiKeyOrConfig.tech.openai_api_key;
        }
        
        // Validar chave
        if (!apiKey || apiKey.trim() === '') {
            throw new Error('Chave OpenAI não configurada. Configure a chave na aba de Configurações.');
        }
        
        if (!apiKey.startsWith('sk-')) {
            throw new Error('Formato de chave OpenAI inválido (deve começar com "sk-")');
        }
        
        // Criar cliente OpenAI com a chave fornecida
        const openai = createOpenAIClient(apiKey);
        
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

// Função para transcrever áudio usando Whisper API
async function transcreverAudio(audioBuffer, mimeType, apiKey = null) {
    try {
        // Se uma chave foi fornecida, configurar a OpenAI com ela
        if (apiKey && apiKey.trim() !== '' && apiKey.startsWith('sk-')) {
            configureOpenAI(apiKey);
        }
        
        // Verificar se a OpenAI está configurada
        if (!openai) {
            throw new Error('OpenAI não configurada. Configure a chave na aba de Configurações.');
        }
        
        console.log(`🎤 Transcrevendo áudio (${audioBuffer.length} bytes, ${mimeType})...`);
        
        // Para a API OpenAI, precisamos enviar o áudio como um arquivo
        // Vamos usar a API diretamente com o buffer
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        // Verificar se o mimeType é válido
        if (!mimeType || typeof mimeType !== 'string') {
            throw new Error('Tipo MIME inválido fornecido para transcrição de áudio');
        }
        
        // Verificar se o mimeType é válido
        if (!mimeType || typeof mimeType !== 'string') {
            throw new Error('Tipo MIME inválido fornecido para transcrição de áudio');
        }
        
        // Criar arquivo temporário
        const tempDir = os.tmpdir();
        // Extrair o formato do mimeType, removendo parâmetros como '; codecs=opus'
        const mimeParts = mimeType.split('/');
        let format = 'ogg'; // fallback padrão
        if (mimeParts.length > 1) {
            // Pega a parte após '/' e remove qualquer parâmetro (separado por ';')
            format = mimeParts[1].split(';')[0].trim();
        }
        // Log para depuração
        console.log(`🎵 Formato extraído do mimeType "${mimeType}": "${format}"`);
        
        // Garantir que a extensão seja uma das suportadas pela Whisper API
        // Mapear formatos conhecidos para extensões de arquivo
        const supportedFormats = {
            'ogg': 'oga',    // Usar .oga para áudio OGG
            'opus': 'oga',   // Opus em container OGG -> .oga
            'oga': 'oga',    // audio/ogg -> .oga
            'mpeg': 'mp3',
            'mp3': 'mp3',
            'mp4': 'm4a',
            'm4a': 'm4a',
            'x-m4a': 'm4a',
            'wav': 'wav',
            'x-wav': 'wav',
            'webm': 'webm',
            'flac': 'flac',
            'x-flac': 'flac'
        };
        let extension = supportedFormats[format] || 'oga'; // fallback para oga se não reconhecido
        
        // Para áudio do WhatsApp (audio/ogg; codecs=opus), a API Whisper pode rejeitar .ogg
        // Vamos sempre usar .oga para formatos OGG/Opus
        if (format === 'opus' || format === 'ogg' || format === 'oga') {
            extension = 'oga';
        }
        
        console.log(`📁 Usando extensão: .${extension} para arquivo temporário`);
        const tempFilePath = path.join(tempDir, `audio_${Date.now()}.${extension}`);
        
        // Escrever buffer no arquivo
        fs.writeFileSync(tempFilePath, audioBuffer);
        
        try {
            // Transcrever usando Whisper
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: "whisper-1",
                language: "pt", // Português
                response_format: "text"
            });
            
            // Log da resposta bruta para debug
            console.log('📄 Resposta bruta da API Whisper:', JSON.stringify(transcription));
            
            // Extrair texto da transcrição
            let text = '';
            if (typeof transcription === 'string') {
                text = transcription;
            } else if (transcription && transcription.text) {
                text = transcription.text;
            } else if (transcription && transcription.data && transcription.data.text) {
                text = transcription.data.text;
            } else {
                console.warn('⚠️  Estrutura inesperada da resposta:', transcription);
                text = '[Erro na transcrição - formato desconhecido]';
            }
            
            if (!text || text.trim() === '') {
                text = '[Transcrição vazia]';
            }
            
            console.log(`✅ Transcrição concluída: ${text.substring(0, 100)}...`);
            
            // Limpar arquivo temporário
            fs.unlinkSync(tempFilePath);
            
            return text;
            
        } catch (transcriptionError) {
            // Limpar arquivo temporário em caso de erro
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
            console.error('❌ Erro na chamada Whisper API:', transcriptionError.message);
            throw transcriptionError;
        }
        
    } catch (error) {
        console.error('❌ Erro ao transcrever áudio:', error.message);
        throw error;
    }
}

// Exportar funções
module.exports = {
    gerarRespostaIA,
    configureOpenAI,
    transcreverAudio,
    parseMenuWithAI // Adicionar a nova função
};

/**
 * Analisa um texto de cardápio usando IA para extrair itens estruturados.
 * @param {string} menuText - O texto bruto do cardápio.
 * @param {object} mainConfig - O objeto de configuração principal.
 * @returns {Promise<Array>} - Array de objetos de itens do cardápio.
 */
async function parseMenuWithAI(menuText, mainConfig) {
    try {
        // A chave OpenAI já deve ter sido configurada no aiService pelo main.js
        if (!openai) {
            // Tentar configurar agora se não estiver configurado
            const apiKey = mainConfig.openAIKey || mainConfig.openaiKey;
            if (apiKey && apiKey.trim() !== '' && apiKey.startsWith('sk-')) {
                configureOpenAI(apiKey);
            } else {
                throw new Error('OpenAI não configurada. Configure a chave na aba de Configurações.');
            }
        }

        console.log(`🤖 IA: Processando cardápio com IA (${menuText.length} caracteres)...`);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Usar o mesmo modelo que gerarRespostaIA
            messages: [
                {
                    role: "system",
                    content: `Você é um assistente especializado em processar cardápios de restaurantes.
Converta o texto fornecido em uma lista estruturada de itens do cardápio.
Cada item deve ter as seguintes propriedades:
- id: Um ID único (pode ser um timestamp ou UUID simples).
- name: Nome do produto.
- description: Descrição breve do produto (se disponível).
- price: Preço do produto (número).
- promoPrice: Preço promocional (número, opcional, null se não houver).
- category: Categoria do produto (ex: "Pizzas", "Bebidas", "Sobremesas").
- paused: Booleano, sempre false por padrão.
- stock: Número, sempre null por padrão.
- image: String vazia por padrão.
- availableDays: Array de strings com os dias da semana (ex: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]). Sempre todos os dias por padrão.
- startTime: String vazia por padrão.
- endTime: String vazia por padrão.
- addonGroups: Array vazio por padrão.

Retorne um array JSON com os itens. Se não conseguir extrair, retorne um array vazio.
Exemplo de formato de saída:
{ "menuItems": [
  {
    "id": 1700000000001,
    "name": "Pizza Margherita",
    "description": "Molho de tomate, mussarela e manjericão fresco.",
    "price": 45.00,
    "promoPrice": null,
    "category": "Pizzas",
    "paused": false,
    "stock": null,
    "image": "",
    "availableDays": ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
    "startTime": "",
    "endTime": "",
    "addonGroups": []
  }
]}`
                },
                {
                    role: "user",
                    content: `Texto do cardápio para processar:\n\n${menuText}`
                }
            ],
            temperature: 0.3,
            max_tokens: 2000, // Aumentar max_tokens para cardápios maiores
            response_format: { type: "json_object" } // Pedir JSON diretamente
        });

        const responseContent = completion.choices[0]?.message?.content;
        if (!responseContent) {
            throw new Error('Resposta vazia da OpenAI ao processar cardápio.');
        }

        console.log(`🤖 IA: Resposta bruta do cardápio: ${responseContent.substring(0, 200)}...`);

        let parsedResult;
        try {
            parsedResult = JSON.parse(responseContent);
        } catch (jsonError) {
            console.error('❌ Erro ao fazer parse do JSON da OpenAI:', jsonError);
            throw new Error('Formato de resposta da OpenAI inválido. Não é um JSON válido.');
        }

        // Se a resposta for um objeto com uma chave 'menuItems', extrair o array
        if (parsedResult && Array.isArray(parsedResult.menuItems)) {
            return parsedResult.menuItems;
        } else if (Array.isArray(parsedResult)) {
            // Se a resposta for diretamente um array (menos provável com response_format: json_object)
            return parsedResult;
        } else {
            console.warn('⚠️ Resposta da OpenAI não contém um array de itens de cardápio esperado:', parsedResult);
            return [];
        }

    } catch (error) {
        console.error('❌ Erro ao processar cardápio com IA:', error.message);
        throw error;
    }
}
