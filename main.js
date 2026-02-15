const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');
const QRCode = require('qrcode');

// Carregar variáveis de ambiente
require('dotenv').config();

// Caminhos de persistência
const dataDir = path.join(app.getPath('userData'), 'data');
const configPath = path.join(dataDir, 'config.json');
const fleetPath = path.join(dataDir, 'fleet.json');
const ordersPath = path.join(dataDir, 'orders.json');
const tablesPath = path.join(dataDir, 'tables.json');
const reservationsPath = path.join(dataDir, 'reservations.json');

// Garantir que o diretório data existe
fs.ensureDirSync(dataDir);

// Configuração padrão
const defaultConfig = {
  storeName: 'Delivery Manager',
  restaurantAddress: '',
  googleMapsKey: '',
  openAIKey: '',
  telegramToken: '',
  telegramBotName: 'MulaFRotaBot', // Nome correto do bot do Telegram
  adminNumber: '',
  goldenRules: '',
  botPaused: false,
  fleet: [],
  pendingMotoboys: [],
  menuCategories: [],
  menuItems: [],
  storeMenu: [],
  deliveryRoutes: [],
  printers: [],
  printRouting: [],
  notificationSettings: {
    sound: true,
    newOrder: true,
    motoboyArrived: true
  },
  hubPagesLogo: '',
  hubPagesSlug: '',
  hubPagesPublicUrl: ''
};

// Função para gerar link do Telegram com carimbo (para convites específicos da loja)
// Para links genéricos (sem carimbo), use: `generateTelegramGenericLink(config)`
// O bot deve processar ambos os formatos: /start com payload e /start sem payload
function generateTelegramInviteLink(config, inviteId) {
  const telegramBotName = config.telegramBotName || 'MulaFRotaBot';
  const storeId = config.hubPagesSlug || config.storeName?.replace(/\s+/g, '-').toLowerCase() || 'ceia-delivery';
  // Garantir que inviteId não seja undefined
  const safeInviteId = inviteId || `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return `https://t.me/${telegramBotName}?start=${storeId}_${safeInviteId}`;
}

// Função para gerar link genérico do Telegram (sem carimbo de loja)
// Usado para cadastros neutros que podem ser associados posteriormente
function generateTelegramGenericLink(config) {
  const telegramBotName = config.telegramBotName || 'MulaFRotaBot';
  return `https://t.me/${telegramBotName}?start`;
}

// Estado em tempo real
const activeDrivers = new Map();
const pendingOrders = [];
const notifications = [];

