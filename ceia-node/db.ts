import { Database } from "bun:sqlite";

export const db = new Database("ceia.sqlite", { create: true });

// Criação das tabelas essenciais se não existirem
db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, mensagem TEXT, data DATETIME DEFAULT CURRENT_TIMESTAMP)`);
db.run(`CREATE TABLE IF NOT EXISTS motoboys (telegram_id TEXT PRIMARY KEY, nome TEXT, lat REAL, lng REAL, status TEXT, ultima_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP)`);

// NOVA TABELA: A Fila de Pedidos
db.run(`CREATE TABLE IF NOT EXISTS pedidos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente TEXT, endereco TEXT, status TEXT DEFAULT 'PENDENTE', data DATETIME DEFAULT CURRENT_TIMESTAMP)`);

console.log("📦 Banco de dados SQLite inicializado e pronto.");