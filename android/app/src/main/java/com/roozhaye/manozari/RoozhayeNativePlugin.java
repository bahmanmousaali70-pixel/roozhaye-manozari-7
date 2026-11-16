package com.roozhaye.manozari;

import android.Manifest;
import android.app.AlarmManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "RoozhayeNative")
public class RoozhayeNativePlugin extends Plugin {
    private static final int PERM_REQ_CODE = 8841;

    @PluginMethod
    public void getNativeCapabilities(PluginCall call) {
        call.resolve(buildCapsObject());
    }

    @PluginMethod
    public void requestPermissionsAndMiuiSetup(PluginCall call) {
        Context ctx = getContext();
        List<String> needed = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_PHONE_STATE);
        }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_CALL_LOG);
        }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_CONTACTS);
        }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECEIVE_SMS);
        }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_SMS);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!needed.isEmpty() && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), needed.toArray(new String[0]), PERM_REQ_CODE);
        }

        // Request battery optimization exemption (critical for MIUI 14)
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && pm != null && !pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) {
                Intent batteryIntent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                batteryIntent.setData(Uri.parse("package:" + ctx.getPackageName()));
                batteryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(batteryIntent);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
                Intent overlayIntent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + ctx.getPackageName())
                );
                overlayIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(overlayIntent);
            } else {
                openMiuiAutostartIfAvailable(ctx);
            }
        } catch (Exception ignored) {
            openMiuiAutostartIfAvailable(ctx);
        }

        call.resolve(buildCapsObject());
    }

    @PluginMethod
    public void setKeepAliveService(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Context ctx = getContext();
        if (enabled) {
            KeepAliveForegroundService.start(ctx);
        } else {
            KeepAliveForegroundService.stop(ctx);
        }
        JSObject ret = new JSObject();
        ret.put("running", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void setServerBaseUrl(PluginCall call) {
        String url = call.getString("url", "");
        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (url != null && !url.trim().isEmpty()) {
            prefs.edit().putString("server_base_url", url.trim().replaceAll("/+$", "")).apply();
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void precacheNativeAudio(PluginCall call) {
        String text = call.getString("text", "");
        String voiceName = call.getString("voiceName", "Kore");
        String audioBase64 = call.getString("audioBase64", "");
        boolean saved = false;
        if (text != null && !text.trim().isEmpty() && audioBase64 != null && !audioBase64.isEmpty()) {
            try {
                byte[] wavBytes = Base64.decode(audioBase64, Base64.DEFAULT);
                saved = CallAnnouncerService.saveWavToCache(getContext(), text, voiceName, wavBytes);
            } catch (Exception ignored) {
            }
        }
        JSObject ret = new JSObject();
        ret.put("ok", saved);
        call.resolve(ret);
    }

    @PluginMethod
    public void setAnnounceToggles(PluginCall call) {
        boolean announceCalls = Boolean.TRUE.equals(call.getBoolean("announceCalls", true));
        boolean announceSms = Boolean.TRUE.equals(call.getBoolean("announceSms", true));
        boolean autoOpenMorning = Boolean.TRUE.equals(call.getBoolean("autoOpenMorning", true));
        String defaultGender = call.getString("defaultGender", "female");
        String defaultVoice = call.getString("defaultVoice", "male".equals(defaultGender) ? "Charon" : "Kore");

        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        prefs.edit()
                .putBoolean("announce_calls_enabled", announceCalls)
                .putBoolean("announce_sms_enabled", announceSms)
                .putBoolean("auto_open_morning_enabled", autoOpenMorning)
                .putString("default_voice_gender", "male".equals(defaultGender) ? "male" : "female")
                .putString("default_voice_name", defaultVoice != null && !defaultVoice.trim().isEmpty() ? defaultVoice.trim() : "Kore")
                .apply();

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void syncCallers(PluginCall call) {
        String json = call.getString("callersJson", "[]");
        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        prefs.edit().putString("callers_json", json).apply();
        JSObject ret = new JSObject();
        ret.put("count", json != null ? json.length() : 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void syncSchedules(PluginCall call) {
        String json = call.getString("schedulesJson", "[]");
        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        prefs.edit().putString("schedules_json", json).apply();
        ScheduleAlarmHelper.rescheduleAll(getContext());
        JSObject ret = new JSObject();
        ret.put("count", json != null ? json.length() : 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void speakNativeBilingual(PluginCall call) {
        String text = call.getString("text", "");
        String gender = call.getString("gender", "female");
        Double rateDouble = call.getDouble("rate", 1.0);
        float rate = rateDouble != null ? rateDouble.floatValue() : 1.0f;

        if (text == null || text.trim().isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            call.resolve(ret);
            return;
        }

        BilingualSpeechHelper.speak(getContext(), text, "male".equals(gender), rate, false, success -> {
            JSObject ret = new JSObject();
            ret.put("ok", success);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void testNativeCallAnnouncement(PluginCall call) {
        String name = call.getString("name", "زری جان");
        String script = call.getString("script", "تماس ورودی از طرف زری جان");
        String gender = call.getString("gender", "female");
        String voiceName = call.getString("voiceName", "male".equals(gender) ? "Charon" : "Kore");

        CallAnnouncerService.announce(getContext(), "تست تماس: " + name, script, voiceName, "male".equals(gender), 1, true);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void testNativeSmsAnnouncement(PluginCall call) {
        String sender = call.getString("sender", "زری جان");
        String body = call.getString("body", "سلام، یادت نره امروز استراحت کنی");
        String gender = call.getString("gender", "female");
        String voiceName = call.getString("voiceName", "male".equals(gender) ? "Charon" : "Kore");

        String spoken = "پیامک جدید از طرف " + sender + ". متن پیام: " + body;
        CallAnnouncerService.announce(getContext(), "تست پیامک: " + sender, spoken, voiceName, "male".equals(gender), 1, false);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    private JSObject buildCapsObject() {
        Context ctx = getContext();
        JSObject obj = new JSObject();
        obj.put("isNative", true);
        obj.put("phoneState", ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED);
        obj.put("callLog", ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED);
        obj.put("contacts", ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED);
        obj.put("sms", ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED);

        boolean notifOk = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notifOk = ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        obj.put("notifications", notifOk);

        boolean batteryOk = false;
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && pm != null) {
            batteryOk = pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        obj.put("batteryIgnored", batteryOk);
        obj.put("overlay", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx));
        obj.put("keepAliveRunning", KeepAliveForegroundService.isRunning);

        boolean exactOk = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            exactOk = am != null && am.canScheduleExactAlarms();
        }
        obj.put("exactAlarm", exactOk);
        return obj;
    }

    private void openMiuiAutostartIfAvailable(Context ctx) {
        try {
            Intent miuiIntent = new Intent();
            miuiIntent.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
            miuiIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(miuiIntent);
        } catch (Exception ignored) {
            // Non-MIUI device or activity restricted; ignore gracefully
        }
    }
}
