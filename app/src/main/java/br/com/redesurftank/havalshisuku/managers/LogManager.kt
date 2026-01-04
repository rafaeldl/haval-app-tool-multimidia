package br.com.redesurftank.havalshisuku.managers

import android.content.Context
import android.util.Log
import br.com.redesurftank.App
import br.com.redesurftank.havalshisuku.models.SharedPreferencesKeys
import com.google.gson.Gson
import kotlinx.coroutines.*
import java.io.File
import java.io.FileWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

class LogManager private constructor() {

    data class TelemetryEvent(
        val key: String,
        val value: String,
        val timestamp: Long
    )

    data class TelemetryBatch(
        val sessionId: String,
        val batchTimestamp: Long,
        val events: List<TelemetryEvent>
    )

    companion object {
        private const val TAG = "LogManager"
        private var instance: LogManager? = null

        @Synchronized
        fun getInstance(): LogManager {
            if (instance == null) {
                instance = LogManager()
            }
            return instance!!
        }
    }

    private val eventQueue = ConcurrentLinkedQueue<TelemetryEvent>()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val gson = Gson()
    private val sessionId = System.currentTimeMillis().toString()
    private val isRunning = AtomicBoolean(false)

    // Preferences
    private var enableTelemetry = false
    private var logToFile = false
    private var sendToCloud = false
    private var webhookUrl = ""

    init {
        updatePreferences()
        startProcessing()
    }

    fun updatePreferences() {
        val prefs = App.getDeviceProtectedContext().getSharedPreferences("haval_prefs", Context.MODE_PRIVATE)
        enableTelemetry = prefs.getBoolean(SharedPreferencesKeys.ENABLE_TELEMETRY.key, false)
        logToFile = prefs.getBoolean(SharedPreferencesKeys.TELEMETRY_LOG_TO_FILE.key, false)
        sendToCloud = prefs.getBoolean(SharedPreferencesKeys.TELEMETRY_SEND_TO_CLOUD.key, false)
        webhookUrl = prefs.getString(SharedPreferencesKeys.TELEMETRY_WEBHOOK_URL.key, "") ?: ""

        Log.d(TAG, "Preferences updated: Enabled=$enableTelemetry, File=$logToFile, Cloud=$sendToCloud, URL=$webhookUrl")
    }

    fun log(key: String, value: String) {
        if (!enableTelemetry) return

        val event = TelemetryEvent(key, value, System.currentTimeMillis())
        eventQueue.offer(event)
    }

    private fun startProcessing() {
        if (isRunning.getAndSet(true)) return

        scope.launch {
            while (isActive) {
                delay(1000) // Process every 1 second
                processQueue()
            }
        }
    }

    private suspend fun processQueue() {
        if (eventQueue.isEmpty()) return

        val eventsToProcess = mutableListOf<TelemetryEvent>()
        while (eventsToProcess.size < 500 && !eventQueue.isEmpty()) {
            eventQueue.poll()?.let { eventsToProcess.add(it) }
        }

        if (eventsToProcess.isEmpty()) return

        val batch = TelemetryBatch(
            sessionId = sessionId,
            batchTimestamp = System.currentTimeMillis(),
            events = eventsToProcess
        )

        if (logToFile) {
            saveToFile(batch)
        }

        if (sendToCloud && webhookUrl.isNotEmpty()) {
            sendToWebhook(batch)
        }
    }

    private fun saveToFile(batch: TelemetryBatch) {
        try {
            val context = App.getContext()
            val dir = File(context.getExternalFilesDir(null), "telemetry")
            if (!dir.exists()) dir.mkdirs()

            val file = File(dir, "session_$sessionId.jsonl")
            FileWriter(file, true).use { writer ->
                writer.append(gson.toJson(batch)).append("\n")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error saving to file", e)
        }
    }

    private fun sendToWebhook(batch: TelemetryBatch) {
        try {
            val json = gson.toJson(batch)
            val url = URL(webhookUrl)
            with(url.openConnection() as HttpURLConnection) {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 5000
                readTimeout = 5000

                outputStream.use { os ->
                    os.write(json.toByteArray())
                }

                val responseCode = responseCode
                if (responseCode !in 200..299) {
                     Log.e(TAG, "Webhook failed with code: $responseCode")
                } else {
                    Log.d(TAG, "Batch sent successfully: ${batch.events.size} events")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error sending to webhook", e)
        }
    }

    fun getSessionId(): String = sessionId
}
