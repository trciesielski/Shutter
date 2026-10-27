package com.trciesielski.shutter.plugin

import android.content.ComponentName
import androidx.media3.session.MediaBrowser
import androidx.media3.session.SessionToken
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trciesielski.shutter.MainActivity
import com.trciesielski.shutter.playback.ShutterMediaLibraryService
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ShutterMediaPluginTest {
    @Test fun pluginRegistersAndBrowsersShareOneServiceSession() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity -> assertNotNull(activity.bridge.getPlugin("ShutterMedia")) }
            val context = ApplicationProvider.getApplicationContext<android.content.Context>()
            val token = SessionToken(context, ComponentName(context, ShutterMediaLibraryService::class.java))
            val first = MediaBrowser.Builder(context, token).buildAsync().get(15, TimeUnit.SECONDS)
            val second = MediaBrowser.Builder(context, token).buildAsync().get(15, TimeUnit.SECONDS)
            try {
                assertEquals(first.mediaItemCount, second.mediaItemCount)
                assertEquals(first.currentMediaItem?.mediaId, second.currentMediaItem?.mediaId)
                assertFalse(ShutterMediaPlugin::class.java.declaredFields.any { it.type.name.contains("ExoPlayer") })
            } finally {
                scenario.onActivity { first.release(); second.release() }
            }
        }
    }
}
