// renderer.js - Lógica principal da interface
window.config = {};
window.driverLastSeen = {};
window.pendingOrders = [];
window.currentDrawMode = null;
window.currentShape = null;

// Sistema de Monitoramento de Wi-Fi (Refatorado para UX Operacional)
window.networkMonitor = {
    intervalId: null,
    lastStatus: null,
    isInitialized: false,
    
    init: function() {
        if (this.isInitialized) {
            console.log('Monitor de rede já inicializado');
            return;
        }
        
        console.log('Inicializando monitor de rede Wi-Fi...');
        // Verificação imediata ao iniciar
        this.checkNetworkStatus();
        
        // Configurar verificação periódica a cada 20 segundos
        this.intervalId = setInterval(() => {
            this.checkNetworkStatus();
        }, 20000);
        
        // Adicionar evento para atualizar ao focar na janela
        window.addEventListener('focus', () => {
            this.checkNetworkStatus();
        });
        
        // Adicionar evento para limpar quando a janela for fechada
        window.addEventListener('beforeunload', () => {
            this.stop();
        });
        
        this.isInitialized = true;
    },
    
    checkNetworkStatus: function() {
        if (!window.electronAPI || !window.electronAPI.getNetworkStatus) {
            console.warn('API de rede não disponível');
            return;
        }
        
        window.electronAPI.getNetworkStatus().then(result => {
            this.updateDashboardUI(result);
            this.handleStatusChange(result);
        }).catch(error => {
            console.error('Erro ao verificar status da rede:', error);
            this.updateDashboardUI({
                connected: false,
                ssid: 'Desconhecido',
                signalStrength: -100,
                signalPercentage: 0,
                status: 'error'
            });
        });
    },
    
    updateDashboardUI: function(status) {
        const wifiIndicator = document.getElementById('dashboard-wifi-indicator');
        const systemStatusText = document.getElementById('dashboard-system-status-text');
        
        if (!wifiIndicator || !systemStatusText) return;
        
        // Determinar estado da conexão baseado nas regras
        let statusClass = 'offline';
        let statusIcon = '🔴';
        let statusText = 'Offline';
        let tooltipText = 'Desconectado';
        
        if (status.connected || status.status === 'no-internet') {
            // Conectado (com ou sem internet)
            if (status.signalPercentage > 20) {
                statusClass = 'online';
                statusIcon = '🟢';
                statusText = 'Online';
            } else {
                statusClass = 'unstable';
                statusIcon = '🟡';
                statusText = 'Instável';
            }
            
            // Tooltip com detalhes técnicos
            const ssid = status.ssid || 'Desconhecido';
            const signal = status.signalPercentage || 0;
            const dbm = status.signalStrength || -100;
            tooltipText = `Rede: ${ssid} | Sinal: ${dbm} dBm (${signal}%)`;
            
            // Atualizar texto do sistema se estiver online
            if (systemStatusText) {
                systemStatusText.textContent = 'Sistema operacional pronto';
            }
        } else {
            // Offline
            statusClass = 'offline';
            statusIcon = '🔴';
            statusText = 'Offline';
            tooltipText = 'Desconectado da rede';
            
            // Alerta de dissonância: atualizar texto central
            if (systemStatusText) {
                systemStatusText.textContent = '⚠️ Aguardando Conexão';
            }
        }
        
        // Atualizar o indicador no dashboard
        wifiIndicator.className = 'dashboard-wifi-indicator ' + statusClass;
        wifiIndicator.querySelector('.wifi-status-icon').textContent = statusIcon;
        wifiIndicator.querySelector('.wifi-status-text').textContent = statusText;
        wifiIndicator.title = tooltipText;
    },
    
    handleStatusChange: function(newStatus) {
        // Verificar se houve mudança significativa no status
        if (this.lastStatus) {
            // Verificar mudança de conectividade
            const wasConnected = this.lastStatus.connected || this.lastStatus.status === 'no-internet';
            const isConnected = newStatus.connected || newStatus.status === 'no-internet';
            
            if (wasConnected !== isConnected) {
                if (!isConnected) {
                    window.showToast('⚠️ Internet desconectada! Verifique sua conexão.', 'error');
                } else if (!wasConnected && isConnected) {
                    window.showToast('✅ Internet reconectada com sucesso!', 'success');
                }
            }
            
            // Verificar mudança de sinal para instável
            if (isConnected && wasConnected) {
                const wasStable = (this.lastStatus.signalPercentage || 0) > 20;
                const isStable = (newStatus.signalPercentage || 0) > 20;
                
                if (wasStable && !isStable) {
                    window.showToast('⚠️ Sinal Wi-Fi instável! Pode afetar a conexão.', 'warning');
                } else if (!wasStable && isStable) {
                    window.showToast('✅ Sinal Wi-Fi estabilizado!', 'success');
                }
            }
        }
        
        // Atualizar último status
        this.lastStatus = {...newStatus};
    },
    
    stop: function() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        // Remover event listeners
        window.removeEventListener('focus', this.checkNetworkStatus);
        window.removeEventListener('beforeunload', this.stop);
        
        this.isInitialized = false;
        console.log('Monitor de rede parado');
    }
};

// Função de compatibilidade para renderT (definida antes de qualquer uso)
window.renderT = function() {
    // Esta função não é mais usada no novo sistema de cardápio
    // Mantida apenas para compatibilidade com código existente
    console.log('renderT chamada (função de compatibilidade)');
    // Atualizar contador do cardápio se necessário
    const menuTotalItems = document.getElementById('menu-total-items');
    if (menuTotalItems) {
        let total = 0;
        if (window.config.menuData && window.config.menuData.categories) {
            window.config.menuData.categories.forEach(category => {
                if (category.products) {
                    total += category.products.length;
                }
            });
        }
        menuTotalItems.textContent = total;
    }
};

// Função para abrir links externos no navegador padrão do sistema
window.openExternalLink = function(url) {
    // Esta chamada IPC precisa ser implementada em preload.js e main.js
    window.electronAPI.openExternal(url); 
};

// Funções de convite da frota (renderFleetInvites, etc.) removidas para simplificar a interface.
// A funcionalidade de envio de convite foi mantida.

// A definição correta de renderFleet está mais abaixo. Esta é uma definição antiga e incorreta.
// window.renderFleet = function() {
//     window.renderFleetNew(); // Chama a função que realmente renderiza a frota
// };

window.addDriver = function() {
    // Abrir modal de adição de motoboy em vez de prompt
    window.showToast('Use o formulário de convite na aba Frota para adicionar motoboys.', 'info');
    // Navegar para a aba Frota
    window.nav('fleet-panel');
};

window.delDriver = function(phone) {
    // Remover sem confirmação
    if (window.config.fleet) {
        window.config.fleet = window.config.fleet.filter(driver => driver.phone !== phone);
        window.electronAPI.saveConfig(window.config).then(result => {
            window.showToast('Motoboy removido!', 'success');
            window.renderFleet();
        });
    }
};

// Função centralizada para salvar configurações
window.saveConfig = function() {
    // Coletar todos os valores dos campos de configuração
    const kGooEl = document.getElementById('k-goo');
    const kOpeEl = document.getElementById('k-ope');
    const kTelEl = document.getElementById('k-tel');
    
    const configUpdates = {
        // Chaves de API (com trim para evitar espaços acidentais)
        googleMapsKey: (kGooEl && kGooEl.value) ? kGooEl.value.trim() : '',
        openAIKey: (kOpeEl && kOpeEl.value) ? kOpeEl.value.trim() : '',
        telegramToken: (kTelEl && kTelEl.value) ? kTelEl.value.trim() : '',
        
        // Configurações Gerais
        telegramBotName: document.getElementById('k-tel-bot')?.value || 'MulaFRotaBot',
        restaurantAddress: document.getElementById('addr')?.value || '',
        adminNumber: document.getElementById('k-adm')?.value || '',
        storeName: document.getElementById('store-name-input')?.value || window.config.storeName || 'Delivery Manager',
        hubPagesSlug: document.getElementById('hub-pages-slug')?.value || window.config.hubPagesSlug || '',
        hubPagesPublicUrl: document.getElementById('hub-pages-public-url')?.value || window.config.hubPagesPublicUrl || ''
    };
    
    console.log('Salvando configurações (valores brutos):', {
        googleMapsKey: configUpdates.googleMapsKey,
        openAIKey: configUpdates.openAIKey,
        telegramToken: configUpdates.telegramToken,
        hasKGoo: !!kGooEl,
        hasKOpe: !!kOpeEl,
        hasKTel: !!kTelEl
    });
    
    // Atualizar window.config com os valores coletados
    Object.assign(window.config, configUpdates);
    
    // Salvar via API
    console.log('Enviando configuração para o processo principal:', {
        googleMapsKey: configUpdates.googleMapsKey?.substring(0, 5) + '...',
        openAIKey: configUpdates.openAIKey?.substring(0, 5) + '...',
        telegramToken: configUpdates.telegramToken?.substring(0, 5) + '...'
    });
    
    return window.electronAPI.saveConfig(window.config).then(result => {
        console.log('Resultado do salvamento do processo principal:', result);
        window.showToast('Configurações salvas com sucesso!', 'success');
        // Forçar recarregamento da configuração após salvar
        window.electronAPI.loadConfig().then(newConfig => {
            console.log('Configuração recarregada após o salvamento:', {
                googleMapsKey: newConfig.googleMapsKey?.substring(0, 5) + '...',
                openAIKey: newConfig.openAIKey?.substring(0, 5) + '...',
                telegramToken: newConfig.telegramToken?.substring(0, 5) + '...'
            });
            Object.assign(window.config, newConfig);
        });
        return result;
    }).catch(err => {
        console.error('Erro ao salvar configurações:', err);
        window.showToast('Erro ao salvar configurações: ' + err.message, 'error');
        throw err;
    });
};

// Função para carregar configurações nos campos
window.loadConfigToForm = function() {
    if (!window.config) return;
    
    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value || '';
        }
    };
    
    // Carregar chaves de API
    setValue('k-goo', window.config.googleMapsKey || '');
    setValue('k-ope', window.config.openAIKey || '');
    setValue('k-tel', window.config.telegramToken || '');
    
    // Carregar configurações gerais
    setValue('k-tel-bot', window.config.telegramBotName || 'MulaFRotaBot');
    setValue('addr', window.config.restaurantAddress || '');
    setValue('k-adm', window.config.adminNumber || '');
    setValue('store-name-input', window.config.storeName || 'Delivery Manager');
    setValue('hub-pages-slug', window.config.hubPagesSlug || '');
    setValue('hub-pages-public-url', window.config.hubPagesPublicUrl || '');
    
    // Atualizar status das chaves
    window.checkGoogleMapsKeyStatus();
    window.checkOpenAIKeyStatus();
};

// Alias para compatibilidade com código existente
window.saveC = window.saveConfig;
window.saveConfigGeneral = window.saveConfig;
window.saveTelegramConfig = window.saveConfig;

