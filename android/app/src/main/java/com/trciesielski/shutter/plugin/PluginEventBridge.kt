package com.trciesielski.shutter.plugin

/** Shared ordering gate for snapshots and event delivery. */
class PluginEventBridge {
    private var revision = -1L
    @Synchronized fun accept(incoming: Long): Boolean {
        if (incoming < revision) return false
        revision = incoming
        return true
    }
    @Synchronized fun nextRevision(): Long = ++revision
}
