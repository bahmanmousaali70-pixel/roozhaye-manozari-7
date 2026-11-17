package com.roozhaye.manozari;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

public class ScheduleAlarmHelper {
    public static void rescheduleAll(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        SharedPreferences prefs = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        String jsonStr = prefs.getString("schedules_json", "[]");

        try {
            JSONArray arr = new JSONArray(jsonStr);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.getJSONObject(i);
                String id = item.optString("id", "sch_" + i);
                boolean enabled = item.optBoolean("enabled", false);
                int reqCode = Math.abs(id.hashCode());

                Intent intent = new Intent(context, ScheduleAlarmReceiver.class);
                intent.putExtra("schedule_id", id);
                intent.putExtra("title", item.optString("title", "روزهای من و زری"));
                intent.putExtra("spoken_text", item.optString("spokenText", ""));
                intent.putExtra("days", item.optString("days", "daily"));
                intent.putExtra("is_male", "male".equals(item.optString("voiceGender", "female")));
                intent.putExtra("voice_name", item.optString("voiceName", ""));
                intent.putExtra("auto_open", item.optBoolean("autoOpen", false));

                PendingIntent pi = PendingIntent.getBroadcast(
                        context,
                        reqCode,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );

                alarmManager.cancel(pi);
                if (!enabled) continue;

                String time = item.optString("time", "08:00");
                String[] parts = time.split(":");
                if (parts.length != 2) continue;
                int hour = Integer.parseInt(parts[0]);
                int minute = Integer.parseInt(parts[1]);

                Calendar cal = Calendar.getInstance();
                cal.set(Calendar.HOUR_OF_DAY, hour);
                cal.set(Calendar.MINUTE, minute);
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);
                if (cal.getTimeInMillis() <= System.currentTimeMillis() + 5000) {
                    cal.add(Calendar.DAY_OF_YEAR, 1);
                }

                long triggerAt = cal.getTimeInMillis();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (alarmManager.canScheduleExactAlarms()) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                    } else {
                        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                    }
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                } else {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                }
            }
        } catch (Exception ignored) {
        }
    }
}
