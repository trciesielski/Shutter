package com.trciesielski.shutter.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "playback_state")
data class PlaybackStateEntity(@PrimaryKey val key: String = "current", val trackId: String?, val positionMs: Long, val updatedAtMs: Long)
