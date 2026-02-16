const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Caminho para o diretório de dados do aplicativo
const dataPath = path.join(app.getPath('userData'), 'data');

// Garante que o diretório de dados exista
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}

// Estruturas de dados padrão
const defaultConfig = {
  storeProfile: {
    name: 'Delivery Manager',
    address: '',
    openingHours: '',
  },
  tech: {
    openai_api_key: '',
    whatsapp_session_id: '',
    printer_config: {},
  },
  telegramBotName: 'MulaFRotaBot',
  adminNumber: '',
  storeName: 'Delivery Manager',
  hubPagesSlug: '',
  hubPagesPublicUrl: '',
  botPaused: false,
  goldenRules: '',
};

const defaultMenu = {
  items: [],
};

const defaultOrders = {
  orders: [],
};

// Variáveis para armazenar as instâncias do lowdb
let configDb, menuDb, ordersDb;
let lowdbInitialized = false;

// Função auxiliar para inicializar um arquivo de banco de dados
const initializeDb = async (fileName, defaultData) => {
  const filePath = path.join(dataPath, fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
  
  // Importar lowdb dinamicamente
  const { Low } = await import('lowdb');
  const { JSONFile } = await import('lowdb/node');
  
  const adapter = new JSONFile(filePath);
  return new Low(adapter, defaultData);
};

// --- Funções Exportadas ---

async function initializeDatabase() {
  if (lowdbInitialized) {
    return;
  }
  
  // Inicializa os bancos de dados
  configDb = await initializeDb('config.json', defaultConfig);
  menuDb = await initializeDb('menu.json', defaultMenu);
  ordersDb = await initializeDb('orders.json', defaultOrders);
  
  await configDb.read();
  await menuDb.read();
  await ordersDb.read();
  
  lowdbInitialized = true;
  console.log('🗃️ Camada de dados inicializada.');
}

async function getConfig() {
  if (!lowdbInitialized) {
    await initializeDatabase();
  }
  await configDb.read();
  return configDb.data;
}

async function saveConfig(data) {
  if (!lowdbInitialized) {
    await initializeDatabase();
  }
  // Evita salvar campos indesejados que pertencem a outros DBs
  const { menuItems, fleet, ...configToSave } = data;
  configDb.data = { ...configDb.data, ...configToSave };
  await configDb.write();
  return configDb.data;
}

async function getMenu() {
  if (!lowdbInitialized) {
    await initializeDatabase();
  }
  await menuDb.read();
  return menuDb.data;
}

async function saveMenu(data) {
  if (!lowdbInitialized) {
    await initializeDatabase();
  }
  menuDb.data = data;
  await menuDb.write();
  return menuDb.data;
}

async function updateItemAvailability(itemId, isAvailable) {
  if (!lowdbInitialized) {
    await initializeDatabase();
  }
  await menuDb.read();
  const item = menuDb.data.items.find(i => i.id === itemId);
  if (item) {
    item.paused = !isAvailable;
    await menuDb.write();
  }
  return item;
}

async function getOpenOrders() {
  if (!lowdbInitialized) {
    await initializeDatabase();
  }
  await ordersDb.read();
  return ordersDb.data.orders.filter(o => !['COMPLETED', 'CANCELED'].includes(o.status));
}

async function createOrder(orderData) {
  if (!lowdbInitialized) {
    await initializeDatabase();
  }
  await ordersDb.read();
  const newOrder = {
    id: uuidv4(),
    ...orderData,
    status: 'PENDING',
    timestamps: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
  ordersDb.data.orders.push(newOrder);
  await ordersDb.write();
  return newOrder;
}

async function updateOrderStatus(orderId, newStatus) {
  if (!lowdbInitialized) {
    await initializeDatabase();
  }
  await ordersDb.read();
  const order = ordersDb.data.orders.find(o => o.id === orderId);
  if (order) {
    order.status = newStatus;
    order.timestamps.updated_at = new Date().toISOString();
    await ordersDb.write();
  }
  return order;
}

module.exports = {
  initializeDatabase,
  getConfig,
  saveConfig,
  getMenu,
  saveMenu,
  updateItemAvailability,
  getOpenOrders,
  createOrder,
  updateOrderStatus,
};
