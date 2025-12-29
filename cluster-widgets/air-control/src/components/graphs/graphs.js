import { getState, subscribe } from '../../state.js';
import { div, img, span } from '../../utils/createElement.js';

import { Chart, registerables } from 'chart.js';
import streamingPlugin from 'chartjs-plugin-streaming';
import 'chartjs-adapter-date-fns';
import { WarpTunnelAnimation } from './warpTunnel.js';
import { circularClipPlugin, centerOverlayPlugin, sideReadoutsPlugin } from './combinedEnergyChart.js';

Chart.register(...registerables, streamingPlugin, circularClipPlugin, centerOverlayPlugin, sideReadoutsPlugin);

const HISTORY_DURATION = 30000; //ms
const TIMER_HIDE_DELAY = 30000; //ms
const UI_UPDATE_INTERVAL = 100; //ms
const ACCELERATION_THRESHOLD = 10; //s (ie 100km/h in 5s = 5, 100km/h in 10s = 10)

export const graphList = [
    {
        id: 'combinedEnergy',
        displayLabel: 'Energia Combinada',
        decimalPlaces: 1,
        isCombinedEnergy: true, // Flag para identificar o gráfico combinado
        datasets: [
            {
                label: 'EV %',
                dataKey: 'evConsumption',
                unity: '% EV',
                yAxisID: 'yLeft'
            },
            {
                label: 'km/L',
                dataKey: 'gasConsumption',
                unity: 'km/L',
                yAxisID: 'yRight'
            }
        ]
    },
    {
        id: 'evConsumption',
        displayLabel: 'Consumo EV',
        decimalPlaces: 0,
        datasets: [
            {
                label: 'Consumo EV',
                dataKey: 'evConsumption',
                unity: '% de Energia',
                yAxisID: 'y'
            },
            { label: null, dataKey: null, yAxisID: 'y1' }
        ]
    },
    {
        id: 'gasConsumption',
        displayLabel: 'Consumo Combustão',
        decimalPlaces: 1,
        datasets: [
            {
                label: 'Consumo Instantâneo',
                dataKey: 'gasConsumption',
                unity: 'Km/L',
                yAxisID: 'y'
            },
            {
                label: 'Consumo em Idle',
                dataKey: 'gasConsumptionIdle',
                unity: 'L/hora',
                yAxisID: 'y1'
            }
        ]
    },
    {
        id: 'carSpeed',
        displayLabel: 'Velocidade',
        decimalPlaces: 0,
        datasets: [
            {
                label: 'Velocidade',
                dataKey: 'carSpeed',
                unity: 'km/h',
                yAxisID: 'y'
            },
            {
                label: 'Consumo',
                dataKey: 'gasConsumption',
                unity: 'km/L',
                yAxisID: 'y'
            }
        ]
    },
];

const historicalData = {};

function initializeGlobalDataStore() {
    graphList.forEach(graph => {
        graph.datasets.forEach(dataset => {
            if (dataset.dataKey) {
                historicalData[dataset.dataKey] = [];
            }
        });
    });
}

function startGlobalDataCollector() {
    initializeGlobalDataStore();

    setInterval(() => {
        const now = Date.now();
        const DURATION = HISTORY_DURATION;

        for (const dataKey in historicalData) {
            const value = getState(dataKey);
            if (value !== undefined) {
                historicalData[dataKey].push({ x: now, y: value });

                const firstPoint = historicalData[dataKey][0];
                if (firstPoint && now - firstPoint.x > DURATION) {
                    historicalData[dataKey].shift();
                }
            }
        }
    }, 200);
}

startGlobalDataCollector();

// Métricas para o gráfico combinado de energia
const combinedEnergyMetrics = {
    evPctInstant: 0,
    kmLInstant: 0,
    kwh100Avg: 0
};

function getCombinedEnergyMetrics() {
    return combinedEnergyMetrics;
}

