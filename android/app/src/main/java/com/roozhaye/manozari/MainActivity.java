package com.roozhaye.manozari;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RoozhayeNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
