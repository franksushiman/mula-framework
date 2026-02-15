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

// Inicia o carregamento
initialLoad();
