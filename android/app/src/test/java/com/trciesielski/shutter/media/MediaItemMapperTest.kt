package com.trciesielski.shutter.media

import android.net.Uri
import com.trciesielski.shutter.data.Track
import com.trciesielski.shutter.data.TrackSource
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MediaItemMapperTest {
    @Test fun catalogTrackMapsToPlayableHttpsItem() {
        val track = Track("catalog:1", "Title", "Artist", "Album",
            Uri.parse("https://shutter-web-6p2.pages.dev/music/song.mp3"), TrackSource.CATALOG,
            "audio/mpeg", 1234, Uri.parse("https://shutter-web-6p2.pages.dev/music/cover.jpg"), 2)
        val item = MediaItemMapper.toMediaItem(track)
        assertEquals(track.id, item.mediaId)
        assertEquals(track.uri, item.localConfiguration!!.uri)
        assertEquals(track.mimeType, item.localConfiguration!!.mimeType)
        assertEquals(1234L, item.mediaMetadata.durationMs)
        assertEquals(track.artworkUri, item.mediaMetadata.artworkUri)
        assertTrue(item.mediaMetadata.isPlayable == true)
        assertFalse(item.mediaMetadata.isBrowsable == true)
    }

    @Test fun localBrowseTrackKeepsContentUriAndStableId() {
        val uri = Uri.parse("content://provider/document/audio%3A1")
        val track = Track("local:abc", "Local", "Artist", "Album", uri,
            TrackSource.LOCAL, "audio/flac", null, null, null)
        val item = MediaItemMapper.toBrowseItem(track)
        assertEquals(track.id, item.mediaId)
        assertEquals(uri, item.localConfiguration!!.uri)
        assertTrue(item.mediaMetadata.isPlayable == true)
        assertFalse(item.mediaMetadata.isBrowsable == true)
    }
}
