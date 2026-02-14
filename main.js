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

// IPC Handlers
ipcMain.handle('load-config', async () => {
  return loadConfig();
});

ipcMain.handle('save-config', async (event, config) => {
  const success = saveConfig(config);
  return success ? 'Configurações salvas!' : 'Erro ao salvar configurações.';
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
  // Simulação de parsing com IA
  console.log('Processando cardápio com IA:', text.substring(0, 100));
  
  // Retornar itens estruturados simulados
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

// Importar serviço do WhatsApp com tratamento de erro
let whatsappService;
try {
    whatsappService = require('./whatsapp.js');
} catch (error) {
    console.error('Erro ao carregar módulo WhatsApp:', error);
    whatsappService = {
        sendWhatsAppMessage: () => Promise.reject(new Error('WhatsApp não disponível')),
        getWhatsAppStatus: () => ({ connected: false, error: 'WhatsApp não inicializado' }),
        restartWhatsApp: () => console.log('WhatsApp não disponível para reiniciar'),
        client: { on: () => {} }
    };
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
    const response = await whatsappService.sendWhatsAppMessage(phone, message);
    return { success: true, data: response };
  } catch (error) {
    console.error('Erro ao enviar WhatsApp:', error);
    return { success: false, error: error.message };
  }
});

// Handler para obter status do WhatsApp
ipcMain.handle('whatsapp-get-status', async () => {
  try {
    const status = whatsappService.getWhatsAppStatus();
    return status;
  } catch (error) {
    console.error('Erro ao obter status WhatsApp:', error);
    return { connected: false, error: error.message };
  }
});

// Handler para reiniciar WhatsApp
ipcMain.handle('whatsapp-restart', async () => {
  try {
    whatsappService.restartWhatsApp();
    return { success: true, message: 'Reiniciando WhatsApp...' };
  } catch (error) {
    console.error('Erro ao reiniciar WhatsApp:', error);
    return { success: false, error: error.message };
  }
});

// Handler para obter QR Code do WhatsApp
let currentQrCode = null;

// Ouvir evento 'qr' do WhatsApp e armazenar o QR Code
// A variável whatsappService já foi importada acima, então usamos ela
whatsappService.client.on('qr', (qr) => {
  console.log('QR Code recebido, convertendo para imagem...');
  // Converter QR Code para data URL
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

ipcMain.handle('whatsapp-get-qr', async () => {
  if (currentQrCode) {
    return { 
      success: true, 
      qrImage: currentQrCode,
      message: 'QR Code disponível'
    };
  } else {
    return { 
      success: false, 
      message: 'Aguardando QR Code do WhatsApp...',
      note: 'O WhatsApp ainda não gerou um QR Code. Aguarde alguns segundos.'
    };
  }
});

// Handler para testar conexão Bayleis (simulação mais realista)
ipcMain.handle('test-bayleis-connection', async (event, { apiKey, secretKey }) => {
  try {
    console.log('Testando conexão Bayleis...');
    
    // Validação básica das chaves
    if (!apiKey || !secretKey) {
      return {
        success: false,
        connected: false,
        message: 'API Key e Secret Key são obrigatórias'
      };
    }
    
    // Simular uma resposta da API Bayleis
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Verificar formato das chaves (simulação)
    const isValidApiKey = apiKey.startsWith('bay_') || apiKey.startsWith('live_') || apiKey.startsWith('test_');
    const isValidSecretKey = secretKey.length >= 32;
    
    if (!isValidApiKey || !isValidSecretKey) {
      return {
        success: false,
        connected: false,
        message: 'Chaves inválidas. Formato esperado: API Key começa com bay_, live_ ou test_'
      };
    }
    
    // Simular dados da conta
    const accountTypes = ['PJ', 'MEI', 'PF'];
    const randomAccount = accountTypes[Math.floor(Math.random() * accountTypes.length)];
    
    return {
      success: true,
      connected: true,
      message: 'Conexão com Bayleis estabelecida',
      account: {
        type: randomAccount,
        name: 'Restaurante Ceia',
        balance: Math.random() * 1000,
        status: 'active',
        canReceivePayments: true
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      message: 'Erro na conexão com Bayleis'
    };
  }
});

// Handler para criar QR Code de pagamento Bayleis
ipcMain.handle('create-bayleis-payment', async (event, { apiKey, secretKey, amount, description }) => {
  try {
    console.log(`Criando pagamento Bayleis: R$ ${amount} - ${description}`);
    
    // Validação básica
    if (!apiKey || !secretKey) {
      return { 
        success: false, 
        error: 'Chaves de API não fornecidas' 
      };
    }
    
    if (!amount || amount <= 0) {
      return { 
        success: false, 
        error: 'Valor inválido' 
      };
    }
    
    // Simular processamento
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    // Gerar ID de pagamento
    const paymentId = `bay_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // Gerar QR Code PIX real (simulação)
    const pixKey = `ceia+${paymentId}@bayleis.com.br`;
    const pixPayload = `00020126580014BR.GOV.BCB.PIX0136${pixKey}520400005303986540${amount.toFixed(2)}5802BR5900CEIA DELIVERY6008SAO PAULO62070503***6304`;
    
    // Gerar QR Code visual
    const qrCodeUrl = await QRCode.toDataURL(pixPayload);
    
    return {
      success: true,
      paymentId,
      qrCodeUrl,
      pixPayload,
      pixKey,
      paymentUrl: `https://bayleis.com/pay/${paymentId}`,
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutos
      amount,
      status: 'pending'
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// Handler para verificar status de pagamento Bayleis
ipcMain.handle('check-bayleis-payment', async (event, { apiKey, secretKey, paymentId }) => {
  try {
    console.log(`Verificando pagamento Bayleis: ${paymentId}`);
    
    // Simular verificação
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Status aleatórios (simulação)
    const statuses = [
      { status: 'pending', message: 'Aguardando pagamento' },
      { status: 'processing', message: 'Processando' },
      { status: 'completed', message: 'Pagamento confirmado' },
      { status: 'expired', message: 'QR Code expirado' }
    ];
    
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    return {
      success: true,
      paymentId,
      status: randomStatus.status,
      message: randomStatus.message,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message 
    };
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
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  
  // Abrir DevTools para depuração
  mainWindow.webContents.openDevTools();

  // Simular atualizações periódicas de status
  setInterval(() => {
    const config = loadConfig();
    if (config.fleet && config.fleet.length > 0) {
      const randomDriver = config.fleet[Math.floor(Math.random() * config.fleet.length)];
      mainWindow.webContents.send('driver-pos', { 
        phone: randomDriver.phone,
        lat: -23.5505 + (Math.random() - 0.5) * 0.1,
        lng: -46.6333 + (Math.random() - 0.5) * 0.1,
        vulgo: randomDriver.code
      });
    }
    
    // Atualizar status do bot
    mainWindow.webContents.send('bot-status', {
      online: true,
      timestamp: Date.now()
    });
  }, 30000);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
