package com.trciesielski.shutter.playback

import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.trciesielski.shutter.data.CatalogRepository
import com.trciesielski.shutter.data.CatalogSnapshot
import com.trciesielski.shutter.data.LibraryRepository
import com.trciesielski.shutter.data.PlaylistRepository
import com.trciesielski.shutter.data.Track
import com.trciesielski.shutter.data.TrackSource
import com.trciesielski.shutter.media.MediaItemMapper
import kotlinx.coroutines.flow.first
import java.util.Base64

/** Read-only media hierarchy shared by Android Auto and other library browsers. */
class BrowseTree(
    private val library: LibraryRepository,
    private val playlists: PlaylistRepository,
    private val loadCatalog: () -> Result<CatalogSnapshot> = { CatalogRepository().load() }
) {
    val rootId = "root"
    private val reservedTrackIds = setOf(rootId, "catalog", "local", "playlists", "catalog:error")
    private var cachedCatalog: List<Track>? = null

    fun root(): MediaItem = node(rootId, "Shutter")

    suspend fun children(parentId: String): List<MediaItem> = when (parentId) {
        rootId -> listOf(node("catalog", "SHUTTER Catalog"), node("local", "My Library"), node("playlists", "Playlists"))
        "catalog" -> catalogTracks().fold(
            onSuccess = { tracks -> tracks.map(MediaItemMapper::toBrowseItem) },
            onFailure = { listOf(statusItem("catalog:error", "Catalog unavailable")) }
        )
        "local" -> library.tracks().filter { it.source == TrackSource.LOCAL && allowedTrackId(it.id) }.map(MediaItemMapper::toBrowseItem)
        "playlists" -> playlists.observePlaylists().first().map { node("playlist:${it.id}", it.name) }
        else -> if (parentId.startsWith("playlist:")) playlistItems(parentId.removePrefix("playlist:")) else emptyList()
    }

    suspend fun item(mediaId: String): MediaItem? = when (mediaId) {
        rootId -> root()
        "catalog", "local", "playlists" -> children(rootId).first { it.mediaId == mediaId }
        "catalog:error" -> statusItem("catalog:error", "Catalog unavailable")
        else -> when {
            mediaId.startsWith("playlist-entry:") -> playlistEntry(mediaId)?.let { (playlistId, _) ->
                playlistItems(playlistId).firstOrNull { it.mediaId == mediaId }
            }
            mediaId.startsWith("playlist:") -> children("playlists").firstOrNull { it.mediaId == mediaId }
            else -> resolveTrack(mediaId)?.let(MediaItemMapper::toBrowseItem)
        }
    }

    suspend fun search(query: String): List<MediaItem> {
        val normalized = query.trim()
        if (normalized.isEmpty()) return emptyList()
        val local = library.tracks()
        val catalog = catalogTracks().getOrDefault(emptyList())
        return (catalog + local).filter { allowedTrackId(it.id) }.distinctBy(Track::id)
            .filter { it.title.contains(normalized, true) || it.artist.contains(normalized, true) || it.album.contains(normalized, true) }
            .map(MediaItemMapper::toBrowseItem)
    }

    /** Expands a selected item into its deterministic source queue. */
    suspend fun queueFor(mediaId: String): Pair<List<MediaItem>, Int>? {
        playlistEntry(mediaId)?.let { (playlistId, _) ->
            val entries = playlistItems(playlistId)
            val index = entries.indexOfFirst { it.mediaId == mediaId }
            if (index < 0) return null
            val queue = entries.mapNotNull { entry ->
                playlistEntry(entry.mediaId)?.trackId?.let { resolveTrack(it) }?.let(MediaItemMapper::toMediaItem)
            }
            return queue to index
        }
        val track = resolveTrack(mediaId) ?: return null
        val parent = if (track.source == TrackSource.LOCAL) "local" else "catalog"
        val queue = children(parent).filter { it.mediaMetadata.isPlayable == true }
        val index = queue.indexOfFirst { it.mediaId == mediaId }
        return if (index >= 0) queue to index else listOf(MediaItemMapper.toMediaItem(track)) to 0
    }

    private suspend fun playlistItems(id: String): List<MediaItem> {
        if (children("playlists").none { it.mediaId == "playlist:$id" }) return emptyList()
        val encodedId = Base64.getUrlEncoder().withoutPadding().encodeToString(id.toByteArray(Charsets.UTF_8))
        return playlists.entries(id).filterNot { it.orphaned }.mapNotNull { entry ->
            resolveTrack(entry.trackId)?.let { track ->
                MediaItemMapper.toBrowseItem(track).buildUpon()
                    .setMediaId("playlist-entry:$encodedId:${entry.position}:${track.id}").build()
            }
        }
    }

    private data class PlaylistEntryRef(val playlistId: String, val position: Int, val trackId: String)

    private fun playlistEntry(mediaId: String): PlaylistEntryRef? {
        if (!mediaId.startsWith("playlist-entry:")) return null
        val suffix = mediaId.removePrefix("playlist-entry:")
        val encoded = suffix.substringBefore(':')
        val position = suffix.substringAfter(':', "").substringBefore(':').toIntOrNull()
        val trackId = suffix.substringAfter(':', "").substringAfter(':', "")
        if (encoded.isBlank() || position == null || position < 0 || trackId.isBlank()) return null
        return try { PlaylistEntryRef(String(Base64.getUrlDecoder().decode(encoded), Charsets.UTF_8), position, trackId) }
        catch (_: IllegalArgumentException) { null }
    }

    private suspend fun resolveTrack(id: String): Track? {
        if (!allowedTrackId(id)) return null
        library.resolve(id)?.let { return it }
        return catalogTracks().getOrDefault(emptyList()).firstOrNull { it.id == id }
    }

    private fun allowedTrackId(id: String): Boolean = id !in reservedTrackIds &&
        !id.startsWith("playlist:") && !id.startsWith("playlist-entry:")

    private fun catalogTracks(): Result<List<Track>> {
        cachedCatalog?.let { return Result.success(it) }
        return loadCatalog().map { snapshot -> snapshot.tracks.filter { allowedTrackId(it.id) }.also { cachedCatalog = it } }
    }

    private fun node(id: String, title: String): MediaItem = MediaItem.Builder().setMediaId(id)
        .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setIsBrowsable(true).setIsPlayable(false).build()).build()

    private fun statusItem(id: String, title: String): MediaItem = MediaItem.Builder().setMediaId(id)
        .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setIsBrowsable(false).setIsPlayable(false).build()).build()
}
