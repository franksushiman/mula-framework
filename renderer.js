// renderer.js - Lógica principal da interface
window.config = {};
window.driverLastSeen = {};
window.pendingOrders = [];
window.currentDrawMode = null;
window.currentShape = null;

// Funções obrigatórias (placeholders)
window.renderFleet = function() {
    console.log('renderFleet chamada');
};

window.addDriver = function() {
    const name = prompt('Nome do motoboy:');
    const code = prompt('Vulgo (código único):');
    const phone = prompt('Telefone:');
    const vehicle = prompt('Veículo/Placa:');
    if (name && code && phone) {
        // Adicionar à frota
        console.log('Motoboy adicionado:', { name, code, phone, vehicle });
        window.showToast('Motoboy adicionado com sucesso!', 'success');
        window.renderFleet();
    }
};

window.delDriver = function(phone) {
    if (confirm('Tem certeza que deseja remover este motoboy?')) {
        console.log('Remover motoboy com telefone:', phone);
        window.showToast('Motoboy removido!', 'success');
        window.renderFleet();
    }
};

window.saveC = function() {
    const config = {
        googleMapsKey: document.getElementById('k-goo').value,
        openAIKey: document.getElementById('k-ope').value,
        telegramToken: document.getElementById('k-tel').value,
        restaurantAddress: document.getElementById('addr').value,
        adminNumber: document.getElementById('k-adm').value,
        goldenRules: document.getElementById('golden-rules').value,
        botPaused: window.config.botPaused || false
    };
    window.electronAPI.saveConfig(config).then(result => {
        window.showToast(result, 'success');
        window.config = config;
    });
};

window.manualOrder = function() {
    const order = {
        id: Date.now(),
        cliente: prompt('Nome do cliente:'),
        endereco: prompt('Endereço:'),
        total: parseFloat(prompt('Total R$:')),
        taxa: parseFloat(prompt('Taxa de entrega R$:')),
        status: 'pending'
    };
    window.pendingOrders.push(order);
    window.renderOrders();
    window.showToast('Pedido criado!', 'success');
};

window.renderOrders = function() {
    const orderList = document.getElementById('order-list');
    orderList.innerHTML = '';
    window.pendingOrders.forEach(order => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `
            <h4>Pedido #${order.id}</h4>
            <p>Cliente: ${order.cliente}</p>
            <p>Endereço: ${order.endereco}</p>
            <p>Total: R$ ${order.total.toFixed(2)}</p>
            <p>Taxa: R$ ${order.taxa.toFixed(2)}</p>
            <button class="btn btn-primary" onclick="window.dispatchOrder(${order.id})">Disparar</button>
        `;
        orderList.appendChild(div);
    });
    document.getElementById('orders-new').textContent = window.pendingOrders.length;
};

window.dispatchOrder = function(orderId) {
    const order = window.pendingOrders.find(o => o.id === orderId);
    if (order) {
        window.electronAPI.dispatchFleet(order, window.config.fleet || []).then(result => {
            window.showToast(result.message, 'success');
        });
    }
};

window.renderT = function() {
    console.log('renderT chamada');
};

window.updM = function(index) {
    console.log('updM chamada para índice', index);
};

window.toggleM = function(index) {
    console.log('toggleM chamada para índice', index);
};

window.delM = function(index) {
    if (confirm('Excluir este item do cardápio?')) {
        console.log('delM para índice', index);
        window.showToast('Item removido!', 'success');
    }
};

window.addM = function() {
    console.log('addM chamada');
};

window.saveM = function() {
    window.showToast('Cardápio salvo!', 'success');
};

window.aiM = function() {
    const text = document.getElementById('menu-import-text').value;
    if (!text.trim()) {
        window.showToast('Cole um texto para processar!', 'error');
        return;
    }
    window.electronAPI.aiParseMenu(text).then(items => {
        console.log('Itens processados:', items);
        window.showToast('Cardápio processado com IA!', 'success');
    });
};

window.saveRules = function() {
    const rules = document.getElementById('golden-rules').value;
    window.config.goldenRules = rules;
    window.showToast('Regras salvas!', 'success');
};

