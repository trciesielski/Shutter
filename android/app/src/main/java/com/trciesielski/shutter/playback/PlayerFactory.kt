package com.trciesielski.shutter.playback

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.trciesielski.shutter.audio.NativeAudioAnalyzer
import com.trciesielski.shutter.audio.NativeAudioAnalysisBus
import com.trciesielski.shutter.plugin.NativeAudioAnalysisBridge

/** Builds the service's sole player with HTTPS and Android content URI support. */
object PlayerFactory {
    fun create(context: Context, analysisBus: NativeAudioAnalysisBus = NativeAudioAnalysisBridge.bus): ExoPlayer {
        val http = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(false)
        val dataSource = DefaultDataSource.Factory(context, http)
        val analyzer = NativeAudioAnalyzer(analysisBus::publish)
        val renderers = object : DefaultRenderersFactory(context) {
            override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean): AudioSink =
                DefaultAudioSink.Builder(context)
                    .setAudioProcessors(arrayOf(analyzer))
                    .setEnableFloatOutput(enableFloatOutput)
                    .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                    .build()
        }
        return ExoPlayer.Builder(context, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSource))
            .build()
            .apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
                setHandleAudioBecomingNoisy(true)
            }
    }
}
