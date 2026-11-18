package com.gymcrew.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Percentage
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.reflect.KClass
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Gym Crew ⇄ Health Connect (0.13). See src/lib/health.js for how the app uses it.
 *
 * Writes use a stable client record id ("gc-session-<id>", "gc-weight-<id>"…) and a version that only goes
 * up, so writing the same thing again updates it in Health Connect instead of adding a copy, and deleting
 * by that id removes it. Reads leave out what this app wrote itself.
 *
 * JS: registerPlugin('HealthBridge')
 *   status()                                  → { status: available|not_installed|update_required|unsupported, granted: [key] }
 *   request({ permissions: [key] })           → { granted: [key] }      key: "write:exercise", "read:heartRate", …
 *   revokeAll() · openSettings() · openStore()
 *   write({ records: [...] })                 → { written: [id], failed: [{ id, error }] }
 *   remove({ items: [{ kind, id }] })         → {}
 *   heartRate({ windows: [{ id, start, end }] }) → { results: [{ id, avg, max, kcal }] }
 *   readWorkouts({ since })                   → { workouts: [{ id, start, end, type, title, source }] }
 *   sleep({ since })                          → { sessions: [{ id, start, end, source }] }
 *   vitals({ since })                         → { resting: [{ time, bpm }], vo2: [{ time, value }] }
 *   steps({ days })                           → { days: [{ date: "YYYY-MM-DD", count }] }
 *   readBody({ since })                       → { weights: [{ id, time, kg, source }], fats: [{ id, time, percent, source }] }
 */