window.manualOrder = function() {
    window.showToast('A aba de pedidos foi removida. Use o dashboard para monitoramento.', 'info');
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

// Sistema de Cardápio Ceia OS - Tabela com edição inline
window.currentEditingMenuItemId = null;
window.menuItems = [];

// Inicializar o cardápio
window.initMenu = function() {
    if (!window.config.menuItems) {
        window.config.menuItems = [];
    }
    window.menuItems = window.config.menuItems;
    window.renderMenuTable();
    
    // Mostrar aviso se houver itens com estoque baixo
    const lowStockItems = window.menuItems.filter(item => item.stock && item.stock < 5);
    if (lowStockItems.length > 0) {
        const warningCallout = document.getElementById('menu-warning-callout');
        if (warningCallout) {
            warningCallout.querySelector('strong').textContent = `Estoque baixo · ${lowStockItems.length} itens com menos de 5 unidades`;
            warningCallout.style.display = 'flex';
        }
    }
};

// Renderizar tabela do cardápio
window.renderMenuTable = function() {
    const tbody = document.getElementById('menu-table-body');
    if (!tbody) return;
    
    if (window.menuItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <div style="margin-bottom: 16px;">
                        <i class="fas fa-utensils" style="font-size: 32px; opacity: 0.3;"></i>
                    </div>
                    Nenhum item no cardápio
                    <div style="font-size: 14px; margin-top: 8px; color: var(--text-secondary);">
                        Comece adicionando seu primeiro item
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    window.menuItems.forEach((item, index) => {
        const isPaused = item.paused === true;
        const rowClass = isPaused ? 'paused-row' : '';
        
        html += `
            <tr class="${rowClass} ceia-interactive" data-item-id="${item.id || index}">
                <td>
                    <label class="menu-toggle">
                        <input type="checkbox" ${!isPaused ? 'checked' : ''} 
                               onchange="window.toggleMenuItem(${index})">
                        <span class="menu-toggle-slider"></span>
                    </label>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 16px;">
                        ${item.image ? 
                            `<img src="${item.image}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; flex-shrink: 0;">` : 
                            `<div style="width: 50px; height: 50px; border-radius: 8px; background-color: #3a475a; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i class="fas fa-camera" style="color: var(--texto-secundario);"></i>
                            </div>`
                        }
                        <div>
                            <div class="product-name" style="font-weight: 600; color: ${isPaused ? 'var(--stone-500)' : 'var(--stone-200)'}">
                                ${item.name || 'Sem nome'}
                            </div>
                            ${item.description ? `<div style="font-size: 13px; color: var(--stone-400); margin-top: 4px;">${item.description}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <span class="category-badge">
                        ${item.category || 'Geral'}
                    </span>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 700; color: var(--stone-100);">
                            R$ ${(item.price || 0).toFixed(2)}
                        </span>
                        ${item.promoPrice ? `<span style="font-size: 13px; color: var(--stone-500); text-decoration: line-through;">R$ ${item.promoPrice.toFixed(2)}</span>` : ''}
                    </div>
                </td>
                <td>
                    <div style="display: flex; gap: 8px; justify-content: flex-end; padding-right: 16px;">
                        <button class="btn btn-secondary" onclick="window.editMenuItemInline(${index})" style="padding: 10px 16px; font-size: 14px; border-radius: 8px; display: flex; align-items: center; gap: 6px; background: var(--cinza-fundo); color: var(--texto-principal); border: 1px solid var(--borda-quente);">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn btn-error" onclick="window.deleteMenuItem(${index})" style="padding: 10px 16px; font-size: 14px; border-radius: 8px; display: flex; align-items: center; gap: 6px; background: var(--vermelho-fundo); color: var(--vermelho-sobrio); border: 1px solid var(--vermelho-sobrio);">
                            <i class="fas fa-trash"></i> Excluir
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
};

// Adicionar novo item
window.addMenuItem = function() {
    const newItem = {
        id: Date.now(),
        name: 'Novo Item',
        description: '',
        category: 'Geral',
        price: 0,
        promoPrice: null,
        paused: false,
        stock: null,
        image: null
    };
    
    window.menuItems.push(newItem);
    window.config.menuItems = window.menuItems;
    window.renderMenuTable();
    
    // Focar na edição do nome
    setTimeout(() => {
        window.editMenuItemInline(window.menuItems.length - 1);
    }, 100);
};

// Alternar status do item
window.toggleMenuItem = function(index) {
    const item = window.menuItems[index];
    item.paused = !item.paused;
    
    window.config.menuItems = window.menuItems;
    window.electronAPI.saveConfig(window.config).then(() => {
        window.showToast(`Item ${item.paused ? 'pausado' : 'ativado'}`, 'success');
        window.renderMenuTable();
    });
};

// Editar item inline
window.editMenuItemInline = function(index) {
    const item = window.menuItems[index];
    const row = document.querySelector(`tr[data-item-id="${item.id || index}"]`);
    if (!row) return;
    
    // Se já está editando, salvar primeiro
    if (window.currentEditingMenuItemId !== null && window.currentEditingMenuItemId !== item.id) {
        window.saveMenuItemEdit();
    }
    
    window.currentEditingMenuItemId = item.id;
    
    // Substituir células por inputs
    const cells = row.cells;
    
    // Nome e descrição
    cells[1].innerHTML = `
        <div style="display: flex; gap: 16px; align-items: flex-start;">
            <div style="flex-shrink: 0; text-align: center;">
                <label for="edit-image-input-${item.id}" style="cursor: pointer; display: block; width: 70px; height: 70px; border-radius: 8px; border: 1px solid var(--borda-quente); background-color: #3a475a; overflow: hidden; position: relative;">
                    <img src="${item.image || ''}" id="edit-image-preview-${item.id}" 
                         style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; display: ${item.image ? 'block' : 'none'};">
                    <div id="edit-image-placeholder-${item.id}" style="width: 100%; height: 100%; display: ${item.image ? 'none' : 'flex'}; align-items: center; justify-content: center; flex-direction: column; font-size: 12px; color: var(--texto-secundario);">
                        <i class="fas fa-camera" style="font-size: 20px; margin-bottom: 5px;"></i>
                        Alterar
                    </div>
                </label>
                <input type="file" id="edit-image-input-${item.id}" accept="image/*" style="display: none;">
            </div>
            <div style="flex-grow: 1;">
                <input type="text" class="menu-editable" value="${item.name || ''}" 
                       placeholder="Nome do produto" data-field="name" style="margin-bottom: 8px;">
                <textarea class="menu-editable" placeholder="Descrição (opcional)" 
                          data-field="description" rows="2" style="resize: vertical;">${item.description || ''}</textarea>
            </div>
        </div>
    `;

    const fileInput = row.querySelector(`#edit-image-input-${item.id}`);
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = row.querySelector(`#edit-image-preview-${item.id}`);
                const placeholder = row.querySelector(`#edit-image-placeholder-${item.id}`);
                preview.src = e.target.result;
                preview.style.display = 'block';
                placeholder.style.display = 'none';
                row.setAttribute('data-new-image', e.target.result);
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Categoria
    cells[2].innerHTML = `
        <select class="menu-editable" data-field="category" style="width: 100%;">
            <option value="Geral" ${item.category === 'Geral' ? 'selected' : ''}>Geral</option>
            <option value="Entradas" ${item.category === 'Entradas' ? 'selected' : ''}>Entradas</option>
            <option value="Pratos Principais" ${item.category === 'Pratos Principais' ? 'selected' : ''}>Pratos Principais</option>
            <option value="Sobremesas" ${item.category === 'Sobremesas' ? 'selected' : ''}>Sobremesas</option>
            <option value="Bebidas" ${item.category === 'Bebidas' ? 'selected' : ''}>Bebidas</option>
            <option value="Promoções" ${item.category === 'Promoções' ? 'selected' : ''}>Promoções</option>
        </select>
    `;
    
    // Preço
    cells[3].innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <input type="number" class="menu-editable" value="${item.price || 0}" 
                   step="0.01" min="0" placeholder="Preço" data-field="price">
            <input type="number" class="menu-editable" value="${item.promoPrice || ''}" 
                   step="0.01" min="0" placeholder="Preço promocional (opcional)" data-field="promoPrice">
        </div>
    `;
    
    // Ações - Botões maiores e mais claros
    cells[4].innerHTML = `
        <div style="display: flex; gap: 12px; justify-content: flex-end; padding-right: 8px;">
            <button class="btn btn-secondary" onclick="window.cancelMenuItemEdit()" style="padding: 12px 20px; font-size: 14px; border-radius: 8px; background: var(--cinza-fundo); color: var(--texto-principal); border: 1px solid var(--borda-quente); display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-times"></i> Cancelar
            </button>
            <button class="btn btn-success" onclick="window.saveMenuItemEdit()" style="padding: 12px 20px; font-size: 14px; border-radius: 8px; background: var(--verde-esperanca); color: white; border: none; display: flex; align-items: center; gap: 8px; font-weight: 600;">
                <i class="fas fa-check"></i> Salvar
            </button>
        </div>
    `;
    
    // Focar no primeiro input
    const firstInput = cells[1].querySelector('input');
    if (firstInput) firstInput.focus();
};

// Salvar edição do item
window.saveMenuItemEdit = function() {
    if (window.currentEditingMenuItemId === null) return;
    
    const index = window.menuItems.findIndex(item => item.id === window.currentEditingMenuItemId);
    if (index === -1) return;
    
    const item = window.menuItems[index];
    const row = document.querySelector(`tr[data-item-id="${window.currentEditingMenuItemId}"]`);
    if (!row) return;
    
    // Coletar valores dos inputs
    const inputs = row.querySelectorAll('.menu-editable');
    inputs.forEach(input => {
        const field = input.getAttribute('data-field');
        if (field === 'price' || field === 'promoPrice') {
            const value = parseFloat(input.value);
            item[field] = isNaN(value) ? (field === 'price' ? 0 : null) : value;
        } else {
            item[field] = input.value.trim();
        }
    });
    
    // Coletar imagem nova, se houver
    const newImage = row.getAttribute('data-new-image');
    if (newImage) {
        item.image = newImage;
    }
    
    window.config.menuItems = window.menuItems;
    window.electronAPI.saveConfig(window.config).then(() => {
        window.showToast('Item salvo', 'success');
        window.currentEditingMenuItemId = null;
        window.renderMenuTable();
    });
};

// Cancelar edição
window.cancelMenuItemEdit = function() {
    window.currentEditingMenuItemId = null;
    window.renderMenuTable();
};

// Excluir item
window.deleteMenuItem = function(index) {
    // Excluir sem confirmação
    window.menuItems.splice(index, 1);
    window.config.menuItems = window.menuItems;
    window.electronAPI.saveConfig(window.config).then(() => {
        window.showToast('Item removido', 'success');
        window.renderMenuTable();
    });
};

// Sistema de Complementos (mantido para compatibilidade)
window.currentEditingAddonGroupId = null;
window.daysOfWeek = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// Renderizar categorias
window.renderMenuCategories = function() {
    const accordion = document.getElementById('menu-categories-accordion');
    if (!accordion) return;
    
    const categories = window.config.menuData?.categories || [];
    
    if (categories.length === 0) {
        accordion.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-utensils"></i>
                <h3>Nenhuma categoria criada</h3>
                <p>Comece criando sua primeira categoria para organizar o cardápio.</p>
                <button class="btn btn-primary" onclick="window.openCategoryModal()">
                    <i class="fas fa-plus"></i> Criar Primeira Categoria
                </button>
            </div>
        `;
        return;
    }
    
    accordion.innerHTML = '';
    
    categories.forEach((category, categoryIndex) => {
        const categoryElement = document.createElement('div');
        categoryElement.className = 'category-item';
        categoryElement.innerHTML = `
            <div class="category-header" onclick="window.toggleCategory(${categoryIndex})">
                <div class="category-title">
                    <i class="fas fa-chevron-right" id="category-icon-${categoryIndex}"></i>
                    <span>${category.name}</span>
                    <span class="badge" style="background: var(--cinza-quente); color: white; font-size: 12px;">
                        ${category.products?.length || 0} itens
                    </span>
                </div>
                <div class="category-actions">
                    <button class="btn btn-secondary" onclick="window.editCategory(${categoryIndex}, event)" style="padding: 5px 10px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-error" onclick="window.deleteCategory(${categoryIndex}, event)" style="padding: 5px 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn btn-success" onclick="window.openProductModal(null, ${categoryIndex}, event)" style="padding: 5px 10px;">
                        <i class="fas fa-plus"></i> Produto
                    </button>
                </div>
            </div>
            <div class="category-products" id="category-products-${categoryIndex}">
                ${category.products && category.products.length > 0 ? 
                    category.products.map((product, productIndex) => `
                        <div class="product-item" draggable="true" 
                             ondragstart="window.dragProduct(event, ${categoryIndex}, ${productIndex})"
                             ondragover="window.allowDrop(event)"
                             ondrop="window.dropProduct(event, ${categoryIndex}, ${productIndex})">
                            <img src="${product.image || ''}" class="product-image" onerror="this.style.display='none'">
                            <div class="product-info">
                                <div class="product-name">${product.name}</div>
                                <div class="product-description">${product.description || ''}</div>
                                <div>
                                    <span class="product-price">R$ ${product.price?.toFixed(2) || '0.00'}</span>
                                    ${product.promoPrice ? `<span class="product-promo-price">R$ ${product.promoPrice.toFixed(2)}</span>` : ''}
                                </div>
                            </div>
                            <div class="product-actions">
                                <label class="switch">
                                    <input type="checkbox" ${product.status !== false ? 'checked' : ''} 
                                           onchange="window.toggleProductStatus(${categoryIndex}, ${productIndex})">
                                    <span class="slider"></span>
                                </label>
                                <button class="btn btn-secondary" onclick="window.editProduct(${categoryIndex}, ${productIndex}, event)" style="padding: 5px 10px;">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-error" onclick="window.deleteProduct(${categoryIndex}, ${productIndex}, event)" style="padding: 5px 10px;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('') : 
                    `<div class="empty-state" style="padding: 20px;">
                        <p>Nenhum produto nesta categoria</p>
                        <button class="btn btn-primary" onclick="window.openProductModal(null, ${categoryIndex})">
                            <i class="fas fa-plus"></i> Adicionar Produto
                        </button>
                    </div>`
                }
            </div>
        `;
        accordion.appendChild(categoryElement);
    });
};

// Funções para Categorias
window.toggleCategory = function(categoryIndex) {
    const productsDiv = document.getElementById(`category-products-${categoryIndex}`);
    const icon = document.getElementById(`category-icon-${categoryIndex}`);
    const header = productsDiv.previousElementSibling;
    
    if (productsDiv.classList.contains('expanded')) {
        productsDiv.classList.remove('expanded');
        header.classList.remove('active');
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
    } else {
        productsDiv.classList.add('expanded');
        header.classList.add('active');
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-down');
    }
};

window.openCategoryModal = function(categoryIndex = null) {
    window.currentEditingCategoryId = categoryIndex;
    const modal = document.getElementById('category-modal');
    const title = document.getElementById('category-modal-title');
    const nameInput = document.getElementById('category-name');
    
    if (categoryIndex !== null) {
        const category = window.config.menuData.categories[categoryIndex];
        title.textContent = 'Editar Categoria';
        nameInput.value = category.name;
    } else {
        title.textContent = 'Nova Categoria';
        nameInput.value = '';
    }
    
    modal.style.display = 'flex';
};

window.closeCategoryModal = function() {
    document.getElementById('category-modal').style.display = 'none';
    window.currentEditingCategoryId = null;
};

window.saveCategory = function() {
    const nameInput = document.getElementById('category-name');
    const name = nameInput.value.trim();
    
    if (!name) {
        window.showInputError('category-name', 'Digite um nome para identificar esta categoria no cardápio.');
        return;
    }
    
    if (!window.config.menuData) window.config.menuData = { categories: [], addonGroups: [] };
    if (!window.config.menuData.categories) window.config.menuData.categories = [];
    
    if (window.currentEditingCategoryId !== null) {
        // Editar categoria existente
        window.config.menuData.categories[window.currentEditingCategoryId].name = name;
    } else {
        // Nova categoria
        window.config.menuData.categories.push({
            id: Date.now(),
            name: name,
            products: []
        });
    }
    
    window.electronAPI.saveConfig(window.config).then(() => {
        window.showToast('Categoria salva', 'success');
        window.closeCategoryModal();
        window.renderMenuCategories();
    }).catch(error => {
        window.showToast('Erro ao salvar categoria. Verifique sua conexão.', 'error');
    });
};

window.editCategory = function(categoryIndex, event) {
    event.stopPropagation();
    window.openCategoryModal(categoryIndex);
};

window.deleteCategory = function(categoryIndex, event) {
    event.stopPropagation();
    // Excluir sem confirmação
    window.config.menuData.categories.splice(categoryIndex, 1);
    window.electronAPI.saveConfig(window.config).then(() => {
        window.showToast('Categoria excluída!', 'success');
        window.renderMenuCategories();
    });
};

// Funções para Produtos
window.openProductModal = function(productIndex = null, categoryIndex = null, event = null) {
    if (event) event.stopPropagation();
    
    window.currentEditingProductId = productIndex;
    window.currentEditingCategoryId = categoryIndex;
    
    const modal = document.getElementById('product-modal');
    const title = document.getElementById('product-modal-title');
    
    // Configurar dias da semana
    const daysContainer = modal.querySelector('.category-products').previousElementSibling;
    daysContainer.innerHTML = '';
    window.daysOfWeek.forEach(day => {
        daysContainer.innerHTML += `
            <label style="display: flex; align-items: center; gap: 5px;">
                <input type="checkbox" id="day-${day.toLowerCase()}" value="${day}">
                <span>${day}</span>
            </label>
        `;
    });
    
    if (productIndex !== null && categoryIndex !== null) {
        // Editar produto existente
        const product = window.config.menuData.categories[categoryIndex].products[productIndex];
        title.textContent = 'Editar Produto';
        
        document.getElementById('product-name').value = product.name || '';
        document.getElementById('product-description').value = product.description || '';
        document.getElementById('product-price').value = product.price || '';
        document.getElementById('product-promo-price').value = product.promoPrice || '';
        document.getElementById('product-status').checked = product.status !== false;
        document.getElementById('product-status-label').textContent = product.status !== false ? 'Disponível' : 'Indisponível';
        
        // Dias da semana
        if (product.availableDays) {
            product.availableDays.forEach(day => {
                const checkbox = document.getElementById(`day-${day.toLowerCase()}`);
                if (checkbox) checkbox.checked = true;
            });
        }
        
        // Horários
        document.getElementById('product-start-time').value = product.startTime || '';
        document.getElementById('product-end-time').value = product.endTime || '';
        
        // Imagem
        const preview = document.getElementById('product-image-preview');
        if (product.image) {
            preview.innerHTML = `<img src="${product.image}" style="width: 100%; height: 100%; object-fit: cover;">`;
        }
        
        // Complementos
        window.renderAddonGroupsForProduct(product.addonGroups || []);
    } else {
        // Novo produto
        title.textContent = 'Novo Produto';
        document.getElementById('product-name').value = '';
        document.getElementById('product-description').value = '';
        document.getElementById('product-price').value = '';
        document.getElementById('product-promo-price').value = '';
        document.getElementById('product-status').checked = true;
        document.getElementById('product-status-label').textContent = 'Disponível';
        
        // Resetar checkboxes
        window.daysOfWeek.forEach(day => {
            const checkbox = document.getElementById(`day-${day.toLowerCase()}`);
            if (checkbox) checkbox.checked = true;
        });
        
        document.getElementById('product-start-time').value = '';
        document.getElementById('product-end-time').value = '';
        
        // Resetar imagem
        const preview = document.getElementById('product-image-preview');
        preview.innerHTML = '<i class="fas fa-camera" style="font-size: 40px; color: var(--texto-secundario);"></i>';
        
        // Complementos
        window.renderAddonGroupsForProduct([]);
    }
    
    // Configurar upload de imagem
    const uploadInput = document.getElementById('product-image-upload');
    uploadInput.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const preview = document.getElementById('product-image-preview');
                preview.innerHTML = `<img src="${event.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`;
            };
            reader.readAsDataURL(file);
        }
    };
    
    modal.style.display = 'flex';
};

window.closeProductModal = function() {
    document.getElementById('product-modal').style.display = 'none';
    window.currentEditingProductId = null;
    window.currentEditingCategoryId = null;
};

window.saveProduct = function() {
    const name = document.getElementById('product-name').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    
    if (!name) {
        window.showErrorWithInstruction(
            'Nome do produto não pode estar vazio.',
            'Digite um nome que os clientes reconhecerão.'
        );
        return;
    }
    if (isNaN(price) || price < 0) {
        window.showErrorWithInstruction(
            'Preço inválido.',
            'Digite um valor numérico maior ou igual a zero. Use ponto para decimais.'
        );
        return;
    }
    
    // Coletar dias selecionados
    const availableDays = [];
    window.daysOfWeek.forEach(day => {
        const checkbox = document.getElementById(`day-${day.toLowerCase()}`);
        if (checkbox && checkbox.checked) {
            availableDays.push(day);
        }
    });
    
    // Coletar imagem
    const preview = document.getElementById('product-image-preview');
    const image = preview.querySelector('img') ? preview.querySelector('img').src : '';
    
    // Coletar complementos selecionados
    const selectedAddonGroups = [];
    const checkboxes = document.querySelectorAll('#addon-groups-list input[type="checkbox"]:checked');
    checkboxes.forEach(checkbox => {
        selectedAddonGroups.push(checkbox.value);
    });
    
    const productData = {
        id: window.currentEditingProductId !== null ? window.config.menuData.categories[window.currentEditingCategoryId].products[window.currentEditingProductId].id : Date.now(),
        name: name,
        description: document.getElementById('product-description').value,
        price: price,
        promoPrice: document.getElementById('product-promo-price').value ? parseFloat(document.getElementById('product-promo-price').value) : null,
        status: document.getElementById('product-status').checked,
        image: image,
        availableDays: availableDays,
        startTime: document.getElementById('product-start-time').value,
        endTime: document.getElementById('product-end-time').value,
        addonGroups: selectedAddonGroups
    };
    
    // Validar dados
    const validation = window.validateProductData(productData);
    if (!validation.isValid) {
        window.showToast(validation.errors.join(', '), 'error');
        return;
    }
    
    if (window.currentEditingProductId !== null && window.currentEditingCategoryId !== null) {
        // Editar produto existente
        window.config.menuData.categories[window.currentEditingCategoryId].products[window.currentEditingProductId] = productData;
    } else {
        // Novo produto
        if (!window.config.menuData.categories[window.currentEditingCategoryId].products) {
            window.config.menuData.categories[window.currentEditingCategoryId].products = [];
        }
        window.config.menuData.categories[window.currentEditingCategoryId].products.push(productData);
    }
    
    window.electronAPI.saveConfig(window.config).then(() => {
        window.showToast('Produto salvo com sucesso!', 'success');
        window.closeProductModal();
        window.renderMenuCategories();
    }).catch(error => {
        window.showErrorWithInstruction(
            'Erro ao salvar produto.',
            'Verifique sua conexão e tente novamente.'
        );
    });
};

window.toggleProductStatus = function(categoryIndex, productIndex) {
    const product = window.config.menuData.categories[categoryIndex].products[productIndex];
    product.status = !product.status;
    
    window.electronAPI.saveConfig(window.config).then(() => {
        window.showToast(`Produto ${product.status ? 'ativado' : 'pausado'}!`, 'success');
        // Atualizar visualmente sem recarregar tudo
        window.renderMenuCategories();
    });
};

window.editProduct = function(categoryIndex, productIndex, event) {
    event.stopPropagation();
    window.openProductModal(productIndex, categoryIndex);
};

window.deleteProduct = function(categoryIndex, productIndex, event) {
    event.stopPropagation();
    // Excluir sem confirmação
    window.config.menuData.categories[categoryIndex].products.splice(productIndex, 1);
    window.electronAPI.saveConfig(window.config).then(() => {
        window.showToast('Produto excluído!', 'success');
        window.renderMenuCategories();
    });
};

// Drag and Drop para produtos
window.dragProduct = function(event, categoryIndex, productIndex) {
    event.dataTransfer.setData('text/plain', JSON.stringify({ categoryIndex, productIndex }));
    event.currentTarget.classList.add('dragging');
};

window.allowDrop = function(event) {
    event.preventDefault();
};

window.dropProduct = function(event, targetCategoryIndex, targetProductIndex) {
    event.preventDefault();
    const sourceData = JSON.parse(event.dataTransfer.getData('text/plain'));
    const sourceCategoryIndex = sourceData.categoryIndex;
    const sourceProductIndex = sourceData.productIndex;
    
    if (sourceCategoryIndex === targetCategoryIndex && sourceProductIndex === targetProductIndex) {
        return;
    }
    
    const product = window.config.menuData.categories[sourceCategoryIndex].products[sourceProductIndex];
    
    // Remover da posição original
    window.config.menuData.categories[sourceCategoryIndex].products.splice(sourceProductIndex, 1);
    
    // Inserir na nova posição
    if (sourceCategoryIndex === targetCategoryIndex) {
        // Mesma categoria, ajustar índice
        const newIndex = sourceProductIndex < targetProductIndex ? targetProductIndex - 1 : targetProductIndex;
        window.config.menuData.categories[targetCategoryIndex].products.splice(newIndex, 0, product);
    } else {
        // Categoria diferente
        window.config.menuData.categories[targetCategoryIndex].products.splice(targetProductIndex, 0, product);
    }
    
    window.electronAPI.saveConfig(window.config).then(() => {
        window.showToast('Produto movido!', 'success');
        window.renderMenuCategories();
    });
    
    // Remover classe dragging
    document.querySelectorAll('.product-item.dragging').forEach(el => {
        el.classList.remove('dragging');
    });
};

// Função para abrir a janela de importação do cardápio via IA
window.openMenuImport = function() {
    window.electronAPI.openMenuImport().then(result => {
        console.log('Janela de importação de cardápio aberta');
    }).catch(error => {
        console.error('Erro ao abrir janela de importação:', error);
        window.showToast('Erro ao abrir importador de cardápio', 'error');
    });
};

// Funções para Complementos
window.openAddonGroupModal = function() {
    document.getElementById('addon-group-modal').style.display = 'flex';
    window.renderAddonGroups();
};

window.closeAddonGroupModal = function() {
    document.getElementById('addon-group-modal').style.display = 'none';
};

window.openNewAddonGroupModal = function(groupId = null) {
    window.currentEditingAddonGroupId = groupId;
    const modal = document.getElementById('new-addon-group-modal');
    const title = document.getElementById('addon-group-modal-title');
    const container = document.getElementById('addon-options-container');
    
    if (groupId !== null) {
        // Editar grupo existente
        const group = window.config.menuData.addonGroups.find(g => g.id === groupId);
        title.textContent = 'Editar Grupo de Complementos';
        
        document.getElementById('addon-group-name').value = group.name || '';
        document.getElementById('addon-group-required').checked = group.required || false;
        document.getElementById('addon-group-min').value = group.minQty || 0;
        document.getElementById('addon-group-max').value = group.maxQty || 1;
        
        // Limpar opções existentes
        container.innerHTML = '';
        
        // Adicionar opções
        if (group.options && group.options.length > 0) {
            group.options.forEach((option, index) => {
                window.addAddonOption(option.name, option.price, index);
            });
        } else {
            window.addAddonOption(); // Opção padrão
        }
    } else {
        // Novo grupo
        title.textContent = 'Novo Grupo de Complementos';
        document.getElementById('addon-group-name').value = '';
        document.getElementById('addon-group-required').checked = false;
        document.getElementById('addon-group-min').value = 0;
        document.getElementById('addon-group-max').value = 1;
        
        // Limpar opções
        container.innerHTML = '';
        window.addAddonOption(); // Opção padrão
    }
    
    modal.style.display = 'flex';
};

window.closeNewAddonGroupModal = function() {
    document.getElementById('new-addon-group-modal').style.display = 'none';
    window.currentEditingAddonGroupId = null;
};

window.addAddonOption = function(name = '', price = 0, index = null) {
    const container = document.getElementById('addon-options-container');
    const optionId = index !== null ? index : container.children.length;
    
    const optionDiv = document.createElement('div');
    optionDiv.className = 'addon-option-item';
    optionDiv.innerHTML = `
        <span class="drag-handle"><i class="fas fa-grip-vertical"></i></span>
        <input type="text" class="addon-option-input" placeholder="Nome da opção" 
               value="${name}" onchange="window.updateAddonOption(${optionId}, 'name', this.value)">
        <input type="number" class="addon-option-input" placeholder="Preço" step="0.01" min="0"
               value="${price}" onchange="window.updateAddonOption(${optionId}, 'price', parseFloat(this.value))">
        <button class="btn btn-error" onclick="window.removeAddonOption(${optionId})" style="padding: 5px 10px;">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(optionDiv);
};

window.updateAddonOption = function(index, field, value) {
    // Esta função será usada para atualizar opções em memória
    // A implementação completa será feita no saveAddonGroup
};

window.removeAddonOption = function(index) {
    const container = document.getElementById('addon-options-container');
    if (container.children.length > 1) {
        container.children[index].remove();
        // Renumerar os índices restantes
        Array.from(container.children).forEach((child, i) => {
            const inputs = child.querySelectorAll('input');
            inputs[0].setAttribute('onchange', `window.updateAddonOption(${i}, 'name', this.value)`);
            inputs[1].setAttribute('onchange', `window.updateAddonOption(${i}, 'price', parseFloat(this.value))`);
            const button = child.querySelector('button');
            button.setAttribute('onclick', `window.removeAddonOption(${i})`);
        });
    }
};

window.saveAddonGroup = function() {
    const name = document.getElementById('addon-group-name').value.trim();
    if (!name) {
        window.showToast('Digite um nome para o grupo', 'error');
        return;
    }
    
    const container = document.getElementById('addon-options-container');
    const options = [];
    
    Array.from(container.children).forEach(child => {
        const inputs = child.querySelectorAll('input');
        const optionName = inputs[0].value.trim();
        const optionPrice = parseFloat(inputs[1].value) || 0;
        
        if (optionName) {
            options.push({
                name: optionName,
                price: optionPrice
            });
        }
    });
    
    if (options.length === 0) {
        window.showToast('Adicione pelo menos uma opção', 'error');
        return;
    }
    
    const groupData = {
        id: window.currentEditingAddonGroupId || Date.now().toString(),
        name: name,
        required: document.getElementById('addon-group-required').checked,
        minQty: parseInt(document.getElementById('addon-group-min').value) || 0,
        maxQty: parseInt(document.getElementById('addon-group-max').value) || 1,
        options: options
    };
    
    // Salvar via IPC
    window.electronAPI.menuAddonGroupSave(groupData).then(result => {
        if (result.success) {
            window.showToast('Grupo salvo com sucesso!', 'success');
            window.closeNewAddonGroupModal();
            window.renderAddonGroups();
        } else {
            window.showToast('Erro ao salvar grupo: ' + result.error, 'error');
        }
    });
};

window.renderAddonGroups = function() {
    const container = document.getElementById('addon-groups-container');
    const groups = window.config.menuData?.addonGroups || [];
    
    if (groups.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-layer-group"></i>
                <h3>Nenhum grupo de complementos</h3>
                <p>Crie grupos para oferecer opções extras nos produtos.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = groups.map(group => `
        <div class="addon-group-item">
            <div class="addon-group-header">
                <div class="addon-group-name">${group.name}</div>
                <div>
                    <button class="btn btn-secondary" onclick="window.editAddonGroup('${group.id}')" style="padding: 5px 10px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-error" onclick="window.deleteAddonGroup('${group.id}')" style="padding: 5px 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="addon-group-rules">
                ${group.required ? 'Obrigatório' : 'Opcional'} · 
                Mín: ${group.minQty} · Máx: ${group.maxQty}
            </div>
            <div>
                <strong>Opções:</strong>
                ${group.options.map(option => `<div style="padding: 5px 0;">• ${option.name} (R$ ${option.price?.toFixed(2) || '0.00'})</div>`).join('')}
            </div>
        </div>
    `).join('');
};

window.editAddonGroup = function(groupId) {
    window.openNewAddonGroupModal(groupId);
};

window.deleteAddonGroup = function(groupId) {
    // Excluir sem confirmação
    window.electronAPI.menuAddonGroupDelete(groupId).then(result => {
        if (result.success) {
            window.showToast('Grupo excluído!', 'success');
            window.renderAddonGroups();
        } else {
            window.showToast('Erro ao excluir grupo: ' + result.error, 'error');
        }
    });
};

window.renderAddonGroupsForProduct = function(selectedGroups) {
    const container = document.getElementById('addon-groups-list');
    const groups = window.config.menuData?.addonGroups || [];
    
    if (groups.length === 0) {
        container.innerHTML = '<p style="color: var(--texto-secundario); text-align: center; padding: 20px;">Nenhum grupo de complementos criado</p>';
        return;
    }
    
    container.innerHTML = groups.map(group => `
        <label style="display: flex; align-items: center; gap: 10px; padding: 8px; border-bottom: 1px solid var(--borda-quente);">
            <input type="checkbox" value="${group.id}" ${selectedGroups.includes(group.id) ? 'checked' : ''}>
            <div>
                <div style="font-weight: 600;">${group.name}</div>
                <div style="font-size: 12px; color: var(--texto-secundario);">
                    ${group.required ? 'Obrigatório' : 'Opcional'} · 
                    Mín: ${group.minQty} · Máx: ${group.maxQty}
                </div>
            </div>
        </label>
    `).join('');
};

// Função de compatibilidade para renderT (cardápio antigo)
window.renderT = function() {
    // Esta função não é mais usada no novo sistema de cardápio
    // Mantida apenas para compatibilidade com código existente
    console.log('renderT chamada (função de compatibilidade)');
    // Atualizar contador do cardápio se necessário
    const menuTotalItems = document.getElementById('menu-total-items');
    if (menuTotalItems) {
        let total = 0;
        if (window.config.menuData && window.config.menuData.categories) {
            window.config.menuData.categories.forEach(category => {
                if (category.products) {
                    total += category.products.length;
                }
            });
        }
        menuTotalItems.textContent = total;
    }
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
        // Não chamar renderT() pois não é mais necessário
        window.showToast(`Item ${window.config.menu[index].paused ? 'pausado' : 'ativado'}!`, 'success');
    }
};

window.delM = function(index) {
    // Excluir sem confirmação
    if (window.config.menu) {
        window.config.menu.splice(index, 1);
        // Não chamar renderT() pois não é mais necessário
        window.showToast('Item removido!', 'success');
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
    // Não chamar renderT() pois não é mais necessário
    window.showToast('Item adicionado!', 'success');
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
    window.showToast('Processando cardápio com IA...', 'info');
    window.electronAPI.aiParseMenu(text).then(items => {
        if (!window.menuItems) window.menuItems = [];
        window.menuItems.push(...items);
        window.config.menuItems = window.menuItems;
        
        window.electronAPI.saveConfig(window.config).then(() => {
            window.showToast(`${items.length} itens importados com sucesso!`, 'success');
            window.renderMenuTable();
        });
    }).catch(error => {
        window.showToast(`Erro ao processar com IA: ${error.message}`, 'error');
    });
};

// Funções para Regras de Ouro
window.saveGoldenRules = function() {
    const rules = document.getElementById('golden-rules-text').value;
    window.config.goldenRules = rules;
    window.electronAPI.saveConfig(window.config).then(result => {
        window.showToast('Regras de Ouro salvas!', 'success');
    });
};

window.loadGoldenRules = function() {
    const textarea = document.getElementById('golden-rules-text');
    if (textarea && window.config.goldenRules) {
        textarea.value = window.config.goldenRules;
        window.showToast('Regras carregadas!', 'success');
    } else {
        window.showToast('Nenhuma regra salva ainda.', 'info');
    }
};

window.exportGoldenRules = function() {
    const rules = document.getElementById('golden-rules-text').value;
    if (!rules.trim()) {
        window.showToast('Não há regras para exportar.', 'error');
        return;
    }
    
    const blob = new Blob([rules], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'regras-de-ouro.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    window.showToast('Regras exportadas com sucesso!', 'success');
};

// Função centralizada para gerenciar o estado de pausa da loja
window.togglePause = function() {
    // Atualizar o estado
    window.config.botPaused = !window.config.botPaused;
    
    // Atualizar a interface
    window.updatePauseUI();
    
    // Mostrar notificação
    const message = window.config.botPaused ? 'Loja pausada' : 'Loja retomada';
    const type = window.config.botPaused ? 'error' : 'success';
    window.showToast(message, type);
    
    // Persistir o estado
    window.electronAPI.saveConfig(window.config).then(result => {
        console.log('Estado de pausa da loja salvo:', result);
    });
};

// Função para atualizar a interface baseada no estado de pausa
window.updatePauseUI = function() {
    const btn = document.getElementById('btn-pause');
    const dashboardBtn = document.getElementById('btn-pause-dashboard');
    
    if (window.config.botPaused) {
        // Estado pausado
        if (btn) {
            btn.innerHTML = '<i class="fas fa-play"></i> Retomar Loja';
            btn.className = 'btn btn-success';
        }
        if (dashboardBtn) {
            dashboardBtn.classList.add('paused');
            dashboardBtn.innerHTML = '<span class="pause-icone">▶️</span><span class="pause-texto">RETOMAR LOJA</span>';
        }
    } else {
        // Estado ativo
        if (btn) {
            btn.innerHTML = '<i class="fas fa-pause"></i> Pausar Loja';
            btn.className = 'btn btn-secondary';
        }
        if (dashboardBtn) {
            dashboardBtn.classList.remove('paused');
            dashboardBtn.innerHTML = '<span class="pause-icone">⏸️</span><span class="pause-texto">PAUSAR LOJA</span>';
        }
    }
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
    console.log('=== NAVEGAÇÃO INICIADA ===');
    console.log('Painel alvo:', panelId);
    
    // Listar todos os painéis antes
    console.log('Painéis antes:');
    document.querySelectorAll('.panel').forEach(p => {
        console.log(`  ${p.id}: ${p.classList.contains('active') ? 'ativo' : 'inativo'}`);
    });
    
    // Remover classe active de todos os itens de navegação
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Remover classe active de todos os painéis
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    // Ativar o item de navegação correspondente
    const navItem = document.querySelector(`[data-panel="${panelId}"]`);
    if (navItem) {
        navItem.classList.add('active');
        console.log('Item de navegação ativado:', navItem.textContent);
    } else {
        console.warn('Item de navegação não encontrado para:', panelId);
    }
    
    // Ativar o painel correspondente
    const panel = document.getElementById(panelId);
    if (panel) {
        panel.classList.add('active');
        console.log('Painel ativado:', panelId);
    } else {
        console.error(`Painel ${panelId} não encontrado`);
    }
    
    // Listar todos os painéis depois
    console.log('Painéis depois:');
    document.querySelectorAll('.panel').forEach(p => {
        console.log(`  ${p.id}: ${p.classList.contains('active') ? 'ativo' : 'inativo'}`);
    });
    console.log('=== NAVEGAÇÃO FINALIZADA ===');
    
    // Atualizar componentes específicos do painel
    if (panelId === 'fleet-panel') {
        window.renderFleet(); // Agora chama a função renomeada
    } else if (panelId === 'menu-panel') {
        // Usar initMenu() em vez de renderT() para o novo sistema de cardápio
        window.initMenu();
    } else if (panelId === 'home-panel') {
        window.renderDashboardStats();
    }
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

// Funções auxiliares para o novo componente de frota
// Função para enviar convite do Telegram via WhatsApp (única função de convite)
// IMPORTANTE: O link deve vir sempre do backend, nunca ser gerado no frontend
window.sendTelegramInviteToWhatsApp = function() {
    // Verificar se já está enviando
    if (window.isSendingInvite) {
        console.log('Envio já em andamento, ignorando clique duplo');
        return;
    }
    
    console.log('sendTelegramInviteToWhatsApp chamada');
    const phoneInput = document.getElementById('fleet-invite-phone');
    const btnEnviar = document.getElementById('btn-enviar-convite');
    
    if (!phoneInput) {
        console.error('Campo de telefone não encontrado');
        window.showToast('Campo de telefone não encontrado!', 'error');
        return;
    }
    
    const phone = phoneInput.value.trim();
    console.log('Número digitado:', phone);
    if (!phone) {
        window.showToast('Digite um número de WhatsApp!', 'error');
        return;
    }
    
    // Validar formato do telefone (mínimo 10 dígitos)
    const cleanPhone = phone.replace(/\D/g, '');
    console.log('Número limpo:', cleanPhone);
    if (cleanPhone.length < 10) {
        window.showToast('Número de telefone inválido!', 'error');
        return;
    }
    
    // Ativar trava de estado
    window.isSendingInvite = true;
    
    // Desabilitar botão visualmente
    if (btnEnviar) {
        btnEnviar.disabled = true;
        btnEnviar.classList.add('disabled');
        btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        // Adicionar estilo inline para garantir visualização
        btnEnviar.style.opacity = '0.7';
        btnEnviar.style.cursor = 'not-allowed';
    }
    
    window.showToast('Enviando convite via WhatsApp...', 'info');
    
    // Log no frontend conforme solicitado
    console.log('Botão de convite clicado, enviando para o backend: ' + cleanPhone);
    
    // Usar o novo handler 'enviarConviteEntregador' em vez do antigo
    console.log('Chamando API "enviarConviteEntregador" com:', cleanPhone);
    window.electronAPI.enviarConviteEntregador(cleanPhone).then(result => {
        console.log('Resultado do envio do convite:', result);
        
        // Liberar trava de estado
        window.isSendingInvite = false;
        
        // Reabilitar botão
        if (btnEnviar) {
            btnEnviar.disabled = false;
            btnEnviar.classList.remove('disabled');
            btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Convite';
            btnEnviar.style.opacity = '';
            btnEnviar.style.cursor = '';
        }
        
        if (result.success) {
            window.showToast('✅ Convite enviado com sucesso!', 'success');
            
            // Mostrar preview do link (se disponível)
            const preview = document.getElementById('invite-preview');
            if (preview) {
                const linkEl = preview.querySelector('.preview-link');
                if (linkEl) {
                    // Usar EXATAMENTE o link retornado pelo backend
                    linkEl.textContent = result.telegramLink || 'Link do Telegram gerado';
                    preview.classList.remove('hidden');
                }
            }
            
            // A lista de convites foi removida, não é mais necessário atualizar.
            
            // Limpar o campo do telefone
            phoneInput.value = '';
        } else {
            window.showToast(`❌ Erro: ${result.error || 'Erro desconhecido'}`, 'error');
        }
    }).catch(error => {
        console.error('Erro ao enviar convite:', error);
        
        // Liberar trava de estado mesmo em caso de erro
        window.isSendingInvite = false;
        
        // Reabilitar botão
        if (btnEnviar) {
            btnEnviar.disabled = false;
            btnEnviar.classList.remove('disabled');
            btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Convite';
            btnEnviar.style.opacity = '';
            btnEnviar.style.cursor = '';
        }
        
        window.showToast(`❌ Erro ao enviar: ${error.message}`, 'error');
    });
};

window.copyInviteLink = function() {
    const linkEl = document.querySelector('.preview-link');
    if (!linkEl) return;
    
    // Copiar exatamente o texto do link que veio do backend
    const linkText = linkEl.textContent;
    if (!linkText || linkText.trim() === '') {
        window.showToast('Nenhum link disponível para copiar', 'error');
        return;
    }
    
    navigator.clipboard.writeText(linkText);
    window.showToast('Link copiado para a área de transferência!', 'success');
};

window.selectFleetTeam = function(team, event) {
    // Atualizar tabs
    document.querySelectorAll('.fleet-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: encontrar a tab correspondente
        const tab = document.querySelector(`.fleet-tab[data-team="${team}"]`);
        if (tab) tab.classList.add('active');
    }
    
    // Filtrar cards
    const cards = document.querySelectorAll('.fleet-card');
    cards.forEach(card => {
        const cardTeam = card.dataset.team || 'fixos';
        const cardType = card.dataset.type || '';
        
        if (team === 'offline') {
            const isOnline = card.querySelector('.status-badge.online');
            card.style.display = isOnline ? 'none' : 'block';
        } else if (team === 'fixos') {
            card.style.display = (cardTeam === 'fixos' || cardType === 'FIXO') ? 'block' : 'none';
        } else if (team === 'freelancers') {
            card.style.display = (cardTeam === 'freelancers' || (cardType !== 'FIXO' && cardType !== 'MULA' && cardTeam !== 'mula')) ? 'block' : 'none';
        } else if (team === 'mula') {
            card.style.display = (cardTeam === 'mula' || cardType === 'MULA') ? 'block' : 'none';
        } else {
            card.style.display = 'block';
        }
    });
};

window.convocarOffline = function(vulgo) {
    const driver = window.config.fleet.find(d => d.code === vulgo);
    if (!driver || !driver.phone) return;
    
    const mensagem = `Olá ${driver.name || driver.code}! 👋\n\nTemos corridas agora. Se quiser rodar, é só compartilhar sua localização no Telegram que você já entra no radar.`;
    
    window.electronAPI.whatsappBroadcast({ 
        phones: [driver.phone], 
        msg: mensagem 
    });
    
    window.showToast(`Convocação enviada para ${driver.code}`, 'success');
};

window.convocarTodosOffline = function() {
    const fleet = window.config.fleet || [];
    const now = Date.now();
    const offlineDaCasa = fleet.filter(driver => {
        const lastSeen = window.driverLastSeen[driver.phone] || 0;
        const isOnline = lastSeen && (now - lastSeen) < 30 * 60000;
        const pertenceALoja = driver.team === 'fixos' || driver.team === 'freelancers';
        return !isOnline && pertenceALoja && driver.phone;
    });
    
    if (offlineDaCasa.length === 0) {
        window.showToast('Nenhum entregador offline da sua loja', 'info');
        return;
    }
    
    const mensagem = `🚨 CORRIDAS AGORA!\n\nSe estiver disponível, compartilhe sua localização no Telegram para entrar no radar.`;
    
    offlineDaCasa.forEach(d => {
        window.electronAPI.whatsappBroadcast({ 
            phones: [d.phone], 
            msg: mensagem 
        });
    });
    
    window.showToast(`Convocação enviada para ${offlineDaCasa.length} entregadores`, 'success');
};

window.abrirChamada = function(vulgo) {
    const driver = window.config.fleet.find(d => d.code === vulgo);
    if (!driver || !driver.phone) return;
    
    const mensagem = `🛵 Chamada para corrida!\n\nTem um pedido pronto. Compartilhe sua localização se estiver disponível.`;
    
    window.electronAPI.whatsappBroadcast({ 
        phones: [driver.phone], 
        msg: mensagem 
    });
    
    window.showToast(`Chamada enviada para ${driver.code}`, 'success');
};

// Função para renderizar a frota
window.renderFleet = function() {
    const fleetCards = document.getElementById('fleet-cards');
    const emptyState = document.getElementById('fleet-empty-state');
    const fleet = window.config.fleet || [];
    
    if (fleet.length === 0) {
        if (fleetCards) fleetCards.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    if (!fleetCards) return;
    
    const now = Date.now();
    let html = '';
    
    fleet.forEach(driver => {
        const lastSeen = window.driverLastSeen[driver.phone] || 0;
        const minutesAgo = lastSeen ? Math.floor((now - lastSeen) / 60000) : Infinity;
        const isOnline = minutesAgo < 30;
        const team = driver.team || 'freelancers';
        const hasPix = driver.pixKey && driver.pixKey.trim() !== '';
        
        html += `
            <div class="fleet-card" data-team="${team}" data-vulgo="${driver.code}">
                <div class="card-header">
                    <span class="card-vulgo">${driver.code}</span>
                    <span class="status-badge ${isOnline ? 'online' : 'offline'}">
                        ${isOnline ? '📡 ONLINE' : '⏳ OFFLINE'}
                    </span>
                </div>
                <div class="card-body">
                    <div class="card-info">
                        <span class="info-label">Nome:</span>
                        <span class="info-value">${driver.name}</span>
                    </div>
                    <div class="card-info">
                        <span class="info-label">Veículo:</span>
                        <span class="info-value">${driver.vehicle || 'Não informado'}</span>
                    </div>
                    <div class="card-info">
                        <span class="info-label">Vínculo:</span>
                        <span class="info-value fixed-badge">${team === 'fixos' ? 'FIXO da casa' : 'FREELANCER'}</span>
                    </div>
                    ${hasPix ? `
                    <div class="card-info">
                        <span class="info-label">PIX:</span>
                        <span class="info-value" style="color: var(--verde-esperanca); font-size: 0.8rem;">
                            ${driver.pixKey.length > 20 ? driver.pixKey.substring(0, 20) + '...' : driver.pixKey}
                        </span>
                    </div>
                    ` : ''}
                </div>
                <div class="card-footer">
                    <span class="last-seen">${isOnline ? `📍 há ${minutesAgo} min` : '⏳ offline'}</span>
                    <button class="btn-chamada" onclick="window.abrirChamada('${driver.code}')">
                        ⚡ Chamar
                    </button>
                </div>
            </div>
        `;
    });
    
    fleetCards.innerHTML = html;
    
    // Atualizar contadores
    const fixosCount = fleet.filter(d => d.team === 'fixos').length;
    const freelancersCount = fleet.filter(d => d.team === 'freelancers').length;
    const offlineCount = fleet.filter(driver => {
        const lastSeen = window.driverLastSeen[driver.phone] || 0;
        return !(lastSeen && (now - lastSeen) < 30 * 60000);
    }).length;
    
    document.getElementById('count-fixos').textContent = fixosCount;
    document.getElementById('count-freelancers').textContent = freelancersCount;
    document.getElementById('count-offline').textContent = offlineCount;
    document.getElementById('fleet-global-count').textContent = fleet.length;
};

// Funções para Telegram - Removida duplicação, usando window.saveConfig
// NOTA: Não gerar links no frontend - sempre usar o link retornado pelo backend


window.hideMotoboysChannel = function() {
    const section = document.getElementById('motoboys-channel-section');
    if (section) {
        section.style.display = 'none';
        window.showToast('Canal dos motoboys ocultado. O sistema usará o canal embutido.', 'success');
    }
};

// Funções para WhatsApp na configuração
window.checkWhatsAppStatus = function() {
    window.electronAPI.whatsappGetStatus().then(status => {
        const statusDot = document.getElementById('whatsapp-config-status-dot');
        const statusText = document.getElementById('whatsapp-config-status-text');
        const lastActivity = document.getElementById('whatsapp-last-activity');
        
        if (statusDot && statusText && lastActivity) {
            if (status.connected) {
                statusDot.className = 'status-dot online';
                statusText.textContent = 'Conectado';
                statusText.style.color = 'var(--verde-esperanca)';
                
                if (status.readyAt) {
                    const readyDate = new Date(status.readyAt);
                    const now = new Date();
                    const diffMs = now - readyDate;
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHours = Math.floor(diffMins / 60);
                    
                    if (diffHours > 0) {
                        lastActivity.textContent = `Há ${diffHours}h ${diffMins % 60}min`;
                    } else {
                        lastActivity.textContent = `Há ${diffMins}min`;
                    }
                } else {
                    lastActivity.textContent = 'Ativo';
                }
                // Não mostrar toast automaticamente para evitar spam
            } else if (status.status === 'initializing') {
                statusDot.className = 'status-dot initializing';
                statusText.textContent = 'Inicializando...';
                statusText.style.color = 'var(--ambar)';
                lastActivity.textContent = 'Aguardando conexão';
            } else {
                statusDot.className = 'status-dot offline';
                statusText.textContent = 'Desconectado';
                statusText.style.color = 'var(--vermelho-sobrio)';
                lastActivity.textContent = 'Não conectado';
            }
        }
    }).catch(error => {
        console.error('Erro ao verificar status WhatsApp:', error);
        // Não mostrar toast para evitar spam
    });
};

// Função para verificar status da chave OpenAI
window.checkOpenAIKeyStatus = function() {
    const openAIKeyInput = document.getElementById('k-ope');
    const statusIndicator = document.getElementById('openai-key-status');
    
    if (!openAIKeyInput || !statusIndicator) return;
    
    const key = openAIKeyInput.value.trim();
    
    if (key.length === 0) {
        statusIndicator.innerHTML = '<i class="fas fa-times-circle" style="color: var(--vermelho-sobrio);"></i> Não configurada';
        statusIndicator.title = 'Chave OpenAI não configurada';
    } else if (key.length < 20) {
        statusIndicator.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--ambar);"></i> Inválida';
        statusIndicator.title = 'Chave OpenAI parece muito curta';
    } else if (key.startsWith('sk-')) {
        statusIndicator.innerHTML = '<i class="fas fa-check-circle" style="color: var(--verde-esperanca);"></i> Configurada';
        statusIndicator.title = 'Chave OpenAI configurada e válida';
    } else {
        statusIndicator.innerHTML = '<i class="fas fa-question-circle" style="color: var(--texto-secundario);"></i> Desconhecida';
        statusIndicator.title = 'Formato de chave OpenAI não reconhecido';
    }
};


// Função para verificar status da chave Google Maps
window.checkGoogleMapsKeyStatus = function() {
    const googleMapsKeyInput = document.getElementById('k-goo');
    const statusIndicator = document.getElementById('google-maps-key-status');
    
    if (!googleMapsKeyInput || !statusIndicator) return;
    
    const key = googleMapsKeyInput.value.trim();
    
    if (key.length === 0) {
        statusIndicator.innerHTML = '<i class="fas fa-times-circle" style="color: var(--vermelho-sobrio);"></i> Não configurada';
        statusIndicator.title = 'Chave Google Maps não configurada';
    } else {
        // Aceita qualquer chave não vazia
        statusIndicator.innerHTML = '<i class="fas fa-check-circle" style="color: var(--verde-esperanca);"></i> Configurada';
        statusIndicator.title = 'Chave Google Maps configurada';
    }
};

// Função para testar a chave Google Maps
window.testGoogleMapsKey = function() {
    const googleMapsKeyInput = document.getElementById('k-goo');
    const key = googleMapsKeyInput?.value.trim();
    
    if (!key) {
        window.showToast('Digite uma chave Google Maps primeiro!', 'error');
        return;
    }
    
    window.showToast('Testando chave Google Maps...', 'info');
    
    // Usar a API do Google Maps para testar a chave
    fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Sao+Paulo&key=${key}`)
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
    })
    .then(data => {
        if (data.status === 'OK') {
            console.log('Resposta da API do Google Maps:', data);
            window.showToast('✅ Chave Google Maps válida! Conectado com sucesso.', 'success');
            
            // Atualizar status
            const statusIndicator = document.getElementById('google-maps-key-status');
            if (statusIndicator) {
                statusIndicator.innerHTML = '<i class="fas fa-check-circle" style="color: var(--verde-esperanca);"></i> Válida e testada';
                statusIndicator.title = 'Chave Google Maps testada e funcionando';
            }
        } else {
            throw new Error(`Status da API: ${data.status}`);
        }
    })
    .catch(error => {
        console.error('Erro ao testar chave Google Maps:', error);
        window.showToast(`❌ Erro ao testar chave: ${error.message}`, 'error');
        
        const statusIndicator = document.getElementById('google-maps-key-status');
        if (statusIndicator) {
            statusIndicator.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--vermelho-sobrio);"></i> Erro no teste';
            statusIndicator.title = `Erro ao testar chave: ${error.message}`;
        }
    });
};

