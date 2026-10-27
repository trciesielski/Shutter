package com.trciesielski.shutter.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.sin

class NativeAudioAnalyzerTest {
    @Test
    fun pcm16IsPassedThroughAndPublishesMeasuredFrame() {
        val frames = mutableListOf<NativeAudioAnalysisFrame>()
        val analyzer = NativeAudioAnalyzer(frames::add, windowSizeSamples = 8, minFrameIntervalMs = 0)
        val format = AudioProcessor.AudioFormat(8_000, 1, C.ENCODING_PCM_16BIT)
        assertEquals(format, analyzer.configure(format))
        assertTrue(analyzer.isActive)

        val input = shortBuffer(shortArrayOf(0, 1_000, -1_000, 2_000, -2_000, 3_000, -3_000, 4_000))
        val expected = input.duplicate()
        analyzer.queueInput(input)
        val output = analyzer.output

        assertEquals(0, input.remaining())
        assertArrayEquals(bytes(expected), bytes(output))
        assertEquals(1, frames.size)
        assertEquals("active", frames.single().signalStatus)
        assertTrue(frames.single().rms > 0)
        assertTrue(frames.single().peak > 0)
        assertEquals(32, frames.single().bands.size)
        assertTrue(frames.single().bands.all { it in 0..100 })
    }

    @Test
    fun silenceProducesZeroBoundedBandsAndSilenceStatus() {
        val frames = mutableListOf<NativeAudioAnalysisFrame>()
        val analyzer = NativeAudioAnalyzer(frames::add, windowSizeSamples = 8, minFrameIntervalMs = 0)
        analyzer.configure(AudioProcessor.AudioFormat(8_000, 1, C.ENCODING_PCM_16BIT))
        analyzer.queueInput(ByteBuffer.allocate(8 * 2).order(ByteOrder.LITTLE_ENDIAN))

        val frame = frames.single()
        assertEquals("silence", frame.signalStatus)
        assertEquals(0, frame.rms)
        assertEquals(0, frame.peak)
        assertEquals(List(32) { 0 }, frame.bands)
    }

    @Test
    fun supportedToneHasMeasuredEnergyAndClippingIsBounded() {
        val frames = mutableListOf<NativeAudioAnalysisFrame>()
        val analyzer = NativeAudioAnalyzer(frames::add, windowSizeSamples = 256, minFrameIntervalMs = 0)
        analyzer.configure(AudioProcessor.AudioFormat(8_000, 1, C.ENCODING_PCM_16BIT))
        val tone = ShortArray(256) { i -> (sin(2 * PI * 1_000 * i / 8_000) * Short.MAX_VALUE).toInt().toShort() }
        analyzer.queueInput(shortBuffer(tone))

        val frame = frames.single()
        assertTrue(frame.bands.max() > 0)
        assertEquals(100, frame.peak)
        assertTrue(frame.bands.all { it in 0..100 })
        assertTrue(frame.rms in 0..100)
    }

    @Test
    fun unsupportedEncodingIsInactiveWithoutBreakingPassThrough() {
        val analyzer = NativeAudioAnalyzer({}, windowSizeSamples = 8, minFrameIntervalMs = 0)
        val format = AudioProcessor.AudioFormat(8_000, 1, C.ENCODING_PCM_24BIT)
        assertEquals(format, analyzer.configure(format))
        assertFalse(analyzer.isActive)
        val input = ByteBuffer.wrap(ByteArray(9) { it.toByte() })
        val expected = input.duplicate()
        analyzer.queueInput(input)
        assertEquals(0, input.remaining())
        assertArrayEquals(bytes(expected), bytes(analyzer.output))
    }

    @Test
    fun framesAreThrottledAndTimestampsRemainMonotonic() {
        val frames = mutableListOf<NativeAudioAnalysisFrame>()
        var now = 100L
        val analyzer = NativeAudioAnalyzer(frames::add, windowSizeSamples = 4, minFrameIntervalMs = 50, clockMs = { now })
        analyzer.configure(AudioProcessor.AudioFormat(8_000, 1, C.ENCODING_PCM_16BIT))
        val samples = shortArrayOf(1_000, -1_000, 1_000, -1_000)
        analyzer.queueInput(shortBuffer(samples))
        now = 120L
        analyzer.queueInput(shortBuffer(samples))
        now = 160L
        analyzer.queueInput(shortBuffer(samples))

        assertEquals(2, frames.size)
        assertTrue(frames[1].timestampMs > frames[0].timestampMs)
    }

    @Test
    fun busStopsDeliveringAfterUnsubscribe() {
        val bus = NativeAudioAnalysisBus()
        var delivered = 0
        val subscription = bus.subscribe { delivered++ }
        bus.publish(testFrame(1))
        subscription.close()
        bus.publish(testFrame(2))
        assertEquals(1, delivered)
    }

    private fun testFrame(timestamp: Long) = NativeAudioAnalysisFrame(
        bands = List(32) { 0 }, rms = 0, peak = 0, signalStatus = "silence", timestampMs = timestamp
    )

    private fun shortBuffer(values: ShortArray): ByteBuffer = ByteBuffer.allocate(values.size * 2)
        .order(ByteOrder.LITTLE_ENDIAN).apply { values.forEach(::putShort); flip() }

    private fun bytes(buffer: ByteBuffer): ByteArray = buffer.duplicate().apply { rewind() }.let {
        ByteArray(it.remaining()).also(it::get)
    }
}