// Funções auxiliares
function readJSON(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Erro ao ler ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Erro ao escrever ${filePath}:`, err);
    return false;
  }
}

// Carregar configuração
function loadConfig() {
  const config = readJSON(configPath, defaultConfig);
  // Mesclar com padrão para garantir novas propriedades
  const merged = { ...defaultConfig, ...config };
  
  // Garantir compatibilidade com nomes antigos
  if (merged.openaiKey && !merged.openAIKey) {
    merged.openAIKey = merged.openaiKey;
  }
  if (merged.telegramClientToken && !merged.telegramToken) {
    merged.telegramToken = merged.telegramClientToken;
  }
  
  return merged;
}

// Salvar configuração
function saveConfig(data) {
  const current = loadConfig();
  const merged = { ...current, ...data };
  
  // Garantir que as chaves de API sejam salvas mesmo se estiverem vazias
  // (para permitir limpar as chaves)
  if (data.googleMapsKey !== undefined) {
    merged.googleMapsKey = data.googleMapsKey;
  }
  if (data.openAIKey !== undefined) {
    merged.openAIKey = data.openAIKey;
  }
  if (data.telegramToken !== undefined) {
    merged.telegramToken = data.telegramToken;
  }
  
  return writeJSON(configPath, merged);
}

// Função centralizada para validar configurações
function validateConfig(config) {
    const errors = [];
    
    // Validar campos obrigatórios básicos
    if (!config.restaurantAddress || config.restaurantAddress.trim() === '') {
        errors.push('Endereço do restaurante é obrigatório');
    }
    
    // Validar formato do telefone do admin (se fornecido)
    if (config.adminNumber && config.adminNumber.trim() !== '') {
        const phoneRegex = /^[0-9]{10,15}$/;
        const cleanPhone = config.adminNumber.replace(/\D/g, '');
        if (!phoneRegex.test(cleanPhone)) {
            errors.push('Número do administrador deve conter apenas dígitos (10-15 caracteres)');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

// IPC Handlers
ipcMain.handle('load-config', async () => {
  return loadConfig();
});

ipcMain.handle('save-config', async (event, config) => {
  console.log('Salvando configuração recebida do frontend:', {
    hasGoogleMapsKey: config.googleMapsKey !== undefined,
    hasOpenAIKey: config.openAIKey !== undefined,
    hasTelegramToken: config.telegramToken !== undefined,
    googleMapsKeyLength: config.googleMapsKey?.length || 0,
    openAIKeyLength: config.openAIKey?.length || 0,
    telegramTokenLength: config.telegramToken?.length || 0
  });
  
  // Salvar sem validação rigorosa para permitir salvar configurações parciais
  const success = saveConfig(config);
  
  // Ler o arquivo salvo para verificação
  if (success) {
    const savedConfig = loadConfig();
    console.log('Configuração salva no disco:', {
      savedGoogleMapsKey: savedConfig.googleMapsKey?.substring(0, 10) + '...',
      savedOpenAIKey: savedConfig.openAIKey?.substring(0, 10) + '...',
      savedTelegramToken: savedConfig.telegramToken?.substring(0, 10) + '...'
    });
  }
  const savedConfig = saveConfig(config); // Agora retorna o objeto de configuração salvo ou null
  
  if (savedConfig) {
    console.log('Configuração salva no disco:', {
      savedGoogleMapsKey: savedConfig.googleMapsKey?.substring(0, 10) + '...',
      savedOpenAIKey: savedConfig.openAIKey?.substring(0, 10) + '...',
      savedTelegramToken: savedConfig.telegramToken?.substring(0, 10) + '...'
    });
    // Envia a configuração completa e atualizada para todos os renderers
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('config-updated', savedConfig);
    });
    return { success: true, message: 'Configurações salvas!' };
  } else {
    return { success: false, message: 'Erro ao salvar configurações.' };
  }
});

ipcMain.handle('get-fleet-status', async () => {
  const config = loadConfig();
  const fleet = config.fleet || [];
  const now = Date.now();
  
  return fleet.map(driver => {
    const lastSeen = activeDrivers.get(driver.phone)?.timestamp || 0;
    const isOnline = lastSeen && (now - lastSeen) < 60000; // 60 segundos
    return {
      ...driver,
      online: isOnline,
      lastSeen: lastSeen
    };
  });
});

ipcMain.handle('dispatch-fleet', async (event, { order, drivers }) => {
  // Simulação de envio para frota
  console.log('Dispatching order:', order, 'to drivers:', drivers);
  return { success: true, message: 'Pedido enviado para a frota' };
});

ipcMain.handle('fleet-invite-create', async (event, { phone, slug }) => {
  const config = loadConfig();
  const inviteId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const pending = config.pendingMotoboys || [];
  pending.push({
    phone,
    inviteId,
    slug: slug || 'default',
    createdAt: Date.now(),
    status: 'pending'
  });
  
  config.pendingMotoboys = pending;
  saveConfig(config);
  
  return { inviteId };
});

ipcMain.handle('request-driver-location', async (event, { telegramId, vulgo }) => {
  // Simulação: enviar solicitação via Telegram
  console.log(`Solicitando localização para ${vulgo} (${telegramId})`);
  return { success: true, message: 'Solicitação enviada' };
});

ipcMain.handle('get-persisted-orders', async () => {
  return readJSON(ordersPath, []);
});

ipcMain.handle('save-orders', async (event, orders) => {
  return writeJSON(ordersPath, orders);
});

ipcMain.handle('order-edit', async (event, { orderId, oldTotal, newTotal, customerId }) => {
  // Lógica de edição de pedido
  const delta = newTotal - oldTotal;
  let flow = 'none';
  let pixPayload = null;
  
  if (delta > 0) {
    flow = 'charge';
    pixPayload = `PIX para cobrar R$ ${delta.toFixed(2)}`;
  } else if (delta < 0) {
    flow = 'refund';
  }
  
  return {
    success: true,
    flow,
    pixPayload,
    newBalance: delta < 0 ? Math.abs(delta) : 0
  };
});

ipcMain.handle('order-edit-confirm-delta-paid', async (event, orderId) => {
  return { success: true, message: 'Diferença confirmada como paga' };
});

ipcMain.handle('cashier-close', async (event, { countedCash, operatorName, ordersFromRenderer }) => {
  // Calcular totais
  const totalOrders = ordersFromRenderer.reduce((sum, order) => sum + (order.total || 0), 0);
  const totalCash = countedCash || 0;
  const difference = totalCash - totalOrders;
  
  // Gerar relatório
  const report = {
    date: new Date().toISOString(),
    operatorName,
    totalOrders,
    countedCash,
    difference,
    ordersCount: ordersFromRenderer.length
  };
  
  // Salvar histórico
  const historyPath = path.join(dataDir, 'cashier-history.json');
  const history = readJSON(historyPath, []);
  history.push(report);
  writeJSON(historyPath, history);
  
  return {
    success: true,
    message: `Fechamento realizado. Diferença: R$ ${difference.toFixed(2)}`,
    report
  };
});

ipcMain.handle('get-dashboard-summary', async (event, orders) => {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayOrders = orders.filter(order => 
    order.createdAt >= todayStart.getTime()
  );
  
  const todaySales = todayOrders.reduce((sum, order) => sum + (order.total || 0), 0);
  const ordersInKitchen = orders.filter(order => order.status === 'preparing').length;
  const ordersDelivering = orders.filter(order => order.status === 'delivering').length;
  
  const activeDriversCount = Array.from(activeDrivers.values()).filter(driver => 
    (now - driver.timestamp) < 60000
  ).length;
  
  return {
    today_sales: todaySales,
    orders_in_kitchen: ordersInKitchen,
    orders_delivering: ordersDelivering,
    active_drivers: activeDriversCount,
    today_orders_count: todayOrders.length
  };
});

ipcMain.handle('tables-save', async (event, tables) => {
  return writeJSON(tablesPath, tables);
});

ipcMain.handle('reservation-create', async (event, data) => {
  const reservations = readJSON(reservationsPath, []);
  const reservation = {
    id: `RES-${Date.now()}`,
    ...data,
    createdAt: Date.now(),
    status: 'confirmed',
    notificationSeen: false
  };
  
  reservations.push(reservation);
  writeJSON(reservationsPath, reservations);
  
  // Simular envio de WhatsApp
  console.log(`Reserva criada para ${data.customerName} às ${data.time}`);
  
  return { success: true, reservation };
});

ipcMain.handle('reservation-mark-notification-seen', async (event, reservationId) => {
  const reservations = readJSON(reservationsPath, []);
  const updated = reservations.map(res => 
    res.id === reservationId ? { ...res, notificationSeen: true } : res
  );
  writeJSON(reservationsPath, updated);
  return { success: true };
});

// Remover o handler duplicado whatsapp-get-status que está acima
// (O handler correto está mais abaixo, importado do whatsapp.js)

ipcMain.handle('validate-telegram-token', async (event, token) => {
  try {
    // Validação simulada
    const isValid = token && token.length > 10;
    return {
      success: isValid,
      username: isValid ? 'ceia_bot' : null
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-printers', async () => {
  // Lista simulada de impressoras
  return ['Impressora Térmica 80mm', 'Impressora Laser Sala', 'Impressora Cozinha'];
});

// Nota: Handlers de pagamento removidos da interface do restaurante
// Essas funcionalidades são gerenciadas apenas no painel administrativo

ipcMain.handle('ai-parse-menu', async (event, text) => {
  try {
    const config = loadConfig();
    const openAIKey = config.openAIKey || config.openaiKey;
    
    if (!openAIKey) {
      throw new Error('Chave OpenAI não configurada. Configure na aba de Configurações.');
    }
    
    console.log('Processando cardápio com IA usando chave:', openAIKey.substring(0, 10) + '...');
    
    // Usar a API real da OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em processar cardápios de restaurantes. Converta o texto fornecido em uma lista estruturada de itens do cardápio com categoria, nome, ingredientes, preço e impressora sugerida.'
          },
          {
            role: 'user',
            content: `Processe este cardápio: ${text}\n\nRetorne um array JSON com os itens. Cada item deve ter: category, name, ingredients, price (número), printer (sugira "Cozinha" ou "Sobremesa" ou "Bebidas"), paused (false).`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Erro da OpenAI: ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('Resposta da OpenAI vazia');
    }
    
    // Extrair JSON da resposta
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const items = JSON.parse(jsonMatch[0]);
      console.log('Itens processados:', items);
      return items;
    } else {
      // Fallback para processamento manual
      console.log('Fazendo parsing manual da resposta:', content);
      return [
        {
          category: 'Processado com IA',
          name: 'Item de exemplo',
          ingredients: 'Ingredientes processados',
          price: 29.90,
          printer: 'Cozinha',
          paused: false
        }
      ];
    }
  } catch (error) {
    console.error('Erro ao processar cardápio com IA:', error);
    
    // Fallback para simulação se a chave não estiver configurada
    if (error.message.includes('não configurada')) {
      throw error;
    }
    
    // Retornar dados simulados em caso de erro
    return [
      {
        category: 'Entradas',
        name: 'Bruschetta',
        ingredients: 'Pão italiano, tomate, manjericão, azeite',
        price: 25.90,
        printer: 'Cozinha',
        paused: false
      },
      {
        category: 'Pratos Principais',
        name: 'Filé Mignon',
        ingredients: 'Filé mignon 200g, batatas rústicas, legumes grelhados',
        price: 89.90,
        printer: 'Cozinha',
        paused: false
      },
      {
        category: 'Sobremesas',
        name: 'Cheesecake',
        ingredients: 'Base de biscoito, cream cheese, frutas vermelhas',
        price: 22.50,
        printer: 'Sobremesa',
        paused: false
      }
    ];
  }
});

ipcMain.handle('export-backup', async () => {
  const backupData = {
    config: loadConfig(),
    fleet: readJSON(fleetPath, []),
    orders: readJSON(ordersPath, []),
    tables: readJSON(tablesPath, []),
    reservations: readJSON(reservationsPath, []),
    exportDate: new Date().toISOString()
  };
  
  const backupPath = path.join(app.getPath('userData'), `backup-${Date.now()}.json`);
  writeJSON(backupPath, backupData);
  
  return backupPath;
});

ipcMain.handle('import-backup', async (event) => {
  // Importar backup sem diálogo - usar caminho padrão
  const backupDir = app.getPath('userData');
  const backupFiles = fs.readdirSync(backupDir).filter(file => file.startsWith('backup-') && file.endsWith('.json'));
  
  if (backupFiles.length === 0) {
    return { success: false, message: 'Nenhum backup encontrado' };
  }
  
  // Usar o backup mais recente
  const latestBackup = backupFiles.sort().reverse()[0];
  const backupPath = path.join(backupDir, latestBackup);
  
  try {
    const backupData = readJSON(backupPath);
    
    if (backupData.config) saveConfig(backupData.config);
    if (backupData.fleet) writeJSON(fleetPath, backupData.fleet);
    if (backupData.orders) writeJSON(ordersPath, backupData.orders);
    if (backupData.tables) writeJSON(tablesPath, backupData.tables);
    if (backupData.reservations) writeJSON(reservationsPath, backupData.reservations);
    
    return { success: true, message: `Backup importado com sucesso: ${latestBackup}` };
  } catch (error) {
    return { success: false, message: `Erro ao importar: ${error.message}` };
  }
});

// WhatsApp service - inicializado apenas quando necessário
let whatsappService = null;
let currentQrCode = null;

// Função para inicializar o WhatsApp apenas quando necessário
function initializeWhatsAppService() {
    try {
        // Se o serviço já existe, verificar se está inicializado
        if (whatsappService && whatsappService.isWhatsAppInitialized && whatsappService.isWhatsAppInitialized()) {
            return whatsappService;
        }
        
        // Carregar o módulo WhatsApp
        whatsappService = require('./whatsapp.js');
        
        // Configurar a chave OpenAI no serviço de IA (se disponível)
        try {
            const config = loadConfig();
            const openAIKey = config.openAIKey || config.openaiKey;
            if (openAIKey && openAIKey.trim() !== '' && openAIKey.startsWith('sk-')) {
                console.log('🔑 Configurando chave OpenAI no serviço de IA...');
                // Passar a chave para o serviço de IA
                const aiService = require('./ai_service');
                // A função configureOpenAI deve ser exportada
                if (aiService.configureOpenAI) {
                    aiService.configureOpenAI(openAIKey);
                }
            } else {
                console.warn('⚠️  Chave OpenAI não configurada ou inválida no config');
            }
        } catch (configError) {
            console.warn('⚠️  Não foi possível configurar chave OpenAI:', configError.message);
        }
        
        // Inicializar o WhatsApp se não estiver inicializado
        if (!whatsappService.isWhatsAppInitialized || !whatsappService.isWhatsAppInitialized()) {
            console.log('WhatsApp não está inicializado, tentando inicializar...');
            // A config já foi carregada acima nesta função
            const config = loadConfig(); 
            whatsappService.initializeWhatsApp(config).catch(error => {
                console.error('Erro ao inicializar WhatsApp:', error);
            });
        }
        
        // NÃO configurar listeners aqui, pois já estão configurados no whatsapp.js
        // Apenas usar o serviço existente
        
        return whatsappService;
    } catch (error) {
        console.error('Erro ao carregar módulo WhatsApp:', error);
        whatsappService = {
            sendWhatsAppMessage: () => Promise.reject(new Error('WhatsApp não disponível')),
            getWhatsAppStatus: () => ({ connected: false, error: 'WhatsApp não inicializado' }),
            restartWhatsApp: () => Promise.reject(new Error('WhatsApp não disponível')),
            initializeWhatsApp: () => Promise.reject(new Error('WhatsApp não disponível')),
            isWhatsAppInitialized: () => false,
            resetInitialization: () => {},
            client: { on: () => {} }
        };
        return whatsappService;
    }
}

// Função para obter o serviço do WhatsApp (inicializa se necessário)
function getWhatsAppService(mainConfig) {
    if (!whatsappService) {
        return initializeWhatsAppService(mainConfig);
    }
    return whatsappService;
}

// Handlers para Telegram
ipcMain.handle('send-telegram-message', async (event, { botToken, chatId, message }) => {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });
    
    return { success: true, messageId: response.data.result.message_id };
  } catch (error) {
    console.error('Erro ao enviar mensagem Telegram:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.description || error.message };
  }
});

ipcMain.handle('get-telegram-updates', async (event, botToken) => {
  try {
    const url = `https://api.telegram.org/bot${botToken}/getUpdates`;
    const response = await axios.get(url);
    return { success: true, updates: response.data.result };
  } catch (error) {
    console.error('Erro ao buscar atualizações Telegram:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.description || error.message };
  }
});

