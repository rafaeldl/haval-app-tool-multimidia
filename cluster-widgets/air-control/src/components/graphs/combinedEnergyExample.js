/**
 * Exemplo de uso do Combined Energy Chart
 *
 * Este arquivo demonstra como integrar o widget de energia combinada
 * com o sistema de estado existente do projeto.
 */

import { getState, subscribe } from '../../state.js';
import { div } from '../../utils/createElement.js';
import { createCombinedEnergyChart } from './combinedEnergyChart.js';

// ============================================================================
// Exemplo 1: Integração com State Manager
// ============================================================================

/**
 * Cria a tela do gráfico de energia combinada
 * Integrado com o sistema de estado existente
 */
export function createCombinedEnergyScreen() {
    // Container principal 452x452
    const container = div({ className: 'combined-energy-container' });
    container.style.cssText = `
        position: relative;
        width: 452px;
        height: 452px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    // Canvas para o gráfico
    const canvas = document.createElement('canvas');
    canvas.id = 'combined-energy-chart';
    canvas.className = 'combined-energy-chart';
    container.appendChild(canvas);

    // Estado local para métricas
    let currentMetrics = {
        evPctInstant: 0,
        kmLInstant: 0,
        kwh100Avg: 0
    };

    // Função getter para os plugins de overlay
    function getMetrics() {
        return currentMetrics;
    }

    // Referência ao gráfico
    let energyChart = null;
    let updateInterval = null;

    // Inicializar após DOM estar pronto
    setTimeout(() => {
        // Criar o gráfico
        energyChart = createCombinedEnergyChart(canvas, getMetrics, {
            width: 452,
            height: 452,
            duration: 30000,     // 30 segundos de histórico
            refresh: 250,        // Refresh a cada 250ms
            evYMin: -50,         // EV% range: -50 a 50
            evYMax: 50,
            kmLYMin: 0,          // km/L range: 0 a 40
            kmLYMax: 40,
            evColor: '#00c3ff',
            kmLColor: '#9affb5',
            ringColor: '#1d4ed8'
        });

        // Coletar dados a cada 1 segundo
        updateInterval = setInterval(() => {
            // Ler valores do estado global
            const evConsumption = getState('evConsumption') || 0;
            const gasConsumption = getState('gasConsumption') || 0;
            const gasConsumptionIdle = getState('gasConsumptionIdle') || 0;

            // Calcular métricas
            // evPctInstant: Porcentagem de energia EV (pode ser negativo para regeneração)
            currentMetrics.evPctInstant = evConsumption;

            // kmLInstant: Consumo instantâneo em km/L
            // Usa gasConsumption quando em movimento, gasConsumptionIdle quando parado
            currentMetrics.kmLInstant = gasConsumption > 0 ? gasConsumption : 0;

            // kwh100Avg: Média de kWh/100km (calculada ou do estado)
            // Este valor deve ser calculado baseado no histórico de consumo
            const kwh100Avg = getState('kwh100Avg');
            if (kwh100Avg !== undefined) {
                currentMetrics.kwh100Avg = kwh100Avg;
            }

            // Enviar amostra para o streaming
            energyChart.pushSample({
                evPctInstant: currentMetrics.evPctInstant,
                kmLInstant: currentMetrics.kmLInstant
            });

        }, 1000);

        // Inscrever-se para atualizações do estado
        subscribe('evConsumption', (value) => {
            currentMetrics.evPctInstant = value;
        });

        subscribe('gasConsumption', (value) => {
            if (value > 0) {
                currentMetrics.kmLInstant = value;
            }
        });

        subscribe('kwh100Avg', (value) => {
            if (value !== undefined) {
                currentMetrics.kwh100Avg = value;
            }
        });

    }, 0);

    // Cleanup function
    container.cleanup = () => {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        if (energyChart) {
            energyChart.destroy();
            energyChart = null;
        }
    };

    return container;
}

// ============================================================================
// Exemplo 2: Uso Standalone com Dados Simulados
// ============================================================================

/**
 * Cria um widget standalone com dados simulados para demonstração
 *
 * @param {HTMLElement} parentElement - Elemento pai onde inserir o widget
 * @returns {Object} - { container, chart, start, stop }
 */
export function createDemoEnergyWidget(parentElement) {
    // Criar container
    const container = document.createElement('div');
    container.style.cssText = `
        position: relative;
        width: 452px;
        height: 452px;
        background: radial-gradient(circle at center, #0a1628 0%, #050a14 100%);
        border-radius: 50%;
        overflow: hidden;
    `;

    // Criar canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'demo-energy-chart-' + Date.now();
    container.appendChild(canvas);

    // Adicionar ao DOM
    if (parentElement) {
        parentElement.appendChild(container);
    }

    // Estado de simulação
    let metrics = {
        evPctInstant: 25,
        kmLInstant: 15.5,
        kwh100Avg: 18.3
    };

    // Criar gráfico
    const energyChart = createCombinedEnergyChart(canvas, () => metrics, {
        width: 452,
        height: 452
    });

    // Intervalo de simulação
    let simulationInterval = null;

    // Gerar dados realistas de simulação
    function simulateData() {
        // EV% com variação suave (-30 a 50, pode ser negativo para regen)
        metrics.evPctInstant += (Math.random() - 0.45) * 8;
        metrics.evPctInstant = Math.max(-40, Math.min(50, metrics.evPctInstant));

        // km/L com variação suave (5 a 35)
        metrics.kmLInstant += (Math.random() - 0.5) * 3;
        metrics.kmLInstant = Math.max(5, Math.min(35, metrics.kmLInstant));

        // kWh/100km médio com variação lenta (12 a 25)
        metrics.kwh100Avg += (Math.random() - 0.5) * 0.2;
        metrics.kwh100Avg = Math.max(12, Math.min(25, metrics.kwh100Avg));

        // Push sample
        energyChart.pushSample({
            evPctInstant: metrics.evPctInstant,
            kmLInstant: metrics.kmLInstant
        });
    }

    // Funções de controle
    function start() {
        if (!simulationInterval) {
            simulationInterval = setInterval(simulateData, 1000);
        }
    }

    function stop() {
        if (simulationInterval) {
            clearInterval(simulationInterval);
            simulationInterval = null;
        }
    }

    function destroy() {
        stop();
        energyChart.destroy();
        container.remove();
    }

    // Auto-iniciar
    start();

    return {
        container,
        chart: energyChart,
        start,
        stop,
        destroy,
        getMetrics: () => ({ ...metrics }),
        setMetrics: (newMetrics) => {
            Object.assign(metrics, newMetrics);
        }
    };
}

// ============================================================================
// Exemplo 3: Uso Básico Inline
// ============================================================================

/*
 * Código mínimo para criar o widget:
 *
 * ```html
 * <canvas id="energy-chart" width="452" height="452"></canvas>
 * ```
 *
 * ```javascript
 * import { createCombinedEnergyChart } from './combinedEnergyChart.js';
 *
 * // Métricas atuais
 * let metrics = { evPctInstant: 0, kmLInstant: 0, kwh100Avg: 15 };
 *
 * // Criar gráfico
 * const chart = createCombinedEnergyChart(
 *     document.getElementById('energy-chart'),
 *     () => metrics
 * );
 *
 * // Atualizar a cada segundo
 * setInterval(() => {
 *     metrics.evPctInstant = lerEvPercent();      // sua função
 *     metrics.kmLInstant = lerKmL();              // sua função
 *     metrics.kwh100Avg = calcularMediaKwh();     // sua função
 *
 *     chart.pushSample({
 *         evPctInstant: metrics.evPctInstant,
 *         kmLInstant: metrics.kmLInstant
 *     });
 * }, 1000);
 * ```
 */

// ============================================================================
// CSS Sugerido (adicionar ao night.style.css se necessário)
// ============================================================================

/*
.combined-energy-container {
    position: relative;
    width: 452px;
    height: 452px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.combined-energy-chart {
    position: absolute;
    top: 0;
    left: 0;
    width: 452px;
    height: 452px;
}

// Para adicionar sombra interna como nos outros gráficos:
.combined-energy-container::before {
    content: '';
    position: absolute;
    width: 392px;
    height: 392px;
    border-radius: 50%;
    box-shadow: 0 0 12px 5px rgb(0 0 0 / 50%);
    z-index: 1;
    pointer-events: none;
}
*/
