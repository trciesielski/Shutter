package com.trciesielski.shutter.playback

import android.content.ComponentName
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaBrowser
import androidx.media3.session.SessionToken
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class MediaLibraryServiceTest {
    @Test fun controllerReconnectRetainsBrowseRootAndSnapshotSource() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val token = SessionToken(context, ComponentName(context, ShutterMediaLibraryService::class.java))
        val first = MediaBrowser.Builder(context, token).buildAsync().get(15, TimeUnit.SECONDS)
        try {
            val root = first.getLibraryRoot(null).get(15, TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_SUCCESS, root.resultCode)
            assertEquals("root", root.value!!.mediaId)
            assertEquals(listOf("catalog", "local", "playlists"), first.getChildren("root", 0, 10, null).get(15, TimeUnit.SECONDS).value!!.map { it.mediaId })
            val second = MediaBrowser.Builder(context, token).buildAsync().get(15, TimeUnit.SECONDS)
            try {
                assertEquals("root", second.getLibraryRoot(null).get(15, TimeUnit.SECONDS).value!!.mediaId)
                assertEquals(first.mediaItemCount, second.mediaItemCount)
            } finally { second.release() }
        } finally { first.release() }
    }
}