// Handler para enviar mensagem via WhatsApp
ipcMain.handle('whatsapp-send', async (event, { phone, message }) => {
  console.log(`📱 IPC: Tentando enviar WhatsApp para ${phone}...`);
  try {
    const service = getWhatsAppService();
    const response = await service.sendWhatsAppMessage(phone, message);
    return { success: true, data: response };
  } catch (error) {
    console.error('Erro ao enviar WhatsApp:', error);
    return { success: false, error: error.message };
  }
});

// Handler para enviar convite do Telegram via WhatsApp
// WhatsApp é opcional: se falhar, o convite ainda é criado e o link é retornado.
ipcMain.handle('send-telegram-invite-to-whatsapp', async (event, phone) => {
  console.log(`📱 IPC send-telegram-invite-to-whatsapp chamado com phone: ${phone}`);
  try {
    const config = loadConfig();
    console.log('Config carregada');
    
    const service = getWhatsAppService();
    console.log('Serviço WhatsApp obtido');
    
    // Gerar ID único para o convite
    const inviteId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('Invite ID gerado:', inviteId);
    
    // ID da loja (usar slug ou nome) - garantir que não seja vazio
    const storeId = config.hubPagesSlug || config.storeName?.replace(/\s+/g, '-').toLowerCase() || 'ceia-delivery';
    console.log('Store ID:', storeId);
    
    // Gerar link do Telegram usando função auxiliar
    const telegramLink = generateTelegramInviteLink(config, inviteId);
    console.log('Telegram link:', telegramLink);
    
    // Mensagem personalizada
    const message = `🚀 *CONVITE PARA FAZER PARTE DA FROTA CEIA DELIVERY* 🚀\n\n` +
                   `Olá! Você foi convidado(a) para fazer parte da frota de entregadores do ${config.storeName || 'Ceia Delivery'}.\n\n` +
                   `📲 *Clique no link abaixo para se cadastrar:*\n` +
                   `${telegramLink}\n\n` +
                   `_\"Esse motoboy é meu\"_ 👊\n\n` +
                   `Após clicar no link, o bot do Telegram irá solicitar:\n` +
                   `• Seu PIX para pagamentos\n` +
                   `• Placa do veículo (se tiver)\n` +
                   `• Tipo de veículo\n` +
                   `• CPF\n` +
                   `• Número do WhatsApp\n\n` +
                   `Assim que cadastrado, você poderá compartilhar sua localização em tempo real e ficar online para receber corridas!`;
    
    // Variáveis para rastrear o envio do WhatsApp
    let whatsappSent = false;
    let whatsappError = null;
    
    // Tentar enviar via WhatsApp (opcional)
    try {
      // Verificar se o WhatsApp está conectado
      const status = service.getWhatsAppStatus();
      console.log('Status WhatsApp:', status);
      
      if (status.connected) {
        console.log(`Enviando convite Telegram para ${phone} via WhatsApp...`);
        console.log('Chamando service.sendWhatsAppMessage...');
        const response = await service.sendWhatsAppMessage(phone, message);
        console.log('Resposta do WhatsApp:', response);
        whatsappSent = true;
      } else {
        whatsappError = 'WhatsApp não está conectado';
        console.log('WhatsApp não conectado, pulando envio:', whatsappError);
      }
    } catch (whatsappErr) {
      whatsappError = whatsappErr.message;
      console.warn(`WhatsApp falhou (não crítico): ${whatsappError}`);
      // Não lançar erro - continuar com o fluxo
    }
    
    // Salvar o convite pendente (sempre, independente do WhatsApp)
    if (!config.pendingMotoboys) {
      config.pendingMotoboys = [];
    }
    config.pendingMotoboys.push({
      phone,
      inviteId,
      storeId,
      telegramLink,
      sentAt: Date.now(),
      status: whatsappSent ? 'sent' : 'pending_whatsapp'
    });
    saveConfig(config);
    console.log('Convite salvo no config');
    
    // Determinar mensagem de retorno
    let userMessage;
    if (whatsappSent) {
      userMessage = 'Convite enviado com sucesso via WhatsApp!';
    } else {
      userMessage = 'Convite criado! O link está pronto para ser compartilhado.';
      if (whatsappError) {
        userMessage += ` (WhatsApp não pôde enviar: ${whatsappError})`;
      }
    }
    
    return { 
      success: true, 
      message: userMessage,
      inviteId,
      telegramLink,
      whatsappSent,
      whatsappError: whatsappError || null
    };
  } catch (error) {
    console.error('Erro ao enviar convite Telegram via WhatsApp:', error);
    console.error('Stack trace:', error.stack);
    return { success: false, error: error.message };
  }
});

