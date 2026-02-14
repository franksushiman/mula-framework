const haversine = require('haversine-distance');

class SmartDispatcher {
    constructor(restaurantLat, restaurantLng) {
        this.restaurantLat = restaurantLat || -23.5505;
        this.restaurantLng = restaurantLng || -46.6333;
    }

    calculateAffinity(order, driver) {
        let score = 0;
        // 1. Distância (base)
        const start = { latitude: this.restaurantLat, longitude: this.restaurantLng };
        const end = { latitude: driver.lat, longitude: driver.lng };
        if (driver.lat && driver.lng) {
            const dist = haversine(start, end);
            score -= (dist / 100); // -1 ponto a cada 100m
        }

        // 2. Prioridade para Fixos
        if (driver.team === 'fixos' || driver.type === 'FIXO') score += 500;

        // 3. Status Livre
        if (!driver.activeOrder) score += 50;

        return score;
    }

    findBestDriver(order, drivers) {
        if (!drivers || !drivers.length) return null;
        
        const scored = drivers.map(d => ({
            driver: d,
            score: this.calculateAffinity(order, d)
        })).sort((a, b) => b.score - a.score);

        return scored[0];
    }
}
module.exports = SmartDispatcher;
