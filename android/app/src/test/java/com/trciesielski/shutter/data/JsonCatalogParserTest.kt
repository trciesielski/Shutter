package com.trciesielski.shutter.data

import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class JsonCatalogParserTest {
    private val parser = JsonCatalogParser()
    private val base = "https://shutter-web-6p2.pages.dev/music/"
    private val origins = setOf("https://shutter-web-6p2.pages.dev")

    private fun parse(tracks: String) = parser.parse("""{"version":1,"title":" Mix ","tracks":[$tracks]}""", base, origins)
    private fun entry(id: String = "one", audio: String = "song.mp3", extra: String = "") =
        """{"id":"$id","title":" Song ","audio":"$audio"$extra}"""

    @Test fun relativePathResolvesAtStagingBaseAndPreservesId() {
        val snapshot = parse(entry("stable-id", "album/song.mp3", ",\"order\":2,\"duration\":1.25"))
        assertEquals("Mix", snapshot.title)
        assertEquals("stable-id", snapshot.tracks.single().id)
        assertEquals("https://shutter-web-6p2.pages.dev/music/album/song.mp3", snapshot.tracks.single().uri.toString())
        assertEquals(1250L, snapshot.tracks.single().durationMs)
    }

    @Test fun unsafeOriginsAndPathsAreSkipped() {
        val snapshot = parse(listOf(entry("a", "http://evil.test/song.mp3"), entry("b", "https://evil.test/song.mp3"), entry("c", "//evil.test/song.mp3"), entry("d", "https://user:pass@shutter-web-6p2.pages.dev/music/song.mp3"), entry("e", "javascript:alert(1)")).joinToString(","))
        assertTrue(snapshot.tracks.isEmpty())
        assertEquals(5, snapshot.skipped.size)
    }

    @Test fun duplicateIdsAndUnsupportedMimeAreSkipped() {
        val snapshot = parse(listOf(entry(), entry("one", "other.mp3"), entry("bad", "song.exe"), entry("bad2", "song.mp3", ",\"mimeType\":\"audio/x-unknown\"")).joinToString(","))
        assertEquals(listOf("one"), snapshot.tracks.map { it.id })
        assertEquals(listOf("duplicate-id", "unknown-audio-format", "unsupported-audio-format"), snapshot.skipped.map { it.reason })
    }

    @Test fun invalidMetadataIsNormalizedOrSkipped() {
        val snapshot = parse(entry("x", "song.mp3", ",\"artist\":\"  A  B \",\"duration\":-4,\"order\":\"bad\",\"cover\":\"cover.svg\""))
        val track = snapshot.tracks.single()
        assertEquals("A B", track.artist)
        assertNull(track.durationMs)
        assertNull(track.order)
        assertNull(track.artworkUri)
        assertEquals("missing-title", parse("""{"id":"x","title":" ","audio":"song.mp3"}""").skipped.single().reason)
    }

    @Test fun byteAndCountLimitsApply() {
        try { parser.parse(" ".repeat(2_000_001), base, origins); fail("size") }
        catch (e: CatalogException) { assertEquals(CatalogErrorCode.TOO_LARGE, e.code) }
        val many = (0..5000).joinToString(",") { entry("id$it") }
        val snapshot = parse(many)
        assertEquals(5000, snapshot.tracks.size)
        assertEquals("too-many-tracks", snapshot.skipped.last().reason)
    }

    @Test fun malformedJsonAndVersionAreRejected() {
        for (json in listOf("{", "[]", """{"version":2,"tracks":[]}""")) {
            try { parser.parse(json, base, origins); fail(json) }
            catch (e: CatalogException) { assertEquals(CatalogErrorCode.INVALID, e.code) }
        }
    }
}