// Handler para enviar convite do entregador
// IMPORTANTE: O bot do Telegram deve processar tanto links com carimbo (/start storeId_inviteId)
// quanto links genéricos (/start). Links genéricos devem criar cadastros sem loja (unassigned)
// que podem ser associados posteriormente. Nenhum cadastro deve ser perdido.
// Este handler usa links com carimbo para vincular o entregador à loja imediatamente.
// Para links genéricos, use generateTelegramGenericLink(config).
// WhatsApp é opcional: se falhar, o convite ainda é criado e o link é retornado.
ipcMain.handle('enviar-convite-entregador', async (event, phoneNumber) => {
  console.log(`[BACKEND] Handler 'enviar-convite-entregador' chamado com telefone: ${phoneNumber}`);
  
  // Validação básica
  if (!phoneNumber || phoneNumber.trim() === '') {
    const errorMsg = 'Número de telefone vazio recebido no backend';
    console.error(`[BACKEND] ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  // Remover caracteres não numéricos
  const numericPhone = phoneNumber.replace(/\D/g, '');
  
  if (numericPhone.length < 10) {
    const errorMsg = `Número muito curto: ${numericPhone}`;
    console.error(`[BACKEND] ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  try {
    console.log(`[BACKEND] Processando convite para: ${numericPhone}`);
    
    // Obter o serviço do WhatsApp
    const service = getWhatsAppService();
    const config = loadConfig();
    
    // Gerar ID único para o convite
    const inviteId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // ID da loja (usar slug ou nome)
    const storeId = config.hubPagesSlug || 'ceia-delivery';
    
    // Gerar link do Telegram usando função auxiliar
    const telegramLink = generateTelegramInviteLink(config, inviteId);
    
    // Mensagem personalizada
    const message = `🚀 *CONVITE PARA FAZER PARTE DA FROTA CEIA DELIVERY* 🚀\n\n` +
                   `Olá! Você foi convidado(a) para fazer parte da frota de entregadores do ${config.storeName || 'Ceia Delivery'}.\n\n` +
                   `📲 *Clique no link abaixo para se cadastrar:*\n` +
                   `${telegramLink}\n\n` +
                   `_\"Esse motoboy é meu\"_ 👊\n\n` +
                   `Após clicar no link, o bot do Telegram irá solicitar:\n` +
                   `• Seu PIX para pagamentos\n` +
                   `• Placa do veículo (se tiver)\n` +
                   `• Tipo de veículo\n` +
                   `• CPF\n` +
                   `• Número do WhatsApp\n\n` +
                   `Assim que cadastrado, você poderá compartilhar sua localização em tempo real e ficar online para receber corridas!`;
    
    // Variáveis para rastrear o envio do WhatsApp
    let whatsappSent = false;
    let whatsappError = null;
    
    // Tentar enviar via WhatsApp (opcional)
    try {
      // Verificar se o WhatsApp está conectado
      const status = service.getWhatsAppStatus();
      console.log(`[BACKEND] Status do WhatsApp:`, status);
      
      if (status.connected) {
        console.log(`[BACKEND] Tentando enviar mensagem via WhatsApp para ${numericPhone}...`);
        await service.sendWhatsAppMessage(numericPhone, message);
        whatsappSent = true;
        console.log(`[BACKEND] WhatsApp enviado com sucesso para ${numericPhone}`);
      } else {
        whatsappError = 'WhatsApp não está conectado';
        console.log(`[BACKEND] WhatsApp não conectado, pulando envio: ${whatsappError}`);
      }
    } catch (whatsappErr) {
      whatsappError = whatsappErr.message;
      console.warn(`[BACKEND] WhatsApp falhou (não crítico): ${whatsappError}`);
      // Não lançar erro - continuar com o fluxo
    }
    
    // Salvar o convite pendente (sempre, independente do WhatsApp)
    if (!config.pendingMotoboys) {
      config.pendingMotoboys = [];
    }
    // Garantir que storeId não seja undefined
    const safeStoreId = storeId || 'ceia-delivery';
    config.pendingMotoboys.push({
      phone: numericPhone,
      inviteId,
      storeId: safeStoreId,
      telegramLink,
      sentAt: Date.now(),
      status: whatsappSent ? 'sent' : 'pending_whatsapp'
    });
    saveConfig(config);
    
    console.log(`[BACKEND] Convite criado com sucesso para ${numericPhone}`);
    
    // Determinar mensagem de retorno
    let userMessage;
    if (whatsappSent) {
      userMessage = 'Convite enviado com sucesso via WhatsApp!';
    } else {
      userMessage = 'Convite criado! O link está pronto para ser compartilhado.';
      if (whatsappError) {
        userMessage += ` (WhatsApp não pôde enviar: ${whatsappError})`;
      }
    }
    
    return { 
      success: true, 
      message: userMessage,
      inviteId,
      telegramLink,
      phone: numericPhone,
      whatsappSent,
      whatsappError: whatsappError || null,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`[BACKEND] Erro ao processar convite: ${error.message}`);
    
    // Retornar erro para o frontend
    return {
      success: false,
      error: error.message,
      phone: numericPhone
    };
  }
});

// Handler para processar áudio com OpenAI (transcrição + análise semântica)
ipcMain.handle('process-audio', async (event, { audioData, mimeType }) => {
  try {
    const config = loadConfig();
    const openAIKey = config.openAIKey || config.openaiKey;
    
    if (!openAIKey) {
      throw new Error('Chave OpenAI não configurada. Configure na aba de Configurações.');
    }
    
    console.log('Processando áudio com OpenAI...');
    
    // Lista de formatos de áudio suportados pelo Whisper API
    const SUPPORTED_AUDIO_TYPES = [
      'audio/flac',
      'audio/m4a',
      'audio/mp3',
      'audio/mp4',
      'audio/mpeg',
      'audio/mpga',
      'audio/oga',
      'audio/ogg',
      'audio/wav',
      'audio/webm'
    ];
    
    // Validar formato do áudio antes de processar
    if (!SUPPORTED_AUDIO_TYPES.includes(mimeType)) {
      console.warn(`Formato de áudio não suportado: ${mimeType}. Tipos suportados: ${SUPPORTED_AUDIO_TYPES.join(', ')}`);
      return {
        success: false,
        error: `Formato de áudio não suportado: ${mimeType}. Use um dos formatos: FLAC, M4A, MP3, MP4, MPEG, MPGA, OGA, OGG, WAV, WEBM.`
      };
    }
    
    // 1. Primeiro, transcrever o áudio usando Whisper
    const transcription = await transcribeAudioWithWhisper(openAIKey, audioData, mimeType);
    
    // 2. Analisar semanticamente a transcrição usando GPT
    const semanticAnalysis = await analyzeTranscriptionWithGPT(openAIKey, transcription);
    
    return {
      success: true,
      transcription: transcription,
      analysis: semanticAnalysis
    };
    
  } catch (error) {
    console.error('Erro ao processar áudio:', error);
    return { 
      success: false, 
      error: error.message,
      note: 'Verifique se a chave OpenAI está configurada e tem créditos suficientes.'
    };
  }
});

// Função para transcrever áudio usando Whisper API
async function transcribeAudioWithWhisper(apiKey, audioData, mimeType) {
  try {
    // Lista de formatos de áudio suportados pelo Whisper API
    const SUPPORTED_AUDIO_TYPES = [
      'audio/flac',
      'audio/m4a',
      'audio/mp3',
      'audio/mp4',
      'audio/mpeg',
      'audio/mpga',
      'audio/oga',
      'audio/ogg',
      'audio/wav',
      'audio/webm'
    ];
    
    // Validar formato do áudio antes de processar
    if (!SUPPORTED_AUDIO_TYPES.includes(mimeType)) {
      console.warn(`Formato de áudio não suportado: ${mimeType}. Tipos suportados: ${SUPPORTED_AUDIO_TYPES.join(', ')}`);
      throw new Error(`Formato de áudio não suportado: ${mimeType}. Use um dos formatos: FLAC, M4A, MP3, MP4, MPEG, MPGA, OGA, OGG, WAV, WEBM.`);
    }
    
    // Converter base64 para buffer se necessário
    let audioBuffer;
    if (typeof audioData === 'string' && audioData.startsWith('data:')) {
      // Remover prefixo data:audio/ogg;base64,
      const base64Data = audioData.split(',')[1];
      audioBuffer = Buffer.from(base64Data, 'base64');
    } else if (typeof audioData === 'string') {
      audioBuffer = Buffer.from(audioData, 'base64');
    } else {
      audioBuffer = audioData;
    }
    
    // Usar FormData do Node.js
    const FormData = require('form-data');
    const formData = new FormData();
    
    // Adicionar o arquivo de áudio
    formData.append('file', audioBuffer, {
      filename: 'audio.ogg',
      contentType: mimeType || 'audio/ogg'
    });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorText;
      } catch {
        errorMessage = errorText;
      }
      throw new Error(`Erro Whisper API: ${errorMessage}`);
    }
    
    const data = await response.json();
    return data.text;
    
  } catch (error) {
    console.error('Erro na transcrição Whisper:', error);
    throw error;
  }
}

// Função para analisar semanticamente a transcrição usando GPT
async function analyzeTranscriptionWithGPT(apiKey, transcription) {
  try {
    const systemPrompt = `Você é um assistente especializado em entender pedidos de delivery de restaurante.
Analise a transcrição de áudio e extraia:
1. Intenção do usuário (pedido, dúvida, reclamação, elogio, endereço, etc.)
2. Entidades relevantes (produto, sabor, tamanho, quantidade, endereço, etc.)
3. Contexto implícito

Retorne um objeto JSON com a seguinte estrutura:
{
  "type": "audio",
  "transcription": "transcrição completa",
  "intent": "intenção principal",
  "entities": {
    "produto": "nome do produto se mencionado",
    "sabor": "sabor se mencionado",
    "tamanho": "tamanho se mencionado",
    "quantidade": "quantidade se mencionada",
    "endereco": "endereço se mencionado",
    "observacoes": "observações especiais"
  },
  "confidence": 0.0 a 1.0
}

Seja preciso e capture todas as informações relevantes para um sistema de delivery.`;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Transcrição: "${transcription}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Erro GPT API: ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('Resposta da GPT vazia');
    }
    
    // Extrair JSON da resposta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      // Garantir que a transcrição original está incluída
      analysis.transcription = transcription;
      return analysis;
    } else {
      // Fallback: retornar estrutura básica
      return {
        type: 'audio',
        transcription: transcription,
        intent: 'unknown',
        entities: {},
        confidence: 0.5
      };
    }
    
  } catch (error) {
    console.error('Erro na análise GPT:', error);
    // Retornar análise básica em caso de erro
    return {
      type: 'audio',
      transcription: transcription,
      intent: 'error',
      entities: {},
      confidence: 0.0,
      error: error.message
    };
  }
}

// Handler para processar mensagem de áudio do WhatsApp
ipcMain.handle('whatsapp-process-audio-message', async (event, { messageId, audioData, mimeType }) => {
  try {
    console.log(`Processando mensagem de áudio ${messageId}...`);
    
    // Lista de formatos de áudio suportados pelo Whisper API
    const SUPPORTED_AUDIO_TYPES = [
      'audio/flac',
      'audio/m4a',
      'audio/mp3',
      'audio/mp4',
      'audio/mpeg',
      'audio/mpga',
      'audio/oga',
      'audio/ogg',
      'audio/wav',
      'audio/webm'
    ];
    
    // Validar formato do áudio antes de processar
    if (!SUPPORTED_AUDIO_TYPES.includes(mimeType)) {
      console.warn(`Formato de áudio não suportado: ${mimeType}. Tipos suportados: ${SUPPORTED_AUDIO_TYPES.join(', ')}`);
      return {
        success: false,
        error: `Formato de áudio não suportado: ${mimeType}. Use um dos formatos: FLAC, M4A, MP3, MP4, MPEG, MPGA, OGA, OGG, WAV, WEBM.`
      };
    }
    
    // Processar o áudio
    const result = await ipcMain.handle('process-audio', event, { audioData, mimeType });
    
    // Enviar notificação para todas as janelas
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('audio-processed', {
        messageId,
        result
      });
    });
    
    return result;
    
  } catch (error) {
    console.error('Erro ao processar mensagem de áudio:', error);
    return { success: false, error: error.message };
  }
});

