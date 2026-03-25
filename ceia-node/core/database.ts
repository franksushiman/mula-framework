import { Database } from "bun:sqlite";

export const db = new Database("mula_node.sqlite", { create: true });

export function inicializarBanco() {
    db.run(`CREATE TABLE IF NOT EXISTS node_profile (id INTEGER PRIMARY KEY CHECK (id = 1), nome TEXT, endereco TEXT, whatsapp TEXT, lat REAL, lng REAL, link_cardapio TEXT, openai_key TEXT, google_maps_key TEXT, meta_api_token TEXT, telegram_bot_token TEXT)`);
    db.run(`INSERT OR IGNORE INTO node_profile (id) VALUES (1)`);
    db.run(`CREATE TABLE IF NOT EXISTS delivery_zones (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, taxa REAL NOT NULL, tipo TEXT NOT NULL, geometria TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS fleet (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT UNIQUE, chat_id TEXT, nome TEXT NOT NULL, cpf TEXT, chave_pix TEXT, tipo_vinculo TEXT DEFAULT 'FREELANCER', veiculo TEXT, placa TEXT, status TEXT DEFAULT 'OFFLINE', lat REAL, lng REAL, ultima_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP)`);
}

export function getProfile() { return db.query("SELECT * FROM node_profile WHERE id = 1").get(); }
export function updateProfile(data: any) {
    db.run(
        "UPDATE node_profile SET nome=?, endereco=?, whatsapp=?, lat=?, lng=?, link_cardapio=?, openai_key=?, google_maps_key=?, meta_api_token=?, telegram_bot_token=? WHERE id=1",
        [data.nome, data.endereco, data.whatsapp, data.lat, data.lng, data.link_cardapio, data.openai_key, data.google_maps_key, data.meta_api_token, data.telegram_bot_token]
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

export function getDriverById(id: number) {
    return db.query("SELECT * FROM fleet WHERE id = ?").get(id);
}

export function upsertDriver(data: any) {
    db.run(
        `INSERT INTO fleet (telegram_id, chat_id, nome, tipo_vinculo, chave_pix, status)
        VALUES (?, ?, ?, ?, ?, 'ONLINE')
        ON CONFLICT(telegram_id) DO UPDATE SET
            chat_id = excluded.chat_id,
            nome = excluded.nome,
            tipo_vinculo = excluded.tipo_vinculo,
            chave_pix = excluded.chave_pix,
            status = 'ONLINE',
            ultima_atualizacao = CURRENT_TIMESTAMP`,
        [data.telegram_id, data.chat_id, data.nome, data.tipo_vinculo, data.chave_pix]
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
