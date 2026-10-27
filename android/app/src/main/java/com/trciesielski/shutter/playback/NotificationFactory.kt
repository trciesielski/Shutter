package com.trciesielski.shutter.playback

import android.content.Context
import androidx.media3.session.DefaultMediaNotificationProvider
import com.trciesielski.shutter.R

/** Media3 owns posting and foreground transitions; this supplies the app's channel and icon. */
object NotificationFactory {
    fun create(context: Context): DefaultMediaNotificationProvider =
        DefaultMediaNotificationProvider.Builder(context)
            .setChannelId("shutter_playback")
            .setChannelName(R.string.playback_channel_name)
            .build()
            .apply { setSmallIcon(R.drawable.ic_shutter_notification) }
}