// Handler para processar localização com OpenAI (interpretação semântica)
ipcMain.handle('process-location', async (event, { latitude, longitude, contextMessage }) => {
  try {
    const config = loadConfig();
    const openAIKey = config.openAIKey || config.openaiKey;
    
    if (!openAIKey) {
      throw new Error('Chave OpenAI não configurada. Configure na aba de Configurações.');
    }
    
    console.log('Processando localização com OpenAI...');
    
    // Analisar semanticamente a localização usando GPT
    const semanticAnalysis = await analyzeLocationWithGPT(openAIKey, latitude, longitude, contextMessage);
    
    return {
      success: true,
      location: { latitude, longitude },
      analysis: semanticAnalysis
    };
    
  } catch (error) {
    console.error('Erro ao processar localização:', error);
    return { 
      success: false, 
      error: error.message,
      note: 'Verifique se a chave OpenAI está configurada e tem créditos suficientes.'
    };
  }
});

// Função para analisar semanticamente localização usando GPT
async function analyzeLocationWithGPT(apiKey, latitude, longitude, contextMessage) {
  try {
    const systemPrompt = `Você é um assistente especializado em interpretar localizações no contexto de delivery de restaurante.
Analise as coordenadas e o contexto da mensagem para inferir:
1. Intenção do usuário (entrega, ponto de referência, confirmação de endereço, etc.)
2. Endereço provável (quando possível inferir)
3. Significado no contexto da conversa
4. Se é um endereço de entrega válido

Use as coordenadas para entender a localização, mas foque no significado para o negócio.

Retorne um objeto JSON com a seguinte estrutura:
{
  "type": "location",
  "latitude": ${latitude},
  "longitude": ${longitude},
  "interpreted_as": "intenção_principal",
  "address_guess": "endereço provável se puder inferir",
  "confidence": 0.0 a 1.0,
  "context_notes": "notas sobre o contexto"
}

Seja preciso e capture todas as informações relevantes para um sistema de delivery.`;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Coordenadas: ${latitude}, ${longitude}. Contexto da mensagem: "${contextMessage || 'sem contexto adicional'}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Erro GPT API: ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('Resposta da GPT vazia');
    }
    
    // Extrair JSON da resposta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      // Garantir que as coordenadas originais estão incluídas
      analysis.latitude = latitude;
      analysis.longitude = longitude;
      return analysis;
    } else {
      // Fallback: retornar estrutura básica
      return {
        type: 'location',
        latitude: latitude,
        longitude: longitude,
        interpreted_as: 'unknown',
        address_guess: '',
        confidence: 0.5,
        context_notes: 'Não foi possível interpretar com precisão'
      };
    }
    
  } catch (error) {
    console.error('Erro na análise de localização GPT:', error);
    // Retornar análise básica em caso de erro
    return {
      type: 'location',
      latitude: latitude,
      longitude: longitude,
      interpreted_as: 'error',
      address_guess: '',
      confidence: 0.0,
      context_notes: `Erro: ${error.message}`
    };
  }
}

// Handler para processar mensagem de localização do WhatsApp
ipcMain.handle('whatsapp-process-location-message', async (event, { messageId, latitude, longitude, contextMessage }) => {
  try {
    console.log(`Processando mensagem de localização ${messageId}...`);
    
    // Processar a localização
    const result = await ipcMain.handle('process-location', event, { latitude, longitude, contextMessage });
    
    // Enviar notificação para todas as janelas
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('location-processed', {
        messageId,
        result
      });
    });
    
    return result;
    
  } catch (error) {
    console.error('Erro ao processar mensagem de localização:', error);
    return { success: false, error: error.message };
  }
});

// Handler para obter status do WhatsApp
ipcMain.handle('whatsapp-get-status', async () => {
  try {
    const service = getWhatsAppService();
    const status = service.getWhatsAppStatus();
    
    // Se não estiver conectado, tentar verificar se precisa inicializar
    if (!status.connected && status.status !== 'initializing') {
      console.log('WhatsApp não está conectado, verificando se precisa inicializar...');
      
      // Verificar se o serviço está inicializado
      if (service.isWhatsAppInitialized && !service.isWhatsAppInitialized()) {
        console.log('WhatsApp não está inicializado, tentando inicializar...');
        try {
          // Inicializar em segundo plano, mas não bloquear a resposta
          service.initializeWhatsApp().catch(error => {
            console.error('Erro ao inicializar WhatsApp em segundo plano:', error);
          });
          
          // Retornar status atualizado para indicar que está inicializando
          return {
            ...status,
            status: 'initializing',
            message: 'Inicializando WhatsApp...',
            isInitializing: true
          };
        } catch (initError) {
          console.error('Erro ao tentar inicializar WhatsApp:', initError);
          return {
            ...status,
            error: initError.message,
            initializationError: true,
            status: 'error'
          };
        }
      }
    }
    
    return status;
  } catch (error) {
    console.error('Erro ao obter status WhatsApp:', error);
    return { 
      connected: false, 
      error: error.message,
      isInitialized: false,
      status: 'error',
      message: `Erro: ${error.message}`
    };
  }
});

// Handler para reiniciar WhatsApp
ipcMain.handle('whatsapp-restart', async () => {
  try {
    const service = getWhatsAppService();
    if (service.restartWhatsApp) {
      await service.restartWhatsApp();
      return { success: true, message: 'WhatsApp reiniciado com sucesso!' };
    } else {
      return { success: false, error: 'Função restartWhatsApp não disponível' };
    }
  } catch (error) {
    console.error('Erro ao reiniciar WhatsApp:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('whatsapp-clear-session', async () => {
  try {
    const fs = require('fs-extra');
    const sessionPath = path.join(app.getPath('userData'), '.wwebjs_auth', 'session-ceia-delivery');
    
    const whatsapp = require('./whatsapp.js');
    if (whatsapp && whatsapp.clearWhatsAppSession) {
        const cleared = whatsapp.clearWhatsAppSession(sessionPath);
        if (cleared) {
            return { success: true, message: 'Sessão limpa. Reinicie o aplicativo.' };
        } else {
            return { success: false, error: 'Falha ao limpar sessão ou sessão não encontrada.' };
        }
    } else {
        // Fallback se a função não estiver disponível no whatsapp.js
        if (fs.existsSync(sessionPath)) {
            fs.removeSync(sessionPath);
            console.log('Sessão do WhatsApp limpa (fallback):', sessionPath);
            return { success: true, message: 'Sessão limpa. Reinicie o aplicativo.' };
        }
        return { success: false, error: 'Módulo WhatsApp não disponível ou sessão não encontrada.' };
    }
  } catch (error) {
    console.error('Erro ao limpar sessão:', error);
    return { success: false, error: error.message };
  }
});

// Função centralizada para processar QR Code do WhatsApp
function processWhatsAppQr(qr) {
  console.log('QR Code recebido, convertendo para imagem...');
  
  return new Promise((resolve, reject) => {
    QRCode.toDataURL(qr, (err, url) => {
      if (err) {
        console.error('Erro ao converter QR Code:', err);
        reject(err);
        return;
      }
      
      currentQrCode = url;
      console.log('QR Code convertido para imagem');
      
      // Enviar para todas as janelas
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('whatsapp-qr-updated', { qrImage: url });
      });
      
      resolve(url);
    });
  });
}

ipcMain.handle('whatsapp-get-qr', async () => {
  try {
    const service = getWhatsAppService();
    
    // Se já temos QR Code, retornar
    if (currentQrCode) {
      return { 
        success: true, 
        qrImage: currentQrCode,
        message: 'QR Code disponível'
      };
    }
    
    // Se não temos QR Code, tentar inicializar o WhatsApp
    console.log('Solicitando QR Code, inicializando WhatsApp...');
    await service.initializeWhatsApp();
    
    // Aguardar QR Code por 10 segundos
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ 
          success: false, 
          message: 'Aguardando QR Code do WhatsApp...',
          note: 'O WhatsApp está inicializando. Tente novamente em alguns segundos.'
        });
      }, 10000);
      
      // Listener temporário para QR Code
      const qrListener = (qr) => {
        clearTimeout(timeout);
        service.client.off('qr', qrListener);
        
        QRCode.toDataURL(qr, (err, url) => {
          if (err) {
            resolve({ 
              success: false, 
              message: 'Erro ao gerar QR Code: ' + err.message
            });
            return;
          }
          
          currentQrCode = url;
          resolve({ 
            success: true, 
            qrImage: url,
            message: 'QR Code gerado com sucesso'
          });
        });
      };
      
      service.client.on('qr', qrListener);
    });
    
  } catch (error) {
    console.error('Erro ao obter QR Code:', error);
    return { 
      success: false, 
      message: 'Erro ao inicializar WhatsApp: ' + error.message,
      note: 'Verifique se o WhatsApp Web pode ser executado no seu sistema.'
    };
  }
});

