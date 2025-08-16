package br.com.redesurftank.havalshisuku

import android.R.attr.data
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import br.com.redesurftank.havalshisuku.managers.ServiceManager
import br.com.redesurftank.havalshisuku.listeners.IDataChanged
import br.com.redesurftank.havalshisuku.ui.theme.HavalShisukuTheme
import androidx.core.content.edit
import br.com.redesurftank.App
import br.com.redesurftank.havalshisuku.managers.AutoBrightnessManager
import br.com.redesurftank.havalshisuku.models.CarConstants
import br.com.redesurftank.havalshisuku.models.SharedPreferencesKeys
import br.com.redesurftank.havalshisuku.models.VehicleRevisions
import br.com.redesurftank.havalshisuku.utils.ShizukuUtils
import br.com.redesurftank.havalshisuku.utils.FridaUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.min

const val TAG = "HavalShisuku"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HavalShisukuTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    MainScreen(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}

@Composable
fun MainScreen(modifier: Modifier = Modifier) {
    val prefs = App.getDeviceProtectedContext().getSharedPreferences("haval_prefs", Context.MODE_PRIVATE)
    val advancedUse = prefs.getBoolean(SharedPreferencesKeys.ADVANCE_USE.key, false)
    val tabs = if (advancedUse) {
        listOf("Configurações Básicas", "Telas", "Valores Atuais", "Instalar Aplicativos", "Informações", "Frida Hooks")
    } else {
        listOf("Configurações Básicas", "Telas", "Valores Atuais", "Instalar Aplicativos", "Informações")
    }
    var selectedTab by remember { mutableStateOf(0) }
    Column(modifier = modifier) {
        TabRow(selectedTabIndex = selectedTab) {
            tabs.forEachIndexed { index, title ->
                Tab(selected = selectedTab == index, onClick = { selectedTab = index }) {
                    Text(title, modifier = Modifier.padding(16.dp))
                }
            }
        }
        when (selectedTab) {
            0 -> BasicSettingsTab()
            1 -> TelasTab()
            2 -> CurrentValuesTab()
            3 -> InstallAppsTab()
            4 -> InformacoesTab()
            5 -> FridaHooksTab()
        }
    }
}

