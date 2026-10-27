package com.trciesielski.shutter.build

import com.trciesielski.shutter.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class BuildConfigurationTest {
    @Test
    fun packageAndMinimumSdkMatchAndroidFoundation() {
        val application = RuntimeEnvironment.getApplication()
        assertEquals("com.trciesielski.shutter", BuildConfig.APPLICATION_ID)
        assertEquals("com.trciesielski.shutter", application.packageName)
        assertEquals(26, application.applicationInfo.minSdkVersion)
    }

    @Test
    fun stagingUrlsAreAvailableToNativeCode() {
        assertEquals("https://shutter-web-6p2.pages.dev/music/", BuildConfig.SHUTTER_MUSIC_BASE_URL)
        assertEquals(
            "https://shutter-web-6p2.pages.dev/music/catalog/catalog.json",
            BuildConfig.SHUTTER_CATALOG_URL,
        )
    }
}
