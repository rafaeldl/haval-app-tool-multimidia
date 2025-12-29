/**
 * Combined Energy Chart Widget
 *
 * Widget circular 452x452 unificando EV% e km/L em um único gráfico streaming.
 *
 * Plugins:
 * - circularClip: Recorta o gráfico em formato circular com aro externo
 * - centerOverlay: Exibe kWh/100km médio no centro
 * - sideReadouts: Exibe EV% (esquerda) e km/L (direita)
 */

import { Chart, registerables } from 'chart.js';
import streamingPlugin from 'chartjs-plugin-streaming';
import 'chartjs-adapter-date-fns';

// Registrar plugins globais se ainda não registrados
if (!Chart.registry.plugins.get('streaming')) {
    Chart.register(...registerables, streamingPlugin);
}

// ============================================================================
// PLUGIN: circularClip
// Aplica clipping circular no chartArea e desenha o aro externo azul
// ============================================================================
const circularClipPlugin = {
    id: 'circularClip',

    beforeDatasetsDraw(chart, args, options) {
        if (options.enabled === false) return;

        const { ctx, chartArea } = chart;
        const { left, top, width, height } = chartArea;

        // Calcular centro e raio do círculo
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const radius = Math.min(width, height) / 2;

        ctx.save();

        // Criar path circular para clipping
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
    },

    afterDatasetsDraw(chart, args, options) {
        if (options.enabled === false) return;
        const { ctx } = chart;
        ctx.restore();
    },

    afterDraw(chart, args, options) {
        if (options.enabled === false) return;

        const { ctx, width, height } = chart;

        const centerX = width / 2;
        const centerY = height / 2;
        const outerRadius = Math.min(width, height) / 2 - 2;
        const ringWidth = options.ringWidth || 3;
        const ringColor = options.ringColor || '#1d4ed8';
        const glowColor = options.glowColor || 'rgba(29, 78, 216, 0.7)';
        const glowBlur = options.glowBlur || 15;

        ctx.save();

        // Desenhar glow/sombra do aro
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Desenhar aro externo
        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = ringWidth;
        ctx.stroke();

        ctx.restore();
    }
};

