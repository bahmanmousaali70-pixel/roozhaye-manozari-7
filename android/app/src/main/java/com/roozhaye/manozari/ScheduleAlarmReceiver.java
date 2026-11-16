package com.roozhaye.manozari;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

import java.util.Calendar;

public class ScheduleAlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "rmz_schedule_alarm_channel";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String scheduleId = intent.getStringExtra("schedule_id");
        String title = intent.getStringExtra("title");
        String spokenText = intent.getStringExtra("spoken_text");
        String days = intent.getStringExtra("days");
        boolean isMale = intent.getBooleanExtra("is_male", false);
        boolean autoOpen = intent.getBooleanExtra("auto_open", false);

        SharedPreferences prefs = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        boolean allowAutoOpen = autoOpen && prefs.getBoolean("auto_open_morning_enabled", true);

        if (matchesDay(days)) {
            postHighPriorityNotification(
                    context,
                    scheduleId != null ? scheduleId : "alarm",
                    title,
                    spokenText,
                    allowAutoOpen
            );

            if (allowAutoOpen) {
                try {
                    boolean canOverlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
                    if (canOverlay) {
                        Intent launch = new Intent(context, MainActivity.class);
                        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                        launch.putExtra("playSchedule", scheduleId);
                        context.startActivity(launch);
                    }
                } catch (Exception ignored) {
                }
            }

            if (spokenText != null && !spokenText.trim().isEmpty()) {
                CallAnnouncerService.announce(
                        context,
                        title != null ? title : "روزهای من و زری",
                        spokenText,
                        isMale,
                        1,
                        false
                );
            }
        }

        // Schedule next day's alarm automatically
        ScheduleAlarmHelper.rescheduleAll(context);
    }

    private boolean matchesDay(String days) {
        if (days == null || "daily".equals(days)) return true;
        int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK);
        boolean isIranWeekend = (dow == Calendar.THURSDAY || dow == Calendar.FRIDAY);
        return "weekends".equals(days) ? isIranWeekend : !isIranWeekend;
    }

    private void postHighPriorityNotification(Context context, String id, String title, String body, boolean fullScreen) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "پیام‌های صبحگاهی و یادآورهای روزانه",
                    NotificationManager.IMPORTANCE_HIGH
            );
            ch.setDescription("اعلان‌های خودکار پیام صبحگاهی و اهداف روزهای من و زری");
            nm.createNotificationChannel(ch);
        }

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openIntent.putExtra("playSchedule", id);
        PendingIntent pi = PendingIntent.getActivity(
                context,
                Math.abs(id.hashCode()),
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title != null ? title : "روزهای من و زری")
                .setContentText(body != null ? body : "زمان یادآور روزانه فرا رسید")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(pi);

        if (fullScreen) {
            builder.setFullScreenIntent(pi, true);
        }

        nm.notify(Math.abs(id.hashCode()), builder.build());
    }
}
