package com.trciesielski.shutter.playback

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory

/** Builds the service's sole player with HTTPS and Android content URI support. */
object PlayerFactory {
    fun create(context: Context): ExoPlayer {
        val http = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(false)
        val dataSource = DefaultDataSource.Factory(context, http)
        return ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSource))
            .build()
            .apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
                setHandleAudioBecomingNoisy(true)
            }
    }
}
