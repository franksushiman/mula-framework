import { Database } from "bun:sqlite";

export const db = new Database("ceia.sqlite", { create: true });

// Criação das tabelas essenciais se não existirem
db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, mensagem TEXT, data DATETIME DEFAULT CURRENT_TIMESTAMP)`);
db.run(`CREATE TABLE IF NOT EXISTS motoboys (telegram_id TEXT PRIMARY KEY, nome TEXT, lat REAL, lng REAL, status TEXT, ultima_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP)`);
db.run(`CREATE TABLE IF NOT EXISTS configuracoes (
    id INTEGER PRIMARY KEY,
    nome TEXT,
    endereco TEXT,
    whatsapp TEXT,
    link_cardapio TEXT,
    google_maps_key TEXT,
    openai_key TEXT,
    meta_api_token TEXT,
    telegram_bot_token TEXT,
    lat REAL,
    lng REAL
)`);
db.run(`CREATE TABLE IF NOT EXISTS zonas (id INTEGER PRIMARY KEY, nome TEXT, valor REAL, tipo TEXT, coordenadas TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS rotas (id TEXT PRIMARY KEY, motoboy_id INTEGER, valor_corrida REAL, endereco TEXT, status TEXT)`);

// NOVA TABELA: A Fila de Pedidos
db.run(`CREATE TABLE IF NOT EXISTS pedidos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente TEXT, endereco TEXT, status TEXT DEFAULT 'PENDENTE', data DATETIME DEFAULT CURRENT_TIMESTAMP)`);

console.log("📦 Banco de dados SQLite inicializado e pronto.");
