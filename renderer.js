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
    // Atualizar window.config com os valores atuais
    window.config.googleMapsKey = document.getElementById('k-goo').value;
    window.config.openAIKey = document.getElementById('k-ope').value;
    window.config.telegramToken = document.getElementById('k-tel').value;
    window.config.restaurantAddress = document.getElementById('addr').value;
    window.config.adminNumber = document.getElementById('k-adm').value;
    window.config.goldenRules = document.getElementById('golden-rules').value;
    // Salvar
    window.electronAPI.saveConfig(window.config).then(result => {
        window.showToast(result, 'success');
    });
};

window.manualOrder = function() {
    window.showToast('A aba de pedidos foi removida. Use o dashboard para monitoramento.', 'info');
    // Opcional: ainda permitir criar pedidos para testes
    /*
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
    */
};

window.updateDashboard = function() {
    // Atualizar contadores do dashboard (se os elementos existirem)
    const ordersNew = document.getElementById('orders-new');
    if (ordersNew) {
        ordersNew.textContent = window.pendingOrders.length;
    }
    
    const todaySales = document.getElementById('today-sales');
    if (todaySales) {
        const total = window.pendingOrders.reduce((sum, order) => sum + (order.total || 0), 0);
        todaySales.textContent = 'R$ ' + total.toFixed(2);
    }
    
    const ordersPrep = document.getElementById('orders-prep');
    if (ordersPrep) {
        // Simulação: contar pedidos com status 'preparing'
        const preparing = window.pendingOrders.filter(order => order.status === 'preparing').length;
        ordersPrep.textContent = preparing;
    }
};

