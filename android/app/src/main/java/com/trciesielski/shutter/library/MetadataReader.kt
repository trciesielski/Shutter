package com.trciesielski.shutter.library

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import java.io.File
import java.security.MessageDigest

data class AudioMetadata(
    val title: String,
    val artist: String,
    val album: String,
    val mimeType: String,
    val durationMs: Long?,
    val size: Long?,
    val modifiedMs: Long?,
    val artworkUri: Uri?
)

open class MetadataReader(private val context: Context) {
    open fun read(uri: Uri, idForArtwork: (Long?, Long?) -> String): AudioMetadata {
        val resolver = context.contentResolver
        var name: String? = null
        var size: Long? = null
        var modified: Long? = null
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                fun string(column: String): String? = cursor.getColumnIndex(column).takeIf { it >= 0 && !cursor.isNull(it) }?.let(cursor::getString)
                fun long(column: String): Long? = cursor.getColumnIndex(column).takeIf { it >= 0 && !cursor.isNull(it) }?.let(cursor::getLong)?.takeIf { it >= 0 }
                name = string(OpenableColumns.DISPLAY_NAME)
                size = long(OpenableColumns.SIZE)
                modified = long(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
            }
        }
        val reportedMime = resolver.getType(uri)?.lowercase()
        val mime = if (reportedMime == null || reportedMime == "application/octet-stream") mimeFromName(name) else reportedMime
        require(mime in SUPPORTED_MIME) { "Unsupported audio type: $mime" }
        val retriever = MediaMetadataRetriever()
        var title: String? = null
        var artist: String? = null
        var album: String? = null
        var duration: Long? = null
        var artwork: Uri? = null
        try {
            retriever.setDataSource(context, uri)
            title = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)
            artist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)
            album = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)
            duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.takeIf { it >= 0 }
            val bytes = retriever.embeddedPicture
            if (bytes != null && bytes.size in 1..MAX_ART_BYTES) {
                val file = artworkFile(idForArtwork(size, modified))
                file.parentFile?.mkdirs()
                file.writeBytes(bytes)
                artwork = artworkUri(file)
            }
        } finally { retriever.release() }
        return AudioMetadata(title.clean() ?: name?.substringBeforeLast('.')?.clean() ?: "Unknown title",
            artist.clean() ?: "Unknown artist", album.clean() ?: "Unknown album", mime, duration, size, modified, artwork)
    }

    open fun artworkFile(id: String): File {
        val digest = MessageDigest.getInstance("SHA-256").digest(id.toByteArray(Charsets.UTF_8))
        val safeName = digest.joinToString("") { "%02x".format(it.toInt() and 0xff) }
        return File(File(context.filesDir, "library-artwork"), "$safeName.img")
    }

    open fun artworkUri(file: File): Uri = FileProvider.getUriForFile(
        context, "${context.packageName}.fileprovider", file
    )

    private fun String?.clean(): String? = this?.trim()?.take(512)?.takeIf { it.isNotEmpty() }

    companion object {
        const val MAX_ART_BYTES = 1024 * 1024
        val SUPPORTED_MIME = setOf("audio/mpeg", "audio/mp3", "audio/flac", "audio/x-flac",
            "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4", "audio/x-m4a")

        fun mimeFromName(name: String?): String = when (name?.substringAfterLast('.', "")?.lowercase()) {
            "mp3" -> "audio/mpeg"
            "flac" -> "audio/flac"
            "wav" -> "audio/wav"
            "m4a", "mp4" -> "audio/mp4"
            else -> "application/octet-stream"
        }
    }
}
