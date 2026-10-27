package com.trciesielski.shutter.data

import android.net.Uri
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.net.URI
import java.nio.charset.StandardCharsets

enum class CatalogErrorCode { INVALID, TOO_LARGE, NETWORK, TIMEOUT, HTTP }

class CatalogException(val code: CatalogErrorCode, val retryable: Boolean, val httpStatus: Int? = null, cause: Throwable? = null) : Exception(code.name, cause)
data class SkippedCatalogTrack(val position: Int, val id: String?, val reason: String)
data class CatalogSnapshot(val title: String?, val tracks: List<Track>, val skipped: List<SkippedCatalogTrack>)

class JsonCatalogParser {
    companion object {
        const val MAX_BYTES = 2_000_000
        const val MAX_TRACKS = 5_000
        private val idPattern = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
        private val audioTypes = mapOf("mp3" to "audio/mpeg", "m4a" to "audio/mp4", "mp4" to "audio/mp4", "aac" to "audio/aac", "ogg" to "audio/ogg", "oga" to "audio/ogg", "opus" to "audio/ogg; codecs=opus", "wav" to "audio/wav", "flac" to "audio/flac", "webm" to "audio/webm")
        private val supportedTypes = audioTypes.values.map { it.substringBefore(';') }.toSet()
        private val imagePattern = Regex("(?i)\\.(jpe?g|png|webp|avif|gif)$")
    }

    fun parse(json: String, baseUrl: String, allowedOrigins: Set<String>): CatalogSnapshot {
        if (json.toByteArray(StandardCharsets.UTF_8).size > MAX_BYTES) throw CatalogException(CatalogErrorCode.TOO_LARGE, false)
        val root = try { JSONObject(json) } catch (e: JSONException) { throw CatalogException(CatalogErrorCode.INVALID, false, cause = e) }
        if (root.opt("version") != 1 || root.opt("tracks") !is JSONArray) throw CatalogException(CatalogErrorCode.INVALID, false)
        val entries = root.getJSONArray("tracks")
        val accepted = mutableListOf<Pair<Int, Track>>()
        val skipped = mutableListOf<SkippedCatalogTrack>()
        val seen = mutableSetOf<String>()
        for (index in 0 until minOf(entries.length(), MAX_TRACKS)) {
            val entry = entries.optJSONObject(index)
            val id = (entry?.opt("id") as? String)?.trim().orEmpty()
            fun skip(reason: String) { skipped += SkippedCatalogTrack(index, id.take(128).ifEmpty { null }, reason) }
            if (entry == null) { skip("invalid-entry"); continue }
            if (!idPattern.matches(id)) { skip("invalid-id"); continue }
            if (id in seen) { skip("duplicate-id"); continue }
            val title = cleanText(entry.opt("title"), 200)
            if (title.isEmpty()) { skip("missing-title"); continue }
            val audio = resolveAsset(entry.opt("audio") as? String, baseUrl, allowedOrigins)
            if (audio == null) { skip("invalid-audio-url"); continue }
            val declared = (entry.opt("mimeType") as? String)?.trim()?.lowercase()?.takeIf { Regex("audio/[a-z0-9.+-]+(;.*)?").matches(it) }
            val extension = audio.path.substringAfterLast('.', "").lowercase()
            val mime = declared ?: audioTypes[extension]
            if (mime == null) { skip("unknown-audio-format"); continue }
            if (mime.substringBefore(';') !in supportedTypes) { skip("unsupported-audio-format"); continue }
            seen += id
            val coverValue = entry.opt("cover") as? String
            val cover = if (coverValue != null && imagePattern.containsMatchIn(coverValue.substringBefore('?').substringBefore('#'))) resolveAsset(coverValue, baseUrl, allowedOrigins) else null
            val seconds = finite(entry.opt("duration"), 0.01, 86400.0)
            val order = finite(entry.opt("order"), -1e9, 1e9)?.toInt()
            accepted += index to Track(id, title, cleanText(entry.opt("artist"), 200).ifEmpty { "Nieznany wykonawca" }, cleanText(entry.opt("album"), 200).ifEmpty { "Nieznany album" }, Uri.parse(audio.toString()), TrackSource.CATALOG, mime, seconds?.times(1000)?.toLong(), cover?.let { Uri.parse(it.toString()) }, order)
        }
        if (entries.length() > MAX_TRACKS) skipped += SkippedCatalogTrack(MAX_TRACKS, null, "too-many-tracks")
        val tracks = accepted.sortedWith(compareBy<Pair<Int, Track>> { it.second.order ?: Int.MAX_VALUE }.thenBy { it.first }).map { it.second }
        return CatalogSnapshot(cleanText(root.opt("title"), 120).ifEmpty { null }, tracks, skipped)
    }

    private fun cleanText(value: Any?, max: Int): String {
        if (value !is String && value !is Number) return ""
        return value.toString().replace(Regex("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u202A-\\u202E\\u2066-\\u2069]"), "").replace(Regex("[ \\t]+"), " ").trim().take(max)
    }

    private fun finite(value: Any?, min: Double, max: Double): Double? = (value as? Number)?.toDouble()?.takeIf { it.isFinite() && it in min..max }
        ?: (value as? String)?.takeIf { it.isNotBlank() }?.toDoubleOrNull()?.takeIf { it.isFinite() && it in min..max }

    internal fun resolveAsset(value: String?, baseUrl: String, allowedOrigins: Set<String>): URI? {
        if (value.isNullOrBlank() || value.length > 2048) return null
        return try {
            val uri = URI(baseUrl).resolve(value.trim()).normalize()
            val host = uri.host?.lowercase() ?: return null
            if (uri.scheme != "https" && !(uri.scheme == "http" && host in setOf("localhost", "127.0.0.1", "[::1]"))) return null
            if (uri.rawUserInfo != null || uri.fragment != null) return null
            val origin = "${uri.scheme}://$host${if (uri.port == -1) "" else ":${uri.port}"}"
            if (origin !in allowedOrigins) null else uri
        } catch (_: Exception) { null }
    }
}
