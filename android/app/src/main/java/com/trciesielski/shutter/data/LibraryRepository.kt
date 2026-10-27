package com.trciesielski.shutter.data

import android.net.Uri
import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.security.MessageDigest

class LibraryRepository(private val db: ShutterDatabase) {
    suspend fun upsert(track: Track, documentSize: Long? = null, documentModifiedMs: Long? = null) {
        require(track.id.isNotBlank())
        require((track.source == TrackSource.LOCAL && track.uri.scheme == "content") || (track.source == TrackSource.CATALOG && (track.uri.scheme == "https" || (track.uri.scheme == "http" && track.uri.host in setOf("localhost", "127.0.0.1", "[::1]")))))
        if (track.source == TrackSource.LOCAL) require(track.id == localId(track.uri, documentSize, documentModifiedMs)) { "Local track ID must match its document URI and metadata" }
        db.withTransaction { db.trackDao().upsert(TrackEntity.from(track, documentSize, documentModifiedMs)) }
    }
    suspend fun replaceLocalIdentity(track: Track, documentSize: Long?, documentModifiedMs: Long?): List<String> {
        require(track.source == TrackSource.LOCAL && track.uri.scheme == "content")
        require(track.id == localId(track.uri, documentSize, documentModifiedMs))
        return db.withTransaction {
            val staleIds = db.trackDao().byUri(track.uri.toString())
                .filter { it.source == TrackSource.LOCAL && it.id != track.id }
                .map { it.id }
            db.trackDao().upsert(TrackEntity.from(track, documentSize, documentModifiedMs))
            for (staleId in staleIds) {
                db.playlistDao().retargetEntries(staleId, track.id)
                db.trackDao().remove(staleId)
            }
            staleIds
        }
    }
    fun observeTracks(): Flow<List<Track>> = db.trackDao().observe().map { rows -> rows.map(TrackEntity::toTrack) }
    suspend fun tracks(): List<Track> = db.trackDao().all().map(TrackEntity::toTrack)
    suspend fun resolve(trackId: String): Track? = db.trackDao().find(trackId)?.toTrack()
    suspend fun remove(trackId: String) { db.withTransaction { db.trackDao().remove(trackId) } }

    suspend fun setRating(trackId: String, rating: Int?, favorite: Boolean) {
        require(rating == null || rating in 0..5)
        db.withTransaction { db.stateDao().upsertRating(RatingEntity(trackId, rating, favorite)) }
    }
    suspend fun setPreferenceRating(trackId: String, rating: String?) {
        require(trackId.isNotBlank() && trackId.length <= 256)
        require(rating == null || rating == "up" || rating == "down")
        db.withTransaction {
            val favorite = db.stateDao().rating(trackId)?.favorite ?: false
            db.stateDao().upsertRating(RatingEntity(trackId, when (rating) { "up" -> 5; "down" -> 0; else -> null }, favorite))
        }
    }
    suspend fun preferenceRatings(): Map<String, String> = db.stateDao().ratings().mapNotNull { row ->
        when (row.rating) { 5 -> row.trackId to "up"; 0 -> row.trackId to "down"; else -> null }
    }.toMap()
    suspend fun recordPlay(trackId: String, playedAtMs: Long) { db.withTransaction { db.stateDao().addHistory(ListeningHistoryEntity(trackId, playedAtMs)) } }
    suspend fun savePosition(trackId: String?, positionMs: Long, updatedAtMs: Long) {
        require(positionMs >= 0)
        db.withTransaction { db.stateDao().upsertPlayback(PlaybackStateEntity(trackId = trackId, positionMs = positionMs, updatedAtMs = updatedAtMs)) }
    }
    suspend fun markMigration(version: Int, completedAtMs: Long) { db.withTransaction { db.stateDao().markMigration(MigrationMarkerEntity(version, completedAtMs)) } }

    companion object {
        fun localId(uri: Uri, size: Long?, modifiedMs: Long?): String {
            require(uri.scheme == "content")
            val canonical = "${uri}|${size ?: -1}|${modifiedMs ?: -1}"
            val digest = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8))
            return "local:" + digest.joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }
    }
}
