package com.trciesielski.shutter.library

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import com.trciesielski.shutter.data.LibraryRepository
import com.trciesielski.shutter.data.Track
import com.trciesielski.shutter.data.TrackSource

data class ImportReport(val imported: Int, val failed: Map<Uri, String>)

class SafLibraryManager(
    private val context: Context,
    private val library: LibraryRepository,
    private val metadataReader: MetadataReader = MetadataReader(context),
    private val isDocument: (Uri) -> Boolean = { DocumentsContract.isDocumentUri(context, it) },
    private val persistRead: (Uri) -> Unit = { context.contentResolver.takePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION) },
    private val releaseRead: (Uri) -> Unit = { context.contentResolver.releasePersistableUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
) {
    fun openDocumentPicker(activity: Activity) {
        activity.startActivityForResult(pickerIntent(), REQUEST_CODE)
    }

    suspend fun importUris(uris: Collection<Uri>): ImportReport {
        val failures = linkedMapOf<Uri, String>()
        var imported = 0
        for (uri in uris.distinct()) {
            var newlyPersisted = false
            try {
                require(uri.scheme == "content" && isDocument(uri)) { "A document URI is required" }
                val alreadyPersisted = context.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }
                persistRead(uri)
                newlyPersisted = !alreadyPersisted
                val metadata = metadataReader.read(uri) { size, modified -> LocalTrackId.from(uri, size, modified) }
                val id = LocalTrackId.from(uri, metadata.size, metadata.modifiedMs)
                library.upsert(Track(id, metadata.title, metadata.artist, metadata.album, uri,
                    TrackSource.LOCAL, metadata.mimeType, metadata.durationMs, metadata.artworkUri, null),
                    metadata.size, metadata.modifiedMs)
                library.tracks().filter { it.source == TrackSource.LOCAL && it.uri == uri && it.id != id }
                    .forEach { stale ->
                        library.remove(stale.id)
                        metadataReader.artworkFile(stale.id).delete()
                    }
                imported++
            } catch (e: Exception) {
                failures[uri] = e.message ?: e.javaClass.simpleName
                if (newlyPersisted && library.tracks().none { it.source == TrackSource.LOCAL && it.uri == uri }) {
                    try { releaseRead(uri) } catch (_: SecurityException) { }
                }
            }
        }
        return ImportReport(imported, failures)
    }

    suspend fun removeTrack(id: String) {
        val track = library.resolve(id) ?: return
        require(track.source == TrackSource.LOCAL) { "Only local tracks can be removed here" }
        library.remove(id)
        metadataReader.artworkFile(id).delete()
        if (library.tracks().none { it.source == TrackSource.LOCAL && it.uri == track.uri }) {
            try {
                releaseRead(track.uri)
            } catch (_: SecurityException) { /* Permission was already revoked. */ }
        }
    }

    companion object {
        const val REQUEST_CODE = 4103
        fun pickerIntent(): Intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "audio/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/mpeg", "audio/flac", "audio/wav",
                "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/opus"))
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
    }
}
