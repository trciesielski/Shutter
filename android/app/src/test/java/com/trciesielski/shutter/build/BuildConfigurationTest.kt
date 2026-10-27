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
    fun configuredUrlsAreAvailableToNativeCode() {
        val musicBaseOverride = System.getProperty("shutter.musicBaseOverride").orEmpty()
        val catalogOverride = System.getProperty("shutter.catalogOverride").orEmpty()
        val expectedMusicBase = musicBaseOverride.ifEmpty {
            "https://shutter-web-6p2.pages.dev/music/"
        }
        val expectedCatalog = catalogOverride.ifEmpty {
            "${expectedMusicBase.trimEnd('/')}/catalog/catalog.json"
        }

        assertEquals(expectedMusicBase, BuildConfig.SHUTTER_MUSIC_BASE_URL)
        assertEquals(
            expectedCatalog,
            BuildConfig.SHUTTER_CATALOG_URL,
        )
    }
}
