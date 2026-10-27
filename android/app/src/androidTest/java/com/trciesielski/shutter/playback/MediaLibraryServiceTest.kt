package com.trciesielski.shutter.playback

import android.content.ComponentName
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaBrowser
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.SessionToken
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.util.concurrent.ListenableFuture
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class MediaLibraryServiceTest {
    private fun <T> onMain(block: () -> T): T {
        val result = AtomicReference<T>()
        InstrumentationRegistry.getInstrumentation().runOnMainSync { result.set(block()) }
        return result.get()
    }

    @Test fun controllerReconnectRetainsBrowseRootAndSnapshotSource() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val token = SessionToken(context, ComponentName(context, ShutterMediaLibraryService::class.java))
        val first = MediaBrowser.Builder(context, token).buildAsync().get(15, TimeUnit.SECONDS)
        try {
            val root = onMain { first.getLibraryRoot(null) }.get(15, TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_SUCCESS, root.resultCode)
            assertEquals("root", root.value!!.mediaId)
            assertEquals(listOf("catalog", "local", "playlists"), onMain { first.getChildren("root", 0, 10, null) }.get(15, TimeUnit.SECONDS).value!!.map { it.mediaId })
            val second = MediaBrowser.Builder(context, token).buildAsync().get(15, TimeUnit.SECONDS)
            try {
                assertEquals("root", onMain { second.getLibraryRoot(null) }.get(15, TimeUnit.SECONDS).value!!.mediaId)
                assertEquals(first.mediaItemCount, second.mediaItemCount)
            } finally { onMain { second.release() } }
        } finally { onMain { first.release() } }
    }

    @Test fun searchNotifiesRequestingBrowserWithResultCount() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val token = SessionToken(context, ComponentName(context, ShutterMediaLibraryService::class.java))
        val ready = CountDownLatch(1)
        val notifiedCount = AtomicInteger(-1)
        val query = "no-such-track-987654321"
        val listener = object : MediaBrowser.Listener {
            override fun onSearchResultChanged(browser: MediaBrowser, resultQuery: String, itemCount: Int, params: MediaLibraryService.LibraryParams?) {
                if (resultQuery == query) {
                    notifiedCount.set(itemCount)
                    ready.countDown()
                }
            }
        }
        val browser = MediaBrowser.Builder(context, token).setListener(listener).buildAsync().get(15, TimeUnit.SECONDS)
        try {
            val result: ListenableFuture<LibraryResult<Void>> = onMain { browser.search(query, null) }
            assertEquals(LibraryResult.RESULT_SUCCESS, result.get(45, TimeUnit.SECONDS).resultCode)
            assertTrue("search result notification missing", ready.await(45, TimeUnit.SECONDS))
            assertEquals(0, notifiedCount.get())
            assertTrue(onMain { browser.getSearchResult(query, 0, 10, null) }.get(45, TimeUnit.SECONDS).value!!.isEmpty())
        } finally { onMain { browser.release() } }
    }
}
