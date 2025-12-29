import { getState, subscribe } from '../../state.js';
import { div, img, span } from '../../utils/createElement.js';

import { Chart, registerables } from 'chart.js';
import streamingPlugin from 'chartjs-plugin-streaming';
import 'chartjs-adapter-date-fns';
import { WarpTunnelAnimation } from './warpTunnel.js';
Chart.register(...registerables, streamingPlugin);

const HISTORY_DURATION = 30000; //ms
const TIMER_HIDE_DELAY = 30000; //ms
const UI_UPDATE_INTERVAL = 100; //ms
const ACCELERATION_THRESHOLD = 10; //s (ie 100km/h in 5s = 5, 100km/h in 10s = 10)

export const graphList = [
    {
        id: 'hybridConsumption',
        displayLabel: 'Consumo Híbrido',
        decimalPlaces: 1,
        datasets: [
            {
                label: 'Consumo Híbrido',
                dataKey: 'kWhPer100km',
                unity: 'kWh/100km',
                yAxisID: 'y'
            },
            {
                label: '% EV',
                dataKey: 'evConsumption',
                unity: '% de Energia',
                yAxisID: 'y1'
            },
            {
                label: 'Combustível',
                dataKey: 'gasConsumption',
                unity: 'km/L',
                yAxisID: 'y2'
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

                } else if (graphInfo.id === 'hybridConsumption') {
                    // Hybrid consumption dashboard
                    this.setWarpAnimation(false);
                    this.setChronometer('stop');

                    const hybridKpiValueEl = document.getElementById('hybrid-kpi-value');
                    const hybridLeftNumberEl = document.getElementById('hybrid-left-number');
                    const hybridRightNumberEl = document.getElementById('hybrid-right-number');

                    // Calculate average kWh/100km from historical data
                    const kWhData = historicalData['kWhPer100km'] || [];
                    let avgKwh = 0;
                    if (kWhData.length > 0) {
                        const sum = kWhData.reduce((acc, point) => acc + point.y, 0);
                        avgKwh = sum / kWhData.length;
                    } else {
                        avgKwh = getState('kWhPer100km') || 0;
                    }

                    // Get instantaneous values for side displays
                    const evPercent = getState('evConsumption') || 0;
                    const gasConsumption = getState('gasConsumption') || 0;

                    // Update center KPI (average kWh/100km)
                    if (hybridKpiValueEl) {
                        hybridKpiValueEl.textContent = avgKwh.toFixed(1);
                    }

                    // Update left side (EV %)
                    // Negative value indicates regeneration
                    if (hybridLeftNumberEl) {
                        const evValue = evPercent;
                        const isNegative = evValue < 0;
                        hybridLeftNumberEl.textContent = (isNegative ? '' : '') + Math.abs(evValue).toFixed(0);
                        if (isNegative) {
                            hybridLeftNumberEl.classList.add('negative');
                            hybridLeftNumberEl.textContent = '-' + Math.abs(evValue).toFixed(0);
                        } else {
                            hybridLeftNumberEl.classList.remove('negative');
                        }
                    }

                    // Update right side (km/L)
                    if (hybridRightNumberEl) {
                        hybridRightNumberEl.textContent = gasConsumption.toFixed(1);
                    }

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
        const hasSecondaryAxis = graphInfo.datasets[1] && graphInfo.datasets[1].dataKey;
        scales.y1.display = hasSecondaryAxis;

        const bulletContainer = document.querySelector('.graph-bullet-container');
        const tooltipLines = document.querySelectorAll('.dynamic-tooltip-line');

        // Hybrid dashboard elements visibility
        const hybridCenterKpi = document.getElementById('hybrid-center-kpi');
        const hybridLeftValue = document.getElementById('hybrid-left-value');
        const hybridRightValue = document.getElementById('hybrid-right-value');
        const hybridAvgLabel = document.getElementById('hybrid-avg-label');

        if (graphId === 'hybridConsumption') {
            // Show hybrid elements
            if (hybridCenterKpi) hybridCenterKpi.classList.add('visible');
            if (hybridLeftValue) hybridLeftValue.classList.add('visible');
            if (hybridRightValue) hybridRightValue.classList.add('visible');
            if (hybridAvgLabel) hybridAvgLabel.classList.add('visible');
            // Position bullets to the right for hybrid
            if (bulletContainer) {
                bulletContainer.classList.add('position-right');
                bulletContainer.classList.remove('position-left');
            }
            if (tooltipLines.length > 0) {
                tooltipLines.forEach(line => line.style.display = 'none');
            }
        } else {
            // Hide hybrid elements for other graphs
            if (hybridCenterKpi) hybridCenterKpi.classList.remove('visible');
            if (hybridLeftValue) hybridLeftValue.classList.remove('visible');
            if (hybridRightValue) hybridRightValue.classList.remove('visible');
            if (hybridAvgLabel) hybridAvgLabel.classList.remove('visible');

            if (bulletContainer && tooltipLines.length > 0) {
                tooltipLines.forEach(line => line.style.display = 'block');
                if (hasSecondaryAxis) {
                    bulletContainer.classList.add('position-left');
                    bulletContainer.classList.remove('position-right');
                    tooltipLines.forEach(line => line.style.width = '80%');
                } else {
                    bulletContainer.classList.add('position-right');
                    bulletContainer.classList.remove('position-left');
                    tooltipLines.forEach(line => line.style.width = '95%');
                }
            }
        }


        if (graphId === 'gasConsumption') {
            scales.y.min = -15;
            scales.y.max = 45;
            scales.y.ticks.stepSize = 10;
            scales.y.ticks.color = this.colors.primary + 'B3';
            scales.y1.min = -5;
            scales.y1.max = 15;
            scales.y1.ticks.stepSize = 3;
            scales.y1.ticks.color = this.colors.secondary + 'B3';
        } else if (graphId === 'carSpeed') {
            scales.y.min = -50;
            scales.y.max = 200;
            scales.y.ticks.stepSize = 40;
            scales.y1.min = -15;
            scales.y1.max = 45;
            scales.y1.ticks.stepSize = 10;
            scales.y1.ticks.color = this.colors.secondary + 'B3';
        } else if (graphId === 'evConsumption') {
            scales.y.min = -125;
            scales.y.max = 115;
            scales.y.ticks.stepSize = 25;
        } else if (graphId === 'hybridConsumption') {
            // Main axis: kWh/100km (for the background graph)
            scales.y.min = 0;
            scales.y.max = 30;
            scales.y.ticks.stepSize = 5;
            scales.y.ticks.color = this.colors.primary + 'B3';
            // Hide secondary axes for hybrid - we show values in custom elements
            scales.y1.display = false;
        }

        const newDatasets = [];
        const datasetColors = [this.colors.primary, this.colors.secondary];

        if (graphId === 'hybridConsumption') {
            // For hybrid, only show the kWh/100km dataset in the background chart
            const mainDataset = graphInfo.datasets[0];
            if (mainDataset.dataKey) {
                newDatasets.push({
                    label: mainDataset.label,
                    data: historicalData[mainDataset.dataKey] || [],
                    yAxisID: mainDataset.yAxisID,
                    borderColor: this.colors.primary,
                    backgroundColor: this.colors.primary + '26',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3,
                });
            }
        } else {
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
        }

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

    // Hybrid consumption dashboard elements
    const hybridCenterKpi = div({ className: 'hybrid-center-kpi', id: 'hybrid-center-kpi' });
    const hybridKpiValue = span({ className: 'hybrid-kpi-value', id: 'hybrid-kpi-value' });
    const hybridKpiUnity = span({ className: 'hybrid-kpi-unity' });
    hybridKpiValue.textContent = '0.0';
    hybridKpiUnity.textContent = 'kWh/100km';
    hybridCenterKpi.appendChild(hybridKpiValue);
    hybridCenterKpi.appendChild(hybridKpiUnity);
    innerRing.appendChild(hybridCenterKpi);

    const hybridLeftValue = div({ className: 'hybrid-side-value left', id: 'hybrid-left-value' });
    const hybridLeftNumber = span({ className: 'hybrid-side-number', id: 'hybrid-left-number' });
    const hybridLeftUnity = span({ className: 'hybrid-side-unity' });
    hybridLeftNumber.textContent = '0';
    hybridLeftUnity.textContent = '% de Energia';
    hybridLeftValue.appendChild(hybridLeftNumber);
    hybridLeftValue.appendChild(hybridLeftUnity);
    innerRing.appendChild(hybridLeftValue);

    const hybridRightValue = div({ className: 'hybrid-side-value right', id: 'hybrid-right-value' });
    const hybridRightNumber = span({ className: 'hybrid-side-number', id: 'hybrid-right-number' });
    const hybridRightUnity = span({ className: 'hybrid-side-unity' });
    hybridRightNumber.textContent = '0.0';
    hybridRightUnity.textContent = 'km/L';
    hybridRightValue.appendChild(hybridRightNumber);
    hybridRightValue.appendChild(hybridRightUnity);
    innerRing.appendChild(hybridRightValue);

    const hybridAvgLabel = div({ className: 'hybrid-avg-label', id: 'hybrid-avg-label' });
    hybridAvgLabel.textContent = 'Média 30s';
    innerRing.appendChild(hybridAvgLabel);



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