// Função para testar a chave OpenAI
window.testOpenAIKey = function() {
    const openAIKeyInput = document.getElementById('k-ope');
    const key = openAIKeyInput?.value.trim();
    
    if (!key) {
        window.showToast('Digite uma chave OpenAI primeiro!', 'error');
        return;
    }
    
    if (!key.startsWith('sk-')) {
        window.showToast('Formato de chave inválido. Deve começar com "sk-"', 'error');
        return;
    }
    
    window.showToast('Testando chave OpenAI...', 'info');
    
    // Usar a API do OpenAI para testar a chave
    fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
    })
    .then(data => {
        console.log('Resposta da API da OpenAI:', data);
        window.showToast('✅ Chave OpenAI válida! Conectado com sucesso.', 'success');
        
        // Atualizar status
        const statusIndicator = document.getElementById('openai-key-status');
        if (statusIndicator) {
            statusIndicator.innerHTML = '<i class="fas fa-check-circle" style="color: var(--verde-esperanca);"></i> Válida e testada';
            statusIndicator.title = 'Chave OpenAI testada e funcionando';
        }
    })
    .catch(error => {
        console.error('Erro ao testar chave OpenAI:', error);
        window.showToast(`❌ Erro ao testar chave: ${error.message}`, 'error');
        
        const statusIndicator = document.getElementById('openai-key-status');
        if (statusIndicator) {
            statusIndicator.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--vermelho-sobrio);"></i> Erro no teste';
            statusIndicator.title = `Erro ao testar chave: ${error.message}`;
        }
    });
};