const graphController = {

    colors: {
        primary: '#00c3ff',
        secondary: '#9affb5'
    },

    chartInstance: null,
    isInitialized: false,
    currentGraphId: null,
    lastCarSpeed: getState('carSpeed') || 0.0,
    warpTunnel: null,
    warpTunnelCanvas: null,
    isSpeedTimerRunning: false,
    speedTimerStartTime: 0,
    timerHideTimeoutId: null,
    last0To100Time: null,
    flashTriggered: false,

    triggerFlash(color = 'white') {
        const flashOverlay = document.querySelector('.graph-flash-overlay');
        if (!flashOverlay || this.flashTriggered) return;

        this.flashTriggered = true;
        flashOverlay.style.background = `radial-gradient(circle, white 0%, ${color} 100%)`;
        flashOverlay.classList.add('screen-flash-animation');

        const onAnimationEnd = () => {
            flashOverlay.classList.remove('screen-flash-animation');
            flashOverlay.style.background = '';
            flashOverlay.removeEventListener('animationend', onAnimationEnd);
        };
        flashOverlay.addEventListener('animationend', onAnimationEnd);
    },

    setWarpAnimation(visible) {
        if (!this.warpTunnel || !this.warpTunnelCanvas) return;

        const graphContainer = document.querySelector('.graph-screen');
        if (visible) {
            if (!this.warpTunnelCanvas.classList.contains('visible')) {
                if (graphContainer) graphContainer.classList.add('warp-active');
                this.warpTunnelCanvas.classList.add('visible');
                this.warpTunnel.start();
            }
        } else {
            if (this.warpTunnelCanvas.classList.contains('visible')) {
                this.warpTunnelCanvas.classList.remove('visible');
                setTimeout(() => {
                    if (!this.warpTunnelCanvas.classList.contains('visible')) {
                        if (graphContainer) graphContainer.classList.remove('warp-active');
                        this.warpTunnel.stop();
                    }
                }, 2000);
            }
        }
    },

    setChronometer(action) {
        const tooltip = document.getElementById('timer-tooltip');
        const valueEl = document.getElementById('timer-tooltip-value');

        switch (action) {
            case 'start':
                this.isSpeedTimerRunning = true;
                this.speedTimerStartTime = Date.now();
                this.last0To100Time = null;
                this.flashTriggered = false;
                if (this.timerHideTimeoutId) {
                    clearTimeout(this.timerHideTimeoutId);
                    this.timerHideTimeoutId = null;
                }
                if (tooltip) tooltip.classList.add('visible');
                if (valueEl) valueEl.textContent = '0.0s';
                break;

            case 'stop': // Immediate hide/reset
                this.isSpeedTimerRunning = false;
                this.flashTriggered = false;
                if (tooltip) tooltip.classList.remove('visible');
                break;

            case 'success_hold': // Start 10s timeout to hide
                this.isSpeedTimerRunning = false;
                if (!this.timerHideTimeoutId) {
                    this.timerHideTimeoutId = setTimeout(() => {
                        this.setChronometer('stop');
                        this.timerHideTimeoutId = null;
                    }, TIMER_HIDE_DELAY);
                }
                break;
        }
    },

    init(canvasContext) {
        if (this.isInitialized) return;

        this.warpTunnelCanvas = document.getElementById('warp-tunnel-canvas');
        if (this.warpTunnelCanvas) {
            this.warpTunnel = new WarpTunnelAnimation(this.warpTunnelCanvas);
        }

        this.lastCarSpeed = getState('carSpeed') || 0.0;

        this.chartInstance = new Chart(canvasContext, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: '',
                        backgroundColor: 'rgba(0, 120, 255, 0.15)',
                        borderColor: '#00c3ff',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3,
                        shadowColor: 'rgba(0, 195, 255, 0.5)',
                        shadowBlur: 10,
                    },
                    {
                        label: '',
                        backgroundColor: 'rgba(0, 120, 255, 0.15)',
                        borderColor: '#00c3ff',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3,
                        shadowColor: 'rgba(0, 195, 255, 0.5)',
                        shadowBlur: 10,
                    }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                    // Plugins do gráfico combinado (desabilitados por padrão)
                    circularClip: {
                        enabled: false,
                        ringWidth: 3,
                        ringColor: '#1d4ed8',
                        glowColor: 'rgba(29, 78, 216, 0.7)',
                        glowBlur: 15
                    },
                    centerOverlay: {
                        enabled: false,
                        getMetricsFn: getCombinedEnergyMetrics,
                        valueFontSize: 72,
                        labelFontSize: 20,
                        fontFamily: "'Khand', system-ui, sans-serif",
                        textColor: '#ffffff',
                        shadowColor: 'rgba(0, 0, 0, 0.5)',
                        shadowBlur: 4
                    },
                    sideReadouts: {
                        enabled: false,
                        getMetricsFn: getCombinedEnergyMetrics,
                        valueFontSize: 32,
                        labelFontSize: 14,
                        fontFamily: "'Khand', system-ui, sans-serif",
                        evColor: '#00c3ff',
                        kmLColor: '#9affb5',
                        horizontalOffset: 95,
                        verticalOffset: 0
                    }
                },
                scales: {
                    x: {
                        type: 'realtime',
                        display: false,
                        realtime: {
                            duration: HISTORY_DURATION,
                            refresh: 250
                        }
                    },
                    y: {
                        min: -20,
                        max: 120,
                        ticks: {
                            display: true,
                            padding: 10,
                            stepSize: 20,
                            color: 'rgba(100,172,255,0.7)',
                        },
                        grid: {
                            display: true,
                            drawOnChartArea: true,
                            drawTicks: false,
                            color: 'rgba(0,160,255,0.3)',
                            zeroLineColor: 'rgba(100, 172, 255, 0.8)',
                            zeroLineWidth: 3
                        },
                    },
                    y1: {
                        id: 'y1',
                        position: 'right',
                        min: 0,
                        max: 200,
                        ticks: {
                            display: true,
                            padding: 10,
                            align: 'start',
                            stepSize: 2,
                            color: 'rgba(0, 255, 187, 0.5)',
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    },
                    // Escalas para o gráfico combinado
                    yLeft: {
                        type: 'linear',
                        position: 'left',
                        display: false,
                        min: -50,
                        max: 50,
                        grid: { display: false }
                    },
                    yRight: {
                        type: 'linear',
                        position: 'right',
                        display: false,
                        min: 0,
                        max: 40,
                        grid: { display: false }
                    }
                }
            }
        });

        this.uiUpdateInterval = setInterval(() => {
            try {
                if (!this.isInitialized || !this.currentGraphId) return;

                const graphInfo = graphList.find(g => g.id === this.currentGraphId);
                if (!graphInfo) return;

                const primaryTooltipEl = document.querySelector('.dynamic-tooltip.primary');
                const secondaryTooltipEl = document.querySelector('.dynamic-tooltip.secondary');
                const primaryLineEl = document.querySelector('.dynamic-tooltip-line.primary');
                const secondaryLineEl = document.querySelector('.dynamic-tooltip-line.secondary');
                const speedTimerTooltip = document.getElementById('timer-tooltip');
                const speedTimerValue = document.getElementById('timer-tooltip-value');
                const LINE_OFFSET = 13;

                // Verificar se é o gráfico combinado de energia
                if (graphInfo.isCombinedEnergy) {
                    // Atualizar métricas para os plugins de overlay
                    combinedEnergyMetrics.evPctInstant = getState('evConsumption') || 0;
                    combinedEnergyMetrics.kmLInstant = getState('gasConsumption') || 0;

                    // kwh100Avg pode vir do estado ou ser calculado
                    const kwh100Avg = getState('kwh100Avg');
                    if (kwh100Avg !== undefined) {
                        combinedEnergyMetrics.kwh100Avg = kwh100Avg;
                    }

                    // Esconder tooltips HTML (plugins desenham no canvas)
                    if (primaryTooltipEl) primaryTooltipEl.style.display = 'none';
                    if (secondaryTooltipEl) secondaryTooltipEl.style.display = 'none';
                    if (primaryLineEl) primaryLineEl.style.display = 'none';
                    if (secondaryLineEl) secondaryLineEl.style.display = 'none';

                    // Garantir que warp e timer estão escondidos
                    this.setWarpAnimation(false);
                    this.setChronometer('stop');

                    this.chartInstance.update('quiet');
                    return;
                }

                if (primaryTooltipEl) primaryTooltipEl.style.opacity = 0;
                if (primaryLineEl) primaryLineEl.style.opacity = 0;
                if (secondaryTooltipEl) secondaryTooltipEl.style.display = 'none';
                if (secondaryLineEl) secondaryLineEl.style.display = 'none';

                if (graphInfo.id === 'carSpeed') {
                    if (secondaryTooltipEl) secondaryTooltipEl.style.display = 'flex';
                    if (secondaryLineEl) secondaryLineEl.style.display = 'block';

                    const dataset1Info = graphInfo.datasets[0];
                    const dataset2Info = graphInfo.datasets[1];

                    const value1 = getState(dataset1Info.dataKey);
                    const value2 = getState(dataset2Info.dataKey);

                    const yAxis = this.chartInstance.scales.y;
                    const y1Axis = this.chartInstance.scales.y1;

                    if (value1 !== undefined && primaryTooltipEl && primaryLineEl) {
                        primaryTooltipEl.querySelector('.tooltip-value').textContent = value1.toFixed(dataset1Info.decimalPlaces || 1);
                        primaryTooltipEl.querySelector('.tooltip-unity').textContent = dataset1Info.unity;
                        primaryLineEl.style.top = `${yAxis.getPixelForValue(value1) + LINE_OFFSET}px`;
                        primaryLineEl.style.backgroundColor = this.colors.primary;
                        primaryTooltipEl.style.opacity = 1;
                        primaryLineEl.style.opacity = 0.5;
                    }

                    if (value2 !== undefined && secondaryTooltipEl && secondaryLineEl) {
                        secondaryTooltipEl.querySelector('.tooltip-value').textContent = value2.toFixed(dataset2Info.decimalPlaces || 1);
                        secondaryTooltipEl.querySelector('.tooltip-unity').textContent = dataset2Info.unity;
                        secondaryLineEl.style.top = `${yAxis.getPixelForValue(value2) + LINE_OFFSET}px`;
                        secondaryLineEl.style.backgroundColor = this.colors.secondary;
                        secondaryTooltipEl.style.opacity = 1;
                        secondaryLineEl.style.opacity = 0.5;
                    }

                    const currentSpeed = getState('carSpeed') || 0.0;
                    const drivingMode = getState('drivingMode');
                    const acceleration = parseFloat(currentSpeed - this.lastCarSpeed) * (1000 / UI_UPDATE_INTERVAL);
                    const isFastAcceleration = acceleration >= (100 / ACCELERATION_THRESHOLD);

                    // Chronometer Running Logic
                    if (this.isSpeedTimerRunning) {
                        const elapsedTime = (Date.now() - this.speedTimerStartTime) / 1000;


                        // 1. Abort Conditions
                        if (elapsedTime > 15) {
                            this.triggerFlash('red');
                            this.setWarpAnimation(false);
                            this.setChronometer('stop');
                        }

                        // 2. Success Condition
                        else if (currentSpeed >= 100) {

                            if (!this.last0To100Time) {
                                this.last0To100Time = elapsedTime.toFixed(1);
                            }
                            if (speedTimerValue) speedTimerValue.textContent = `${this.last0To100Time}s`;

                            // Trigger Flash and hold results for few secs
                            this.triggerFlash('white');
                            this.setChronometer('success_hold');
                        }

                        // 3. Reset if car has stopped
                        else if (currentSpeed === 0) {
                            this.setWarpAnimation(false);
                            this.setChronometer('stop');
                        }

                        // 4. Update Condition
                        else {
                            // Update Timer (ensure its visible)
                            if (speedTimerValue) speedTimerValue.textContent = `${elapsedTime.toFixed(1)}s`;
                            if (speedTimerTooltip && !speedTimerTooltip.classList.contains('visible')) {
                                speedTimerTooltip.classList.add('visible');
                            }

                            // Ensure warp is running if we are still accelerating
                            if (acceleration > 0) {
                                this.setWarpAnimation(true);
                                if (this.warpTunnel) this.warpTunnel.setSpeed(currentSpeed);
                            }
                        }
                    }

                    // Chronometer & Warp Tunnel Start Condition
                    const shouldWarp = this.lastCarSpeed === 0 && currentSpeed > 0 && isFastAcceleration && drivingMode === 'Sport';
                    if (shouldWarp) {
                        this.triggerFlash('orange');
                        this.setChronometer('start');
                        this.setWarpAnimation(true);
                        if (this.warpTunnel) this.warpTunnel.setSpeed(currentSpeed);
                    } else if ((currentSpeed >= 100) && (currentSpeed < this.lastCarSpeed)) {
                        this.setWarpAnimation(false);
                    }

                    this.lastCarSpeed = currentSpeed;

                } else {  // Other graphs
                    let activeValue, activeUnity, activeDatasetIndex;

                    // makes sure warp tunnel and speed timer are hidden
                    this.setWarpAnimation(false);
                    this.setChronometer('stop');

                    if (graphInfo.id === 'gasConsumption') {
                        const runningValue = getState(graphInfo.datasets[0].dataKey);
                        const idleValue = getState(graphInfo.datasets[1].dataKey);
                        if (runningValue > 0) {
                            activeValue = runningValue;
                            activeUnity = graphInfo.datasets[0].unity;
                            activeDatasetIndex = 0;
                        } else {
                            activeValue = idleValue;
                            activeUnity = graphInfo.datasets[1].unity;
                            activeDatasetIndex = 1;
                        }
                    } else {
                        const mainDatasetInfo = graphInfo.datasets[0];
                        activeValue = getState(mainDatasetInfo.dataKey);
                        activeUnity = mainDatasetInfo.unity;
                        activeDatasetIndex = 0;
                    }

                    if (activeValue !== undefined) {
                        const yAxis = activeDatasetIndex === 0 ? this.chartInstance.scales.y : this.chartInstance.scales.y1;
                        primaryTooltipEl.querySelector('.tooltip-value').textContent = activeValue.toFixed(graphInfo.decimalPlaces || 0);
                        primaryTooltipEl.querySelector('.tooltip-unity').textContent = activeUnity;
                        primaryLineEl.style.top = `${yAxis.getPixelForValue(activeValue) + LINE_OFFSET}px`;
                        primaryLineEl.style.backgroundColor = activeDatasetIndex === 0 ? this.colors.primary : this.colors.secondary;
                        primaryTooltipEl.style.opacity = 1;
                        primaryLineEl.style.opacity = 0.5;;
                    }
                }
                this.chartInstance.update('quiet');
            } catch (error) {
                console.error('Error: ', error);
            }
        }, UI_UPDATE_INTERVAL);


        this.isInitialized = true;
    },

    switchTo(graphId) {
        if (!this.isInitialized) {
            return;
        }

        const graphInfo = graphList.find(g => g.id === graphId);
        if (!graphInfo) return;

        const scales = this.chartInstance.options.scales;
        const plugins = this.chartInstance.options.plugins;
        const isCombinedEnergy = graphInfo.isCombinedEnergy === true;

        // Habilitar/desabilitar plugins do gráfico combinado
        plugins.circularClip.enabled = isCombinedEnergy;
        plugins.centerOverlay.enabled = isCombinedEnergy;
        plugins.sideReadouts.enabled = isCombinedEnergy;

        // Esconder tooltips HTML quando gráfico combinado estiver ativo
        const primaryTooltipEl = document.querySelector('.dynamic-tooltip.primary');
        const secondaryTooltipEl = document.querySelector('.dynamic-tooltip.secondary');
        const primaryLineEl = document.querySelector('.dynamic-tooltip-line.primary');
        const secondaryLineEl = document.querySelector('.dynamic-tooltip-line.secondary');

        if (isCombinedEnergy) {
            // Esconder elementos HTML - os plugins desenham no canvas
            if (primaryTooltipEl) primaryTooltipEl.style.display = 'none';
            if (secondaryTooltipEl) secondaryTooltipEl.style.display = 'none';
            if (primaryLineEl) primaryLineEl.style.display = 'none';
            if (secondaryLineEl) secondaryLineEl.style.display = 'none';

            // Configurar escalas para o gráfico combinado
            scales.y.display = false;
            scales.y1.display = false;
            scales.yLeft.display = false;
            scales.yRight.display = false;

            // Ajustar layout para o gráfico combinado (mais padding para os overlays)
            this.chartInstance.options.layout.padding = { top: 60, bottom: 60, left: 60, right: 60 };
        } else {
            // Restaurar elementos HTML
            if (primaryTooltipEl) primaryTooltipEl.style.display = 'flex';
            if (secondaryTooltipEl) secondaryTooltipEl.style.display = 'flex';
            if (primaryLineEl) primaryLineEl.style.display = 'block';
            if (secondaryLineEl) secondaryLineEl.style.display = 'block';

            // Restaurar layout padrão
            this.chartInstance.options.layout.padding = { top: 0, bottom: 0, left: 0, right: 0 };
        }

        const hasSecondaryAxis = !isCombinedEnergy && graphInfo.datasets[1] && graphInfo.datasets[1].dataKey;
        scales.y1.display = hasSecondaryAxis;

        const bulletContainer = document.querySelector('.graph-bullet-container');
        const tooltipLines = document.querySelectorAll('.dynamic-tooltip-line');
        if (bulletContainer && tooltipLines.length > 0) {
            if (isCombinedEnergy) {
                bulletContainer.classList.add('position-right');
                bulletContainer.classList.remove('position-left');
                tooltipLines.forEach(line => line.style.display = 'none');
            } else if (hasSecondaryAxis) {
                bulletContainer.classList.add('position-left');
                bulletContainer.classList.remove('position-right');
                tooltipLines.forEach(line => {
                    line.style.display = 'block';
                    line.style.width = '80%';
                });
            } else {
                bulletContainer.classList.add('position-right');
                bulletContainer.classList.remove('position-left');
                tooltipLines.forEach(line => {
                    line.style.display = 'block';
                    line.style.width = '95%';
                });
            }
        }

        if (graphId === 'combinedEnergy') {
            // Configurar escalas do gráfico combinado
            scales.y.display = false;
            scales.y1.display = false;
        } else if (graphId === 'gasConsumption') {
            scales.y.display = true;
            scales.y.min = -15;
            scales.y.max = 45;
            scales.y.ticks.stepSize = 10;
            scales.y.ticks.color = this.colors.primary + 'B3';
            scales.y1.min = -5;
            scales.y1.max = 15;
            scales.y1.ticks.stepSize = 3;
            scales.y1.ticks.color = this.colors.secondary + 'B3';
        } else if (graphId === 'carSpeed') {
            scales.y.display = true;
            scales.y.min = -50;
            scales.y.max = 200;
            scales.y.ticks.stepSize = 40;
            scales.y1.min = -15;
            scales.y1.max = 45;
            scales.y1.ticks.stepSize = 10;
            scales.y1.ticks.color = this.colors.secondary + 'B3';
        } else if (graphId === 'evConsumption') {
            scales.y.display = true;
            scales.y.min = -125;
            scales.y.max = 115;
            scales.y.ticks.stepSize = 25;
        }

        const newDatasets = [];
        const datasetColors = [this.colors.primary, this.colors.secondary];

        graphInfo.datasets.forEach((datasetInfo, index) => {
            if (datasetInfo.dataKey) {
                newDatasets.push({
                    label: datasetInfo.label,
                    data: historicalData[datasetInfo.dataKey] || [],
                    yAxisID: datasetInfo.yAxisID,
                    borderColor: datasetColors[index],
                    backgroundColor: index === 0 ? this.colors.primary + '26' : this.colors.secondary + '1A',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3,
                });
            }
        });

        this.chartInstance.data.datasets = newDatasets;

        const tooltipEl = this.chartInstance.canvas.parentNode.querySelector('.dynamic-tooltip');
        if (tooltipEl) tooltipEl.style.opacity = 0;

        this.currentGraphId = graphId;
        this.chartInstance.update({ duration: 400 });
    },

    cleanup() {
        if (this.uiUpdateInterval) {
            clearInterval(this.uiUpdateInterval);
            this.uiUpdateInterval = null;
        }
        if (this.warpTunnel) {
            this.warpTunnel.stop();
        }
        if (this.timerHideTimeoutId) {
            clearTimeout(this.timerHideTimeoutId);
            this.timerHideTimeoutId = null;
        }
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
        this.isInitialized = false;
        this.currentGraphId = null;
    }

};

