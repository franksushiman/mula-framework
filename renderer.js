// renderer.js - Lógica principal da interface
window.config = {};
window.driverLastSeen = {};
window.pendingOrders = [];
window.currentDrawMode = null;
window.currentShape = null;

// Funções obrigatórias
window.renderFleet = function() {
    const tbody = document.querySelector('#tb-fleet tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const fleet = window.config.fleet || [];
    const now = Date.now();
    
    fleet.forEach((driver, index) => {
        const lastSeen = window.driverLastSeen[driver.phone] || 0;
        const minutesAgo = lastSeen ? Math.floor((now - lastSeen) / 60000) : Infinity;
        const isOnline = minutesAgo < 30;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${driver.name}</td>
            <td>${driver.code}</td>
            <td>${driver.phone}</td>
            <td>${driver.vehicle || ''}</td>
            <td><span class="badge ${isOnline ? 'badge-online' : 'badge-offline'}">${isOnline ? 'ONLINE' : 'OFFLINE'}</span></td>
            <td>
                <button class="btn btn-error" onclick="window.delDriver('${driver.phone}')" style="padding: 5px 10px; font-size: 0.8rem;">
                    <i class="fas fa-trash"></i> Remover
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    // Atualizar contador de ativos
    const activeCount = fleet.filter(driver => {
        const lastSeen = window.driverLastSeen[driver.phone] || 0;
        return lastSeen && (Date.now() - lastSeen) < 30 * 60000;
    }).length;
    document.getElementById('fleet-active').textContent = activeCount;
};

window.addDriver = function() {
    const name = prompt('Nome do motoboy:');
    const code = prompt('Vulgo (código único):');
    const phone = prompt('Telefone:');
    const vehicle = prompt('Veículo/Placa:');
    if (name && code && phone) {
        const newDriver = { name, code, phone, vehicle };
        
        // Adicionar à frota no config
        if (!window.config.fleet) window.config.fleet = [];
        window.config.fleet.push(newDriver);
        
        // Salvar configuração
        window.electronAPI.saveConfig(window.config).then(result => {
            window.showToast('Motoboy adicionado com sucesso!', 'success');
            window.renderFleet();
        });
    }
};

window.delDriver = function(phone) {
    if (confirm('Tem certeza que deseja remover este motoboy?')) {
        if (window.config.fleet) {
            window.config.fleet = window.config.fleet.filter(driver => driver.phone !== phone);
            window.electronAPI.saveConfig(window.config).then(result => {
                window.showToast('Motoboy removido!', 'success');
                window.renderFleet();
            });
        }
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
    const tbody = document.querySelector('#tb tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const menu = window.config.menu || [];
    
    menu.forEach((item, index) => {
        const row = document.createElement('tr');
        if (item.paused) row.classList.add('paused-row');
        
        row.innerHTML = `
            <td><input type="text" value="${item.category || ''}" onchange="window.updM(${index}, 'category', this.value)"></td>
            <td><input type="text" value="${item.name || ''}" onchange="window.updM(${index}, 'name', this.value)"></td>
            <td><input type="text" value="${item.ingredients || ''}" onchange="window.updM(${index}, 'ingredients', this.value)"></td>
            <td><input type="number" step="0.01" value="${item.price || 0}" onchange="window.updM(${index}, 'price', parseFloat(this.value))"></td>
            <td>
                <select onchange="window.updM(${index}, 'printer', this.value)">
                    <option value="Cozinha" ${item.printer === 'Cozinha' ? 'selected' : ''}>Cozinha</option>
                    <option value="Bar" ${item.printer === 'Bar' ? 'selected' : ''}>Bar</option>
                    <option value="Sobremesa" ${item.printer === 'Sobremesa' ? 'selected' : ''}>Sobremesa</option>
                </select>
            </td>
            <td>
                <button class="btn ${item.paused ? 'btn-success' : 'btn-secondary'}" onclick="window.toggleM(${index})" style="padding: 5px 10px; margin-right: 5px;">
                    <i class="fas ${item.paused ? 'fa-play' : 'fa-pause'}"></i> ${item.paused ? 'Ativar' : 'Pausar'}
                </button>
                <button class="btn btn-error" onclick="window.delM(${index})" style="padding: 5px 10px;">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
};

window.updM = function(index, field, value) {
    if (!window.config.menu) window.config.menu = [];
    if (window.config.menu[index]) {
        window.config.menu[index][field] = value;
    }
};

window.toggleM = function(index) {
    if (!window.config.menu) window.config.menu = [];
    if (window.config.menu[index]) {
        window.config.menu[index].paused = !window.config.menu[index].paused;
        window.renderT();
    }
};

window.delM = function(index) {
    if (confirm('Excluir este item do cardápio?')) {
        if (window.config.menu) {
            window.config.menu.splice(index, 1);
            window.renderT();
            window.showToast('Item removido!', 'success');
        }
    }
};

window.addM = function() {
    if (!window.config.menu) window.config.menu = [];
    window.config.menu.push({
        category: 'Nova Categoria',
        name: 'Novo Item',
        ingredients: '',
        price: 0,
        printer: 'Cozinha',
        paused: false
    });
    window.renderT();
};

window.saveM = function() {
    window.electronAPI.saveConfig(window.config).then(result => {
        window.showToast('Cardápio salvo!', 'success');
    });
};

window.aiM = function() {
    const text = document.getElementById('menu-import-text').value;
    if (!text.trim()) {
        window.showToast('Cole um texto para processar!', 'error');
        return;
    }
    window.electronAPI.aiParseMenu(text).then(items => {
        if (!window.config.menu) window.config.menu = [];
        window.config.menu.push(...items);
        window.renderT();
        window.showToast('Cardápio processado com IA!', 'success');
    });
};

window.saveRules = function() {
    const rules = document.getElementById('golden-rules-text').value;
    window.config.goldenRules = rules;
    window.electronAPI.saveConfig(window.config).then(result => {
        window.showToast('Regras salvas!', 'success');
    });
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
        const select = document.getElementById('printer-main');
        select.innerHTML = '<option value="">Selecione uma impressora</option>';
        printers.forEach(printer => {
            const option = document.createElement('option');
            option.value = printer;
            option.textContent = printer;
            select.appendChild(option);
        });
        window.showToast('Impressoras carregadas!', 'success');
    });
};

window.savePrinterCfg = function() {
    const printer = document.getElementById('printer-main').value;
    const autoPrint = document.getElementById('auto-print').checked;
    
    window.config.printerConfig = {
        mainPrinter: printer,
        autoPrint: autoPrint
    };
    
    window.electronAPI.saveConfig(window.config).then(result => {
        window.showToast('Configuração de impressora salva!', 'success');
    });
};

window.testPrint = function() {
    const printer = document.getElementById('printer-main').value || 'Impressora Padrão';
    window.electronAPI.printJob(printer, '<h1>Teste de Impressão</h1><p>Esta é uma impressão de teste do Delivery Manager.</p>').then(result => {
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
        document.getElementById('golden-rules-text').value = window.config.goldenRules || '';
        
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
    window.renderT();
    window.loadPrinters();
    window.initMap();
    
    // Carregar configuração de impressora se existir
    if (window.config.printerConfig) {
        document.getElementById('printer-main').value = window.config.printerConfig.mainPrinter || '';
        document.getElementById('auto-print').checked = window.config.printerConfig.autoPrint || false;
    }
});