// ============================================================================
// PLUGIN: centerOverlay
// Desenha o valor médio de kWh/100km no centro do gráfico
// ============================================================================
const centerOverlayPlugin = {
    id: 'centerOverlay',

    afterDraw(chart, args, options) {
        if (options.enabled === false) return;

        const { ctx, width, height } = chart;
        const getMetrics = options.getMetricsFn;

        if (!getMetrics) return;

        const metrics = getMetrics();
        const kwh100Avg = metrics.kwh100Avg ?? 0;

        const centerX = width / 2;
        const centerY = height / 2;

        // Configurações de estilo
        const valueFontSize = options.valueFontSize || 72;
        const labelFontSize = options.labelFontSize || 20;
        const fontFamily = options.fontFamily || 'system-ui, -apple-system, sans-serif';
        const textColor = options.textColor || '#ffffff';
        const shadowColor = options.shadowColor || 'rgba(0, 0, 0, 0.5)';
        const shadowBlur = options.shadowBlur || 4;

        ctx.save();

        // Aplicar sombra ao texto
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;

        // Desenhar valor principal (kWh/100km)
        ctx.fillStyle = textColor;
        ctx.font = `600 ${valueFontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const valueText = kwh100Avg.toFixed(1);
        ctx.fillText(valueText, centerX, centerY - 10);

        // Desenhar label
        ctx.font = `300 ${labelFontSize}px ${fontFamily}`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText('kWh/100 km', centerX, centerY + 35);

        ctx.restore();
    }
};

// ============================================================================
// PLUGIN: sideReadouts
// Desenha os valores instantâneos nas laterais (EV% esquerda, km/L direita)
// ============================================================================
const sideReadoutsPlugin = {
    id: 'sideReadouts',

    afterDraw(chart, args, options) {
        if (options.enabled === false) return;

        const { ctx, width, height } = chart;
        const getMetrics = options.getMetricsFn;

        if (!getMetrics) return;

        const metrics = getMetrics();
        const evPctInstant = metrics.evPctInstant ?? 0;
        const kmLInstant = metrics.kmLInstant ?? 0;

        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2;

        // Configurações de estilo
        const valueFontSize = options.valueFontSize || 32;
        const labelFontSize = options.labelFontSize || 14;
        const fontFamily = options.fontFamily || 'system-ui, -apple-system, sans-serif';
        const evColor = options.evColor || '#00c3ff';
        const kmLColor = options.kmLColor || '#9affb5';
        const shadowColor = options.shadowColor || 'rgba(0, 0, 0, 0.5)';
        const horizontalOffset = options.horizontalOffset || 85;
        const verticalOffset = options.verticalOffset || 0;

        ctx.save();

        // Aplicar sombra
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;

        // ========== LADO ESQUERDO: EV% ==========
        const leftX = centerX - horizontalOffset;
        const leftY = centerY + verticalOffset;

        // Valor EV%
        ctx.fillStyle = evColor;
        ctx.font = `500 ${valueFontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Formatar valor (pode ser negativo para regeneração)
        const evText = evPctInstant >= 0
            ? evPctInstant.toFixed(0)
            : evPctInstant.toFixed(0); // Mantém o sinal negativo
        ctx.fillText(evText, leftX, leftY - 8);

        // Label EV%
        ctx.font = `300 ${labelFontSize}px ${fontFamily}`;
        ctx.fillStyle = 'rgba(0, 195, 255, 0.8)';
        ctx.fillText('% EV', leftX, leftY + 18);

        // ========== LADO DIREITO: km/L ==========
        const rightX = centerX + horizontalOffset;
        const rightY = centerY + verticalOffset;

        // Valor km/L
        ctx.fillStyle = kmLColor;
        ctx.font = `500 ${valueFontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const kmLText = kmLInstant.toFixed(1);
        ctx.fillText(kmLText, rightX, rightY - 8);

        // Label km/L
        ctx.font = `300 ${labelFontSize}px ${fontFamily}`;
        ctx.fillStyle = 'rgba(154, 255, 181, 0.8)';
        ctx.fillText('km/L', rightX, rightY + 18);

        ctx.restore();
    }
};

// ============================================================================
// FACTORY: createCombinedEnergyChart
// Cria o gráfico combinado de energia com todos os plugins
// ============================================================================

/**
 * Cria um gráfico circular combinado de energia (EV + Combustão)
 *
 * @param {HTMLCanvasElement} canvas - Elemento canvas para renderizar o gráfico
 * @param {Function} getMetricsFn - Função que retorna { evPctInstant, kmLInstant, kwh100Avg }
 * @param {Object} options - Opções de configuração
 * @returns {Object} - { chart, pushSample, destroy }
 */
export function createCombinedEnergyChart(canvas, getMetricsFn, options = {}) {

    // Configurações padrão
    const config = {
        width: options.width || 452,
        height: options.height || 452,
        duration: options.duration || 30000,      // 30 segundos de histórico
        refresh: options.refresh || 250,           // Atualização a cada 250ms
        evYMin: options.evYMin || -50,
        evYMax: options.evYMax || 50,
        kmLYMin: options.kmLYMin || 0,
        kmLYMax: options.kmLYMax || 40,
        evColor: options.evColor || '#00c3ff',
        kmLColor: options.kmLColor || '#9affb5',
        ringColor: options.ringColor || '#1d4ed8',
        ...options
    };

    // Configurar dimensões do canvas
    canvas.width = config.width;
    canvas.height = config.height;
    canvas.style.width = `${config.width}px`;
    canvas.style.height = `${config.height}px`;

    const ctx = canvas.getContext('2d');

    // Criar instância do Chart
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                // Dataset A: EV% instantâneo (eixo Y esquerdo)
                {
                    label: 'EV %',
                    data: [],
                    yAxisID: 'yLeft',
                    borderColor: config.evColor,
                    backgroundColor: 'rgba(0, 195, 255, 0.15)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3,
                },
                // Dataset B: km/L instantâneo (eixo Y direito)
                {
                    label: 'km/L',
                    data: [],
                    yAxisID: 'yRight',
                    borderColor: config.kmLColor,
                    backgroundColor: 'rgba(154, 255, 181, 0.08)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3,
                }
            ]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: false,
            layout: {
                padding: {
                    top: 30,
                    bottom: 30,
                    left: 30,
                    right: 30
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
                // Configurações dos plugins customizados
                circularClip: {
                    ringWidth: 3,
                    ringColor: config.ringColor,
                    glowColor: 'rgba(29, 78, 216, 0.7)',
                    glowBlur: 15
                },
                centerOverlay: {
                    getMetricsFn: getMetricsFn,
                    valueFontSize: 72,
                    labelFontSize: 20,
                    fontFamily: "'Khand', system-ui, sans-serif",
                    textColor: '#ffffff',
                    shadowColor: 'rgba(0, 0, 0, 0.5)',
                    shadowBlur: 4
                },
                sideReadouts: {
                    getMetricsFn: getMetricsFn,
                    valueFontSize: 32,
                    labelFontSize: 14,
                    fontFamily: "'Khand', system-ui, sans-serif",
                    evColor: config.evColor,
                    kmLColor: config.kmLColor,
                    horizontalOffset: 95,
                    verticalOffset: 0
                }
            },
            scales: {
                x: {
                    type: 'realtime',
                    display: false,
                    realtime: {
                        duration: config.duration,
                        refresh: config.refresh,
                        delay: 0,
                        pause: false,
                        ttl: config.duration * 2
                    }
                },
                yLeft: {
                    type: 'linear',
                    position: 'left',
                    min: config.evYMin,
                    max: config.evYMax,
                    display: false, // Grid discreto - desabilitado
                    grid: {
                        display: false,
                        drawOnChartArea: false
                    },
                    ticks: {
                        display: false
                    }
                },
                yRight: {
                    type: 'linear',
                    position: 'right',
                    min: config.kmLYMin,
                    max: config.kmLYMax,
                    display: false, // Grid discreto - desabilitado
                    grid: {
                        display: false,
                        drawOnChartArea: false
                    },
                    ticks: {
                        display: false
                    }
                }
            }
        },
        plugins: [circularClipPlugin, centerOverlayPlugin, sideReadoutsPlugin]
    });

    /**
     * Adiciona uma nova amostra aos datasets do gráfico
     *
     * @param {Object} sample - { evPctInstant: number, kmLInstant: number }
     */
    function pushSample(sample) {
        const now = Date.now();

        // Dataset 0: EV%
        if (sample.evPctInstant !== undefined) {
            chart.data.datasets[0].data.push({
                x: now,
                y: sample.evPctInstant
            });
        }

        // Dataset 1: km/L
        if (sample.kmLInstant !== undefined) {
            chart.data.datasets[1].data.push({
                x: now,
                y: sample.kmLInstant
            });
        }

        // Atualizar sem animação
        chart.update('none');
    }

    /**
     * Destrói a instância do gráfico
     */
    function destroy() {
        if (chart) {
            chart.destroy();
        }
    }

    /**
     * Atualiza o gráfico manualmente
     */
    function update() {
        chart.update('none');
    }

    return {
        chart,
        pushSample,
        destroy,
        update
    };
}

// ============================================================================
// EXEMPLO DE USO
// ============================================================================

/**
 * Exemplo de integração do widget de energia combinada
 *
 * @example
 * ```javascript
 * import { createCombinedEnergyChart } from './combinedEnergyChart.js';
 *
 * // Estado atual das métricas
 * let currentMetrics = {
 *     evPctInstant: 0,
 *     kmLInstant: 0,
 *     kwh100Avg: 0
 * };
 *
 * // Função que retorna as métricas atuais para os overlays
 * function getMetrics() {
 *     return currentMetrics;
 * }
 *
 * // Criar o canvas
 * const canvas = document.getElementById('combined-energy-chart');
 *
 * // Criar o gráfico
 * const energyChart = createCombinedEnergyChart(canvas, getMetrics, {
 *     width: 452,
 *     height: 452,
 *     duration: 30000,    // 30 segundos de histórico
 *     evYMin: -50,        // EV% pode ser negativo (regeneração)
 *     evYMax: 50,
 *     kmLYMin: 0,
 *     kmLYMax: 40
 * });
 *
 * // Simular dados a cada 1 segundo
 * setInterval(() => {
 *     // Atualizar métricas (simulação)
 *     currentMetrics.evPctInstant = Math.random() * 80 - 30;  // -30 a 50
 *     currentMetrics.kmLInstant = Math.random() * 25 + 5;     // 5 a 30
 *     currentMetrics.kwh100Avg = 15 + Math.random() * 5;      // 15 a 20
 *
 *     // Enviar amostra para o gráfico
 *     energyChart.pushSample({
 *         evPctInstant: currentMetrics.evPctInstant,
 *         kmLInstant: currentMetrics.kmLInstant
 *     });
 * }, 1000);
 *
 * // Para destruir quando não for mais necessário
 * // energyChart.destroy();
 * ```
 */

// ============================================================================
// EXPORTAÇÕES
// ============================================================================

export { circularClipPlugin, centerOverlayPlugin, sideReadoutsPlugin };
