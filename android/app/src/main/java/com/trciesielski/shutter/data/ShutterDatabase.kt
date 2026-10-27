package com.trciesielski.shutter.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Database(entities = [TrackEntity::class, PlaylistEntity::class, PlaylistEntryEntity::class, RatingEntity::class, ListeningHistoryEntity::class, PlaybackStateEntity::class, MigrationMarkerEntity::class], version = 1, exportSchema = false)
@TypeConverters(TrackSourceConverter::class)
abstract class ShutterDatabase : RoomDatabase() {
    abstract fun trackDao(): TrackDao
    abstract fun playlistDao(): PlaylistDao
    abstract fun stateDao(): StateDao
}

class TrackSourceConverter {
    @TypeConverter fun toString(value: TrackSource): String = value.name
    @TypeConverter fun fromString(value: String): TrackSource = TrackSource.valueOf(value)
}

@Dao
interface TrackDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(track: TrackEntity)
    @Query("SELECT * FROM tracks ORDER BY CASE WHEN sortOrder IS NULL THEN 1 ELSE 0 END, sortOrder, id") fun observe(): Flow<List<TrackEntity>>
    @Query("SELECT * FROM tracks ORDER BY CASE WHEN sortOrder IS NULL THEN 1 ELSE 0 END, sortOrder, id") suspend fun all(): List<TrackEntity>
    @Query("SELECT * FROM tracks WHERE id = :id") suspend fun find(id: String): TrackEntity?
    @Query("SELECT * FROM tracks WHERE uri = :uri") suspend fun byUri(uri: String): List<TrackEntity>
    @Query("DELETE FROM tracks WHERE id = :id") suspend fun remove(id: String)
}

@Dao
interface PlaylistDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(playlist: PlaylistEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertEntries(entries: List<PlaylistEntryEntity>)
    @Query("DELETE FROM playlist_entries WHERE playlistId = :playlistId") suspend fun clearEntries(playlistId: String)
    @Query("UPDATE playlist_entries SET trackId = :newId, orphaned = 0 WHERE trackId = :oldId") suspend fun retargetEntries(oldId: String, newId: String)
    @Query("SELECT * FROM playlists ORDER BY sortOrder, id") fun observePlaylists(): Flow<List<PlaylistEntity>>
    @Query("SELECT * FROM playlist_entries WHERE playlistId = :playlistId ORDER BY position") suspend fun entries(playlistId: String): List<PlaylistEntryEntity>
    @Query("DELETE FROM playlists WHERE id = :playlistId") suspend fun remove(playlistId: String)
}

@Dao
interface StateDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertRating(value: RatingEntity)
    @Query("SELECT * FROM ratings WHERE trackId = :trackId") suspend fun rating(trackId: String): RatingEntity?
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun addHistory(value: ListeningHistoryEntity)
    @Query("SELECT * FROM listening_history ORDER BY playedAtMs DESC, trackId") suspend fun history(): List<ListeningHistoryEntity>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertPlayback(value: PlaybackStateEntity)
    @Query("SELECT * FROM playback_state WHERE `key` = 'current'") suspend fun playback(): PlaybackStateEntity?
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun markMigration(value: MigrationMarkerEntity)
    @Query("SELECT * FROM migration_markers WHERE version = :version") suspend fun migration(version: Int): MigrationMarkerEntity?
}
