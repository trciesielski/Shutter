package com.trciesielski.shutter.plugin

import com.trciesielski.shutter.audio.NativeAudioAnalysisBus
import com.google.common.util.concurrent.ListenableFuture

/** The service's audio sink and the Capacitor plugin share this process-local bus. */
object NativeAudioAnalysisBridge {
    val bus = NativeAudioAnalysisBus()
}

/** Shared ordering gate for snapshots and event delivery. */
class PluginEventBridge {
    private var revision = -1L
    @Synchronized fun accept(incoming: Long): Boolean {
        if (incoming <= revision) return false
        revision = incoming
        return true
    }
    @Synchronized fun nextRevision(): Long = ++revision
}

/** Holds only a pending connection. Failures and disconnects must release it for retry. */
class ControllerConnection<T> {
    private var pending: ListenableFuture<T>? = null
    fun getOrStart(start: () -> ListenableFuture<T>): ListenableFuture<T> = pending ?: start().also { pending = it }
    suspend fun await(start: () -> ListenableFuture<T>, resolve: suspend (ListenableFuture<T>) -> T): T {
        val future = getOrStart(start)
        return try { resolve(future) }
        finally { if (pending === future) pending = null }
    }
    fun cancel() { pending?.cancel(true); pending = null }
}
