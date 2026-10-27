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
        db.withTransaction { db.trackDao().upsert(TrackEntity.from(track, documentSize, documentModifiedMs)) }
    }
    fun observeTracks(): Flow<List<Track>> = db.trackDao().observe().map { rows -> rows.map(TrackEntity::toTrack) }
    suspend fun tracks(): List<Track> = db.trackDao().all().map(TrackEntity::toTrack)
    suspend fun resolve(trackId: String): Track? = db.trackDao().find(trackId)?.toTrack()
    suspend fun remove(trackId: String) { db.withTransaction { db.trackDao().remove(trackId) } }

    suspend fun setRating(trackId: String, rating: Int?, favorite: Boolean) {
        require(rating == null || rating in 0..5)
        db.withTransaction { db.stateDao().upsertRating(RatingEntity(trackId, rating, favorite)) }
    }
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
