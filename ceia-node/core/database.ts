import { Database } from "bun:sqlite";

export const db = new Database("mula_node.sqlite", { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");

export function inicializarBanco() {
    db.run(`CREATE TABLE IF NOT EXISTS node_profile (id INTEGER PRIMARY KEY CHECK (id = 1), nome TEXT, endereco TEXT, whatsapp TEXT, lat REAL, lng REAL, link_cardapio TEXT, openai_key TEXT, google_maps_key TEXT, meta_api_token TEXT, telegram_bot_token TEXT)`);
    db.run(`INSERT OR IGNORE INTO node_profile (id) VALUES (1)`);
    db.run(`CREATE TABLE IF NOT EXISTS delivery_zones (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, tipo TEXT, coordenadas TEXT, valor REAL)`);
    db.run(`CREATE TABLE IF NOT EXISTS active_dispatches (id INTEGER PRIMARY KEY AUTOINCREMENT, motoboy_id INTEGER, cliente_telefone TEXT, endereco TEXT, lat_destino REAL, lng_destino REAL, status TEXT DEFAULT 'AGUARDANDO_ACEITE', aviso_chegada_enviado INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS fleet (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT UNIQUE, chat_id TEXT, nome TEXT NOT NULL, cpf TEXT, chave_pix TEXT, tipo_vinculo TEXT DEFAULT 'FREELANCER', veiculo TEXT, placa TEXT, status TEXT DEFAULT 'OFFLINE', lat REAL, lng REAL, ultima_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP, last_location_time INTEGER, veiculo_tipo TEXT, veiculo_id TEXT, saldo REAL DEFAULT 0)`);
}

export function getProfile() { return db.query("SELECT * FROM node_profile WHERE id = 1").get(); }
export function updateProfile(data: any) {
    db.run(
        `INSERT INTO node_profile (id, nome, endereco, whatsapp, lat, lng, link_cardapio, openai_key, google_maps_key, meta_api_token, telegram_bot_token)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            nome=excluded.nome,
            endereco=excluded.endereco,
            whatsapp=excluded.whatsapp,
            lat=excluded.lat,
            lng=excluded.lng,
            link_cardapio=excluded.link_cardapio,
            openai_key=excluded.openai_key,
            google_maps_key=excluded.google_maps_key,
            meta_api_token=excluded.meta_api_token,
            telegram_bot_token=excluded.telegram_bot_token`,
        [data.nome, data.endereco, data.whatsapp, data.lat, data.lng, data.link_cardapio, data.openai_key, data.google_maps_key, data.meta_api_token, data.telegram_bot_token]
    );
    return getProfile();
}
export function getZones() { return db.query("SELECT * FROM delivery_zones").all(); }
export function upsertZone(data: any) { 
    if (data.id) { 
        db.run("UPDATE delivery_zones SET nome=?, valor=? WHERE id=?", [data.nome, data.valor, data.id]); 
    } else { 
        db.run("INSERT INTO delivery_zones (nome, tipo, coordenadas, valor) VALUES (?, ?, ?, ?)", [data.nome, data.tipo, data.coordenadas, data.valor]); 
    } 
    return getZones(); 
}
export function deleteZone(id: number) { db.run("DELETE FROM delivery_zones WHERE id = ?", [id]); return getZones(); }
export function getFleet() { return db.query("SELECT * FROM fleet ORDER BY status DESC").all(); }

export function getDriverByTelegramId(telegram_id: string | number) {
    return db.query("SELECT * FROM fleet WHERE telegram_id = ?").get(telegram_id);
}

export function getDriverById(id: number) {
    return db.query("SELECT * FROM fleet WHERE id = ?").get(id);
}

export function updateDriver(id: number, data: any) {
    db.run(
        "UPDATE fleet SET nome=?, cpf=?, tipo_vinculo=?, chave_pix=? WHERE id=?",
        [data.nome, data.cpf, data.tipo_vinculo, data.chave_pix, id]
    );
    return getDriverById(id);
}

export function deleteDriver(id: number) {
    db.run("DELETE FROM fleet WHERE id = ?", [id]);
    return { success: true };
}

export function upsertDriver(data: any) {
    db.run(
        `INSERT INTO fleet (telegram_id, chat_id, nome, cpf, tipo_vinculo, chave_pix, veiculo_tipo, veiculo_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OFFLINE')
        ON CONFLICT(telegram_id) DO UPDATE SET
            chat_id = excluded.chat_id,
            nome = excluded.nome,
            cpf = excluded.cpf,
            tipo_vinculo = excluded.tipo_vinculo,
            chave_pix = excluded.chave_pix,
            veiculo_tipo = excluded.veiculo_tipo,
            veiculo_id = excluded.veiculo_id,
            status = 'OFFLINE',
            ultima_atualizacao = CURRENT_TIMESTAMP`,
        [data.telegram_id, data.chat_id, data.nome, data.cpf, data.tipo_vinculo, data.chave_pix, data.veiculo_tipo, data.veiculo_id]
    );
    return getDriverByTelegramId(data.telegram_id);
}

export function updateDriverStatus(telegram_id: string | number, status: string) {
    db.run("UPDATE fleet SET status=?, ultima_atualizacao=CURRENT_TIMESTAMP WHERE telegram_id=?", [status, telegram_id]);
    return getDriverByTelegramId(telegram_id);
}

export function updateDriverLocation(telegram_id: string | number, lat: number, lng: number) {
    db.run(
        "UPDATE fleet SET status='ONLINE', lat=?, lng=?, ultima_atualizacao=CURRENT_TIMESTAMP, last_location_time=? WHERE telegram_id=?",
        [lat, lng, Date.now(), telegram_id]
    );
    return getDriverByTelegramId(telegram_id);
}

export function sweepInactiveDrivers() {
    const fiveMinutesAgo = Date.now() - 300000;
    const stm = db.query("UPDATE fleet SET status = 'OFFLINE' WHERE status = 'ONLINE' AND last_location_time < $tempo");
    const result = stm.run({ $tempo: fiveMinutesAgo });
    return result.changes > 0;
}
