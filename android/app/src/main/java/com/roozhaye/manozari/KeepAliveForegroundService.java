package com.roozhaye.manozari;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.database.ContentObserver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.ContactsContract;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

public class KeepAliveForegroundService extends Service {
    public static final String CHANNEL_ID = "rmz_keepalive_channel";
    public static final int NOTIF_ID = 7001;
    public static volatile boolean isRunning = false;

    private ContentObserver smsObserver = null;
    private long lastObservedSmsId = -1L;

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
        registerSmsObserverIfPermitted();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        isRunning = true;
        registerSmsObserverIfPermitted();

        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("روزهای من و زری · فعال در پس‌زمینه")
                .setContentText("اعلام خودکار تماس، پیامک و زمان‌بندی صبحگاهی روشن است")
                .setSmallIcon(R.drawable.ic_stat_rmz)
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

    /**
     * Watches content://sms as a HyperOS/MIUI safety net so if SMS_RECEIVED broadcasts are delayed or throttled
     * while READ_SMS is granted, new incoming inbox messages are still spoken reliably.
     */
    private void registerSmsObserverIfPermitted() {
        if (smsObserver != null) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            // Seed baseline last ID so we don't replay an old SMS
            try (Cursor c = getContentResolver().query(
                    Uri.parse("content://sms/inbox"),
                    new String[]{"_id"},
                    null,
                    null,
                    "_id DESC LIMIT 1"
            )) {
                if (c != null && c.moveToFirst()) {
                    lastObservedSmsId = c.getLong(0);
                }
            } catch (Exception ignored) {
            }

            smsObserver = new ContentObserver(new Handler(Looper.getMainLooper())) {
                @Override
                public void onChange(boolean selfChange) {
                    checkLatestInboxSms();
                }
            };
            getContentResolver().registerContentObserver(Uri.parse("content://sms"), true, smsObserver);
        } catch (Exception ignored) {
            smsObserver = null;
        }
    }

    private void checkLatestInboxSms() {
        SharedPreferences prefs = getSharedPreferences("rmz_native_prefs", MODE_PRIVATE);
        if (!prefs.getBoolean("announce_sms_enabled", true)) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try (Cursor c = getContentResolver().query(
                Uri.parse("content://sms/inbox"),
                new String[]{"_id", "address", "body", "date"},
                null,
                null,
                "_id DESC LIMIT 1"
        )) {
            if (c != null && c.moveToFirst()) {
                long id = c.getLong(0);
                String address = c.getString(1);
                String body = c.getString(2);
                long msgDate = c.getLong(3);

                if (id <= lastObservedSmsId) return;
                if (System.currentTimeMillis() - msgDate > 30000L) {
                    lastObservedSmsId = id;
                    return;
                }
                lastObservedSmsId = id;

                String safeBody = body != null ? body.trim() : "";
                if (safeBody.length() > 240) safeBody = safeBody.substring(0, 240);

                String sender = resolveContactDisplay(address);
                if (sender == null || sender.trim().isEmpty()) {
                    sender = (address != null && !address.trim().isEmpty()) ? address.trim() : "فرستنده ناشناس";
                }

                if (IncomingSmsReceiver.shouldSkipDuplicateSms(sender, safeBody)) {
                    return;
                }

                boolean isMale = "male".equals(prefs.getString("default_voice_gender", "female"));
                String voiceName = prefs.getString("default_voice_name", isMale ? "Charon" : "Kore");
                String spokenSender = FinglishPhoneticHelper.resolveSenderDisplayName(this, sender);
                String spoken = "پیامک جدید از طرف " + spokenSender + ". متن پیام: " + (safeBody.isEmpty() ? "بدون متن" : safeBody);

                CallAnnouncerService.announce(
                        getApplicationContext(),
                        "پیامک جدید: " + sender,
                        spoken,
                        voiceName,
                        isMale,
                        1,
                        false
                );
            }
        } catch (Exception ignored) {
        }
    }

    private String resolveContactDisplay(String phoneNumber) {
        if (phoneNumber == null || phoneNumber.trim().isEmpty()) return null;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
            Uri uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(phoneNumber));
            try (Cursor cursor = getContentResolver().query(
                    uri,
                    new String[]{ContactsContract.PhoneLookup.DISPLAY_NAME},
                    null,
                    null,
                    null
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    String found = cursor.getString(0);
                    if (found != null && !found.trim().isEmpty()) {
                        return found;
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return FinglishPhoneticHelper.resolvePhoneToSyncedName(this, phoneNumber);
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
        if (smsObserver != null) {
            try {
                getContentResolver().unregisterContentObserver(smsObserver);
            } catch (Exception ignored) {
            }
            smsObserver = null;
        }
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
