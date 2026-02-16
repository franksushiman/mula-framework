document.addEventListener('DOMContentLoaded', () => {
    // --- Lógica de Navegação (Dock) ---
    const dockItems = document.querySelectorAll('.dock-item');
    const views = document.querySelectorAll('.view-section');

    function switchView(viewId) {
        if (!viewId) {
            console.error('switchView chamada sem viewId.');
            return;
        }
        views.forEach(view => {
            view.classList.remove('active');
        });
        const activeView = document.getElementById(`${viewId}-view`);
        if (activeView) {
            activeView.classList.add('active');
        } else {
            console.error(`[Erro de Navegação] View com ID "${viewId}-view" não foi encontrada no HTML.`);
        }

        dockItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.view === viewId) {
                item.classList.add('active');
            }
        });
    }

    dockItems.forEach(item => {
        item.addEventListener('click', () => {
            const viewId = item.dataset.view;
            switchView(viewId);
        });
    });

    // --- Lógica da Frota ---
    function renderFleet(drivers) {
        const fleetContainer = document.getElementById('fleet-container');
        const onlineCountEl = document.getElementById('online-count');

        if (onlineCountEl) {
            const count = drivers ? drivers.length : 0;
            onlineCountEl.textContent = count;
            if (count > 0) {
                onlineCountEl.classList.add('online');
            } else {
                onlineCountEl.classList.remove('online');
            }
        }

        if (!fleetContainer) return;

        if (!drivers || drivers.length === 0) {
            fleetContainer.innerHTML = '<p>Nenhum motorista online.</p>';
            return;
        }

        // Usando uma tabela para o layout da frota
        const table = `
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nome</th>
                        <th>Localização (Lat, Lon)</th>
                        <th>Última Atualização</th>
                    </tr>
                </thead>
                <tbody>
                    ${drivers.map(driver => `
                        <tr>
                            <td>${driver.id}</td>
                            <td>${driver.firstName || driver.username}</td>
                            <td>${driver.location.latitude.toFixed(4)}, ${driver.location.longitude.toFixed(4)}</td>
                            <td>${new Date(driver.lastUpdate).toLocaleTimeString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        fleetContainer.innerHTML = table;
    }

    // Carrega a frota inicial
    async function initialLoad() {
        try {
            // Prova de vida da comunicação com o backend
            const health = await window.electronAPI.healthPing();
            console.log('✅ Health Check IPC:', health);

            const drivers = await window.electronAPI.getDrivers();
            renderFleet(drivers);
        } catch (error) {
            console.error('Erro ao carregar a frota inicial:', error);
        }
    }

    // Escuta por atualizações em tempo real
    window.electronAPI.onFleetUpdate((drivers) => {
        console.log('Frota atualizada recebida:', drivers);
        renderFleet(drivers);
    });

    // --- Lógica de Ajustes (Settings) ---

    // Elementos DOM
    const btnSaveConfig = document.getElementById('btn-save-config');
    const btnAddItem = document.getElementById('btn-add-item');

    // Função Principal: Carregar Dados da Tela de Ajustes
    async function loadSettingsData() {
        try {
            const config = await window.electronAPI.loadConfig();
            
            // Preencher Inputs de Configuração
            if (config.tech) {
                const openaiInput = document.getElementById('openai-key');
                const whatsappInput = document.getElementById('whatsapp-session');
                if (openaiInput) openaiInput.value = config.tech.openai_api_key || '';
                if (whatsappInput) whatsappInput.value = config.tech.whatsapp_session_id || '';
            }

            // Renderizar Tabela de Menu
            const menu = await window.electronAPI.getMenu();
            renderMenuTable(menu.items || []);
        } catch (error) {
            console.error("Erro ao carregar configs:", error);
        }
    }

    // Função de Renderização da Tabela
    function renderMenuTable(items) {
        const tbody = document.getElementById('settings-menu-body');
        if (!tbody) return;

        tbody.innerHTML = items.map(item => `
            <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 12px 0; font-weight: 500; color: var(--text-main);">${item.name}</td>
                <td style="padding: 12px; color: var(--text-main);">R$ ${parseFloat(item.price).toFixed(2)}</td>
                <td style="padding: 12px;">
                    <span style="background: #eff6ff; color: #2563eb; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 500;">
                        ${item.category}
                    </span>
                </td>
                <td style="padding: 12px;">
                    <span style="color: ${item.paused ? '#dc2626' : '#10b981'}; background: ${item.paused ? '#fef2f2' : '#ecfdf5'}; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">
                        ${item.paused ? 'Pausado' : 'Ativo'}
                    </span>
                </td>
                <td style="text-align: right; padding: 12px 0;">
                    <button onclick="toggleItem('${item.id}')" style="background: none; border: none; cursor: pointer; color: #6b7280; padding: 4px; border-radius: 4px; transition: background 0.2s;">
                        <span class="material-icons-round" style="font-size: 1.2rem;">power_settings_new</span>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // Listener: Salvar Configurações (API Keys)
    if (btnSaveConfig) {
        btnSaveConfig.addEventListener('click', async () => {
            const key = document.getElementById('openai-key').value;
            const session = document.getElementById('whatsapp-session').value;
            
            const configToSave = {
                tech: {
                    openai_api_key: key,
                    whatsapp_session_id: session
                }
            };

            try {
                await window.electronAPI.saveConfig(configToSave);
                alert('Configurações salvas com sucesso!');
            } catch (err) {
                console.error('Erro ao salvar:', err);
                alert('Erro ao salvar configurações.');
            }
        });
    }

    // Listener: Adicionar Novo Item ao Menu
    if (btnAddItem) {
        btnAddItem.addEventListener('click', async () => {
            const nameInput = document.getElementById('new-item-name');
            const priceInput = document.getElementById('new-item-price');
            const categoryInput = document.getElementById('new-item-category');
            
            const name = nameInput.value;
            const price = parseFloat(priceInput.value);
            const category = categoryInput.value;
            
            if (!name || isNaN(price)) {
                alert('Por favor, preencha nome e preço corretamente.');
                return;
            }

            try {
                const menu = await window.electronAPI.getMenu();
                
                // Gera ID único (fallback manual se crypto.randomUUID falhar em contextos antigos)
                const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'item-' + Date.now();

                const newItem = { 
                    id: newId, 
                    name, 
                    price, 
                    category, 
                    paused: false 
                };
                
                // Adiciona ao array existente
                const newItems = [...(menu.items || []), newItem];
                
                // Salva no backend
                await window.electronAPI.saveMenu({ items: newItems });
                
                // Limpa formulário
                nameInput.value = '';
                priceInput.value = '';
                
                // Atualiza tabela visualmente
                renderMenuTable(newItems);
                
            } catch (err) {
                console.error('Erro ao adicionar item:', err);
                alert('Erro ao adicionar item.');
            }
        });
    }

    // Função Global para Toggle (Pausar/Ativar)
    window.toggleItem = async (id) => {
        try {
            const menu = await window.electronAPI.getMenu();
            const item = menu.items.find(i => i.id === id);
            
            if (item) {
                // item.paused === true significa que está pausado (indisponível)
                // Para dataManager.updateItemAvailability, isAvailable = true significa disponível
                // Portanto, se está pausado (true), queremos disponível (true)
                // Se está disponível (false), queremos pausado (false)
                const isNowAvailable = item.paused; // true → true, false → false
                
                await window.electronAPI.updateItemAvailability(id, isNowAvailable);
                
                // Recarrega dados para atualizar a UI
                loadSettingsData();
            }
        } catch (err) {
            console.error('Erro ao alternar item:', err);
        }
    };

    // Hook na navegação: Carregar dados ao clicar na aba Ajustes
    const btnSettingsNav = document.querySelector('.dock-item[data-view="configuracoes"]');
    if (btnSettingsNav) {
        btnSettingsNav.addEventListener('click', loadSettingsData);
    }

    // --- Inicialização ---
    // Ativar a view de configurações por padrão para facilitar o setup
    switchView('configuracoes');

    // Inicia o carregamento da frota
    initialLoad();

    // Carregar dados de ajustes se a aba já estiver ativa (caso de F5 na aba de config)
    if (document.getElementById('configuracoes-view').classList.contains('active')) {
        loadSettingsData();
    }
});