// Handler para obter status da rede Wi-Fi
ipcMain.handle('get-network-status', async () => {
    try {
        // Usar o módulo de rede do Node.js para obter informações da rede
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        
        let isConnected = false;
        let hasInternet = false;
        let ssid = 'Desconhecido';
        let signalStrength = -100; // dBm (valor padrão para desconectado)
        
        // Verificar se há interfaces de rede ativas
        for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            for (const iface of interfaces) {
                // Ignorar interfaces locais e IPv6
                if (!iface.internal && iface.family === 'IPv4') {
                    isConnected = true;
                    
                    // Tentar obter SSID (apenas para Wi-Fi)
                    if (interfaceName.toLowerCase().includes('wi-fi') || 
                        interfaceName.toLowerCase().includes('wlan') ||
                        interfaceName.toLowerCase().includes('wireless') ||
                        interfaceName.toLowerCase().includes('wifi')) {
                        
                        // Usar o nome da interface como SSID
                        ssid = interfaceName;
                        
                        // Tentar obter informações mais específicas do sistema
                        try {
                            // Para Windows: tentar usar netsh
                            if (process.platform === 'win32') {
                                const { execSync } = require('child_process');
                                try {
                                    const output = execSync('netsh wlan show interfaces').toString();
                                    const ssidMatch = output.match(/SSID\s*:\s*(.+)/);
                                    const signalMatch = output.match(/Signal\s*:\s*(\d+)%/);
                                    
                                    if (ssidMatch && ssidMatch[1]) {
                                        ssid = ssidMatch[1].trim();
                                    }
                                    if (signalMatch && signalMatch[1]) {
                                        const signalPercent = parseInt(signalMatch[1]);
                                        // Converter porcentagem para dBm aproximado
                                        // 100% = -30 dBm, 0% = -90 dBm
                                        signalStrength = -30 - ((100 - signalPercent) * 0.6);
                                    }
                                } catch (e) {
                                    console.log('Não foi possível obter detalhes do Wi-Fi via netsh:', e.message);
                                }
                            }
                            // Para macOS: tentar usar airport
                            else if (process.platform === 'darwin') {
                                const { execSync } = require('child_process');
                                try {
                                    const output = execSync('/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I').toString();
                                    const ssidMatch = output.match(/SSID:\s*(.+)/);
                                    const signalMatch = output.match(/agrCtlRSSI:\s*(-?\d+)/);
                                    
                                    if (ssidMatch && ssidMatch[1]) {
                                        ssid = ssidMatch[1].trim();
                                    }
                                    if (signalMatch && signalMatch[1]) {
                                        signalStrength = parseInt(signalMatch[1]);
                                    }
                                } catch (e) {
                                    console.log('Não foi possível obter detalhes do Wi-Fi via airport:', e.message);
                                }
                            }
                            // Para Linux: tentar usar iwconfig
                            else if (process.platform === 'linux') {
                                const { execSync } = require('child_process');
                                try {
                                    const output = execSync('iwconfig 2>/dev/null | grep -i "essid\\|signal"').toString();
                                    const ssidMatch = output.match(/ESSID:"([^"]+)"/);
                                    const signalMatch = output.match(/Signal level=(-?\d+) dBm/);
                                    
                                    if (ssidMatch && ssidMatch[1]) {
                                        ssid = ssidMatch[1].trim();
                                    }
                                    if (signalMatch && signalMatch[1]) {
                                        signalStrength = parseInt(signalMatch[1]);
                                    }
                                } catch (e) {
                                    console.log('Não foi possível obter detalhes do Wi-Fi via iwconfig:', e.message);
                                }
                            }
                        } catch (error) {
                            console.log('Erro ao obter detalhes do Wi-Fi:', error.message);
                        }
                        
                        // Se não conseguiu obter sinal real, usar valor simulado
                        if (signalStrength === -100) {
                            // Valor simulado entre -30 dBm (excelente) e -90 dBm (fraco)
                            signalStrength = -50 - Math.random() * 40;
                        }
                    }
                    break;
                }
            }
            if (isConnected) break;
        }
        
        // Verificar conectividade com a internet usando axios (já disponível)
        try {
            const response = await axios.head('https://www.google.com', { 
                timeout: 3000 
            });
            hasInternet = response.status >= 200 && response.status < 300;
        } catch (internetError) {
            console.log('Sem conexão com a internet:', internetError.message);
            hasInternet = false;
        }
        
        // Converter dBm para porcentagem (aproximação)
        // -30 dBm = 100%, -90 dBm = 0%
        let signalPercentage = 0;
        if (isConnected && signalStrength > -90) {
            signalPercentage = Math.min(100, Math.max(0, 
                ((signalStrength + 90) / 60) * 100
            ));
            signalPercentage = Math.round(signalPercentage);
        }
        
        // Determinar status baseado na porcentagem do sinal e conectividade com internet
        let status = 'disconnected';
        if (isConnected) {
            if (!hasInternet) {
                status = 'no-internet';
                signalPercentage = 0; // Forçar 0% se não tem internet
            } else if (signalPercentage >= 70) {
                status = 'excellent';
            } else if (signalPercentage >= 40) {
                status = 'unstable';
            } else {
                status = 'weak';
            }
        }
        
        return {
            connected: isConnected && hasInternet,
            hasInternet: hasInternet,
            ssid: ssid,
            signalStrength: Math.round(signalStrength),
            signalPercentage: signalPercentage,
            status: status,
            timestamp: Date.now()
        };
        
    } catch (error) {
        console.error('Erro ao obter status da rede:', error);
        return {
            connected: false,
            hasInternet: false,
            ssid: 'Erro',
            signalStrength: -100,
            signalPercentage: 0,
            status: 'error',
            error: error.message,
            timestamp: Date.now()
        };
    }
});

