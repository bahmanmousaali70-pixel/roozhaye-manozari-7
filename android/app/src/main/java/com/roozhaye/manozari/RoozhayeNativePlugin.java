package com.roozhaye.manozari;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

        // Request battery optimization exemption (critical for MIUI / HyperOS)
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
    public void openNotificationListenerSettings(PluginCall call) {
        Context ctx = getContext();
        boolean launched;
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            launched = true;
        } catch (Exception ignored) {
            launched = openAppDetailsInternal(ctx);
        }
        JSObject ret = new JSObject();
        ret.put("ok", launched);
        call.resolve(ret);
    }

    @PluginMethod
    public void openAppInfoSettings(PluginCall call) {
        boolean launched = openAppDetailsInternal(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", launched);
        call.resolve(ret);
    }

    @PluginMethod
    public void openXiaomiOtherPermissions(PluginCall call) {
        Context ctx = getContext();
        boolean launched = false;
        try {
            Intent permIntent = new Intent("miui.intent.action.APP_PERM_EDITOR");
            permIntent.setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity");
            permIntent.putExtra("extra_pkgname", ctx.getPackageName());
            permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(permIntent);
            launched = true;
        } catch (Exception ignored) {
            try {
                Intent permIntent2 = new Intent("miui.intent.action.APP_PERM_EDITOR");
                permIntent2.putExtra("extra_pkgname", ctx.getPackageName());
                permIntent2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(permIntent2);
                launched = true;
            } catch (Exception ignored2) {
                launched = openAppDetailsInternal(ctx);
            }
        }
        JSObject ret = new JSObject();
        ret.put("ok", launched);
        call.resolve(ret);
    }

    private boolean openAppDetailsInternal(Context ctx) {
        try {
            Intent detailsIntent = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + ctx.getPackageName())
            );
            detailsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(detailsIntent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
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
    public void saveLearnedPhonetics(PluginCall call) {
        String phoneticsJson = call.getString("phoneticsJson", "{}");
        SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        int count = 0;
        try {
            JSONObject incoming = new JSONObject(phoneticsJson != null ? phoneticsJson : "{}");
            JSONObject existing = new JSONObject(prefs.getString("learned_phonetics_json", "{}"));
            JSONArray keys = incoming.names();
            if (keys != null) {
                for (int i = 0; i < keys.length(); i++) {
                    String k = keys.getString(i);
                    String v = incoming.optString(k, "").trim();
                    if (!k.trim().isEmpty() && !v.isEmpty()) {
                        existing.put(k.trim().toLowerCase(), v);
                        count++;
                    }
                }
            }
            prefs.edit().putString("learned_phonetics_json", existing.toString()).apply();
        } catch (Exception ignored) {
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("count", count);
        call.resolve(ret);
    }

    @PluginMethod
    public void readDeviceContacts(PluginCall call) {
        Context ctx = getContext();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            if (getActivity() != null) {
                ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.READ_CONTACTS}, PERM_REQ_CODE);
            }
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("permissionRequired", true);
            ret.put("contactsJson", "[]");
            call.resolve(ret);
            return;
        }

        Map<String, JSONObject> byName = new LinkedHashMap<>();
        JSONObject phoneToNameMap = new JSONObject();
        JSONObject offlinePhoneticMap = new JSONObject();

        String[] projection = new String[]{
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
        };
        try (Cursor c = ctx.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
        )) {
            if (c != null) {
                int nameIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int numIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                while (c.moveToNext() && byName.size() < 1500) {
                    String rawName = nameIdx >= 0 ? c.getString(nameIdx) : "";
                    String rawPhone = numIdx >= 0 ? c.getString(numIdx) : "";
                    String cleanName = rawName != null ? rawName.trim() : "";
                    if (cleanName.isEmpty()) continue;

                    String phoneKey = FinglishPhoneticHelper.normalizePhoneKey(rawPhone);
                    if (phoneKey.length() >= 7) {
                        phoneToNameMap.put(phoneKey, cleanName);
                    }

                    String nameKey = cleanName.toLowerCase();
                    if (!byName.containsKey(nameKey)) {
                        String phonetic = cleanName.matches("(?s).*[A-Za-z].*")
                                ? FinglishPhoneticHelper.transliterateToPersianPhonetic(cleanName)
                                : cleanName;
                        JSONObject item = new JSONObject();
                        item.put("name", cleanName);
                        item.put("phone", rawPhone != null ? rawPhone.trim() : "");
                        item.put("persianPhonetic", phonetic);
                        byName.put(nameKey, item);
                        offlinePhoneticMap.put(nameKey, phonetic);
                    }
                }
            }
        } catch (Exception ignored) {
        }

        SharedPreferences prefs = ctx.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        try {
            // Preserve existing server-refined phonetics unless missing
            JSONObject existingLearned = new JSONObject(prefs.getString("learned_phonetics_json", "{}"));
            JSONArray keys = offlinePhoneticMap.names();
            if (keys != null) {
                for (int i = 0; i < keys.length(); i++) {
                    String k = keys.getString(i);
                    if (!existingLearned.has(k)) {
                        existingLearned.put(k, offlinePhoneticMap.getString(k));
                    } else {
                        String savedVal = existingLearned.optString(k, "").trim();
                        if (!savedVal.isEmpty() && byName.containsKey(k)) {
                            byName.get(k).put("persianPhonetic", savedVal);
                        }
                    }
                }
            }
            prefs.edit()
                    .putString("synced_phone_name_json", phoneToNameMap.toString())
                    .putString("learned_phonetics_json", existingLearned.toString())
                    .apply();
        } catch (Exception ignored) {
        }

        JSONArray arr = new JSONArray(byName.values());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("count", arr.length());
        ret.put("contactsJson", arr.toString());
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
    public void wasScheduleFiredNatively(PluginCall call) {
        String scheduleId = call.getString("scheduleId", "");
        String todayKey = call.getString("todayKey", "");
        boolean fired = false;
        if (scheduleId != null && !scheduleId.isEmpty() && todayKey != null && !todayKey.isEmpty()) {
            SharedPreferences prefs = getContext().getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
            String recordedDay = prefs.getString("fired_today_" + scheduleId, "");
            fired = todayKey.equals(recordedDay);
        }
        JSObject ret = new JSObject();
        ret.put("fired", fired);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopNativeAudio(PluginCall call) {
        CallAnnouncerService.stopActive(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void saveBackupJson(PluginCall call) {
        String filename = call.getString("filename", "man-o-zari-backup.json");
        String content = call.getString("content", "");
        boolean shareAfter = Boolean.TRUE.equals(call.getBoolean("shareAfter", false));

        if (content == null || content.isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", "محتوای فایل خالی است.");
            call.resolve(ret);
            return;
        }

        Context ctx = getContext();
        String safeName = (filename != null && !filename.trim().isEmpty())
                ? filename.replaceAll("[^A-Za-z0-9._-]", "_")
                : "man-o-zari-backup.json";

        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        boolean savedToDownloads = false;
        String displayPath = "Download/RoozhayeManOZari/" + safeName;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = ctx.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/RoozhayeManOZari");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri itemUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (itemUri != null) {
                    try (OutputStream os = resolver.openOutputStream(itemUri)) {
                        if (os != null) {
                            os.write(bytes);
                            os.flush();
                            savedToDownloads = true;
                        }
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    resolver.update(itemUri, values, null, null);
                }
            } else {
                File dir = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "RoozhayeManOZari");
                if (!dir.exists()) dir.mkdirs();
                File outFile = new File(dir, safeName);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(bytes);
                    savedToDownloads = true;
                }
                displayPath = outFile.getAbsolutePath();
            }
        } catch (Exception ignored) {
        }

        // Write cache copy for FileProvider sharing sheet
        boolean shared = false;
        if (shareAfter) {
            try {
                File shareDir = new File(ctx.getCacheDir(), "backups");
                if (!shareDir.exists()) shareDir.mkdirs();
                File cacheFile = new File(shareDir, safeName);
                try (FileOutputStream fos = new FileOutputStream(cacheFile)) {
                    fos.write(bytes);
                }
                Uri contentUri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", cacheFile);
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("*/*");
                shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, safeName);
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(shareIntent, "ذخیره یا ارسال فایل پشتیبان روزهای من و زری");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(chooser);
                shared = true;
            } catch (Exception ignored) {
            }
        }

        JSObject ret = new JSObject();
        ret.put("ok", savedToDownloads || shared);
        ret.put("savedPath", displayPath);
        ret.put("shared", shared);
        call.resolve(ret);
    }

    @PluginMethod
    public void pickJsonFileNative(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            // Allow any MIME type because MIUI/HyperOS file manager frequently indexes .json as octet-stream/text
            intent.setType("*/*");
            startActivityForResult(call, intent, "handlePickJsonResult");
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", "امکان باز کردن انتخابگر فایل وجود نداشت.");
            call.resolve(ret);
        }
    }

    @ActivityCallback
    private void handlePickJsonResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        Uri uri = result.getData().getData();
        String fileName = "backup.json";
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) fileName = c.getString(idx);
            }
        } catch (Exception ignored) {
        }

        try (InputStream is = getContext().getContentResolver().openInputStream(uri)) {
            if (is == null) throw new Exception("Empty input stream");
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) {
                baos.write(buf, 0, n);
            }
            String text = new String(baos.toByteArray(), StandardCharsets.UTF_8);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("name", fileName);
            ret.put("content", text);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", "امکان خواندن فایل انتخاب‌شده نبود.");
            call.resolve(ret);
        }
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

        boolean listenerOk = false;
        try {
            listenerOk = NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.getPackageName());
        } catch (Exception ignored) {
        }
        obj.put("notificationListener", listenerOk);

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
