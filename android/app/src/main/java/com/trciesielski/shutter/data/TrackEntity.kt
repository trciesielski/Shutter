package com.trciesielski.shutter.data

import android.net.Uri
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "tracks", indices = [Index("source")])
data class TrackEntity(
    @PrimaryKey val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val uri: String,
    val source: TrackSource,
    val mimeType: String?,
    val durationMs: Long?,
    val artworkUri: String?,
    val sortOrder: Int?,
    val documentSize: Long? = null,
    val documentModifiedMs: Long? = null,
    val available: Boolean = true
) {
    fun toTrack() = Track(id, title, artist, album, Uri.parse(uri), source, mimeType, durationMs, artworkUri?.let(Uri::parse), sortOrder)
    companion object {
        fun from(track: Track, size: Long? = null, modifiedMs: Long? = null) = TrackEntity(track.id, track.title, track.artist, track.album, track.uri.toString(), track.source, track.mimeType, track.durationMs, track.artworkUri?.toString(), track.order, size, modifiedMs)
    }
}