// Handlers para grupos de complementos do cardápio
ipcMain.handle('menu-addon-group-save', async (event, groupData) => {
  try {
    const config = loadConfig();
    if (!config.menuData) {
      config.menuData = { categories: [], addonGroups: [] };
    }
    if (!config.menuData.addonGroups) {
      config.menuData.addonGroups = [];
    }
    
    // Gerar ID se for novo grupo
    if (!groupData.id) {
      groupData.id = Date.now().toString();
    }
    
    // Verificar se já existe
    const existingIndex = config.menuData.addonGroups.findIndex(g => g.id === groupData.id);
    if (existingIndex >= 0) {
      config.menuData.addonGroups[existingIndex] = groupData;
    } else {
      config.menuData.addonGroups.push(groupData);
    }
    
    saveConfig(config);
    return { success: true, group: groupData };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('menu-addon-group-delete', async (event, groupId) => {
  try {
    const config = loadConfig();
    if (config.menuData && config.menuData.addonGroups) {
      config.menuData.addonGroups = config.menuData.addonGroups.filter(g => g.id !== groupId);
      saveConfig(config);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('menu-addon-group-list', async () => {
  try {
    const config = loadConfig();
    const groups = config.menuData?.addonGroups || [];
    return { success: true, groups };
  } catch (error) {
    return { success: false, error: error.message, groups: [] };
  }
});

ipcMain.handle('open-menu-import', async (event, { menuItems, menuCategories, addonGroups }) => {
  try {
    const config = loadConfig();
    
    if (!config.menuData) {
      config.menuData = { categories: [], addonGroups: [] };
    }

    // Atualizar itens do cardápio
    if (menuItems) {
      config.menuItems = menuItems;
    }
    // Atualizar categorias
    if (menuCategories) {
      config.menuData.categories = menuCategories;
    }
    // Atualizar grupos de complementos
    if (addonGroups) {
      config.menuData.addonGroups = addonGroups;
    }
    
    saveConfig(config);
    return { success: true, message: 'Cardápio importado com sucesso!' };
  } catch (error) {
    console.error('Erro ao importar cardápio:', error);
    return { success: false, error: error.message };
  }
});


// Event listeners
ipcMain.on('save-config', (event, data) => {
  saveConfig(data);
  event.sender.send('config-updated', data);
});

ipcMain.on('notify-motoboy-approved', (event, { telegramId, nome }) => {
  console.log(`Motoboy ${nome} (${telegramId}) aprovado`);
  // Enviar mensagem de boas-vindas via Telegram
});

ipcMain.on('restart-whatsapp', () => {
  console.log('Reiniciando conexão WhatsApp...');
});

ipcMain.on('whatsapp-broadcast', (event, { phones, msg }) => {
  console.log(`Broadcast para ${phones.length} números: ${msg.substring(0, 50)}...`);
});

ipcMain.on('print-job', (event, { printer, html }) => {
  console.log(`Imprimindo em ${printer}: ${html.substring(0, 100)}...`);
});

ipcMain.on('driver-pos', (event, { phone, lat, lng, vulgo, liveTracking, timestamp }) => {
  const now = timestamp || Date.now();
  activeDrivers.set(phone, {
    phone,
    lat,
    lng,
    vulgo,
    timestamp: now,
    liveTracking: liveTracking || false
  });
  
  // Broadcast para todas as janelas
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('telegram-location', { 
      phone, 
      lat, 
      lng, 
      vulgo,
      liveTracking: liveTracking || false,
      timestamp: now
    });
  });
  
  // Log para depuração
  if (liveTracking) {
    console.log(`[RASTREAMENTO] Entregador ${vulgo} (${phone}) moveu-se para ${lat}, ${lng}`);
  }
});

// Listener para processar áudio recebido do WhatsApp
ipcMain.on('whatsapp-audio-to-process', async (event, data) => {
  console.log(`Processando áudio recebido via evento: ${data.messageId}`);
  
  try {
    // Processar o áudio diretamente
    const result = await processAudioDirectly(data.audioData, data.mimeType);
    
    // Enviar resultado para todas as janelas
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('audio-processed', {
        messageId: data.messageId,
        result
      });
    });
    
    console.log('Áudio processado via evento:', result?.success ? 'Sucesso' : 'Falha');
  } catch (error) {
    console.error('Erro ao processar áudio via evento:', error);
  }
});

// Função auxiliar para processar áudio diretamente
async function processAudioDirectly(audioData, mimeType) {
  try {
    const config = loadConfig();
    const openAIKey = config.openAIKey || config.openaiKey;
    
    if (!openAIKey) {
      throw new Error('Chave OpenAI não configurada. Configure na aba de Configurações.');
    }
    
    console.log('Processando áudio com OpenAI...');
    
    // Lista de formatos de áudio suportados pelo Whisper API
    const SUPPORTED_AUDIO_TYPES = [
      'audio/flac',
      'audio/m4a',
      'audio/mp3',
      'audio/mp4',
      'audio/mpeg',
      'audio/mpga',
      'audio/oga',
      'audio/ogg',
      'audio/wav',
      'audio/webm'
    ];
    
    // Validar formato do áudio antes de processar
    if (!SUPPORTED_AUDIO_TYPES.includes(mimeType)) {
      console.warn(`Formato de áudio não suportado: ${mimeType}. Tipos suportados: ${SUPPORTED_AUDIO_TYPES.join(', ')}`);
      return {
        success: false,
        error: `Formato de áudio não suportado: ${mimeType}. Use um dos formatos: FLAC, M4A, MP3, MP4, MPEG, MPGA, OGA, OGG, WAV, WEBM.`
      };
    }
    
    // 1. Primeiro, transcrever o áudio usando Whisper
    const transcription = await transcribeAudioWithWhisper(openAIKey, audioData, mimeType);
    
    // 2. Analisar semanticamente a transcrição usando GPT
    const semanticAnalysis = await analyzeTranscriptionWithGPT(openAIKey, transcription);
    
    return {
      success: true,
      transcription: transcription,
      analysis: semanticAnalysis
    };
    
  } catch (error) {
    console.error('Erro ao processar áudio:', error);
    return { 
      success: false, 
      error: error.message,
      note: 'Verifique se a chave OpenAI está configurada e tem créditos suficientes.'
    };
  }
}

// Listener para cadastro de entregador via Telegram
ipcMain.on('driver-registered', async (event, driverData) => {
    console.log('🚗 Recebido driver-registered:', driverData);
    try {
        const config = loadConfig();
        const fleet = config.fleet || [];
        
        // Verificar se já existe pelo telefone ou chatId
        const existingIndex = fleet.findIndex(d => 
            d.phone === driverData.phone || d.chatId === driverData.chatId
        );
        
        // Lógica de Status baseada no carimbo (inviteCode)
        // Se tiver carimbo, é para ESTA loja -> active
        // Se não tiver, é cadastro geral (Site) -> pending/site_only
        let driverStatus = 'pending';
        let origin = 'site';

        if (driverData.inviteCode) {
            driverStatus = 'active';
            origin = 'store_link';
            console.log(`🔗 Cadastro carimbado (Código: ${driverData.inviteCode}). Ativando para a loja.`);
        } else {
            console.log('🌐 Cadastro sem carimbo (Site). Mantendo como pendente/global.');
        }

        // Se o driverData já vier com status definido pelo bot, respeitar, senão usar a lógica acima
        const finalStatus = driverData.status || driverStatus;

        const newDriver = {
            id: existingIndex >= 0 ? fleet[existingIndex].id : `DRV-${Date.now()}`,
            name: driverData.name,
            phone: driverData.phone,
            pixKey: driverData.pixKey,
            type: driverData.type,
            vehicle: driverData.vehicle,
            telegramUserId: driverData.telegramUserId,
            telegramUsername: driverData.username,
            chatId: driverData.chatId,
            status: finalStatus, 
            origin: origin,
            inviteCode: driverData.inviteCode || null,
            registeredAt: driverData.registeredAt || Date.now(),
            lastSeen: null,
            online: false
        };

        if (existingIndex >= 0) {
            fleet[existingIndex] = { ...fleet[existingIndex], ...newDriver };
            console.log('✅ Atualizado entregador existente:', newDriver.name);
        } else {
            fleet.push(newDriver);
            console.log('✅ Novo entregador adicionado:', newDriver.name);
        }
        
        config.fleet = fleet;
        const savedConfig = saveConfig(config); // Usa a função saveConfig atualizada
        
        // Notificar frontend sobre o registro do driver
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('driver-registered-ack', {
                success: true,
                driver: newDriver,
                message: `Entregador ${newDriver.name} registrado com sucesso!`
            });
            // Também notifica sobre a atualização da configuração
            if (savedConfig) {
                win.webContents.send('config-updated', savedConfig);
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao processar driver-registered:', error);
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('driver-registered-ack', {
                success: false,
                error: error.message
            });
        });
    }
});

ipcMain.on('bot-status', (event, data) => {
    console.log(`[main.js] Bot status received: Type=${data.botType || 'Telegram'}, Online=${data.online}, Message=${data.message}`);
    // Enviar para todas as janelas
    BrowserWindow.getAllWindows().forEach(win => {
        if (data.botType === 'whatsapp') {
            // O renderer.js já tem um listener específico para whatsapp-qr-updated que lida com o status do WhatsApp
            // Este listener 'bot-status' pode ser usado para um feedback mais genérico ou para o Telegram
            // Por enquanto, vamos usar o 'bot-status' para o Telegram e o 'whatsapp-qr-updated' para o WhatsApp
            // Se o renderer.js tiver um listener genérico para 'bot-status', ele o processará.
            // Para o Telegram, o renderer.js precisa de uma função updateTelegramStatusUI.
            win.webContents.send('telegram-bot-status', data); // Envia para o Telegram UI
        } else {
            // Assume Telegram se não especificado ou se for Telegram
            win.webContents.send('telegram-bot-status', data);
        }
    });
});

// Listener para processar localização recebida do WhatsApp
ipcMain.on('whatsapp-location-to-process', async (event, data) => {
  console.log(`Processando localização recebida via evento: ${data.messageId}`);
  
  try {
    // Processar a localização diretamente
    const result = await processLocationDirectly(data.latitude, data.longitude, data.contextMessage);
    
    // Enviar resultado para todas as janelas
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('location-processed', {
        messageId: data.messageId,
        result
      });
    });
    
    console.log('Localização processada via evento:', result?.success ? 'Sucesso' : 'Falha');
  } catch (error) {
    console.error('Erro ao processar localização via evento:', error);
  }
});

// Handler para atualizar localização em tempo real do entregador (Live Location)
ipcMain.handle('update-driver-live-location', async (event, { phone, lat, lng, vulgo, timestamp }) => {
  try {
    console.log(`[RASTREAMENTO] Atualizando localização em tempo real para ${vulgo} (${phone}): ${lat}, ${lng}`);
    
    // Atualizar no mapa de drivers ativos
    activeDrivers.set(phone, {
      phone,
      lat,
      lng,
      vulgo,
      timestamp: timestamp || Date.now(),
      liveTracking: true
    });
    
    // Broadcast para todas as janelas
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('driver-pos', { 
        phone,
        lat,
        lng,
        vulgo,
        liveTracking: true,
        timestamp: timestamp || Date.now()
      });
    });
    
    return { success: true, message: 'Localização em tempo real atualizada' };
  } catch (error) {
    console.error('Erro ao atualizar localização em tempo real:', error);
    return { success: false, error: error.message };
  }
});

