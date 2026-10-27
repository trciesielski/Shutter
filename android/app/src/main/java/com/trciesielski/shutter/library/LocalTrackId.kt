package com.trciesielski.shutter.library

import android.net.Uri
import com.trciesielski.shutter.data.LibraryRepository

object LocalTrackId {
    fun from(uri: Uri, size: Long?, modifiedMs: Long?): String =
        LibraryRepository.localId(uri, size, modifiedMs)
}
