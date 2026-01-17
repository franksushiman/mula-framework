import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import fs from "fs";
import path from "path";

const AUTH_DIR = path.resolve("auth");

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        process.exit(1);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    const from = msg.key.remoteJid;
    if (!from) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (text === "/mula status") {
      await sock.sendMessage(from, {
        text: "MULA V3 ativo. Nó soberano em operação."
      });
    }
  });
}

startWhatsApp();