// Função auxiliar para processar localização diretamente
async function processLocationDirectly(latitude, longitude, contextMessage) {
  try {
    const config = loadConfig();
    const openAIKey = config.openAIKey || config.openaiKey;
    
    if (!openAIKey) {
      throw new Error('Chave OpenAI não configurada. Configure na aba de Configurações.');
    }
    
    console.log('Processando localização com OpenAI...');
    
    // Analisar semanticamente a localização usando GPT
    const semanticAnalysis = await analyzeLocationWithGPT(openAIKey, latitude, longitude, contextMessage);
    
    return {
      success: true,
      location: { latitude, longitude },
      analysis: semanticAnalysis
    };
    
  } catch (error) {
    console.error('Erro ao processar localização:', error);
    return { 
      success: false, 
      error: error.message,
      note: 'Verifique se a chave OpenAI está configurada e tem créditos suficientes.'
    };
  }
}

// Criar janela principal
let mainWindow = null;

function createWindow() {
  // Se já existe uma janela, focar nela em vez de criar outra
  const existingWindows = BrowserWindow.getAllWindows();
  if (existingWindows.length > 0) {
    existingWindows[0].focus();
    return existingWindows[0];
  }
  
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false // Não mostrar imediatamente
  });

  win.loadFile('index.html');
  
  // Mostrar a janela quando o conteúdo estiver carregado
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Abrir DevTools apenas em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  // Simular atualizações periódicas de status
  setInterval(() => {
    const config = loadConfig();
    if (config.fleet && config.fleet.length > 0) {
      const randomDriver = config.fleet[Math.floor(Math.random() * config.fleet.length)];
      win.webContents.send('driver-pos', { 
        phone: randomDriver.phone,
        lat: -23.5505 + (Math.random() - 0.5) * 0.1,
        lng: -46.6333 + (Math.random() - 0.5) * 0.1,
        vulgo: randomDriver.code
      });
    }
    
    // Atualizar status do bot
    win.webContents.send('bot-status', {
      botType: 'whatsapp', // Assuming this is for WhatsApp simulation
      online: true,
      timestamp: Date.now()
    });
  }, 30000);
  
  mainWindow = win;
  return win;
}

// Inicializar o aplicativo
app.whenReady().then(() => {
  // Garantir que apenas uma janela seja criada
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
  
  // Inicializar o WhatsApp após um breve delay para garantir que a janela está pronta
  setTimeout(() => {
    console.log('Verificando status do WhatsApp...');
    try {
      const service = getWhatsAppService();
      console.log('Serviço WhatsApp obtido, verificando status...');
      
      // Verificar status atual
      const status = service.getWhatsAppStatus();
      console.log('Status atual do WhatsApp:', status);
      
      // Se já está conectado, apenas enviar status
      if (status.connected) {
        console.log('✅ WhatsApp já está conectado!');
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('bot-status', {
            botType: 'whatsapp',
            online: true,
            timestamp: Date.now(),
            message: status.message
          });
        });
        return;
      }
      
      // Se está inicializando, não tentar inicializar novamente
      if (status.isInitializing || status.status === 'initializing') {
        console.log('WhatsApp já está em processo de inicialização, aguardando...');
        
        // Aguardar e verificar se conecta
        setTimeout(() => {
          const newStatus = service.getWhatsAppStatus();
          if (newStatus.connected) {
            console.log('✅ WhatsApp conectado após espera!');
            BrowserWindow.getAllWindows().forEach(win => {
              win.webContents.send('bot-status', {
                botType: 'whatsapp',
                online: true,
                timestamp: Date.now(),
                message: newStatus.message
              });
            });
          }
        }, 10000); // Aguardar 10 segundos
        return;
      }
      
      // Se não está conectado nem inicializando, tentar inicializar
      console.log('WhatsApp não está conectado, tentando inicializar...');
      
      const config = loadConfig(); // Carregar config aqui para passar ao WhatsApp
      service.initializeWhatsApp(config).then(() => {
        console.log('✅ WhatsApp inicializado com sucesso!');
        
        // Verificar status após inicialização
        setTimeout(() => {
          const newStatus = service.getWhatsAppStatus();
          console.log('Status do WhatsApp após inicialização:', newStatus);
          
          // Enviar status para a janela principal
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('bot-status', {
              botType: 'whatsapp',
              online: newStatus.connected,
              timestamp: Date.now(),
              message: newStatus.message
            });
          });
        }, 2000);
        
      }).catch(error => {
        console.error('❌ Erro ao inicializar WhatsApp:', error);
        
        // Não tentar novamente automaticamente
        console.log('Não tentando novamente automaticamente para evitar loops');
      });
      
    } catch (error) {
      console.error('Erro ao verificar serviço WhatsApp:', error);
    }
  }, 3000); // Delay de 3 segundos

  // Inicializar bot Telegram (Live Location)
  setTimeout(async () => { // Torna o callback assíncrono
    console.log('Inicializando bot Telegram para Live Location...');
    try {
      const config = loadConfig(); // Carrega a configuração atual
      const telegramToken = config.telegramToken || config.telegramClientToken;

      if (!telegramToken || telegramToken.trim() === '') {
        console.warn('⚠️ Token Telegram vazio no config.json. O bot Telegram não será inicializado.');
        // Envia um status para o frontend para exibir um toast
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('bot-status', {
            online: false,
            timestamp: Date.now(),
            message: 'Token Telegram vazio. Bot não inicializado.'
          });
        });
        return; // Sai da função se não houver token
      }

      const telegramBot = require('./telegram.js');
      if (telegramBot && telegramBot.initializeTelegramBot) {
        // A função initializeTelegramBot agora recebe a config
        const botInstance = await telegramBot.initializeTelegramBot(config);
        if (botInstance) {
          console.log('✅ Bot Telegram inicializado para rastreamento em tempo real');
          // Envia um status de sucesso para o frontend
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('bot-status', {
              botType: 'telegram',
              online: true,
              timestamp: Date.now(),
              message: 'Bot Telegram inicializado.'
            });
          });
        } else {
          console.warn('⚠️ Bot Telegram não foi inicializado. Verifique o token e logs do telegram.js.');
          // Envia um status de falha para o frontend
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('bot-status', {
              online: false,
              timestamp: Date.now(),
              message: 'Bot Telegram não inicializado. Token pode estar inválido.'
            });
          });
        }
      } else {
        console.warn('⚠️  Módulo Telegram não encontrado ou sem função initializeTelegramBot');
        // Envia um status de falha para o frontend
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('bot-status', {
            online: false,
            timestamp: Date.now(),
            message: 'Módulo Telegram não encontrado.'
          });
        });
      }
    } catch (error) {
      console.error('❌ Erro ao inicializar bot Telegram:', error);
      // Envia um status de erro para o frontend
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('bot-status', {
          online: false,
          timestamp: Date.now(),
          message: `Erro ao inicializar Bot Telegram: ${error.message}`
        });
      });
    }
  }, 5000); // Delay de 5 segundos após o WhatsApp

  app.on('activate', () => {
    // No macOS, é comum recriar uma janela quando o dock é clicado e não há outras janelas abertas
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Listener para status do bot (WhatsApp e Telegram)
ipcMain.on('bot-status', (event, data) => {
    // Reencaminhar para todas as janelas com o tipo correto
    BrowserWindow.getAllWindows().forEach(win => {
        // Se ainda não tem botType, assume Telegram se vier do telegram.js
        if (!data.botType) {
            // Tenta inferir pelo conteúdo ou padrão telegram
            data.botType = 'telegram';
        }

        win.webContents.send('bot-status', data);
        
        // Também enviar eventos específicos para compatibilidade com a UI
        if (data.botType === 'telegram') {
            win.webContents.send('telegram-bot-status', data);
        }
    });
});

// Handler para reiniciar o bot Telegram
ipcMain.handle('restartTelegramBot', async () => {
    console.log('🔄 [main.js] Recebida solicitação para reiniciar bot Telegram.');
    try {
        const config = loadConfig(); // Recarregar config para garantir dados atualizados
        const telegramBot = require('./telegram.js');
        
        // Parar o bot atual se estiver rodando
        if (telegramBot.getBot && telegramBot.getBot()) {
             try {
                 await telegramBot.getBot().stop('restart');
                 console.log('✅ [main.js] Bot Telegram parado.');
             } catch (e) {
                 console.warn('⚠️ [main.js] Erro ao parar bot Telegram:', e.message);
             }
        }

        // Reinicializar com a nova config
        const botInstance = await telegramBot.initializeTelegramBot(config);
        
        if (botInstance) {
            console.log('✅ [main.js] Bot Telegram reinicializado.');
            return { success: true, message: 'Bot Telegram reinicializado com sucesso.' };
        } else {
            return { success: false, error: 'Falha ao inicializar. Verifique o Token.' };
        }
    } catch (error) {
        console.error('❌ [main.js] Erro ao reiniciar bot Telegram:', error);
        return { success: false, error: error.message };
    }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
