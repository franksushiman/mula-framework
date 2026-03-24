import { Database } from "bun:sqlite";

export const db = new Database("mula_node.sqlite", { create: true });

export function inicializarBanco() {
    db.run(`CREATE TABLE IF NOT EXISTS node_profile (id INTEGER PRIMARY KEY CHECK (id = 1), nome TEXT, endereco TEXT, whatsapp TEXT, lat REAL, lng REAL, link_cardapio TEXT, openai_key TEXT, google_maps_key TEXT, meta_api_token TEXT)`);
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
export function updateProfile(data: any) {
    db.run(
        "UPDATE node_profile SET nome=?, endereco=?, whatsapp=?, lat=?, lng=?, link_cardapio=?, openai_key=?, google_maps_key=?, meta_api_token=? WHERE id=1",
        [data.nome, data.endereco, data.whatsapp, data.lat, data.lng, data.link_cardapio, data.openai_key, data.google_maps_key, data.meta_api_token]
    );
    return getProfile();
}
export function getZones() { return db.query("SELECT * FROM delivery_zones").all(); }
export function upsertZone(data: any) { if (data.id) { db.run("UPDATE delivery_zones SET nome=?, taxa=? WHERE id=?", [data.nome, data.taxa, data.id]); } else { db.run("INSERT INTO delivery_zones (nome, taxa, tipo, geometria) VALUES (?, ?, ?, ?)", [data.nome, data.taxa, data.tipo, data.geometria]); } return getZones(); }
export function deleteZone(id: number) { db.run("DELETE FROM delivery_zones WHERE id = ?", [id]); return getZones(); }
export function getFleet() { return db.query("SELECT * FROM fleet ORDER BY status DESC").all(); }

export function getDriverByTelegramId(telegram_id: string | number) {
    return db.query("SELECT * FROM fleet WHERE telegram_id = ?").get(telegram_id);
}

export function createDriver(data: any) {
    db.run(
        "INSERT INTO fleet (telegram_id, nome, cpf, chave_pix, tipo_vinculo, veiculo, status) VALUES (?, ?, ?, ?, ?, ?, 'ONLINE')",
        [data.telegram_id, data.nome, data.cpf, data.chave_pix, data.tipo_vinculo, data.veiculo]
    );
    return getDriverByTelegramId(data.telegram_id);
}

export function updateDriverStatus(telegram_id: string | number, status: string) {
    db.run("UPDATE fleet SET status=?, ultima_atualizacao=CURRENT_TIMESTAMP WHERE telegram_id=?", [status, telegram_id]);
    return getDriverByTelegramId(telegram_id);
}

export function updateDriverLocation(telegram_id: string | number, lat: number, lng: number) {
    db.run(
        "UPDATE fleet SET status='ONLINE', lat=?, lng=?, ultima_atualizacao=CURRENT_TIMESTAMP WHERE telegram_id=?",
        [lat, lng, telegram_id]
    );
    return getDriverByTelegramId(telegram_id);
}
