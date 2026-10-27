package com.trciesielski.shutter.data

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "playlists")
data class PlaylistEntity(@PrimaryKey val id: String, val name: String, val sortOrder: Int = 0)

@Entity(tableName = "playlist_entries", primaryKeys = ["playlistId", "position"], foreignKeys = [ForeignKey(entity = PlaylistEntity::class, parentColumns = ["id"], childColumns = ["playlistId"], onDelete = ForeignKey.CASCADE)], indices = [Index("playlistId"), Index("trackId")])
data class PlaylistEntryEntity(val playlistId: String, val position: Int, val trackId: String, val orphaned: Boolean = false)

@Entity(tableName = "ratings")
data class RatingEntity(@PrimaryKey val trackId: String, val rating: Int?, val favorite: Boolean)

@Entity(tableName = "listening_history", primaryKeys = ["trackId", "playedAtMs"])
data class ListeningHistoryEntity(val trackId: String, val playedAtMs: Long)

@Entity(tableName = "migration_markers")
data class MigrationMarkerEntity(@PrimaryKey val version: Int, val completedAtMs: Long)