// Função para mostrar ajuda sobre a chave OpenAI
window.showOpenAIHelp = function() {
    const helpMessage = `
        <div style="padding: 20px;">
            <h3 style="color: var(--terra); margin-bottom: 15px;">Como obter sua chave OpenAI</h3>
            <ol style="margin-left: 20px; margin-bottom: 15px;">
                <li>Acesse <a href="https://platform.openai.com/api-keys" target="_blank" style="color: var(--verde-esperanca);">platform.openai.com/api-keys</a></li>
                <li>Faça login ou crie uma conta</li>
                <li>Clique em "Create new secret key"</li>
                <li>Dê um nome à chave (ex: "Ceia Delivery")</li>
                <li>Copie a chave gerada (começa com "sk-")</li>
                <li>Cole no campo acima e clique em "Testar Chave"</li>
            </ol>
            <p style="color: var(--texto-secundario); font-size: 14px;">
                <strong>Nota:</strong> A chave é necessária para funcionalidades de IA, como importação de cardápio e processamento de texto.
            </p>
        </div>
    `;
    
    // Criar modal de ajuda
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 2000;';
    
    modal.innerHTML = `
        <div class="modal" style="max-width: 500px; background: var(--branco-quente); padding: 25px; border-radius: 12px; border: 1px solid var(--borda-quente);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="color: var(--terra); margin: 0;">Ajuda - Chave OpenAI</h3>
                <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; font-size: 20px; color: var(--texto-secundario); cursor: pointer;">×</button>
            </div>
            ${helpMessage}
            <div style="margin-top: 20px; text-align: right;">
                <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fechar ao clicar fora
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
};

window.generateWhatsAppQR = function() {
    // Primeiro inicializa o WhatsApp
    window.electronAPI.whatsappInitialize().then(initResult => {
        if (!initResult.success) {
            window.showToast('Erro ao inicializar WhatsApp: ' + initResult.error, 'error');
            return;
        }
        
        window.showToast('WhatsApp inicializando... Aguarde o QR Code aparecer.', 'info');
        
        // Tentar obter o QR Code a cada 2 segundos até conseguir
        const checkQR = setInterval(() => {
            window.electronAPI.whatsappGetQr().then(result => {
                if (result.success && result.qrImage) {
                    clearInterval(checkQR);
                    const qrContainer = document.getElementById('whatsapp-qr-container-config');
                    const qrImage = document.getElementById('whatsapp-qr-image-config');
                    
                    if (qrContainer && qrImage) {
                        qrImage.src = result.qrImage;
                        qrContainer.style.display = 'block';
                        window.showToast('QR Code gerado! Escaneie com o WhatsApp.', 'success');
                    }
                } else if (result.message && result.message.includes('não inicializado')) {
                    // WhatsApp ainda não inicializado, continuar tentando
                    console.log('WhatsApp ainda não inicializado, tentando novamente...');
                } else {
                    console.log('Aguardando QR Code:', result.message);
                }
            }).catch(error => {
                console.error('Erro ao obter QR Code:', error);
            });
        }, 2000);
        
        // Timeout após 30 segundos
        setTimeout(() => {
            clearInterval(checkQR);
            window.showToast('Timeout ao aguardar QR Code. Tente novamente.', 'error');
        }, 30000);
        
    }).catch(error => {
        console.error('Erro ao inicializar WhatsApp:', error);
        window.showToast('Erro ao inicializar WhatsApp: ' + error.message, 'error');
    });
};

window.restartWhatsAppConnection = function() {
    // Reiniciar sem confirmação
    window.electronAPI.whatsappRestart().then(result => {
        if (result.success) {
            window.showToast('Reiniciando conexão WhatsApp...', 'info');
            // Atualizar status após alguns segundos
            setTimeout(() => {
                window.checkWhatsAppStatus();
            }, 3000);
        } else {
            window.showToast('Erro ao reiniciar: ' + (result.error || 'Desconhecido'), 'error');
        }
    }).catch(error => {
        console.error('Erro ao reiniciar WhatsApp:', error);
        window.showToast('Erro ao reiniciar conexão', 'error');
    });
};

window.clearWhatsAppSession = function() {
    // Limpar sessão sem confirmação
    window.electronAPI.whatsappClearSession().then(result => {
        if (result.success) {
            window.showToast('Sessão limpa! Reinicie o aplicativo.', 'success');
        } else {
            window.showToast('Erro ao limpar sessão: ' + result.error, 'error');
        }
    });
};

// Função para verificar status do WhatsApp (simplificada - apenas para dashboard)
window.checkWhatsAppStatusForDashboard = function() {
    return window.electronAPI.whatsappGetStatus().then(status => {
        return {
            online: status.connected || false,
            simpleStatus: status.connected ? 'conectado' : 'desconectado'
        };
    });
};

// Funções adicionais (mantidas para compatibilidade)
window.inviteDriver = function() {
    window.sendTelegramInviteToWhatsApp();
};

window.saveConfig = function() {
    window.saveC();
};

window.closeCashier = function() {
    window.showToast('Use o dashboard para fechar o caixa com os dados do sistema.', 'info');
    // Em vez de prompt, usar dados do sistema
    const countedCash = window.pendingOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const operatorName = 'Sistema';
    
    window.electronAPI.cashierClose({ countedCash, operatorName, ordersFromRenderer: window.pendingOrders }).then(result => {
        window.showToast(result.message, 'success');
    });
};

// Voz do Registro (✔️) - Toast no canto inferior esquerdo
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-notification');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast ceia-interactive';
    
    // Ícone baseado no tipo
    let icon = 'fas fa-check';
    if (type === 'error') icon = 'fas fa-exclamation-circle';
    if (type === 'warning') icon = 'fas fa-exclamation-triangle';
    if (type === 'info') icon = 'fas fa-info-circle';
    
    toast.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    // Remover toasts antigos se houver muitos
    const existingToasts = container.querySelectorAll('.toast');
    if (existingToasts.length > 3) {
        existingToasts[0].remove();
    }
    
    container.appendChild(toast);
    
    // Remover após 2.5s (conforme manifesto)
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 150);
        }
    }, 2500);
    
    // Clique para remover imediatamente
    toast.addEventListener('click', () => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 150);
    });
};

// Função para mostrar erro em input (Voz do Erro Real)
window.showInputError = function(inputId, message) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    input.classList.add('ceia-input-error');
    
    // Remover mensagem anterior
    const existingMessage = input.parentNode.querySelector('.ceia-input-message');
    if (existingMessage) existingMessage.remove();
    
    // Adicionar nova mensagem
    const errorDiv = document.createElement('div');
    errorDiv.className = 'ceia-input-message';
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    
    input.parentNode.appendChild(errorDiv);
    
    // Remover erro quando o input for alterado
    const removeError = () => {
        input.classList.remove('ceia-input-error');
        if (errorDiv.parentNode) errorDiv.remove();
        input.removeEventListener('input', removeError);
        input.removeEventListener('change', removeError);
    };
    
    input.addEventListener('input', removeError);
    input.addEventListener('change', removeError);
};

// Dashboard functions
window.renderDashboardStats = async function() {
    try {
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
            console.warn('Erro ao buscar resumo do dashboard:', e);
        }
        
        // Atualiza cards
        const safeSet = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        
        safeSet('orders-today', String(summary.today_orders_count || 0));
        safeSet('orders-in-kitchen', String(summary.orders_in_kitchen || 0));
        safeSet('fleet-online', String(window.config.fleet?.length || 0)); // Mostrar total de entregadores registrados
        
        const financeEl = document.getElementById('finance-total-hoje');
        if (financeEl) {
            const valor = (summary.today_sales || 0).toFixed(2).replace('.', ',');
            financeEl.textContent = `R$ ${valor}`;
        }
        
        // Atualiza status da loja
        const isPaused = window.config.botPaused === true;
        const statusValue = document.getElementById('dashboard-status-value');
        if (statusValue) {
            statusValue.textContent = isPaused ? 'Pausada' : 'Ativa';
        }
        
        // Atualiza botão de pausa
        const pauseBtn = document.getElementById('btn-pause-dashboard');
        if (pauseBtn) {
            if (isPaused) {
                pauseBtn.innerHTML = '<i class="fas fa-play"></i> Retomar Loja';
                pauseBtn.classList.remove('btn-primary');
                pauseBtn.classList.add('btn-success');
            } else {
                pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Pausar Loja';
                pauseBtn.classList.remove('btn-success');
                pauseBtn.classList.add('btn-primary');
            }
        }
        
        // Renderiza feed da frota
        window.renderFleetFeed();
        
        // Renderiza últimos pedidos
        window.renderDashboardLastOrders();
        
        // Renderiza oportunidades
        window.renderDashboardOpportunities();
    } catch (error) {
        console.error('Erro em renderDashboardStats:', error);
    }
};

window.renderFleetFeed = function() {
    // Renderiza feed no dashboard
    const dashboardFeed = document.getElementById('dashboard-fleet-feed-list');
    if (dashboardFeed) {
        const fleet = window.config.fleet || [];
        const now = Date.now();
        
        // Filtra motoristas ativos (últimos 30 minutos)
        const activeDrivers = fleet.filter(driver => {
            const lastSeen = window.driverLastSeen[driver.phone] || 0;
            return lastSeen && (now - lastSeen) < 30 * 60000;
        });
        
        if (activeDrivers.length === 0) {
            dashboardFeed.innerHTML = `
                <div class="fleet-feed-item">
                    <span class="feed-item-icon">👋</span>
                    <div class="feed-item-content">
                        <strong>Sistema pronto</strong> · Aguardando atividade da frota
                    </div>
                    <div class="feed-item-time">agora</div>
                </div>
            `;
        } else {
            dashboardFeed.innerHTML = '';
            activeDrivers.slice(0, 5).forEach(driver => {
                const lastSeen = window.driverLastSeen[driver.phone] || 0;
                const minutesAgo = Math.floor((now - lastSeen) / 60000);
                
                // Mensagens mais humanas
                let activityText = '';
                if (minutesAgo < 5) {
                    activityText = `está em serviço agora`;
                } else if (minutesAgo < 15) {
                    activityText = `está em rota há ${minutesAgo} minutos`;
                } else {
                    activityText = `está trabalhando`;
                }
                
                const item = document.createElement('div');
                item.className = 'fleet-feed-item';
                item.innerHTML = `
                    <span class="feed-item-icon">🛵</span>
                    <div class="feed-item-content">
                        <strong>${driver.name}</strong> ${activityText}
                    </div>
                    <div class="feed-item-time">${minutesAgo} min</div>
                `;
                dashboardFeed.appendChild(item);
            });
        }
    }
    
    // Renderiza feed no painel de frota (se estiver visível)
    const fleetPanelFeed = document.getElementById('fleet-feed-list');
    if (fleetPanelFeed && document.getElementById('fleet-panel').classList.contains('active')) {
        const fleet = window.config.fleet || [];
        const now = Date.now();
        
        const activeDrivers = fleet.filter(driver => {
            const lastSeen = window.driverLastSeen[driver.phone] || 0;
            return lastSeen && (now - lastSeen) < 30 * 60000;
        });
        
        if (activeDrivers.length === 0) {
            fleetPanelFeed.innerHTML = `
                <div class="feed-item">
                    <span class="feed-icon">👋</span>
                    <span class="feed-text">
                        Aguardando entregadores compartilharem localização
                    </span>
                </div>
            `;
        } else {
            fleetPanelFeed.innerHTML = '';
            activeDrivers.slice(0, 5).forEach(driver => {
                const lastSeen = window.driverLastSeen[driver.phone] || 0;
                const minutesAgo = Math.floor((now - lastSeen) / 60000);
                
                let activityText = '';
                if (minutesAgo < 5) {
                    activityText = `em serviço agora`;
                } else {
                    activityText = `em rota há ${minutesAgo} minutos`;
                }
                
                const item = document.createElement('div');
                item.className = 'feed-item';
                item.innerHTML = `
                    <span class="feed-icon">🛵</span>
                    <span class="feed-text">
                        <strong>${driver.name}</strong> ${activityText}
                    </span>
                    <span class="feed-time">${minutesAgo} min</span>
                `;
                fleetPanelFeed.appendChild(item);
            });
        }
    }
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

// Função centralizada para validar dados do produto
window.validateProductData = function(productData) {
    const errors = [];
    
    if (!productData.name || productData.name.trim() === '') {
        errors.push('Nome do produto é obrigatório');
    }
    
    if (isNaN(productData.price) || productData.price < 0) {
        errors.push('Preço deve ser um número válido maior ou igual a zero');
    }
    
    if (productData.promoPrice !== null && productData.promoPrice !== undefined) {
        if (isNaN(productData.promoPrice) || productData.promoPrice < 0) {
            errors.push('Preço promocional deve ser um número válido maior ou igual a zero');
        }
        if (productData.promoPrice >= productData.price) {
            errors.push('Preço promocional deve ser menor que o preço original');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
};

// Função para verificar status do WhatsApp quando a aba de configurações é aberta
window.checkWhatsAppOnConfigOpen = function() {
    if (document.getElementById('config-panel').classList.contains('active')) {
        window.checkWhatsAppStatus();
        window.checkTelegramStatus(); // Também verificar o Telegram
    }
};

// Função para verificar status do Telegram Bot
window.checkTelegramStatus = function() {
    const statusDot = document.getElementById('telegram-config-status-dot');
    const statusText = document.getElementById('telegram-config-status-text');
    const lastActivity = document.getElementById('telegram-last-activity');

    if (!statusDot || !statusText || !lastActivity) return;

    // Assumimos que o status do bot Telegram é enviado via 'bot-status' do main.js
    // Por enquanto, vamos apenas exibir um status padrão ou o último conhecido
    statusDot.className = 'status-dot initializing';
    statusText.textContent = 'Verificando...';
    statusText.style.color = 'var(--ambar)';
    lastActivity.textContent = 'Aguardando atualização...';

    // O status real será atualizado pelo evento 'bot-status' vindo do main.js
    // que é disparado na inicialização e em caso de erro.
    // Podemos adicionar um IPC invoke aqui se quisermos um check manual mais direto,
    // mas o 'bot-status' já deve cobrir a maioria dos casos.
    // Exemplo de IPC invoke (se main.js tiver um handler para isso):
    // window.electronAPI.getTelegramBotStatus().then(status => {
    //     window.updateTelegramStatusUI(status);
    // });
};

// Função para reiniciar o bot Telegram
window.restartTelegramBot = function() {
    window.showToast('Reiniciando bot Telegram...', 'info');
    // Enviar um evento para o main.js para reiniciar o bot
    window.electronAPI.restartTelegramBot().then(result => {
        if (result.success) {
            window.showToast('Bot Telegram reiniciado com sucesso!', 'success');
            window.checkTelegramStatus(); // Atualizar UI após reinício
        } else {
            window.showToast(`Erro ao reiniciar bot Telegram: ${result.error}`, 'error');
        }
    }).catch(error => {
        window.showToast(`Erro ao reiniciar bot Telegram: ${error.message}`, 'error');
    });
};

// Função para atualizar a UI do status do Telegram
window.updateTelegramStatusUI = function(data) {
    const statusDot = document.getElementById('telegram-config-status-dot');
    const statusText = document.getElementById('telegram-config-status-text');
    const lastActivity = document.getElementById('telegram-last-activity');

    if (!statusDot || !statusText || !lastActivity) return;

    if (data.online) {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'Conectado';
        statusText.style.color = 'var(--verde-esperanca)';
        lastActivity.textContent = `Última atividade: ${new Date(data.timestamp).toLocaleTimeString()}`;
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Desconectado';
        statusText.style.color = 'var(--vermelho-sobrio)';
        lastActivity.textContent = `Erro: ${data.message || 'Desconhecido'}`;
    }
};

// Função para adicionar botão de salvar configurações se não existir
window.ensureSaveButton = function() {
    const configPanel = document.getElementById('config-panel');
    if (!configPanel) return;
    
    // Verificar se já existe um botão de salvar
    const existingButton = configPanel.querySelector('#btn-save-config');
    if (existingButton) return;
    
    // Criar botão de salvar
    const saveButton = document.createElement('button');
    saveButton.id = 'btn-save-config';
    saveButton.className = 'btn btn-primary';
    saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar Configurações';
    saveButton.style.marginTop = '20px';
    saveButton.style.padding = '12px 24px';
    saveButton.style.fontSize = '16px';
    saveButton.style.display = 'flex';
    saveButton.style.alignItems = 'center';
    saveButton.style.gap = '8px';
    saveButton.style.marginLeft = 'auto';
    saveButton.style.marginRight = 'auto';
    
    // Adicionar evento de clique
    saveButton.addEventListener('click', function() {
        window.saveConfig();
    });
    
    // Encontrar um local apropriado para adicionar o botão
    const configContent = configPanel.querySelector('.panel-content') || configPanel;
    configContent.appendChild(saveButton);
    
    // Adicionar evento onBlur para salvar automaticamente quando o usuário sai do campo
    const configInputs = configPanel.querySelectorAll('input, textarea');
    configInputs.forEach(input => {
        // Remover event listeners antigos para evitar duplicação
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        
        // Adicionar evento onBlur
        newInput.addEventListener('blur', function() {
            // Pequeno delay para garantir que o valor foi atualizado
            setTimeout(() => {
                window.saveConfig();
            }, 100);
        });
    });
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Iniciando aplicativo...');
        
        // Interceptar cliques em links externos para abrir no navegador do sistema
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href^="http"]');
            if (link && link.getAttribute('href').startsWith('http')) {
                e.preventDefault();
                e.stopPropagation();
                window.openExternalLink(link.getAttribute('href'));
                return false;
            }
        });
        
        // Configurar navegação
        const navItems = document.querySelectorAll('.nav-item');
        if (navItems.length === 0) {
            console.warn('Nenhum item de navegação encontrado');
        } else {
            navItems.forEach((item) => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const panelId = item.getAttribute('data-panel');
                    console.log(`Navegação para: ${panelId}`);
                    window.nav(panelId);
                    
                    // Ações específicas por painel
                    if (panelId === 'config-panel') {
                        setTimeout(() => {
                            window.checkWhatsAppStatus();
                            // Carregar configurações nos campos
                            window.loadConfigToForm();
                            // Garantir que o botão de salvar existe
                            window.ensureSaveButton();
                        }, 100);
                    }
                    if (panelId === 'golden-rules-panel') {
                        setTimeout(() => {
                            window.loadGoldenRules();
                        }, 100);
                    }
                    if (panelId === 'menu-panel') {
                        setTimeout(() => {
                            window.initMenu();
                        }, 100);
                    }
                });
            });
        }
        
        // Ativar painel home inicial
        setTimeout(() => {
            document.querySelectorAll('.panel').forEach(panel => {
                panel.classList.remove('active');
            });
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });
            
            const homePanel = document.getElementById('home-panel');
            const homeNavItem = document.querySelector('[data-panel="home-panel"]');
            if (homePanel && homeNavItem) {
                homePanel.classList.add('active');
                homeNavItem.classList.add('active');
                console.log('Painel home ativado');
            }
        }, 100);

        // Configurar botão de pausa
        const btnPause = document.getElementById('btn-pause');
        if (btnPause) {
            btnPause.addEventListener('click', window.togglePause);
        }

        // Carregar configuração
        window.config = await window.electronAPI.loadConfig();
        console.log('Configuração carregada');
        
        // Preencher campos de configuração
        if (window.config) {
            window.loadConfigToForm();
            
            const goldenRulesText = document.getElementById('golden-rules-text');
            if (goldenRulesText && window.config.goldenRules) {
                goldenRulesText.value = window.config.goldenRules;
            }
            
            // Atualizar botão de pausa
            if (btnPause && window.config.botPaused) {
                btnPause.innerHTML = '<i class="fas fa-play"></i> Retomar Loja';
                btnPause.className = 'btn btn-success';
            }
            const dashboardPauseBtn = document.getElementById('btn-pause-dashboard');
            if (dashboardPauseBtn) {
                if (window.config.botPaused) {
                    dashboardPauseBtn.classList.add('paused');
                    dashboardPauseBtn.innerHTML = '<span class="pause-icone">▶️</span><span class="pause-texto">RETOMAR LOJA</span>';
                } else {
                    dashboardPauseBtn.classList.remove('paused');
                    dashboardPauseBtn.innerHTML = '<span class="pause-icone">⏸️</span><span class="pause-texto">PAUSAR LOJA</span>';
                }
            }
        }

        // Configurar listeners de eventos
        window.electronAPI.onDriverPos((event, data) => {
            console.log('Posição do entregador atualizada:', data);
            // Usar timestamp do GPS se disponível, caso contrário usar o tempo atual
            window.driverLastSeen[data.phone] = data.timestamp || Date.now();
            
            // Verificar se é rastreamento em tempo real
            if (data.liveTracking) {
                console.log('Rastreamento em tempo real:', data.lat, data.lng);
            }
            
            window.renderFleet();
            window.renderDashboardStats();
        });

        // Listener para confirmação de registro de entregador
        window.electronAPI.onDriverRegisteredAck((event, data) => {
            console.log('Confirmação de registro de entregador recebida:', data);
            if (data.success) {
                window.showToast(`✅ Entregador ${data.driver.name} registrado com sucesso!`, 'success');
                // As funções renderFleet() e renderDashboardStats() serão chamadas pelo listener 'config-updated'
                // após a atualização da configuração global.
            } else {
                window.showToast(`❌ Erro ao registrar entregador: ${data.error}`, 'error');
            }
        });

        // Adicionar listener para atualizações de configuração
        window.electronAPI.onConfigUpdated((event, newConfig) => {
            console.log('Configuração atualizada recebida do main.js:', newConfig);
            Object.assign(window.config, newConfig); // Atualiza o objeto de configuração global
            window.renderFleet(); // Re-renderiza a frota com a configuração atualizada (função renomeada)
            window.renderDashboardStats(); // Re-renderiza o dashboard com a configuração atualizada
            
            // Atualiza o painel de cardápio se estiver ativo
            if (document.getElementById('menu-panel').classList.contains('active')) {
                window.initMenu();
            }
            
            // Também atualiza o formulário de configuração se estiver aberto
            if (document.getElementById('config-panel').classList.contains('active')) {
                window.loadConfigToForm();
            }
        });

        window.electronAPI.onWhatsappQrUpdated((event, data) => {
            console.log('QR Code do WhatsApp atualizado');
            
            const qrContainerConfig = document.getElementById('whatsapp-qr-container-config');
            const qrImageConfig = document.getElementById('whatsapp-qr-image-config');
            
            if (qrContainerConfig && qrImageConfig && data.qrImage) {
                qrImageConfig.src = data.qrImage;
                qrContainerConfig.style.display = 'block';
            }
            
            window.checkWhatsAppStatus();
            
            if (document.getElementById('config-panel').classList.contains('active')) {
                window.showToast('QR Code do WhatsApp atualizado!', 'success');
            }
        });

        window.electronAPI.onDriverAccepted((event, data) => {
            console.log('Entregador aceitou o pedido:', data);
            window.showToast(`Motoboy ${data.driverName} aceitou o pedido ${data.orderId}`, 'success');
        });

        window.electronAPI.onShowQR((event, qrUrl) => {
            window.showToast('QR Code recebido: ' + qrUrl, 'success');
        });

        // Listener para status geral do bot (pode ser WhatsApp ou Telegram)
        window.electronAPI.onBotStatus((event, data) => {
            console.log('[renderer.js] Status geral do bot recebido:', data);
            // Este listener pode ser para um toast genérico ou para depuração
            window.showToast(`Bot ${data.botType || 'Geral'} ${data.online ? 'online' : 'offline'}: ${data.message}`, data.online ? 'success' : 'error');
        });

        // Listener específico para status do Telegram Bot
        window.electronAPI.onTelegramBotStatus((event, data) => {
            console.log('[renderer.js] Status do bot do Telegram recebido:', data);
            window.updateTelegramStatusUI(data);
        });

        // Inicializar componentes
        window.renderFleet(); // Agora chama a função renomeada
        // Não chamar renderT() aqui - o novo sistema de cardápio usa initMenu()
        window.loadPrinters();
        window.initMap();
        window.updateDashboard();
        window.renderDashboardStats();
        
        // Inicializar monitor de rede Wi-Fi (refatorado)
        if (window.networkMonitor && window.networkMonitor.init && window.electronAPI && window.electronAPI.getNetworkStatus) {
            setTimeout(() => {
                window.networkMonitor.init();
            }, 1000); // Aguardar 1 segundo para o sistema estabilizar
        } else {
            console.warn('Monitor de rede não disponível');
        }
        
        // Carregar configuração de impressora
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
        
        // Atualização periódica do dashboard
        setInterval(() => {
            window.renderDashboardStats();
        }, 30000);
        
        console.log('Aplicativo inicializado com sucesso');
        
        // Conectar botão de envio de convite
        setTimeout(() => {
            const btnEnviarConvite = document.getElementById('btn-enviar-convite');
            const inputTelefone = document.getElementById('fleet-invite-phone');
            
            if (btnEnviarConvite && inputTelefone) {
                console.log('✅ Botão e campo de telefone para convite de frota encontrados.');
                
                // Usar a função já existente window.sendTelegramInviteToWhatsApp
                // que já está configurada para usar o link do backend
                btnEnviarConvite.addEventListener('click', window.sendTelegramInviteToWhatsApp);
            } else {
                console.warn('⚠️ Botão ou campo de telefone para convite de frota não encontrados.');
            }
            
            window.showToast('Sistema Ceia carregado com sucesso!', 'success');
        }, 1000);
        
    } catch (error) {
        console.error('Erro durante a inicialização:', error);
        const errorDiv = document.getElementById('app-error');
        const errorMsg = document.getElementById('error-message');
        if (errorDiv && errorMsg) {
            errorMsg.textContent = error.message;
            errorDiv.style.display = 'block';
        }
        window.showErrorWithInstruction(
            'Erro ao inicializar o aplicativo.',
            'Verifique sua conexão e reinicie o aplicativo.'
        );
    }
});
