package br.com.redesurftank.havalshisuku.models

object VehicleRevisions {
    private val revisionPlans = mapOf(
        "Haval H6" to listOf(12000, 24000, 36000, 48000, 60000),
        "Ora 03" to listOf(24000, 48000, 72000, 96000, 120000)
    )

    fun calculateNextRevision(model: String, currentKm: Int): Int? {
        return revisionPlans[model]?.find { it > currentKm }
    }
}
