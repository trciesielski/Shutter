package com.trciesielski.shutter.plugin

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PluginPayloadsTest {
    @Test fun rejectsInvalidCommands() {
        assertThrows(IllegalArgumentException::class.java) { PluginPayloads.seek(JSONObject().put("positionMs", -1)) }
        assertThrows(IllegalArgumentException::class.java) { PluginPayloads.volume(JSONObject().put("value", 2)) }
        assertThrows(IllegalArgumentException::class.java) { PluginPayloads.queue(JSONObject().put("trackIds", JSONArray().put("")), 0) }
        assertThrows(IllegalArgumentException::class.java) { PluginPayloads.repeat(JSONObject().put("mode", "random")) }
    }
    @Test fun rejectsStaleEventsAndKeepsMonotonicRevisions() {
        val gate = PluginEventBridge()
        assertTrue(gate.accept(4))
        assertFalse(gate.accept(3))
        assertTrue(gate.accept(4))
        assertTrue(gate.nextRevision() > 4)
    }
}
