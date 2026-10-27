package com.trciesielski.shutter;

import com.getcapacitor.BridgeActivity;
import com.trciesielski.shutter.plugin.ShutterMediaPlugin;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(ShutterMediaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