window.togglePause = function() {
    const btn = document.getElementById('btn-pause');
    window.config.botPaused = !window.config.botPaused;
    if (window.config.botPaused) {
        btn.innerHTML = '<i class="fas fa-play"></i> Retomar Loja';
        btn.className = 'btn btn-success';
        window.showToast('Loja pausada', 'error');
    } else {
        btn.innerHTML = '<i class="fas fa-pause"></i> Pausar Loja';
        btn.className = 'btn btn-secondary';
        window.showToast('Loja retomada', 'success');
    }
    window.saveC();
};

window.initMap = function() {
    console.log('initMap chamada');
    // A implementação real carregaria a API do Google Maps
};

window.saveR = function() {
    window.showToast('Rotas salvas!', 'success');
};

window.setDrawMode = function(mode) {
    window.currentDrawMode = mode;
    window.showToast(`Modo de desenho: ${mode}`, 'success');
};

window.centerMap = function() {
    console.log('centerMap chamada');
};

window.updS = function() {
    console.log('updS chamada');
};

window.delS = function() {
    console.log('delS chamada');
};

window.nav = function(panelId) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('active'));
    document.querySelector(`[data-panel="${panelId}"]`).classList.add('active');
    document.getElementById(panelId).classList.add('active');
};

window.doBackup = function() {
    window.electronAPI.exportBackup().then(path => {
        window.showToast(`Backup exportado para: ${path}`, 'success');
    });
};

window.doRestore = function() {
    // Simulação de importação
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = JSON.parse(event.target.result);
            window.electronAPI.importBackup(data).then(() => {
                window.showToast('Backup importado com sucesso!', 'success');
                location.reload();
            });
        };
        reader.readAsText(file);
    };
    input.click();
};

window.loadPrinters = function() {
    window.electronAPI.getPrinters().then(printers => {
        console.log('Impressoras:', printers);
    });
};

window.savePrinterCfg = function() {
    console.log('savePrinterCfg chamada');
};

window.testPrint = function() {
    window.electronAPI.printJob('Impressora Padrão', '<h1>Teste</h1>').then(result => {
        window.showToast('Impressão enviada!', 'success');
    });
};

// Sistema de notificações Toast
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-notification');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // Configurar navegação
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const panelId = item.getAttribute('data-panel');
            window.nav(panelId);
        });
    });

    // Configurar botão de pausa
    document.getElementById('btn-pause').addEventListener('click', window.togglePause);

    // Carregar configuração
    window.config = await window.electronAPI.loadConfig();
    
    // Preencher campos de configuração
    if (window.config) {
        document.getElementById('k-goo').value = window.config.googleMapsKey || '';
        document.getElementById('k-ope').value = window.config.openAIKey || '';
        document.getElementById('k-tel').value = window.config.telegramToken || '';
        document.getElementById('addr').value = window.config.restaurantAddress || '';
        document.getElementById('k-adm').value = window.config.adminNumber || '';
        document.getElementById('golden-rules').value = window.config.goldenRules || '';
        
        // Atualizar botão de pausa
        const btn = document.getElementById('btn-pause');
        if (window.config.botPaused) {
            btn.innerHTML = '<i class="fas fa-play"></i> Retomar Loja';
            btn.className = 'btn btn-success';
        }
    }

    // Configurar listeners de eventos
    window.electronAPI.onDriverPos((event, data) => {
        console.log('Driver position updated:', data);
        window.driverLastSeen[data.phone] = Date.now();
        window.renderFleet();
    });

    window.electronAPI.onDriverAccepted((event, data) => {
        console.log('Driver accepted order:', data);
        window.showToast(`Motoboy ${data.driverName} aceitou o pedido ${data.orderId}`, 'success');
    });

    window.electronAPI.onShowQR((event, qrUrl) => {
        window.showToast('QR Code recebido: ' + qrUrl, 'success');
    });

    window.electronAPI.onBotStatus((event, data) => {
        console.log('Bot status:', data);
        window.showToast(`Bot ${data.online ? 'online' : 'offline'}`, data.online ? 'success' : 'error');
    });

    // Inicializar componentes
    window.renderFleet();
    window.renderOrders();
    window.loadPrinters();
    window.initMap();
});
