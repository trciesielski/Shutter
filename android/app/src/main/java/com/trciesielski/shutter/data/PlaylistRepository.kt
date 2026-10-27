package com.trciesielski.shutter.data

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow

class PlaylistRepository(private val db: ShutterDatabase) {
    suspend fun upsert(playlist: PlaylistEntity, trackIds: List<String>, orphanedIds: Set<String>? = null) {
        require(playlist.id.isNotBlank())
        require(trackIds.none(String::isBlank))
        db.withTransaction {
            val effectiveOrphans = orphanedIds ?: db.playlistDao().entries(playlist.id).filter { it.orphaned }.map { it.trackId }.toSet()
            db.playlistDao().upsert(playlist)
            db.playlistDao().clearEntries(playlist.id)
            db.playlistDao().insertEntries(trackIds.mapIndexed { index, id -> PlaylistEntryEntity(playlist.id, index, id, id in effectiveOrphans) })
        }
    }
    fun observePlaylists(): Flow<List<PlaylistEntity>> = db.playlistDao().observePlaylists()
    suspend fun entries(playlistId: String): List<PlaylistEntryEntity> = db.playlistDao().entries(playlistId)
    suspend fun remove(playlistId: String) { db.withTransaction { db.playlistDao().remove(playlistId) } }
}
