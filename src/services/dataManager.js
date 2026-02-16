const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
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

// Função auxiliar para inicializar um arquivo de banco de dados
const initializeDb = (fileName, defaultData) => {
  const filePath = path.join(dataPath, fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
  const adapter = new JSONFile(filePath);
  return new Low(adapter, defaultData);
};

// Inicializa os bancos de dados
const configDb = initializeDb('config.json', defaultConfig);
const menuDb = initializeDb('menu.json', defaultMenu);
const ordersDb = initializeDb('orders.json', defaultOrders);

// --- Funções Exportadas ---

async function initializeDatabase() {
  await configDb.read();
  await menuDb.read();
  await ordersDb.read();
  console.log('🗃️ Camada de dados inicializada.');
}

async function getConfig() {
  await configDb.read();
  return configDb.data;
}

async function saveConfig(data) {
  // Evita salvar campos indesejados que pertencem a outros DBs
  const { menuItems, fleet, ...configToSave } = data;
  configDb.data = { ...configDb.data, ...configToSave };
  await configDb.write();
  return configDb.data;
}

async function getMenu() {
  await menuDb.read();
  return menuDb.data;
}

async function saveMenu(data) {
  menuDb.data = data;
  await menuDb.write();
  return menuDb.data;
}

async function updateItemAvailability(itemId, isAvailable) {
  await menuDb.read();
  const item = menuDb.data.items.find(i => i.id === itemId);
  if (item) {
    item.paused = !isAvailable;
    await menuDb.write();
  }
  return item;
}

async function getOpenOrders() {
  await ordersDb.read();
  return ordersDb.data.orders.filter(o => !['COMPLETED', 'CANCELED'].includes(o.status));
}

async function createOrder(orderData) {
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
