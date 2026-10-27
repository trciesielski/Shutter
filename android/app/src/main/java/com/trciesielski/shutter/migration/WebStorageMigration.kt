package com.trciesielski.shutter.migration

import androidx.room.withTransaction
import com.trciesielski.shutter.data.*
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.json.JSONObject

data class MigrationReport(val completed: Boolean, val diagnostics: List<String>, val importedPlaylists: Int, val importedHistory: Int)
private class MigrationTooLarge(message: String) : IllegalArgumentException(message)

/** Parse before writing, then apply all accepted scalar state and the marker in one Room transaction. */
class WebStorageMigration(private val db: ShutterDatabase) {
    suspend fun migrate(payload: Map<String, String?>, schemaVersion: Int): MigrationReport {
        require(schemaVersion == 1) { "Unsupported migration schema" }
        val diagnostics = mutableListOf<String>()
        fun <T> read(key: String, fallback: T, decode: (String) -> T): T {
            val raw = payload[key] ?: return fallback
            if (raw.length > 2_000_000) throw MigrationTooLarge("$key: too large; migration not committed")
            return try { decode(raw) }
            catch (error: MigrationTooLarge) { throw error }
            catch (_: Exception) { diagnostics += "$key: malformed JSON or fields"; fallback }
        }
        val playlists = read("shutter-user-playlists-v1", emptyList<Triple<String, String, List<String>>>()) { raw ->
            val arr = JSONArray(raw)
            if (arr.length() > 500) throw MigrationTooLarge("shutter-user-playlists-v1: more than 500 playlists; migration not committed")
            (0 until arr.length()).mapNotNull { i ->
                val item = arr.optJSONObject(i)
                val id = item?.opt("id") as? String
                val name = item?.opt("name") as? String
                val tracks = item?.optJSONArray("tracks")
                if (tracks != null && tracks.length() > 5000) throw MigrationTooLarge("shutter-user-playlists-v1[$i]: more than 5000 tracks; migration not committed")
                if (id.isNullOrBlank() || id.length > 128 || name.isNullOrBlank() || tracks == null) {
                    diagnostics += "shutter-user-playlists-v1[$i]: invalid playlist"; null
                } else {
                    Triple(id, name.take(200), (0 until tracks.length()).mapNotNull { j ->
                    (tracks.opt(j) as? String)?.takeIf { it.isNotBlank() && it.length <= 256 }
                        ?: run { diagnostics += "shutter-user-playlists-v1[$i].tracks[$j]: invalid ID"; null }
                    }.distinct())
                }
            }
        }
        val favorites = read("shutter-favorites", emptyList<String>()) { raw ->
            val arr = JSONArray(raw)
            if (arr.length() > 5000) throw MigrationTooLarge("shutter-favorites: more than 5000 tracks; migration not committed")
            (0 until arr.length()).mapNotNull { (arr.opt(it) as? String)?.takeIf { id -> id.isNotBlank() && id.length <= 256 } }.distinct()
        }
        val ratings = read("shutter-track-preferences-v1", emptyMap<String, String>()) { raw ->
            val obj = JSONObject(raw)
            obj.keys().asSequence().filter { it.isNotBlank() && it.length <= 256 }.mapNotNull { id ->
                (obj.opt(id) as? String)?.takeIf { it == "up" || it == "down" }?.let { id to it }
            }.toMap()
        }
        val history = read("shutter-listening-history-v1", emptyList<Pair<String, Long>>()) { raw ->
            val arr = JSONArray(raw)
            if (arr.length() > 500) throw MigrationTooLarge("shutter-listening-history-v1: more than 500 rows; migration not committed")
            (0 until arr.length()).mapNotNull { i ->
                val row = arr.optJSONObject(i)
                val id = row?.opt("id") as? String
                val at = row?.opt("at") as? Number
                if (id.isNullOrBlank() || id.length > 256 || at == null || at.toDouble() < 0 || !at.toDouble().isFinite()) {
                    diagnostics += "shutter-listening-history-v1[$i]: invalid row"; null
                } else id to at.toLong()
            }.distinct()
        }
        val position = read("shutter-last-position-v1", null as Pair<String, Long>?) { raw ->
            val obj = JSONObject(raw)
            val id = obj.opt("id") as? String
            val seconds = obj.opt("time") as? Number
            if (id.isNullOrBlank() || id.length > 256 || seconds == null || !seconds.toDouble().isFinite() || seconds.toDouble() < 0 || seconds.toDouble() > 86400.0) {
                diagnostics += "shutter-last-position-v1: invalid position"; null
            } else id to (seconds.toDouble() * 1000).toLong()
        }
        return db.withTransaction {
            if (db.stateDao().migration(1) != null) return@withTransaction MigrationReport(false, diagnostics, 0, 0)
            val existing = db.playlistDao().observePlaylists().first().associateBy { it.id }
            val knownTracks = db.trackDao().all().map { it.id }.toSet()
            var count = 0
            for ((id, name, ids) in playlists + (if (favorites.isEmpty()) emptyList() else listOf(Triple("shutter-favorites", "Ulubione", favorites)))) {
                val previous = db.playlistDao().entries(id)
                val merged = (previous.map { it.trackId } + ids).distinct()
                db.playlistDao().upsert(existing[id] ?: PlaylistEntity(id, name, count))
                db.playlistDao().clearEntries(id)
                db.playlistDao().insertEntries(merged.mapIndexed { index, trackId ->
                    PlaylistEntryEntity(id, index, trackId, previous.any { it.trackId == trackId && it.orphaned } || trackId !in knownTracks && (trackId.startsWith("blob:") || trackId.startsWith("local:") || Regex("^local-[0-9]+-[0-9]+$").matches(trackId)))
                })
                count++
            }
            for ((id, rating) in ratings) if (db.stateDao().rating(id) == null) db.stateDao().upsertRating(RatingEntity(id, if (rating == "up") 5 else 0, rating == "up"))
            for (id in favorites) if (db.stateDao().rating(id) == null) db.stateDao().upsertRating(RatingEntity(id, null, true))
            for ((id, at) in history) db.stateDao().addHistory(ListeningHistoryEntity(id, at))
            if (position != null && db.stateDao().playback() == null) db.stateDao().upsertPlayback(PlaybackStateEntity(trackId = position.first, positionMs = position.second, updatedAtMs = System.currentTimeMillis()))
            db.stateDao().markMigration(MigrationMarkerEntity(1, System.currentTimeMillis()))
            MigrationReport(true, diagnostics, count, history.size)
        }
    }
}
