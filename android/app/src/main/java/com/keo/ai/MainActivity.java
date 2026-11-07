package com.keo.ai;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KeoNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