@CapacitorPlugin(name = "HealthBridge")
class HealthBridgePlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val permissionContract = PermissionController.createRequestPermissionResultContract()

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        scope.cancel()
    }

    // Run Health Connect work and always answer the call, so a failure never crashes the app
    private fun PluginCall.work(block: suspend (HealthConnectClient) -> Unit) {
        val call = this
        scope.launch {
            try {
                if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
                    call.reject("Health Connect isn't available", "unavailable")
                    return@launch
                }
                block(HealthConnectClient.getOrCreate(context))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                Log.e(TAG, "Health Connect call failed", e)
                call.reject(e.message ?: "Health Connect call failed", "failed", e as? Exception ?: Exception(e))
            }
        }
    }

    // ── Permissions ─────────────────────────────────────────
    private val permissionByKey: Map<String, String> by lazy {
        mapOf(
            "write:exercise" to HealthPermission.getWritePermission(ExerciseSessionRecord::class),
            "write:distance" to HealthPermission.getWritePermission(DistanceRecord::class),
            "write:weight" to HealthPermission.getWritePermission(WeightRecord::class),
            "write:bodyFat" to HealthPermission.getWritePermission(BodyFatRecord::class),
            "write:height" to HealthPermission.getWritePermission(HeightRecord::class),
            "read:weight" to HealthPermission.getReadPermission(WeightRecord::class),
            "read:bodyFat" to HealthPermission.getReadPermission(BodyFatRecord::class),
            "read:heartRate" to HealthPermission.getReadPermission(HeartRateRecord::class),
            "read:steps" to HealthPermission.getReadPermission(StepsRecord::class),
            "read:exercise" to HealthPermission.getReadPermission(ExerciseSessionRecord::class),
            "read:activeCalories" to HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
            "read:sleep" to HealthPermission.getReadPermission(SleepSessionRecord::class),
            "read:restingHeartRate" to HealthPermission.getReadPermission(RestingHeartRateRecord::class),
            "read:vo2max" to HealthPermission.getReadPermission(Vo2MaxRecord::class)
        )
    }

    private fun allows(granted: Set<String>, key: String): Boolean {
        val perm = permissionByKey[key] ?: return false
        return granted.contains(perm)
    }

    private fun keysFor(granted: Set<String>): JSArray {
        val out = JSArray()
        for ((key, perm) in permissionByKey) if (granted.contains(perm)) out.put(key)
        return out
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val sdk = HealthConnectClient.getSdkStatus(context)
        val status = when (sdk) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            else -> if (android.os.Build.VERSION.SDK_INT >= 34) "unsupported" else "not_installed"
        }
        if (sdk != HealthConnectClient.SDK_AVAILABLE) {
            call.resolve(JSObject().apply { put("status", status); put("granted", JSArray()) })
            return
        }
        call.work { client ->
            val granted = client.permissionController.getGrantedPermissions()
            call.resolve(JSObject().apply { put("status", status); put("granted", keysFor(granted)) })
        }
    }

    @PluginMethod
    fun request(call: PluginCall) {
        val keys = call.getArray("permissions")?.toList<String>() ?: emptyList()
        val wanted = keys.mapNotNull { permissionByKey[it] }.toSet()
        call.work { client ->
            val granted = client.permissionController.getGrantedPermissions()
            if (wanted.isEmpty() || granted.containsAll(wanted)) {
                call.resolve(JSObject().apply { put("granted", keysFor(granted)) })
                return@work
            }
            val intent = permissionContract.createIntent(context, wanted)
            startActivityForResult(call, intent, "permissionsResult")
        }
    }

    @ActivityCallback
    private fun permissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        call.work { client ->
            val granted = client.permissionController.getGrantedPermissions()
            call.resolve(JSObject().apply { put("granted", keysFor(granted)) })
        }
    }

    @PluginMethod
    fun revokeAll(call: PluginCall) {
        call.work { client ->
            client.permissionController.revokeAllPermissions()
            call.resolve()
        }
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: ActivityNotFoundException) {
            call.reject("Health Connect settings aren't available", "unavailable")
        }
    }

    /** The Health Connect app in the Play Store (Android 13 and older), to install or update it */
    @PluginMethod
    fun openStore(call: PluginCall) {
        val pkg = "com.google.android.apps.healthdata"
        val uri = Uri.parse("market://details?id=$pkg&url=healthconnect%3A%2F%2Fonboarding")
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pkg"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
        call.resolve()
    }

    // ── Writing ─────────────────────────────────────────────
    @PluginMethod
    fun write(call: PluginCall) {
        val list = call.getArray("records") ?: JSArray()
        call.work { client ->
            val granted = client.permissionController.getGrantedPermissions()
            val written = JSArray()
            val failed = JSArray()
            val version = System.currentTimeMillis()
            for (i in 0 until list.length()) {
                val r = list.getJSONObject(i)
                val id = r.optString("id")
                try {
                    val records = buildRecords(r, version, granted)
                    if (records.isNotEmpty()) client.insertRecords(records)
                    written.put(id)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "Couldn't write $id", e)
                    failed.put(JSObject().apply { put("id", id); put("error", e.message ?: e.javaClass.simpleName) })
                }
            }
            call.resolve(JSObject().apply { put("written", written); put("failed", failed) })
        }
    }

    private fun buildRecords(r: JSONObject, version: Long, granted: Set<String>): List<Record> {
        val id = r.getString("id")
        return when (r.getString("kind")) {
            "session" -> {
                if (!allows(granted, "write:exercise")) return emptyList()
                val start = Instant.parse(r.getString("start"))
                val end = Instant.parse(r.getString("end"))
                val out = mutableListOf<Record>(session(r, id, start, end, version))
                val km = r.optDouble("distanceKm", 0.0)
                if (km > 0 && allows(granted, "write:distance")) {
                    out.add(
                        DistanceRecord(
                            startTime = start,
                            startZoneOffset = offset(start),
                            endTime = end,
                            endZoneOffset = offset(end),
                            distance = Length.meters(km * 1000.0),
                            metadata = Metadata.manualEntry("gc-dist-$id", version)
                        )
                    )
                }
                out
            }
            "weight" -> {
                if (!allows(granted, "write:weight")) return emptyList()
                val time = Instant.parse(r.getString("time"))
                listOf(WeightRecord(time = time, zoneOffset = offset(time), weight = Mass.kilograms(r.getDouble("kg")), metadata = Metadata.manualEntry("gc-weight-$id", version)))
            }
            "fat" -> {
                if (!allows(granted, "write:bodyFat")) return emptyList()
                val time = Instant.parse(r.getString("time"))
                listOf(BodyFatRecord(time = time, zoneOffset = offset(time), percentage = Percentage(r.getDouble("percent")), metadata = Metadata.manualEntry("gc-fat-$id", version)))
            }
            "height" -> {
                if (!allows(granted, "write:height")) return emptyList()
                val time = Instant.parse(r.getString("time"))
                listOf(HeightRecord(time = time, zoneOffset = offset(time), height = Length.meters(r.getDouble("meters")), metadata = Metadata.manualEntry("gc-height-$id", version)))
            }
            else -> emptyList()
        }
    }

    private fun session(r: JSONObject, id: String, start: Instant, end: Instant, version: Long): ExerciseSessionRecord {
        return ExerciseSessionRecord(
            startTime = start,
            startZoneOffset = offset(start),
            endTime = end,
            endZoneOffset = offset(end),
            metadata = Metadata.manualEntry("gc-session-$id", version),
            exerciseType = exerciseType(r.optString("exerciseType")),
            title = r.optString("title").takeIf { it.isNotBlank() }?.take(200)
        )
    }

    private fun exerciseType(name: String): Int = when (name) {
        "strength" -> ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING
        "treadmill" -> ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL
        "walking" -> ExerciseSessionRecord.EXERCISE_TYPE_WALKING
        "bike" -> ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY
        "rower" -> ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE
        "climbing" -> ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING
        "hiit" -> ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING
        "calisthenics" -> ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS
        else -> ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val items = call.getArray("items") ?: JSArray()
        call.work { client ->
            val byType = mutableMapOf<KClass<out Record>, MutableList<String>>()
            fun add(type: KClass<out Record>, cid: String) { byType.getOrPut(type) { mutableListOf() }.add(cid) }
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                val id = item.getString("id")
                when (item.getString("kind")) {
                    "session" -> { add(ExerciseSessionRecord::class, "gc-session-$id"); add(DistanceRecord::class, "gc-dist-$id") }
                    "weight" -> add(WeightRecord::class, "gc-weight-$id")
                    "fat" -> add(BodyFatRecord::class, "gc-fat-$id")
                    "height" -> add(HeightRecord::class, "gc-height-$id")
                }
            }
            for ((type, ids) in byType) {
                try {
                    client.deleteRecords(type, emptyList(), ids)
                } catch (e: SecurityException) {
                    // No write permission for that type any more: nothing of ours to delete there
                }
            }
            call.resolve()
        }
    }

    // ── Reading ─────────────────────────────────────────────
    /** Average and highest heart rate, and active calories, in each window (a workout), from any watch or app */
    @PluginMethod
    fun heartRate(call: PluginCall) {
        val windows = call.getArray("windows") ?: JSArray()
        call.work { client ->
            val granted = client.permissionController.getGrantedPermissions()
            val hr = allows(granted, "read:heartRate")
            val kcal = allows(granted, "read:activeCalories")
            val results = JSArray()
            for (i in 0 until windows.length()) {
                val w = windows.getJSONObject(i)
                val range = TimeRangeFilter.between(Instant.parse(w.getString("start")), Instant.parse(w.getString("end")))
                val out = JSObject().apply { put("id", w.getString("id")) }
                if (hr) {
                    val res = client.aggregate(AggregateRequest(metrics = setOf(HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MAX), timeRangeFilter = range))
                    val avg = res[HeartRateRecord.BPM_AVG]
                    val max = res[HeartRateRecord.BPM_MAX]
                    if (avg != null) out.put("avg", avg)
                    if (max != null) out.put("max", max)
                }
                if (kcal) {
                    val res = client.aggregate(AggregateRequest(metrics = setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), timeRangeFilter = range))
                    val energy = res[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]
                    if (energy != null) out.put("kcal", energy.inKilocalories)
                }
                results.put(out)
            }
            call.resolve(JSObject().apply { put("results", results) })
        }
    }

    /** Workouts other apps or a watch recorded (runs, rides, swims…), not this app's own */
    @PluginMethod
    fun readWorkouts(call: PluginCall) {
        val since = call.getString("since")?.let { try { Instant.parse(it) } catch (e: Exception) { null } }
            ?: Instant.now().minusSeconds(30L * 86400)
        call.work { client ->
            val mine = context.packageName
            val out = JSArray()
            readAll(client, ExerciseSessionRecord::class, since, Instant.now()) { s ->
                if (s.metadata.dataOrigin.packageName != mine) out.put(JSObject().apply {
                    put("id", s.metadata.id)
                    put("start", s.startTime.toString())
                    put("end", s.endTime.toString())
                    put("type", exerciseName(s.exerciseType))
                    put("title", s.title ?: "")
                    put("source", s.metadata.dataOrigin.packageName)
                })
            }
            call.resolve(JSObject().apply { put("workouts", out) })
        }
    }

    private fun exerciseName(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "running"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "treadmill"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "biking"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "bike"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "swimming"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swimming"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "rower"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "strength"
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "strength"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "hiit"
        ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING -> "climbing"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "yoga"
        ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL -> "basketball"
        ExerciseSessionRecord.EXERCISE_TYPE_SOCCER -> "football"
        ExerciseSessionRecord.EXERCISE_TYPE_TENNIS -> "tennis"
        ExerciseSessionRecord.EXERCISE_TYPE_SQUASH -> "squash"
        ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON -> "badminton"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "elliptical"
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "stairs"
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "pilates"
        ExerciseSessionRecord.EXERCISE_TYPE_BOXING -> "boxing"
        ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS -> "martialArts"
        ExerciseSessionRecord.EXERCISE_TYPE_DANCING -> "dancing"
        else -> "other"
    }

    /** Sleep sessions since a moment (the app adds them up per night) */
    @PluginMethod
    fun sleep(call: PluginCall) {
        val since = call.getString("since")?.let { try { Instant.parse(it) } catch (e: Exception) { null } }
            ?: Instant.now().minusSeconds(8L * 86400)
        call.work { client ->
            val out = JSArray()
            readAll(client, SleepSessionRecord::class, since, Instant.now()) { s ->
                out.put(JSObject().apply {
                    put("id", s.metadata.id); put("start", s.startTime.toString()); put("end", s.endTime.toString())
                    put("source", s.metadata.dataOrigin.packageName)
                })
            }
            call.resolve(JSObject().apply { put("sessions", out) })
        }
    }

    /** Resting heart rate and VO2 max readings since a moment */
    @PluginMethod
    fun vitals(call: PluginCall) {
        val since = call.getString("since")?.let { try { Instant.parse(it) } catch (e: Exception) { null } }
            ?: Instant.now().minusSeconds(30L * 86400)
        call.work { client ->
            val granted = client.permissionController.getGrantedPermissions()
            val resting = JSArray()
            val vo2 = JSArray()
            if (allows(granted, "read:restingHeartRate")) {
                readAll(client, RestingHeartRateRecord::class, since, Instant.now()) { r ->
                    resting.put(JSObject().apply { put("time", r.time.toString()); put("bpm", r.beatsPerMinute) })
                }
            }
            if (allows(granted, "read:vo2max")) {
                readAll(client, Vo2MaxRecord::class, since, Instant.now()) { r ->
                    vo2.put(JSObject().apply { put("time", r.time.toString()); put("value", r.vo2MillilitersPerMinuteKilogram) })
                }
            }
            call.resolve(JSObject().apply { put("resting", resting); put("vo2", vo2) })
        }
    }

    /** Steps per day for the last N days, today included (Health Connect removes double counting between apps) */
    @PluginMethod
    fun steps(call: PluginCall) {
        val days = (call.getInt("days") ?: 7).coerceIn(1, 30)
        call.work { client ->
            val today = LocalDate.now()
            val from = today.minusDays((days - 1).toLong()).atStartOfDay()
            val to = today.plusDays(1).atStartOfDay()
            val groups = client.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(from, to),
                    timeRangeSlicer = Period.ofDays(1)
                )
            )
            val out = JSArray()
            for (g in groups) {
                val count = g.result[StepsRecord.COUNT_TOTAL] ?: continue
                out.put(JSObject().apply { put("date", g.startTime.toLocalDate().toString()); put("count", count) })
            }
            call.resolve(JSObject().apply { put("days", out) })
        }
    }

    /** Weigh-ins and body fat from other apps (a smart scale, Samsung Health…), not the ones this app wrote */
    @PluginMethod
    fun readBody(call: PluginCall) {
        val since = call.getString("since")?.let { try { Instant.parse(it) } catch (e: Exception) { null } }
            ?: Instant.now().minusSeconds(30L * 86400)
        call.work { client ->
            val granted = client.permissionController.getGrantedPermissions()
            val mine = context.packageName
            val now = Instant.now()
            val weights = JSArray()
            val fats = JSArray()
            if (allows(granted, "read:weight")) {
                readAll(client, WeightRecord::class, since, now) { w ->
                    if (w.metadata.dataOrigin.packageName != mine) weights.put(JSObject().apply {
                        put("id", w.metadata.id); put("time", w.time.toString()); put("kg", w.weight.inKilograms)
                        put("source", w.metadata.dataOrigin.packageName)
                    })
                }
            }
            if (allows(granted, "read:bodyFat")) {
                readAll(client, BodyFatRecord::class, since, now) { f ->
                    if (f.metadata.dataOrigin.packageName != mine) fats.put(JSObject().apply {
                        put("id", f.metadata.id); put("time", f.time.toString()); put("percent", f.percentage.value)
                        put("source", f.metadata.dataOrigin.packageName)
                    })
                }
            }
            call.resolve(JSObject().apply { put("weights", weights); put("fats", fats) })
        }
    }

    private suspend fun <T : Record> readAll(
        client: HealthConnectClient, type: KClass<T>, start: Instant, end: Instant, each: (T) -> Unit
    ) {
        var token: String? = null
        var pages = 0
        do {
            val res = client.readRecords(
                ReadRecordsRequest(recordType = type, timeRangeFilter = TimeRangeFilter.between(start, end), pageSize = 500, pageToken = token)
            )
            res.records.forEach(each)
            // An exhausted page token can be "" instead of null on older Health Connect versions
            token = res.pageToken
            pages++
        } while (!token.isNullOrEmpty() && pages < 20)
    }

    private fun offset(t: Instant): ZoneOffset = ZoneId.systemDefault().rules.getOffset(t)

    companion object {
        private const val TAG = "HealthBridge"
    }
}
