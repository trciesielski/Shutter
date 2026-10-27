package com.trciesielski.shutter.playback

import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LegacyBrowseDiscoveryTest {
    @Test fun exportedServiceIsDiscoverableByLegacyMediaBrowser() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val services = context.packageManager.queryIntentServices(Intent("android.media.browse.MediaBrowserService").setPackage(context.packageName), 0)
        assertTrue(services.any { it.serviceInfo.name == ShutterMediaLibraryService::class.java.name && it.serviceInfo.exported })
    }
}