@Composable
fun BasicSettingsTab() {
    val context = LocalContext.current
    val prefs = App.getDeviceProtectedContext().getSharedPreferences("haval_prefs", Context.MODE_PRIVATE)
    var isAdvancedUse by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.ADVANCE_USE.key, false)) }
    var selfInstallationCheck by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.SELF_INSTALLATION_INTEGRITY_CHECK.key, false)) }
    var bypassSelfInstallationCheck by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.BYPASS_SELF_INSTALLATION_INTEGRITY_CHECK.key, false)) }
    var disableMonitoring by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.DISABLE_MONITORING.key, false)) }
    var disableAvas by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.DISABLE_AVAS.key, false)) }
    var disableAvmCarStopped by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.DISABLE_AVM_CAR_STOPPED.key, false)) }
    var closeWindowOnPowerOff by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.CLOSE_WINDOW_ON_POWER_OFF.key, false)) }
    var setStartupVolume by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.SET_STARTUP_VOLUME.key, false)) }
    var volume by remember { mutableIntStateOf(prefs.getInt(SharedPreferencesKeys.STARTUP_VOLUME.key, 1)) }
    var closeWindowsOnSpeed by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.CLOSE_WINDOWS_ON_SPEED.key, false)) }
    var speedThreshold by remember { mutableFloatStateOf(prefs.getFloat(SharedPreferencesKeys.SPEED_THRESHOLD.key, 5f)) }
    var enableAutoBrightness by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.ENABLE_AUTO_BRIGHTNESS.key, false)) }
    var nightStartHour by remember { mutableIntStateOf(prefs.getInt(SharedPreferencesKeys.NIGHT_START_HOUR.key, 20)) }
    var nightStartMinute by remember { mutableIntStateOf(prefs.getInt(SharedPreferencesKeys.NIGHT_START_MINUTE.key, 0)) }
    var nightEndHour by remember { mutableIntStateOf(prefs.getInt(SharedPreferencesKeys.NIGHT_END_HOUR.key, 6)) }
    var nightEndMinute by remember { mutableIntStateOf(prefs.getInt(SharedPreferencesKeys.NIGHT_END_MINUTE.key, 0)) }
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        if(isAdvancedUse && !selfInstallationCheck) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = bypassSelfInstallationCheck,
                    onCheckedChange = {
                        bypassSelfInstallationCheck = it
                        prefs.edit { putBoolean(SharedPreferencesKeys.BYPASS_SELF_INSTALLATION_INTEGRITY_CHECK.key, it) }
                    }
                )
                Spacer(Modifier.width(8.dp))
                Text(SharedPreferencesKeys.BYPASS_SELF_INSTALLATION_INTEGRITY_CHECK.description)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = disableMonitoring,
                onCheckedChange = {
                    disableMonitoring = it
                    prefs.edit { putBoolean(SharedPreferencesKeys.DISABLE_MONITORING.key, it) }
                    ServiceManager.getInstance().setMonitoringEnabled(!it)
                }
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.DISABLE_MONITORING.description)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = disableAvas,
                onCheckedChange = {
                    disableAvas = it
                    prefs.edit { putBoolean(SharedPreferencesKeys.DISABLE_AVAS.key, it) }
                    ServiceManager.getInstance().setAvasEnabled(!it)
                }
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.DISABLE_AVAS.description)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = disableAvmCarStopped,
                onCheckedChange = {
                    disableAvmCarStopped = it
                    prefs.edit { putBoolean(SharedPreferencesKeys.DISABLE_AVM_CAR_STOPPED.key, it) }
                }
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.DISABLE_AVM_CAR_STOPPED.description)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = closeWindowOnPowerOff,
                onCheckedChange = {
                    closeWindowOnPowerOff = it
                    prefs.edit { putBoolean(SharedPreferencesKeys.CLOSE_WINDOW_ON_POWER_OFF.key, it) }
                }
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.CLOSE_WINDOW_ON_POWER_OFF.description)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = setStartupVolume,
                onCheckedChange = {
                    setStartupVolume = it
                    prefs.edit { putBoolean(SharedPreferencesKeys.SET_STARTUP_VOLUME.key, it) }
                }
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.SET_STARTUP_VOLUME.description)
        }
        if (setStartupVolume) {
            Column {
                Text("Volume: ${volume}")
                Slider(
                    value = volume.toFloat(),
                    onValueChange = {
                        volume = it.toInt()
                        prefs.edit { putInt(SharedPreferencesKeys.STARTUP_VOLUME.key, it.toInt()) }
                    },
                    valueRange = 1f..39f,
                    steps = 37
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = closeWindowsOnSpeed,
                onCheckedChange = {
                    closeWindowsOnSpeed = it
                    prefs.edit { putBoolean(SharedPreferencesKeys.CLOSE_WINDOWS_ON_SPEED.key, it) }
                }
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.CLOSE_WINDOWS_ON_SPEED.description)
        }
        if (closeWindowsOnSpeed) {
            Column {
                Text("Velocidade: ${speedThreshold.toInt()} km/h")
                Slider(
                    value = speedThreshold,
                    onValueChange = {
                        speedThreshold = it
                        prefs.edit { putFloat(SharedPreferencesKeys.SPEED_THRESHOLD.key, it) }
                    },
                    valueRange = 15f..120f,
                    steps = 21
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = enableAutoBrightness,
                onCheckedChange = {
                    enableAutoBrightness = it
                    prefs.edit { putBoolean(SharedPreferencesKeys.ENABLE_AUTO_BRIGHTNESS.key, it) }
                    AutoBrightnessManager.getInstance().setEnabled(it)
                }
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.ENABLE_AUTO_BRIGHTNESS.description)
        }
        if (enableAutoBrightness) {
            Column {
                Text("Período noturno: de ${String.format("%02d:%02d", nightStartHour, nightStartMinute)} até ${String.format("%02d:%02d", nightEndHour, nightEndMinute)}")
                Row {
                    Button(onClick = { showStartPicker = true }) { Text("Escolher início") }
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = { showEndPicker = true }) { Text("Escolher fim") }
                }
            }
        }
    }
    if (showStartPicker) {
        LaunchedEffect(Unit) {
            val dialog = TimePickerDialog(
                context,
                { _, h, m ->
                    nightStartHour = h
                    nightStartMinute = m
                    prefs.edit {
                        putInt(SharedPreferencesKeys.NIGHT_START_HOUR.key, h)
                        putInt(SharedPreferencesKeys.NIGHT_START_MINUTE.key, m)
                    }
                    AutoBrightnessManager.getInstance().updateSchedule()
                },
                nightStartHour,
                nightStartMinute,
                true
            )
            dialog.setOnDismissListener { showStartPicker = false }
            dialog.show()
        }
    }
    if (showEndPicker) {
        LaunchedEffect(Unit) {
            val dialog = TimePickerDialog(
                context,
                { _, h, m ->
                    nightEndHour = h
                    nightEndMinute = m
                    prefs.edit {
                        putInt(SharedPreferencesKeys.NIGHT_END_HOUR.key, h)
                        putInt(SharedPreferencesKeys.NIGHT_END_MINUTE.key, m)
                    }
                    AutoBrightnessManager.getInstance().updateSchedule()
                },
                nightEndHour,
                nightEndMinute,
                true
            )
            dialog.setOnDismissListener { showEndPicker = false }
            dialog.show()
        }
    }
}

