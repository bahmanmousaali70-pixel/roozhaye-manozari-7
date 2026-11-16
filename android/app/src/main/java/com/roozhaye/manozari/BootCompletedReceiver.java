package com.roozhaye.manozari;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class BootCompletedReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }

        ScheduleAlarmHelper.rescheduleAll(context);
        SharedPreferences prefs = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (prefs.getBoolean("keep_alive_enabled", false)) {
            KeepAliveForegroundService.start(context);
        }
    }
}
