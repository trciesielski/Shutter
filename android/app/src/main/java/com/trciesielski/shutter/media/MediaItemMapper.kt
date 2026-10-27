package com.trciesielski.shutter.media

import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.trciesielski.shutter.data.Track
import com.trciesielski.shutter.data.TrackSource

object MediaItemMapper {
    fun toMediaItem(track: Track): MediaItem {
        validate(track)
        return MediaItem.Builder().setMediaId(track.id).setUri(track.uri)
            .setMimeType(track.mimeType)
            .setMediaMetadata(metadata(track))
            .build()
    }

    fun toBrowseItem(track: Track): MediaItem {
        validate(track)
        return MediaItem.Builder().setMediaId(track.id).setUri(track.uri)
            .setMimeType(track.mimeType)
            .setMediaMetadata(metadata(track))
            .build()
    }

    private fun metadata(track: Track) = MediaMetadata.Builder()
        .setTitle(track.title).setArtist(track.artist).setAlbumTitle(track.album)
        .setArtworkUri(track.artworkUri).setDurationMs(track.durationMs)
        .setIsBrowsable(false).setIsPlayable(true).build()

    private fun validate(track: Track) {
        require(track.id.isNotBlank())
        require(when (track.source) {
            TrackSource.LOCAL -> track.uri.scheme == "content"
            TrackSource.CATALOG -> track.uri.scheme == "https"
        })
    }
}
