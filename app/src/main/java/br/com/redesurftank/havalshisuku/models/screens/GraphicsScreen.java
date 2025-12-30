package br.com.redesurftank.havalshisuku.models.screens;

import android.util.Log;

import br.com.redesurftank.havalshisuku.managers.ServiceManager;
import br.com.redesurftank.havalshisuku.models.CarConstants;
import br.com.redesurftank.havalshisuku.models.MainUiManager;
import br.com.redesurftank.havalshisuku.models.ServiceManagerEventType;
import br.com.redesurftank.havalshisuku.models.SteeringWheelAcControlType;


public class GraphicsScreen implements Screen {

    private static final String TAG = "GraphicsScreen";


    public static class GraphOptions {
        public static final String EV_CONSUMPTION = "evConsumption";
        public static final String GAS_CONSUMPTION = "gasConsumption";
        public static final String GAS_CONSUMPTION_METRIC = "gasConsumptionMetric";
        public static final String GAS_CONSUMPTION_IDLE = "gasConsumptionIdle";
        public static final String GAS_CONSUMPTION_METRIC_IDLE = "gasConsumptionMetricIdle";
        public static final String GAS_CONSUMPTION_MODE = "gasConsumptionMode";
        private static final String GAS_CONSUMPTION_MODE_RUNNING = "Running";
        private static final String GAS_CONSUMPTION_MODE_IDLE = "Idle";

        public static final String HEV_CONSUMPTION = "hevConsumption";
        public static final String ENERGY_EFFICIENCY = "energyEfficiency";
        public static final String CAR_SPEED = "carSpeed";
        private static final String[] graphsValueMap = {EV_CONSUMPTION, GAS_CONSUMPTION, HEV_CONSUMPTION, ENERGY_EFFICIENCY, CAR_SPEED};
    }
    private int currentGraphIndex = 0;

    private ServiceManager serviceManager;
    private Screen previousScreen = this;

    @Override
    public String getJsName() {
        return "graph";
    }

    @Override
    public void processKey(Key key) {
        switch (key) {
            case UP:
                currentGraphIndex--;
                if (currentGraphIndex < 0) currentGraphIndex = GraphOptions.graphsValueMap.length - 1;
                break;
            case ENTER:
            case DOWN:
                currentGraphIndex++;
                if (currentGraphIndex >= GraphOptions.graphsValueMap.length) currentGraphIndex = 0;
                break;
            case BACK:
                MainUiManager.getInstance().updateScreen(previousScreen);
                break;
            case BACK_LONG:
                MainUiManager.getInstance().updateScreen(previousScreen);
                break;
        }

        String valueToSend = GraphOptions.graphsValueMap[currentGraphIndex];
        serviceManager.dispatchServiceManagerEvent(ServiceManagerEventType.GRAPH_SCREEN_NAVIGATION, valueToSend);
        Log.i(TAG, "Graph changed to screen: " + valueToSend);

    }

    @Override
    public void initialize() {
        this.serviceManager = ServiceManager.getInstance();
        serviceManager.dispatchServiceManagerEvent(ServiceManagerEventType.UPDATE_SCREEN,this);
    }

    @Override
    public void setReturnScreen(Screen previousScreen) {
        this.previousScreen = previousScreen;
    }


}
