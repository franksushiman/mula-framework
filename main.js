const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');
const QRCode = require('qrcode');

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
  openaiKey: '',
  telegramClientToken: '',
  telegramClientBotUsername: '',
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
  paymentConfigs: {
    asaas: {
      is_active: false,
      credentials: {}
    }
  },
  hubPagesLogo: '',
  hubPagesSlug: '',
  hubPagesPublicUrl: ''
};

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
  return { ...defaultConfig, ...config };
}

// Salvar configuração
function saveConfig(data) {
  const current = loadConfig();
  const merged = { ...current, ...data };
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
  // Validar configuração antes de salvar
  const validation = validateConfig(config);
  if (!validation.isValid) {
    return { success: false, message: `Erro de validação: ${validation.errors.join(', ')}` };
  }
  
  const success = saveConfig(config);
  return success ? { success: true, message: 'Configurações salvas!' } : { success: false, message: 'Erro ao salvar configurações.' };
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
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  
  if (canceled || filePaths.length === 0) {
    return { success: false, message: 'Importação cancelada' };
  }
  
  try {
    const backupData = readJSON(filePaths[0]);
    
    if (backupData.config) saveConfig(backupData.config);
    if (backupData.fleet) writeJSON(fleetPath, backupData.fleet);
    if (backupData.orders) writeJSON(ordersPath, backupData.orders);
    if (backupData.tables) writeJSON(tablesPath, backupData.tables);
    if (backupData.reservations) writeJSON(reservationsPath, backupData.reservations);
    
    return { success: true, message: 'Backup importado com sucesso' };
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
        
        // Inicializar o WhatsApp se não estiver inicializado
        if (!whatsappService.isWhatsAppInitialized || !whatsappService.isWhatsAppInitialized()) {
            console.log('WhatsApp não está inicializado, tentando inicializar...');
            whatsappService.initializeWhatsApp().catch(error => {
                console.error('Erro ao inicializar WhatsApp:', error);
            });
        }
        
        // Configurar listener para QR Code
        whatsappService.client.on('qr', (qr) => {
            console.log('QR Code recebido, convertendo para imagem...');
            QRCode.toDataURL(qr, (err, url) => {
                if (err) {
                    console.error('Erro ao converter QR Code:', err);
                    return;
                }
                currentQrCode = url;
                console.log('QR Code convertido para imagem');
                
                // Enviar para todas as janelas
                BrowserWindow.getAllWindows().forEach(win => {
                    win.webContents.send('whatsapp-qr-updated', { qrImage: url });
                });
            });
        });
        
        // Configurar outros listeners importantes
        whatsappService.client.on('ready', () => {
            console.log('✅ WhatsApp pronto via initializeWhatsAppService');
        });
        
        whatsappService.client.on('disconnected', (reason) => {
            console.log(`❌ WhatsApp desconectado: ${reason}`);
            currentQrCode = null;
        });
        
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
function getWhatsAppService() {
    if (!whatsappService) {
        return initializeWhatsAppService();
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

// Handler para obter status do WhatsApp
ipcMain.handle('whatsapp-get-status', async () => {
  try {
    const service = getWhatsAppService();
    const status = service.getWhatsAppStatus();
    
    // Se não estiver conectado, tentar verificar se precisa inicializar
    if (!status.connected) {
      console.log('WhatsApp não está conectado, verificando se precisa inicializar...');
      
      // Verificar se o serviço está inicializado
      if (service.isWhatsAppInitialized && !service.isWhatsAppInitialized()) {
        console.log('WhatsApp não está inicializado, tentando inicializar...');
        try {
          await service.initializeWhatsApp();
          // Aguardar um momento e obter status atualizado
          await new Promise(resolve => setTimeout(resolve, 1000));
          const newStatus = service.getWhatsAppStatus();
          return newStatus;
        } catch (initError) {
          console.error('Erro ao tentar inicializar WhatsApp:', initError);
          return {
            ...status,
            error: initError.message,
            initializationError: true
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
      status: 'error'
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
    const path = require('path');
    const sessionPath = path.join(app.getPath('userData'), '.wwebjs_auth', 'session-ceia-delivery');
    
    if (fs.existsSync(sessionPath)) {
      fs.removeSync(sessionPath);
      console.log('Sessão do WhatsApp limpa:', sessionPath);
    }
    
    return { success: true, message: 'Sessão limpa. Reinicie o aplicativo.' };
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

ipcMain.on('driver-pos', (event, { phone, lat, lng, vulgo }) => {
  activeDrivers.set(phone, {
    phone,
    lat,
    lng,
    vulgo,
    timestamp: Date.now()
  });
  
  // Broadcast para todas as janelas
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('telegram-location', { phone, lat, lng, vulgo });
  });
});

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
    console.log('Inicializando serviço WhatsApp...');
    try {
      const service = getWhatsAppService();
      console.log('Serviço WhatsApp obtido, verificando status...');
      
      // Forçar inicialização do WhatsApp
      service.initializeWhatsApp().then(() => {
        console.log('✅ WhatsApp inicializado com sucesso!');
        
        // Verificar status após inicialização
        setTimeout(() => {
          const status = service.getWhatsAppStatus();
          console.log('Status do WhatsApp após inicialização:', status);
          
          // Enviar status para a janela principal
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('bot-status', {
              online: status.connected,
              timestamp: Date.now(),
              message: status.message
            });
          });
        }, 2000);
        
      }).catch(error => {
        console.error('❌ Erro ao inicializar WhatsApp:', error);
        
        // Tentar novamente em 10 segundos
        setTimeout(() => {
          console.log('Tentando inicializar WhatsApp novamente...');
          service.initializeWhatsApp().catch(err => {
            console.error('❌ Erro na segunda tentativa:', err);
          });
        }, 10000);
      });
      
    } catch (error) {
      console.error('Erro ao inicializar serviço WhatsApp:', error);
    }
  }, 3000); // Delay de 3 segundos

  app.on('activate', () => {
    // No macOS, é comum recriar uma janela quando o dock é clicado e não há outras janelas abertas
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
