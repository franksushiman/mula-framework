import { serve, file } from "bun";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const PORTA = 3000;
const UPLOAD_DIR = "uploads";
const DB_FILE = "cardapio.json";
const TAXAS_FILE = "taxas.json"; // O cofre das taxas

// Garante pastas e arquivos essenciais
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR);
if (!existsSync(DB_FILE)) writeFileSync(DB_FILE, "[]");

// Se não existir arquivo de taxas, cria o padrão Híbrido
if (!existsSync(TAXAS_FILE)) {
    const taxasPadrao = {
        fixa: 5.00,       // Taxa de Saída (Embalagem + Motoboy sair da loja)
        km: 1.50,         // Preço por Km rodado
        minimo: 7.00      // Ninguém roda por menos que isso
    };
    writeFileSync(TAXAS_FILE, JSON.stringify(taxasPadrao, null, 2));
    console.log("> Arquivo taxas.json criado com valores padrão.");
}

console.log(`MULA SYSTEM V2 - Porta ${PORTA}`);

serve({
  port: PORTA,
  async fetch(req) {
    const url = new URL(req.url);

    // 1. SERVIR IMAGENS (Links Públicos)
    if (url.pathname.startsWith("/" + UPLOAD_DIR)) {
      const arquivo = file("." + url.pathname);
      return await arquivo.exists() ? new Response(arquivo) : new Response("404", { status: 404 });
    }

    // 2. CARDÁPIO (GET) - Agora retorna Ordenado por Categoria
    if (url.pathname === "/cardapio" && req.method === "GET") {
      let db = JSON.parse(readFileSync(DB_FILE, "utf-8"));
      // Ordena alfabeticamente pela Categoria (A-Z)
      db.sort((a: any, b: any) => a.categoria.localeCompare(b.categoria));
      return new Response(JSON.stringify(db), { headers: { "Content-Type": "application/json" } });
    }

    // 3. SALVAR ITEM (POST) - Recebe Foto + Dados
    if (url.pathname === "/cardapio" && req.method === "POST") {
      try {
        const formData = await req.formData();
        const id = formData.get("id") || Date.now().toString();
        const foto = formData.get("foto");
        
        let db = JSON.parse(readFileSync(DB_FILE, "utf-8"));
        let item = db.find((i: any) => i.id == id) || {};
        let urlImagem = item.fotoUrl || "";

        // Se veio foto nova, salva no disco e atualiza o link
        if (foto && typeof foto === 'object') {
          const nomeArquivo = `img_${id}.jpg`;
          await Bun.write(join(UPLOAD_DIR, nomeArquivo), await foto.arrayBuffer());
          const host = req.headers.get("host") || "localhost:3000";
          urlImagem = `http://${host}/${UPLOAD_DIR}/${nomeArquivo}`;
        }

        const novoItem = {
          id: id.toString(),
          categoria: formData.get("categoria"),
          nome: formData.get("nome"),
          preco: formData.get("preco"),
          fotoUrl: urlImagem
        };

        const index = db.findIndex((i: any) => i.id == id);
        if (index >= 0) db[index] = novoItem; else db.push(novoItem);

        writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        return new Response("Salvo", { status: 200 });
      } catch (e) { return new Response("Erro", { status: 500 }); }
    }

    // 4. CALCULAR FRETE (Novo Endpoint Híbrido)
    // Uso: /frete?km=5
    if (url.pathname === "/frete" && req.method === "GET") {
        const km = parseFloat(url.searchParams.get("km") || "0");
        
        // Lê as taxas na hora (permite editar o arquivo sem reiniciar o server)
        const taxas = JSON.parse(readFileSync(TAXAS_FILE, "utf-8"));
        
        // FÓRMULA: Fixo + (Km * ValorKm)
        let total = taxas.fixa + (km * taxas.km);
        
        // Trava de segurança (Mínimo)
        if (total < taxas.minimo) total = taxas.minimo;

        return new Response(JSON.stringify({ 
            distancia_km: km, 
            valor_final: total.toFixed(2),
            memoria_calculo: `Fixo R$${taxas.fixa} + (${km}km x R$${taxas.km})`
        }), { headers: { "Content-Type": "application/json" } });
    }
    
    // 5. LISTAR PEDIDOS (Simulação para Console de Despacho)
    if (url.pathname === "/pedidos") {
         // Aqui entraria a leitura de um pedidos.json real
         // Retornando array vazio para limpar a tela ou dados fake para teste
         return new Response("[]", { headers: { "Content-Type": "application/json" } });
    }

    return new Response("MULA ONLINE");
  },
});