@Composable
fun FridaHooksTab() {
    val prefs = App.getDeviceProtectedContext().getSharedPreferences("haval_prefs", Context.MODE_PRIVATE)
    var enableFridaHooks by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.ENABLE_FRIDA_HOOKS.key, false)) }
    var enableFridaHookSystemServer by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.ENABLE_FRIDA_HOOK_SYSTEM_SERVER.key, false)) }
    var showFridaDialog by remember { mutableStateOf(false) }
    var showManualDialog by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = enableFridaHooks,
                onCheckedChange = { newValue ->
                    if (!newValue) {
                        enableFridaHooks = false
                        prefs.edit { putBoolean(SharedPreferencesKeys.ENABLE_FRIDA_HOOKS.key, false) }
                    } else {
                        showFridaDialog = true
                    }
                }
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.ENABLE_FRIDA_HOOKS.description)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = enableFridaHookSystemServer,
                onCheckedChange = { newValue ->
                    prefs.edit { putBoolean(SharedPreferencesKeys.ENABLE_FRIDA_HOOK_SYSTEM_SERVER.key, newValue) }
                    enableFridaHookSystemServer = newValue;
                    if (newValue)
                        FridaUtils.injectSystemServer()
                }
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.ENABLE_FRIDA_HOOK_SYSTEM_SERVER.description)
        }
        Button(onClick = { showManualDialog = true }) {
            Text("Injetar Código Manual")
        }
    }
    if (showFridaDialog) {
        AlertDialog(
            onDismissRequest = { showFridaDialog = false },
            title = { Text("Confirmação") },
            text = { Text("Ativar scripts fridas é uma função experimental que pode causar instabilidades, utilize por conta e risco. Caso não saiba o que é essa função é melhor manter desativada") },
            confirmButton = {
                TextButton(onClick = {
                    showFridaDialog = false
                    enableFridaHooks = true
                    prefs.edit { putBoolean(SharedPreferencesKeys.ENABLE_FRIDA_HOOKS.key, true) }
                    ServiceManager.getInstance().initializeFrida()
                }) {
                    Text("Ativar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showFridaDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
    if (showManualDialog) {
        AlertDialog(
            onDismissRequest = { showManualDialog = false },
            title = { Text("Hooks Manuais") },
            text = {
                val manuals = FridaUtils.ScriptProcess.entries.filter { it.injectMode == FridaUtils.InjectMode.MANUAL }
                LazyColumn {
                    items(manuals) { script ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(script.getProcess())
                            Spacer(Modifier.width(8.dp))
                            Button(onClick = { FridaUtils.injectScript(script, false) }) {
                                Text("Injetar")
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showManualDialog = false }) {
                    Text("Fechar")
                }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TelasTab() {
    val context = LocalContext.current
    val prefs = App.getDeviceProtectedContext().getSharedPreferences("haval_prefs", Context.MODE_PRIVATE)
    var enableProjector by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.ENABLE_INSTRUMENT_PROJECTOR.key, false)) }
    var enableWarning by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.ENABLE_INSTRUMENT_REVISION_WARNING.key, false)) }
    var nextKmText by remember { mutableStateOf(prefs.getInt(SharedPreferencesKeys.INSTRUMENT_REVISION_KM.key, 12000).toString()) }
    var nextDateMillis by remember { mutableLongStateOf(prefs.getLong(SharedPreferencesKeys.INSTRUMENT_REVISION_NEXT_DATE.key, 0L)) }
    var showDatePicker by remember { mutableStateOf(false) }
    val dateFormatter = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())

    val formattedNextDate = if (nextDateMillis > 0) dateFormatter.format(nextDateMillis) else "Não definido"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = enableProjector,
                onCheckedChange = {
                    enableProjector = it
                    prefs.edit { putBoolean(SharedPreferencesKeys.ENABLE_INSTRUMENT_PROJECTOR.key, it) }
                    if (!it) {
                        enableWarning = false
                        prefs.edit { putBoolean(SharedPreferencesKeys.ENABLE_INSTRUMENT_REVISION_WARNING.key, false) }
                    }
                }
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.ENABLE_INSTRUMENT_PROJECTOR.description)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = enableWarning,
                onCheckedChange = {
                    enableWarning = it
                    prefs.edit { putBoolean(SharedPreferencesKeys.ENABLE_INSTRUMENT_REVISION_WARNING.key, it) }
                },
                enabled = enableProjector
            )
            Spacer(Modifier.width(8.dp))
            Text(SharedPreferencesKeys.ENABLE_INSTRUMENT_REVISION_WARNING.description)
        }
        if (enableWarning) {
            val models = listOf("Haval H6", "Ora 03", "Manual / Outro Modelo")
            var expanded by remember { mutableStateOf(false) }
            var selectedModel by remember { mutableStateOf(prefs.getString(SharedPreferencesKeys.CAR_MODEL.key, models.first()) ?: models.first()) }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Modelo do Veículo:")
                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = !expanded }
                ) {
                    TextField(
                        value = selectedModel,
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                        modifier = Modifier.menuAnchor()
                    )
                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        models.forEach { model ->
                            DropdownMenuItem(
                                text = { Text(model) },
                                onClick = {
                                    selectedModel = model
                                    prefs.edit { putString(SharedPreferencesKeys.CAR_MODEL.key, model) }
                                    expanded = false
                                }
                            )
                        }
                    }
                }
            }

            if (selectedModel == "Manual / Outro Modelo") {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Próxima KM:")
                    Row {
                        TextField(
                            value = nextKmText,
                            onValueChange = { newValue ->
                                if (newValue.isEmpty() || newValue.toIntOrNull() != null) {
                                    nextKmText = newValue
                                    newValue.toIntOrNull()?.let {
                                        prefs.edit { putInt(SharedPreferencesKeys.INSTRUMENT_REVISION_KM.key, it) }
                                    }
                                }
                            },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(Modifier.width(8.dp))
                        Button(onClick = {
                            val currentKm = ServiceManager.getInstance().totalOdometer
                            val newNextKm = currentKm + 12000
                            nextKmText = newNextKm.toString()
                            prefs.edit { putInt(SharedPreferencesKeys.INSTRUMENT_REVISION_KM.key, newNextKm) }
                        }) {
                            Text("Resetar")
                        }
                    }
                }
            } else {
                val currentKm = ServiceManager.getInstance().totalOdometer
                val nextRevision = VehicleRevisions.calculateNextRevision(selectedModel, currentKm)
                Text("Próxima Revisão: ${nextRevision?.toString() ?: "N/A"} km")
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Próxima data: $formattedNextDate")
                Row {
                    Button(onClick = { showDatePicker = true }) {
                        Text("Informar manual")
                    }
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = {
                        val cal = Calendar.getInstance()
                        cal.add(Calendar.YEAR, 1)
                        nextDateMillis = cal.timeInMillis
                        prefs.edit { putLong(SharedPreferencesKeys.INSTRUMENT_REVISION_NEXT_DATE.key, nextDateMillis) }
                    }) {
                        Text("Resetar")
                    }
                }
            }
        }
    }

    if (showDatePicker) {
        val calendar = Calendar.getInstance()
        if (nextDateMillis > 0) calendar.timeInMillis = nextDateMillis

        LaunchedEffect(Unit) {
            val dialog = DatePickerDialog(
                context,
                { _, year, month, day ->
                    val cal = Calendar.getInstance()
                    cal.set(year, month, day)
                    nextDateMillis = cal.timeInMillis
                    prefs.edit { putLong(SharedPreferencesKeys.INSTRUMENT_REVISION_NEXT_DATE.key, nextDateMillis) }
                },
                calendar.get(Calendar.YEAR),
                calendar.get(Calendar.MONTH),
                calendar.get(Calendar.DAY_OF_MONTH)
            )
            dialog.setOnDismissListener { showDatePicker = false }
            dialog.show()
        }
    }
}

