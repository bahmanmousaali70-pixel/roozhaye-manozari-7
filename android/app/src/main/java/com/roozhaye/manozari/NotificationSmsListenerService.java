package com.roozhaye.manozari;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Listens to incoming messaging notifications from Google Messages (SMS + RCS),
 * Xiaomi/MIUI Messages, and Samsung Messages so POCO X6 Pro (HyperOS) & Mi 10T Pro
 * reliably announce incoming SMS and RCS chat messages in fluent Persian.
 */
public class NotificationSmsListenerService extends NotificationListenerService {
    private static final Set<String> SMS_PACKAGES = new HashSet<>(Arrays.asList(
            "com.google.android.apps.messaging",
            "com.android.mms",
            "com.xiaomi.mms",
            "com.samsung.android.messaging"
    ));

    @Override
    @SuppressWarnings("deprecation")
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !SMS_PACKAGES.contains(sbn.getPackageName())) {
            return;
        }

        Notification notif = sbn.getNotification();
        if (notif == null) return;
        if ((notif.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        if ((notif.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;

        SharedPreferences prefs = getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("announce_sms_enabled", true)) {
            return;
        }

        Bundle extras = notif.extras;
        if (extras == null) return;

        String title = charSeqToString(extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE));
        if (title.isEmpty()) {
            title = charSeqToString(extras.getCharSequence(Notification.EXTRA_TITLE));
        }

        String body = charSeqToString(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (body.isEmpty()) {
            body = charSeqToString(extras.getCharSequence(Notification.EXTRA_TEXT));
        }

        // Check MessagingStyle bundle array if EXTRA_TEXT is sparse
        if (body.isEmpty()) {
            Parcelable[] msgs = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
            if (msgs != null && msgs.length > 0 && msgs[msgs.length - 1] instanceof Bundle) {
                Bundle lastMsg = (Bundle) msgs[msgs.length - 1];
                body = charSeqToString(lastMsg.getCharSequence("text"));
                String msgSender = charSeqToString(lastMsg.getCharSequence("sender"));
                if (!msgSender.isEmpty() && title.isEmpty()) {
                    title = msgSender;
                }
            }
        }

        if (title.isEmpty() || body.isEmpty()) {
            return;
        }

        // Ignore background sync / service status banners from Google Messages
        String lowerBody = body.toLowerCase();
        if (lowerBody.contains("doing work in the background")
                || lowerBody.contains("messages for web")
                || lowerBody.contains("connecting to web")
                || lowerBody.contains("downloading")) {
            return;
        }

        if (body.length() > 240) {
            body = body.substring(0, 240);
        }

        if (IncomingSmsReceiver.shouldSkipDuplicateSms(title, body)) {
            return;
        }

        boolean isMale = "male".equals(prefs.getString("default_voice_gender", "female"));
        String voiceName = prefs.getString("default_voice_name", isMale ? "Charon" : "Kore");
        String spokenSender = FinglishPhoneticHelper.resolveSenderDisplayName(getApplicationContext(), title);
        String spoken = "پیام جدید از طرف " + spokenSender + ". متن پیام: " + body;

        CallAnnouncerService.announce(
                getApplicationContext(),
                "پیام جدید: " + title,
                spoken,
                voiceName,
                isMale,
                1,
                false
        );
    }

    private static String charSeqToString(CharSequence cs) {
        return cs != null ? cs.toString().trim() : "";
    }
}
