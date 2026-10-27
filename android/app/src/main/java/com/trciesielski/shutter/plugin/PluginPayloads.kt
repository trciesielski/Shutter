package com.trciesielski.shutter.plugin

import androidx.media3.common.MediaItem
import com.getcapacitor.JSObject
import com.trciesielski.shutter.audio.NativeAudioAnalysisFrame
import org.json.JSONArray
import org.json.JSONObject

object PluginPayloads {
    const val VERSION = 1
    fun seek(value: JSONObject): Long {
        val n = value.opt("positionMs") as? Number ?: throw IllegalArgumentException("positionMs must be a nonnegative integer")
        require(n.toDouble().isFinite() && n.toDouble() >= 0 && n.toDouble() <= Long.MAX_VALUE && n.toDouble() % 1.0 == 0.0) { "Invalid positionMs" }
        return n.toLong()
    }
    fun volume(value: JSONObject): Float {
        val n = value.opt("value") as? Number ?: throw IllegalArgumentException("value must be between 0 and 1")
        require(n.toDouble().isFinite() && n.toDouble() in 0.0..1.0) { "Invalid volume" }
        return n.toFloat()
    }
    fun queue(value: JSONObject, limit: Int = 5000): Pair<List<String>, Int> {
        val array = value.opt("trackIds") as? JSONArray ?: throw IllegalArgumentException("trackIds required")
        require(array.length() in 1..limit) { "Invalid queue length" }
        val ids = (0 until array.length()).map { (array.opt(it) as? String)?.takeIf { id -> id.isNotBlank() && id.length <= 256 } ?: throw IllegalArgumentException("Invalid track ID") }
        val index = (value.opt("startIndex") as? Number)?.toInt() ?: 0
        require(index in ids.indices && (value.opt("startIndex") == null || (value.opt("startIndex") as Number).toDouble() == index.toDouble())) { "Invalid startIndex" }
        return ids to index
    }
    fun repeat(value: JSONObject): Int = when (value.opt("mode")) {
        "off" -> 0; "one" -> 1; "all" -> 2
        else -> throw IllegalArgumentException("Invalid repeat mode")
    }
    fun requiredId(value: JSONObject, key: String): String = (value.opt(key) as? String)?.takeIf { it.isNotBlank() && it.length <= 256 }
        ?: throw IllegalArgumentException("Invalid $key")
    fun enabled(value: JSONObject): Boolean = value.opt("enabled") as? Boolean ?: throw IllegalArgumentException("enabled must be boolean")
    suspend fun resolvePlayable(ids: List<String>, getItem: suspend (String) -> MediaItem?): List<MediaItem> = ids.map { id ->
        getItem(id)?.takeIf { it.mediaMetadata.isPlayable == true }
            ?: throw IllegalArgumentException("Unknown or unplayable media ID: $id")
    }
    suspend fun replaceQueue(ids: List<String>, getItem: suspend (String) -> MediaItem?, replace: suspend (List<MediaItem>) -> Unit) {
        replace(resolvePlayable(ids, getItem))
    }
    fun analysisFrame(frame: NativeAudioAnalysisFrame): JSObject = JSObject()
        .put("bands", JSONArray(frame.bands))
        .put("signalStatus", frame.signalStatus)
        .put("analysisRevision", frame.revision)
        .put("signalDebug", JSObject()
            .put("context", "media3-pcm")
            .put("sampleRate", frame.sampleRate)
            .put("channels", frame.channelCount)
            .put("rms", frame.rms)
            .put("peak", frame.peak)
            .put("maxBand", frame.bands.maxOrNull() ?: 0))
}