export function createGraphScreen() {

    var main = div({ className: 'main-container' });

    const container = div({ className: 'graph-screen' });

    const graphProgressRing = div({ className: 'graph-progress-ring' });
    graphProgressRing.id = 'graph-progress-ring';
    container.appendChild(graphProgressRing);

    const divider = div({ className: 'graph-selector-line' });
    const outerRing = div({ className: 'graph-outer-ring' });
    const innerRingShadow = div({ className: 'graph-inner-ring-shadow' });
    const innerRing = div({ className: 'graph-inner-ring' });

    const dynamicTooltip = div({ className: 'dynamic-tooltip primary' });
    const tooltipValue = span({ className: 'tooltip-value' });
    const tooltipUnity = span({ className: 'tooltip-unity' });
    dynamicTooltip.appendChild(tooltipValue);
    dynamicTooltip.appendChild(tooltipUnity);

    const secondaryTooltip = div({ className: 'dynamic-tooltip secondary' });
    const secondaryTooltipValue = span({ className: 'tooltip-value' });
    const secondaryTooltipUnity = span({ className: 'tooltip-unity' });
    secondaryTooltip.appendChild(secondaryTooltipValue);
    secondaryTooltip.appendChild(secondaryTooltipUnity);

    const dynamicTooltipLine = div({ className: 'dynamic-tooltip-line primary' });
    const secondaryTooltipLine = div({ className: 'dynamic-tooltip-line secondary' });

    innerRing.appendChild(dynamicTooltip);
    innerRing.appendChild(secondaryTooltip);
    innerRing.appendChild(dynamicTooltipLine);
    innerRing.appendChild(secondaryTooltipLine);

    const timerTooltip = div({ className: 'timer-tooltip', id: 'timer-tooltip' });
    const timerTooltipValue = span({ className: 'timer-tooltip-value', id: 'timer-tooltip-value' });
    const timerTooltipUnity = span({ className: 'timer-tooltip-unity' });
    timerTooltip.appendChild(timerTooltipValue);
    timerTooltip.appendChild(timerTooltipUnity);
    timerTooltipValue.textContent = '--.-s';
    timerTooltipUnity.textContent = '0 - 100 km/h';

    innerRing.appendChild(timerTooltip);



    const warpCanvas = document.createElement('canvas');
    warpCanvas.id = 'warp-tunnel-canvas';
    warpCanvas.className = 'warp-tunnel-canvas';
    container.appendChild(warpCanvas);

    const canvas = document.createElement('canvas');
    canvas.className = 'graph-chart';
    canvas.id = 'graph-chart';
    innerRing.appendChild(canvas);

    container.appendChild(outerRing);
    container.appendChild(innerRingShadow);
    container.appendChild(innerRing);

    const flashOverlay = div({ className: 'graph-flash-overlay' });
    container.appendChild(flashOverlay);

    main.appendChild(container);

    const bulletContainer = div({ className: 'graph-bullet-container' });
    const bulletElements = {};

    graphList.forEach((itemData) => {
        const bulletEl = div({
            id: `bullet-${itemData.id}`,
            className: 'graph-bullet',
            'data-id': itemData.id
        });
        bulletContainer.appendChild(bulletEl);
        bulletElements[itemData.id] = bulletEl;
    });

    container.appendChild(bulletContainer);

    const graphTitleLabel = div({ className: 'graph-title-label' });
    container.appendChild(graphTitleLabel);

    setTimeout(() => {
        const ctx = document.getElementById('graph-chart');
        if (ctx) {
            graphController.init(ctx);
            graphController.switchTo(getState('currentGraph'));
        }

        subscribe('currentGraph', (newGraphId) => {
            graphController.switchTo(newGraphId);
            updateFocus(newGraphId);
        });

        updateFocus(getState('currentGraph'));

    }, 0);

    main.cleanup = () => {
        graphController.cleanup();
    };

    const updateFocus = (currentGraphId) => {
        Object.values(bulletElements).forEach(bullet => {
            if (bullet.dataset.id === currentGraphId) {
                bullet.classList.add('active');
            } else {
                bullet.classList.remove('active');
            }
        });

        const currentItem = graphList.find(item => item.id === currentGraphId);
        if (currentItem) {
            var currentLabel = currentItem.displayLabel;
        }
        graphTitleLabel.textContent = currentLabel;
    };

    return main;
}