@Composable
fun CurrentValuesTab() {
    val prefs = App.getDeviceProtectedContext().getSharedPreferences("haval_prefs", Context.MODE_PRIVATE)
    val advancedUse = prefs.getBoolean(SharedPreferencesKeys.ADVANCE_USE.key, false)
    val dataMap = remember {
        mutableStateMapOf<String, String>().apply {
            putAll(ServiceManager.getInstance().allCurrentCachedData)
        }
    }
    var showConfigDialog by remember { mutableStateOf(false) }
    val allConstants = remember { CarConstants.entries.map { it.value } }
    val defaultKeys = remember { ServiceManager.DEFAULT_KEYS.map { it.value } } // Assuming DEFAULT_KEYS is Array<CarConstants>
    val filteredConstants = remember { allConstants.filter { it !in defaultKeys } }
    val monitoredSet = remember {
        mutableStateOf(prefs.getStringSet(SharedPreferencesKeys.CAR_MONITOR_PROPERTIES.key, emptySet()) ?: emptySet())
    }
    val tempChecked = remember {
        mutableStateMapOf<String, Boolean>().apply {
            allConstants.forEach { this[it] = monitoredSet.value.contains(it) }
        }
    }
    var showUpdateDialog by remember { mutableStateOf(false) }
    var selectedKey by remember { mutableStateOf("") }
    var newValue by remember { mutableStateOf("") }
    var searchQueryValues by remember { mutableStateOf("") }
    var searchQueryConfig by remember { mutableStateOf("") }
    DisposableEffect(Unit) {
        val listener = IDataChanged { key, value -> dataMap[key] = value }
        ServiceManager.getInstance().addDataChangedListener(listener)
        onDispose {
            ServiceManager.getInstance().removeDataChangedListener(listener)
        }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        if (advancedUse) {
            Button(onClick = { showConfigDialog = true }) {
                Text("Configurar")
            }
            Spacer(Modifier.height(8.dp))
        }
        TextField(
            value = searchQueryValues,
            onValueChange = { searchQueryValues = it },
            label = { Text("Pesquisar valores") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            val filteredData = dataMap.toList()
                .filter { it.first.lowercase().contains(searchQueryValues.lowercase()) }
                .sortedBy { it.first }
            items(filteredData) { (key, value) ->
                Text(
                    "$key: $value",
                    modifier = if (advancedUse) Modifier.clickable {
                        selectedKey = key
                        newValue = value
                        showUpdateDialog = true
                    } else Modifier
                )
            }
        }
    }
    if (showConfigDialog && advancedUse) {
        AlertDialog(
            onDismissRequest = { showConfigDialog = false },
            title = { Text("Configurar Monitoramento") },
            text = {
                Column {
                    TextField(
                        value = searchQueryConfig,
                        onValueChange = { searchQueryConfig = it },
                        label = { Text("Pesquisar constantes") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    val checked = filteredConstants.filter { tempChecked[it] ?: false }.sorted()
                    val unchecked = filteredConstants.filter { !(tempChecked[it] ?: false) }.sorted()
                    val sortedConstants = (checked + unchecked)
                        .filter { it.lowercase().contains(searchQueryConfig.lowercase()) }
                    LazyColumn {
                        items(sortedConstants) { constant ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(
                                    checked = tempChecked[constant] ?: false,
                                    onCheckedChange = { tempChecked[constant] = it }
                                )
                                Text(constant)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val newSet = tempChecked.filterValues { it }.keys.toSet()
                    prefs.edit { putStringSet(SharedPreferencesKeys.CAR_MONITOR_PROPERTIES.key, newSet) }
                    monitoredSet.value = newSet
                    showConfigDialog = false
                    ServiceManager.getInstance().updateMonitoringProperties()
                    dataMap.clear()
                    dataMap.putAll(ServiceManager.getInstance().allCurrentCachedData)
                }) {
                    Text("Salvar")
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    allConstants.forEach { tempChecked[it] = monitoredSet.value.contains(it) }
                    showConfigDialog = false
                }) {
                    Text("Cancelar")
                }
            }
        )
    }
    if (showUpdateDialog && advancedUse) {
        AlertDialog(
            onDismissRequest = { showUpdateDialog = false },
            title = { Text("Atualizar $selectedKey") },
            text = {
                TextField(
                    value = newValue,
                    onValueChange = { newValue = it },
                    label = { Text("Novo valor") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    ServiceManager.getInstance().updateData(selectedKey, newValue)
                    showUpdateDialog = false
                }) {
                    Text("Atualizar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showUpdateDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}

@Composable
fun InstallAppsTab() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val requestPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { /* Permission requested, user will return */ }
    var showPermissionDialog by remember { mutableStateOf(false) }
    var showConfirmDialog by remember { mutableStateOf(false) }
    var installResult by remember { mutableStateOf("") }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Button(onClick = { showConfirmDialog = true }) {
            Text("Instalar via Apk")
        }
        if (installResult.isNotEmpty()) {
            Text(installResult)
        }
        Text("Aplicativos disponíveis:")
        LazyColumn {
            item {
                Text("Nenhum aplicativo disponível")
            }
        }
    }
    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text("Confirmação") },
            text = { Text("O APK será copiado de /data/local/tmp/application.apk e instalado. Continuar?") },
            confirmButton = {
                TextButton(onClick = {
                    showConfirmDialog = false
                    scope.launch {
                        try {
                            val targetDir = context.getExternalFilesDir(null)
                            val targetFile = File(targetDir, "application.apk")
                            val command = arrayOf("cp", "/data/local/tmp/application.apk", targetFile.absolutePath)
                            val output = ShizukuUtils.runCommandAndGetOutput(command)
                            if (output.contains("error", ignoreCase = true) || !targetFile.exists()) {
                                installResult = "Erro na cópia: $output"
                                return@launch
                            }
                            if (!context.packageManager.canRequestPackageInstalls()) {
                                showPermissionDialog = true
                                return@launch
                            }
                            val uri = FileProvider.getUriForFile(context, "${context.packageName}.provider", targetFile)
                            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                                setDataAndType(uri, "application/vnd.android.package-archive")
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            context.startActivity(installIntent)
                            installResult = "Instalação iniciada."
                        } catch (e: Exception) {
                            installResult = "Exceção: ${e.message}"
                        }
                    }
                }) {
                    Text("Continuar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
    if (showPermissionDialog) {
        AlertDialog(
            onDismissRequest = { showPermissionDialog = false },
            title = { Text("Permissão necessária") },
            text = { Text("Permita a instalação de apps de fontes desconhecidas.") },
            confirmButton = {
                TextButton(onClick = {
                    showPermissionDialog = false
                    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${context.packageName}")
                    }
                    requestPermissionLauncher.launch(intent)
                }) {
                    Text("Configurações")
                }
            },
            dismissButton = {
                TextButton(onClick = { showPermissionDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}

@Composable
fun InformacoesTab() {
    val context = LocalContext.current
    val prefs = App.getDeviceProtectedContext().getSharedPreferences("haval_prefs", Context.MODE_PRIVATE)
    var isActive by remember { mutableStateOf(ServiceManager.getInstance().isServicesInitialized) }
    var bypassSelfInstallationCheck by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.BYPASS_SELF_INSTALLATION_INTEGRITY_CHECK.key, false)) }
    var selfInstallationCheck by remember { mutableStateOf(prefs.getBoolean(SharedPreferencesKeys.SELF_INSTALLATION_INTEGRITY_CHECK.key, false)) }
    var formattedTime by remember { mutableStateOf("Não inicializado") }
    var formattedTime2 by remember { mutableStateOf("Não inicializado") }
    var formattedTime3 by remember { mutableStateOf("Não inicializado") }
    var version by remember { mutableStateOf("Desconhecida") }
    var clickCount by remember { mutableIntStateOf(0) }
    var showAdvancedDialog by remember { mutableStateOf(false) }
    var showUpdateDialog by remember { mutableStateOf(false) }
    var updateMessage by remember { mutableStateOf("") }
    var updateAvailable by remember { mutableStateOf(false) }
    var latestVersion by remember { mutableStateOf("") }
    var downloadUrl by remember { mutableStateOf("") }
    var isDownloading by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableFloatStateOf(0f) }
    var downloadError by remember { mutableStateOf<String?>(null) }
    var downloadJob by remember { mutableStateOf<Job?>(null) }
    val scope = rememberCoroutineScope()
    val requestPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { /* Permission requested */ }
    var showPermissionDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            version = packageInfo.versionName ?: "Desconhecida"
        } catch (e: PackageManager.NameNotFoundException) {
            version = "Erro"
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            isActive = ServiceManager.getInstance().isServicesInitialized
            val timeBoot = ServiceManager.getInstance().timeBootReceived
            formattedTime = if (isActive && timeBoot > 0) {
                val minutes = timeBoot / 60000
                val seconds = (timeBoot / 1000) % 60
                val millis = timeBoot % 1000
                String.format("%02d:%02d.%03d", minutes, seconds, millis)
            } else {
                "Não inicializado"
            }
            val timeStart = ServiceManager.getInstance().timeStartInitialization
            formattedTime2 = if (isActive && timeStart > 0) {
                val minutes = timeStart / 60000
                val seconds = (timeStart / 1000) % 60
                val millis = timeStart % 1000
                String.format("%02d:%02d.%03d", minutes, seconds, millis)
            } else {
                "Não inicializado"
            }
            val timeInit = ServiceManager.getInstance().timeInitialized
            formattedTime3 = if (isActive && timeInit > 0) {
                val minutes = timeInit / 60000
                val seconds = (timeInit / 1000) % 60
                val millis = timeInit % 1000
                String.format("%02d:%02d.%03d", minutes, seconds, millis)
            } else {
                "Não inicializado"
            }
            delay(100)
        }
    }

    suspend fun getLatestReleaseInfo(): Pair<String?, String?> {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("https://api.github.com/repos/bobaoapae/haval-app-tool-multimidia/releases/latest")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.setRequestProperty("Accept", "application/vnd.github.v3+json")
                if (conn.responseCode == 200) {
                    val reader = BufferedReader(InputStreamReader(conn.inputStream))
                    val response = reader.use { it.readText() }
                    val json = JSONObject(response)
                    val tag = json.getString("tag_name")
                    val assets = json.getJSONArray("assets")
                    var dlUrl: String? = null
                    for (i in 0 until assets.length()) {
                        val asset = assets.getJSONObject(i)
                        if (asset.getString("name").endsWith(".apk")) {
                            dlUrl = asset.getString("browser_download_url")
                            break
                        }
                    }
                    tag to dlUrl
                } else null to null
            } catch (e: Exception) {
                Log.w(TAG, "Error fetching latest release info", e)
                null to null
            }
        }
    }

    fun compareVersions(v1: String, v2: String): Int {
        val parts1 = v1.split(".").map { it.toIntOrNull() ?: 0 }
        val parts2 = v2.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until min(parts1.size, parts2.size)) {
            if (parts1[i] > parts2[i]) return 1
            if (parts1[i] < parts2[i]) return -1
        }
        return parts1.size.compareTo(parts2.size)
    }

    fun startDownload() {
        isDownloading = true
        downloadProgress = 0f
        downloadJob = scope.launch(Dispatchers.IO) {
            try {
                val file = File(context.getExternalFilesDir(null), "update.apk")
                withContext(Dispatchers.IO) {
                    val url = URL(downloadUrl)
                    val conn = url.openConnection() as HttpURLConnection
                    val length = conn.contentLength
                    val input = BufferedInputStream(conn.inputStream)
                    val output = FileOutputStream(file)
                    val buffer = ByteArray(4096)
                    var bytesRead: Int
                    var total = 0
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        total += bytesRead
                        if (length > 0) downloadProgress = total.toFloat() / length
                    }
                    output.close()
                    input.close()
                }
                isDownloading = false
                withContext(Dispatchers.Main) {
                    if (!context.packageManager.canRequestPackageInstalls()) {
                        showPermissionDialog = true
                        return@withContext
                    }
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.provider", file)
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "application/vnd.android.package-archive")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Download failed", e)
                isDownloading = false
                downloadError = e.message ?: "Erro desconhecido"
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if(!bypassSelfInstallationCheck) {
            Text("Instalado corretamente: ${if (selfInstallationCheck) "Sim" else "Não"}")
        }
        Text("Estado: ${if (isActive) "Ativo" else "Inativo"}")
        if (isActive) {
            Text("Tempo para receber BOOT_COMPLETED: $formattedTime")
            Text("Tempo para começar a inicializar: $formattedTime2")
            Text("Tempo para inicializar: $formattedTime3")
        }
        Text(
            "Versão: $version",
            modifier = Modifier.combinedClickable(
                onClick = {
                    clickCount++
                    if (clickCount >= 5) {
                        showAdvancedDialog = true
                        clickCount = 0
                    }
                },
                onLongClick = {
                    scope.launch {
                        val (latest, dlUrl) = getLatestReleaseInfo()
                        if (latest != null && dlUrl != null) {
                            val currentClean = version.removePrefix("v")
                            val latestClean = latest.removePrefix("v")
                            if (compareVersions(latestClean, currentClean) > 0) {
                                latestVersion = latest
                                downloadUrl = dlUrl
                                updateAvailable = true
                            } else {
                                updateMessage = "Atualizado"
                                showUpdateDialog = true
                            }
                        } else {
                            updateMessage = "Erro na verificação"
                            showUpdateDialog = true
                        }
                    }
                }
            )
        )
    }

    if (showAdvancedDialog) {
        AlertDialog(
            onDismissRequest = { showAdvancedDialog = false },
            title = { Text("Confirmação") },
            text = { Text("Quer ativar o uso avançado? Pode causar instabilidades, utilize por conta e risco.") },
            confirmButton = {
                TextButton(onClick = {
                    showAdvancedDialog = false
                    prefs.edit { putBoolean(SharedPreferencesKeys.ADVANCE_USE.key, true) }
                }) {
                    Text("Ativar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAdvancedDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }

    if (showUpdateDialog) {
        AlertDialog(
            onDismissRequest = { showUpdateDialog = false },
            title = { Text("Verificação de Atualização") },
            text = { Text(updateMessage) },
            confirmButton = {
                TextButton(onClick = { showUpdateDialog = false }) {
                    Text("OK")
                }
            }
        )
    }

    if (updateAvailable) {
        AlertDialog(
            onDismissRequest = { updateAvailable = false },
            title = { Text("Atualização disponível: $latestVersion") },
            text = { Text("Deseja baixar?") },
            confirmButton = {
                TextButton(onClick = {
                    updateAvailable = false
                    startDownload()
                }) {
                    Text("Sim")
                }
            },
            dismissButton = {
                TextButton(onClick = { updateAvailable = false }) {
                    Text("Não")
                }
            }
        )
    }

    if (isDownloading) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Baixando atualização") },
            text = {
                Column {
                    LinearProgressIndicator(progress = { downloadProgress })
                    Text("${(downloadProgress * 100).toInt()}%")
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    downloadJob?.cancel()
                    isDownloading = false
                }) {
                    Text("Cancelar")
                }
            }
        )
    }

    if (downloadError != null) {
        AlertDialog(
            onDismissRequest = { downloadError = null },
            title = { Text("Erro no download") },
            text = { Text(downloadError!!) },
            confirmButton = {
                TextButton(onClick = {
                    downloadError = null
                    startDownload()
                }) {
                    Text("Tentar novamente")
                }
            },
            dismissButton = {
                TextButton(onClick = { downloadError = null }) {
                    Text("Cancelar")
                }
            }
        )
    }

    if (showPermissionDialog) {
        AlertDialog(
            onDismissRequest = { showPermissionDialog = false },
            title = { Text("Permissão necessária") },
            text = { Text("Permita a instalação de apps de fontes desconhecidas.") },
            confirmButton = {
                TextButton(onClick = {
                    showPermissionDialog = false
                    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${context.packageName}")
                    }
                    requestPermissionLauncher.launch(intent)
                }) {
                    Text("Configurações")
                }
            },
            dismissButton = {
                TextButton(onClick = { showPermissionDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}

@Preview(showBackground = true)
@Composable
fun MainScreenPreview() {
    HavalShisukuTheme {
        MainScreen()
    }
}