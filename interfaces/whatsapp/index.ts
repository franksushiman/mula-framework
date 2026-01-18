import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";

import { InterfaceAdapter } from "../adapter/interface-adapter";
import path from "path";

const AUTH_DIR = path.resolve("auth");

/**
 * Interface WhatsApp — MULA V3
 * Interface mínima, sem lógica de negócio.
 */

const adapter: InterfaceAdapter = {
  async receive(message) {
    if (message.text.trim() === "/status") {
      return { text: "MULA ativo e aguardando comandos." };
    }
    return null;
  }
};

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    const from = msg.key.remoteJid;
    if (!from) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const response = await adapter.receive({
      senderId: from,
      text
    });

    if (response) {
      await sock.sendMessage(from, { text: response.text });
    }
  });
}

start();
