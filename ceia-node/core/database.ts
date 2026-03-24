import { Database } from "bun:sqlite";

export const db = new Database("mula_node.sqlite", { create: true });

export function inicializarBanco() {
    db.run(`CREATE TABLE IF NOT EXISTS node_profile (id INTEGER PRIMARY KEY CHECK (id = 1), nome TEXT, endereco TEXT, whatsapp TEXT, lat REAL, lng REAL, link_cardapio TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS delivery_zones (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, taxa REAL NOT NULL, tipo TEXT NOT NULL, geometria TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS fleet (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT UNIQUE, nome TEXT NOT NULL, cpf TEXT, chave_pix TEXT, tipo_vinculo TEXT DEFAULT 'FREELANCER', veiculo TEXT, placa TEXT, status TEXT DEFAULT 'OFFLINE', lat REAL, lng REAL, ultima_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // Injeta a sua chave para os testes do QR Code
    db.run(`INSERT OR IGNORE INTO fleet (telegram_id, nome, cpf, chave_pix, tipo_vinculo, veiculo, placa, status) VALUES 
        ('mock1', 'Tiago Silva', '111.222.333-44', 'pix@franksushiman.com.br', 'FIXO', 'Honda CG 160', 'ABC-1234', 'ONLINE'),
        ('mock2', 'Marcos Souza', '222.333.444-55', 'pix@franksushiman.com.br', 'FREELANCER', 'Yamaha Fazer', 'XYZ-9876', 'EM_ENTREGA'),
        ('mock3', 'Lucas Pereira', '333.444.555-66', 'pix@franksushiman.com.br', 'FREELANCER', 'Honda Biz', 'QWE-5555', 'OFFLINE')
    `);
}

export function getProfile() { return db.query("SELECT * FROM node_profile WHERE id = 1").get(); }
export function updateProfile(data: any) { db.run("UPDATE node_profile SET nome=?, endereco=?, whatsapp=?, lat=?, lng=?, link_cardapio=? WHERE id=1", [data.nome, data.endereco, data.whatsapp, data.lat, data.lng, data.link_cardapio]); return getProfile(); }
export function getZones() { return db.query("SELECT * FROM delivery_zones").all(); }
export function upsertZone(data: any) { if (data.id) { db.run("UPDATE delivery_zones SET nome=?, taxa=? WHERE id=?", [data.nome, data.taxa, data.id]); } else { db.run("INSERT INTO delivery_zones (nome, taxa, tipo, geometria) VALUES (?, ?, ?, ?)", [data.nome, data.taxa, data.tipo, data.geometria]); } return getZones(); }
export function deleteZone(id: number) { db.run("DELETE FROM delivery_zones WHERE id = ?", [id]); return getZones(); }
export function getFleet() { return db.query("SELECT * FROM fleet ORDER BY status DESC").all(); }
