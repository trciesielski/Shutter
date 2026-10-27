package com.trciesielski.shutter.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

data class NativeAudioAnalysisFrame(
    val bands: List<Int>,
    val rms: Int,
    val peak: Int,
    val signalStatus: String,
    val timestampMs: Long,
    val sampleRate: Int = 0,
    val channelCount: Int = 0,
    val revision: Long = 0L,
)

/** A callback bus shared by the Media3 service and the Capacitor plugin. */
class NativeAudioAnalysisBus {
    private val listeners = CopyOnWriteArrayList<Subscription>()

    fun subscribe(listener: (NativeAudioAnalysisFrame) -> Unit): AutoCloseable {
        val subscription = Subscription(listener)
        listeners += subscription
        return subscription
    }

    fun publish(frame: NativeAudioAnalysisFrame) {
        listeners.forEach { it.deliver(frame) }
    }

    private inner class Subscription(private val listener: (NativeAudioAnalysisFrame) -> Unit) : AutoCloseable {
        private var active = true

        fun deliver(frame: NativeAudioAnalysisFrame) {
            synchronized(this) {
                if (active) listener(frame)
            }
        }

        override fun close() {
            synchronized(this) { active = false }
            listeners.remove(this)
        }
    }
}

/** Measures decoded PCM while returning every input byte unchanged to AudioSink. */
class NativeAudioAnalyzer(
    private val publish: (NativeAudioAnalysisFrame) -> Unit,
    private val windowSizeSamples: Int = 1024,
    private val minFrameIntervalMs: Long = 50L,
    private val clockMs: () -> Long = { System.currentTimeMillis() },
) : AudioProcessor {
    private val emptyBuffer = ByteBuffer.allocate(0)
    private var outputBuffer: ByteBuffer = emptyBuffer
    private var inputFormat = AudioProcessor.AudioFormat.NOT_SET
    private var inputEnded = false
    private var active = false
    private var sampleRate = 0
    private var channelCount = 0
    private var sampleBytes = 0
    private var samples = FloatArray(windowSizeSamples.coerceAtLeast(1))
    private var sampleCount = 0
    private var lastEmissionMs = Long.MIN_VALUE
    private var lastTimestampMs = Long.MIN_VALUE
    private var frameRevision = 0L

    init {
        require(windowSizeSamples > 0) { "windowSizeSamples must be positive" }
        require(minFrameIntervalMs >= 0) { "minFrameIntervalMs must be nonnegative" }
    }

    override fun configure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        inputFormat = inputAudioFormat
        sampleRate = inputAudioFormat.sampleRate
        channelCount = inputAudioFormat.channelCount
        sampleBytes = when (inputAudioFormat.encoding) {
            C.ENCODING_PCM_16BIT -> 2
            C.ENCODING_PCM_FLOAT -> 4
            else -> 0
        }
        active = sampleBytes > 0 && sampleRate > 0 && channelCount > 0
        samples = FloatArray(windowSizeSamples)
        sampleCount = 0
        outputBuffer = emptyBuffer
        inputEnded = false
        return inputAudioFormat
    }

    override fun isActive(): Boolean = active

    override fun queueInput(inputBuffer: ByteBuffer) {
        if (!inputBuffer.hasRemaining()) {
            outputBuffer = emptyBuffer
            return
        }
        val source = inputBuffer.duplicate()
        outputBuffer = ByteBuffer.allocateDirect(source.remaining()).order(ByteOrder.nativeOrder())
        outputBuffer.put(source).flip()
        val analysis = inputBuffer.duplicate().order(ByteOrder.LITTLE_ENDIAN)
        inputBuffer.position(inputBuffer.limit())

        if (!active) return
        val bytesPerFrame = sampleBytes * channelCount
        while (analysis.remaining() >= bytesPerFrame) {
            var mixed = 0f
            repeat(channelCount) {
                mixed += when (sampleBytes) {
                    2 -> analysis.short.toFloat() / Short.MAX_VALUE
                    else -> analysis.float
                }
            }
            samples[sampleCount++] = (mixed / channelCount).coerceIn(-1f, 1f)
            if (sampleCount == samples.size) {
                publishFrame(samples)
                sampleCount = 0
            }
        }
    }

    override fun queueEndOfStream() {
        inputEnded = true
    }

    override fun getOutput(): ByteBuffer {
        val output = outputBuffer
        outputBuffer = emptyBuffer
        return output
    }

    override fun isEnded(): Boolean = inputEnded && !outputBuffer.hasRemaining()

    override fun flush() {
        outputBuffer = emptyBuffer
        sampleCount = 0
        inputEnded = false
    }

    override fun reset() {
        flush()
        inputFormat = AudioProcessor.AudioFormat.NOT_SET
        inputEnded = false
        active = false
        sampleRate = 0
        channelCount = 0
        sampleBytes = 0
        lastEmissionMs = Long.MIN_VALUE
        lastTimestampMs = Long.MIN_VALUE
        frameRevision = 0L
    }

    private fun publishFrame(window: FloatArray) {
        val now = clockMs()
        if (lastEmissionMs != Long.MIN_VALUE && now - lastEmissionMs < minFrameIntervalMs) return
        lastEmissionMs = now
        val timestamp = max(now, if (lastTimestampMs == Long.MIN_VALUE) now else lastTimestampMs + 1)
        lastTimestampMs = timestamp
        val rmsValue = sqrt(window.sumOf { (it * it).toDouble() } / window.size).toFloat()
        val peakValue = window.maxOf { abs(it) }
        val bands = spectralBands(window)
        publish(
            NativeAudioAnalysisFrame(
                bands = bands,
                rms = level(rmsValue),
                peak = level(peakValue),
                signalStatus = if (rmsValue == 0f && peakValue == 0f) "silence" else "active",
                timestampMs = timestamp,
                sampleRate = sampleRate,
                channelCount = channelCount,
                revision = ++frameRevision,
            )
        )
    }

    private fun spectralBands(window: FloatArray): List<Int> = List(32) { index ->
        val low = 35.0 * (15_000.0 / 35.0).pow(index / 32.0)
        val high = 35.0 * (15_000.0 / 35.0).pow((index + 1) / 32.0)
        var best = 0.0
        repeat(3) { candidate ->
            val frequency = low * (high / low).pow((candidate + 0.5) / 3.0)
            if (frequency < sampleRate / 2.0) best = max(best, goertzel(window, frequency))
        }
        (level(320.0 * sqrt(best * 3.0))).coerceIn(0, 100)
    }

    private fun goertzel(window: FloatArray, frequency: Double): Double {
        val omega = 2.0 * PI * frequency / sampleRate
        val coefficient = 2.0 * cos(omega)
        var previous = 0.0
        var previousPrevious = 0.0
        window.forEachIndexed { index, sample ->
            val windowed = sample * (0.5 - 0.5 * cos(2.0 * PI * index / (window.size - 1).coerceAtLeast(1)))
            val current = windowed + coefficient * previous - previousPrevious
            previousPrevious = previous
            previous = current
        }
        return 2.0 * sqrt((previous * previous + previousPrevious * previousPrevious - coefficient * previous * previousPrevious).coerceAtLeast(0.0)) / window.size
    }

    private fun level(value: Float): Int = (value.coerceIn(0f, 1f) * 100f).roundToInt()
    private fun level(value: Double): Int = (value.coerceIn(0.0, 100.0)).roundToInt()
}
