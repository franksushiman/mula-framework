class FleetService {
    constructor() {
        if (FleetService.instance) {
            return FleetService.instance;
        }
        this.drivers = [];
        FleetService.instance = this;
    }

    /**
     * Adiciona um novo motorista ou atualiza um existente.
     * @param {object} driverData - Dados do motorista. Deve conter um 'id'.
     */
    addOrUpdateDriver(driverData) {
        if (!driverData || !driverData.id) {
            console.error('FleetService: ID do motorista é obrigatório para adicionar ou atualizar.');
            return null;
        }

        const index = this.drivers.findIndex(d => d.id === driverData.id);
        if (index !== -1) {
            // Atualiza o motorista existente, mesclando os dados
            this.drivers[index] = { ...this.drivers[index], ...driverData };
            console.log(`Motorista ${driverData.id} atualizado.`);
            return this.drivers[index];
        } else {
            // Adiciona um novo motorista
            this.drivers.push(driverData);
            console.log(`Novo motorista ${driverData.id} adicionado.`);
            return driverData;
        }
    }

    /**
     * Retorna um motorista pelo ID.
     * @param {string|number} id - O ID do motorista.
     * @returns {object|undefined}
     */
    getDriver(id) {
        return this.drivers.find(d => d.id === id);
    }

    /**
     * Retorna todos os motoristas.
     * @returns {Array<object>}
     */
    getAllDrivers() {
        return this.drivers;
    }

    /**
     * Remove um motorista pelo ID.
     * @param {string|number} id - O ID do motorista.
     */
    removeDriver(id) {
        const initialLength = this.drivers.length;
        this.drivers = this.drivers.filter(d => d.id !== id);
        if (this.drivers.length < initialLength) {
            console.log(`Motorista ${id} removido.`);
        }
    }
}

// Exporta uma instância única (Singleton)
const instance = new FleetService();
module.exports = instance;
