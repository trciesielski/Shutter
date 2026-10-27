package com.trciesielski.shutter.build

import com.trciesielski.shutter.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

@RunWith(RobolectricTestRunner::class)
class BuildVariantManifestContractTest {
    @Test
    fun bothPlatformFlavorsAreDeclaredOnOneDimension() {
        val buildGradle = appFile("build.gradle").readText()

        assertTrue(buildGradle.contains("flavorDimensions += \"platform\""))
        assertTrue(buildGradle.contains("phoneAuto"))
        assertTrue(buildGradle.contains("automotive"))
        assertTrue(buildGradle.contains("dimension \"platform\""))
    }

    @Test
    fun eachFlavorKeepsTheSharedApplicationIdAndMinimumSdk() {
        assertEquals("com.trciesielski.shutter", BuildConfig.APPLICATION_ID)
        assertEquals(26, RuntimeEnvironment.getApplication().applicationInfo.minSdkVersion)
    }

    @Test
    fun phoneAutoOwnsTheProjectionDescriptor() {
        val commonManifest = manifestDocument(appFile("src/main/AndroidManifest.xml"))
        val phoneManifest = manifestDocument(appFile("src/phoneAuto/AndroidManifest.xml"))

        assertFalse(
            commonManifest.hasMetaData("com.google.android.gms.car.application"),
        )
        assertEquals(
            "@xml/automotive_app_desc",
            phoneManifest.metaDataResource("com.google.android.gms.car.application"),
        )
        assertTrue(appFile("src/phoneAuto/res/xml/automotive_app_desc.xml").isFile)
        assertFalse(appFile("src/main/res/xml/automotive_app_desc.xml").isFile)
    }

    @Test
    fun automotiveRequiresTheAutomotiveHardwareFeature() {
        val automotiveManifest = manifestDocument(appFile("src/automotive/AndroidManifest.xml"))
        val feature = automotiveManifest.usesFeature("android.hardware.type.automotive")

        assertTrue(feature != null)
        assertEquals("true", feature?.getAttributeNS(ANDROID_NS, "required"))
    }

    @Test
    fun sharedMediaLibraryServiceIsDeclaredExactlyOnce() {
        val manifestFiles = listOf(
            appFile("src/main/AndroidManifest.xml"),
            appFile("src/phoneAuto/AndroidManifest.xml"),
            appFile("src/automotive/AndroidManifest.xml"),
        )
        val serviceNodes = manifestFiles
            .map(::manifestDocument)
            .flatMap { it.serviceNames() }

        assertEquals(
            listOf(".playback.ShutterMediaLibraryService"),
            serviceNodes,
        )
    }

    private fun appFile(relativePath: String): File {
        val workingDirectory = File(System.getProperty("user.dir"))
        val appDirectory = sequenceOf(
            File(System.getProperty("shutter.androidAppDir", "")),
            workingDirectory,
            File(workingDirectory, "android/app"),
        ).firstOrNull { File(it, "build.gradle").isFile }
            ?: error("Could not locate android/app from ${workingDirectory.absolutePath}")

        return File(appDirectory, relativePath)
    }

    private fun manifestDocument(file: File): ManifestDocument {
        return ManifestDocument(
            DocumentBuilderFactory.newInstance()
                .apply { isNamespaceAware = true }
                .newDocumentBuilder()
                .parse(file),
        )
    }
}

private class ManifestDocument(
    private val document: org.w3c.dom.Document,
) {
    fun hasMetaData(name: String): Boolean = metaData(name) != null

    fun metaDataResource(name: String): String? = metaData(name)
        ?.getAttributeNS(ANDROID_NS, "resource")

    fun usesFeature(name: String): org.w3c.dom.Element? =
        document.getElementsByTagName("uses-feature")
            .elements()
            .map { it as org.w3c.dom.Element }
            .firstOrNull { it.getAttributeNS(ANDROID_NS, "name") == name }

    fun serviceNames(): List<String> = document.getElementsByTagName("service")
        .elements()
        .map { (it as org.w3c.dom.Element).getAttributeNS(ANDROID_NS, "name") }
        .toList()

    private fun metaData(name: String): org.w3c.dom.Element? =
        document.getElementsByTagName("meta-data")
            .elements()
            .map { it as org.w3c.dom.Element }
            .firstOrNull { it.getAttributeNS(ANDROID_NS, "name") == name }
}

private fun org.w3c.dom.NodeList.elements(): Sequence<org.w3c.dom.Element> =
    (0 until length).asSequence().map { item(it) as org.w3c.dom.Element }

private const val ANDROID_NS = "http://schemas.android.com/apk/res/android"