window.renderOrders = function() {
    // Esta função agora apenas atualiza o dashboard, já que o painel de pedidos foi removido
    window.updateDashboard();
    window.renderDashboardStats();
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
    window.electronAPI.importBackup().then(result => {
        if (result.success) {
            window.showToast('Backup importado com sucesso!', 'success');
            location.reload();
        } else {
            window.showToast('Importação cancelada ou falhou', 'error');
        }
    }).catch(error => {
        window.showToast('Erro ao importar backup: ' + error.message, 'error');
    });
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

// Funções adicionais
window.inviteDriver = function() {
    const phone = document.getElementById('fleet-invite-phone').value;
    if (!phone) {
        window.showToast('Digite um telefone!', 'error');
        return;
    }
    window.electronAPI.fleetInviteCreate({ phone, slug: 'default' }).then(result => {
        window.showToast(`Convite criado: ${result.inviteId}`, 'success');
    });
};

window.saveConfig = function() {
    window.saveC();
};

window.closeCashier = function() {
    const countedCash = parseFloat(prompt('Dinheiro contado no caixa:'));
    if (isNaN(countedCash)) return;
    const operatorName = prompt('Nome do operador:');
    if (!operatorName) return;
    
    window.electronAPI.cashierClose({ countedCash, operatorName, ordersFromRenderer: window.pendingOrders }).then(result => {
        window.showToast(result.message, 'success');
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

// Dashboard functions
window.renderDashboardStats = async function() {
    // Atualiza status do sistema
    const systemDot = document.getElementById('system-status-dot');
    if (systemDot) {
        systemDot.className = 'status-dot online';
    }
    
    // Busca dados do dashboard
    let summary = { 
        today_sales: 0, 
        orders_in_kitchen: 0, 
        orders_delivering: 0, 
        active_drivers: 0, 
        today_orders_count: 0 
    };
    
    try {
        summary = await window.electronAPI.getDashboardSummary(window.pendingOrders) || summary;
    } catch (e) {
        console.warn('Erro ao buscar dashboard summary:', e);
    }
    
    // Atualiza cards
    const safeSet = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    
    safeSet('orders-today', String(summary.today_orders_count || 0));
    safeSet('orders-in-kitchen', String(summary.orders_in_kitchen || 0));
    safeSet('fleet-online', String(summary.active_drivers || 0));
    
    const financeEl = document.getElementById('finance-total-hoje');
    if (financeEl) {
        const valor = (summary.today_sales || 0).toFixed(2).replace('.', ',');
        financeEl.textContent = `R$ ${valor}`;
    }
    
    // Atualiza status da loja
    const isPaused = window.config.botPaused === true;
    const statusDot = document.getElementById('store-status-dot');
    const statusText = document.getElementById('store-status-text');
    
    if (statusDot && statusText) {
        if (isPaused) {
            statusDot.className = 'status-dot paused';
            statusText.textContent = 'Loja pausada · sem receber pedidos';
        } else {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Loja aberta · sistema pronto';
        }
    }
    
    // Atualiza botão de pausa do dashboard
    const pauseBtn = document.getElementById('btn-pause-dashboard');
    if (pauseBtn) {
        if (isPaused) {
            pauseBtn.classList.add('paused');
            pauseBtn.innerHTML = '<span class="pause-icone">▶️</span><span class="pause-texto">RETOMAR LOJA</span>';
        } else {
            pauseBtn.classList.remove('paused');
            pauseBtn.innerHTML = '<span class="pause-icone">⏸️</span><span class="pause-texto">PAUSAR LOJA</span>';
        }
    }
    
    // Renderiza feed da frota
    window.renderFleetFeed();
    
    // Renderiza últimos pedidos
    window.renderDashboardLastOrders();
    
    // Renderiza oportunidades
    window.renderDashboardOpportunities();
};

window.renderFleetFeed = function() {
    const feedList = document.getElementById('fleet-feed-list');
    if (!feedList) return;
    
    const fleet = window.config.fleet || [];
    const now = Date.now();
    
    // Filtra motoristas ativos (últimos 30 minutos)
    const activeDrivers = fleet.filter(driver => {
        const lastSeen = window.driverLastSeen[driver.phone] || 0;
        return lastSeen && (now - lastSeen) < 30 * 60000;
    });
    
    if (activeDrivers.length === 0) {
        feedList.innerHTML = '<div class="fleet-feed-item"><span class="feed-item-icon">🟡</span><div class="feed-item-content">Nenhum entregador ativo no momento</div></div>';
        return;
    }
    
    feedList.innerHTML = '';
    activeDrivers.slice(0, 5).forEach(driver => {
        const lastSeen = window.driverLastSeen[driver.phone] || 0;
        const minutesAgo = Math.floor((now - lastSeen) / 60000);
        
        const item = document.createElement('div');
        item.className = 'fleet-feed-item';
        item.innerHTML = `
            <span class="feed-item-icon">🛵</span>
            <div class="feed-item-content">
                <strong>${driver.name}</strong> (${driver.code}) está em rota
            </div>
            <div class="feed-item-time">${minutesAgo} min atrás</div>
        `;
        feedList.appendChild(item);
    });
};

window.renderDashboardLastOrders = function() {
    const tbody = document.getElementById('dashboard-last-orders-body');
    if (!tbody) return;
    
    const orders = window.pendingOrders || [];
    const recentOrders = orders.slice(-5).reverse(); // Últimos 5 pedidos
    
    if (recentOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-tertiary);">
                    Nenhum pedido recente
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = '';
    recentOrders.forEach(order => {
        const row = document.createElement('tr');
        const timeAgo = 'há pouco';
        
        row.innerHTML = `
            <td>#${order.id}</td>
            <td>${order.cliente || 'Cliente'}</td>
            <td><span style="color: #f59e0b;">${order.status || 'pendente'}</span></td>
            <td>${timeAgo}</td>
            <td>R$ ${(order.total || 0).toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
};

window.renderDashboardOpportunities = function() {
    const opportunitiesList = document.getElementById('dashboard-opportunities-list');
    const countEl = document.getElementById('dashboard-opportunities-count');
    
    if (!opportunitiesList || !countEl) return;
    
    // Simulação: pedidos pendentes há mais de 15 minutos
    const now = Date.now();
    const opportunities = (window.pendingOrders || []).filter(order => {
        // Se o pedido não tem timestamp, consideramos como oportunidade
        return !order.timestamp || (now - order.timestamp) > 15 * 60000;
    });
    
    countEl.textContent = opportunities.length;
    
    if (opportunities.length === 0) {
        opportunitiesList.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--text-tertiary);">
                🎉 Tudo em dia! Nenhum pedido pendente há mais de 15 minutos.
            </div>
        `;
        return;
    }
    
    opportunitiesList.innerHTML = '';
    opportunities.slice(0, 3).forEach(order => {
        const item = document.createElement('div');
        item.className = 'fleet-feed-item';
        item.innerHTML = `
            <span class="feed-item-icon">⏰</span>
            <div class="feed-item-content">
                <strong>Pedido #${order.id}</strong> de ${order.cliente || 'Cliente'} está pendente há mais de 15 minutos
            </div>
        `;
        opportunitiesList.appendChild(item);
    });
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Configurar navegação
        const navItems = document.querySelectorAll('.nav-item');
        if (navItems.length === 0) {
            console.error('Nenhum item de navegação encontrado');
        }
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const panelId = item.getAttribute('data-panel');
                window.nav(panelId);
            });
        });

        // Configurar botão de pausa
        const btnPause = document.getElementById('btn-pause');
        if (btnPause) {
            btnPause.addEventListener('click', window.togglePause);
        } else {
            console.warn('Botão de pausa não encontrado');
        }

        // Carregar configuração
        window.config = await window.electronAPI.loadConfig();
        
        // Preencher campos de configuração
        if (window.config) {
            const setValue = (id, value) => {
                const element = document.getElementById(id);
                if (element) {
                    element.value = value || '';
                } else {
                    console.warn(`Elemento #${id} não encontrado`);
                }
            };
            setValue('k-goo', window.config.googleMapsKey);
            setValue('k-ope', window.config.openAIKey);
            setValue('k-tel', window.config.telegramToken);
            setValue('addr', window.config.restaurantAddress);
            setValue('k-adm', window.config.adminNumber);
            setValue('golden-rules', window.config.goldenRules);
            setValue('golden-rules-text', window.config.goldenRules);
            
            // Atualizar botão de pausa
            if (btnPause && window.config.botPaused) {
                btnPause.innerHTML = '<i class="fas fa-play"></i> Retomar Loja';
                btnPause.className = 'btn btn-success';
            }
        }

        // Configurar listeners de eventos
        window.electronAPI.onDriverPos((event, data) => {
            console.log('Driver position updated:', data);
            window.driverLastSeen[data.phone] = Date.now();
            window.renderFleet();
            window.renderDashboardStats(); // Atualiza dashboard também
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
        // window.renderOrders() removido porque o painel de pedidos foi removido
        window.renderT();
        window.loadPrinters();
        window.initMap();
        window.updateDashboard();
        window.renderDashboardStats(); // Novo dashboard
        
        // Carregar configuração de impressora se existir
        if (window.config.printerConfig) {
            const printerSelect = document.getElementById('printer-main');
            const autoPrintCheck = document.getElementById('auto-print');
            if (printerSelect) {
                printerSelect.value = window.config.printerConfig.mainPrinter || '';
            }
            if (autoPrintCheck) {
                autoPrintCheck.checked = window.config.printerConfig.autoPrint || false;
            }
        }
        
        // Configurar atualização periódica do dashboard
        setInterval(() => {
            window.renderDashboardStats();
        }, 30000); // Atualiza a cada 30 segundos
        
        console.log('Aplicativo inicializado com sucesso');
    } catch (error) {
        console.error('Erro durante a inicialização:', error);
        window.showToast('Erro ao inicializar: ' + error.message, 'error');
    }
});
