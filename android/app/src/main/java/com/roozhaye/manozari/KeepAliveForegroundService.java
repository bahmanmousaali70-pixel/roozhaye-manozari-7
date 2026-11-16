package com.roozhaye.manozari;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class KeepAliveForegroundService extends Service {
    public static final String CHANNEL_ID = "rmz_keepalive_channel";
    public static final int NOTIF_ID = 7001;
    public static volatile boolean isRunning = false;

    public static void start(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("rmz_native_prefs", MODE_PRIVATE);
        prefs.edit().putBoolean("keep_alive_enabled", true).apply();

        Intent intent = new Intent(context, KeepAliveForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("rmz_native_prefs", MODE_PRIVATE);
        prefs.edit().putBoolean("keep_alive_enabled", false).apply();

        Intent intent = new Intent(context, KeepAliveForegroundService.class);
        context.stopService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        isRunning = true;

        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("روزهای من و زری · فعال در پس‌زمینه")
                .setContentText("اعلام خودکار تماس ورودی و زمان‌بندی صبحگاهی روشن است")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID, notification);
        }

        ScheduleAlarmHelper.rescheduleAll(this);
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        SharedPreferences prefs = getSharedPreferences("rmz_native_prefs", MODE_PRIVATE);
        if (prefs.getBoolean("keep_alive_enabled", false)) {
            Intent restart = new Intent(getApplicationContext(), KeepAliveForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getApplicationContext().startForegroundService(restart);
            } else {
                getApplicationContext().startService(restart);
            }
        }
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "سرویس دائمی روزهای من و زری",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("برای بیدار ماندن زمان‌بند و اعلام تماس ورودی در پس‌زمینه");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
