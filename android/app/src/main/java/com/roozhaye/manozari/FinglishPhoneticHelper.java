package com.roozhaye.manozari;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Converts common Latin/Finglish names & SMS phrases into clean Persian phonetics
 * for offline Android TTS and looks up user-defined Persian phonetic overrides in callers_json.
 */
public class FinglishPhoneticHelper {
    private static final Map<String, String> WORD_MAP = new HashMap<>();
    private static final Pattern LATIN_TOKEN = Pattern.compile("[A-Za-z]+(?:['’.-][A-Za-z]+)*");

    static {
        WORD_MAP.put("bahman", "بَهمن");
        WORD_MAP.put("mousaali", "موساعلی");
        WORD_MAP.put("musaali", "موساعلی");
        WORD_MAP.put("mousa", "موسی");
        WORD_MAP.put("musa", "موسی");
        WORD_MAP.put("zari", "زَری");
        WORD_MAP.put("zahra", "زهرا");
        WORD_MAP.put("mehdi", "مهدی");
        WORD_MAP.put("mohammad", "محمد");
        WORD_MAP.put("muhammad", "محمد");
        WORD_MAP.put("ali", "علی");
        WORD_MAP.put("reza", "رضا");
        WORD_MAP.put("hossein", "حسین");
        WORD_MAP.put("hasan", "حسن");
        WORD_MAP.put("sara", "سارا");
        WORD_MAP.put("maryam", "مریم");
        WORD_MAP.put("mina", "مینا");
        WORD_MAP.put("neda", "ندا");
        WORD_MAP.put("amir", "امیر");
        WORD_MAP.put("saeed", "سعید");
        WORD_MAP.put("omid", "امید");
        WORD_MAP.put("navid", "نوید");
        WORD_MAP.put("pouya", "پویا");
        WORD_MAP.put("arash", "آرش");
        WORD_MAP.put("radin", "رادین");
        WORD_MAP.put("negin", "نگین");
        WORD_MAP.put("nasim", "نسیم");
        WORD_MAP.put("mom", "مامان");
        WORD_MAP.put("maman", "مامان");
        WORD_MAP.put("baba", "بابا");
        WORD_MAP.put("dad", "پدر");
        WORD_MAP.put("khanoom", "خانوم");
        WORD_MAP.put("khanom", "خانم");
        WORD_MAP.put("agha", "آقا");
        WORD_MAP.put("jan", "جان");
        WORD_MAP.put("joon", "جون");
        WORD_MAP.put("jun", "جون");
        WORD_MAP.put("salam", "سَلام");
        WORD_MAP.put("slm", "سَلام");
        WORD_MAP.put("salm", "سَلام");
        WORD_MAP.put("khobi", "خوبی");
        WORD_MAP.put("khoobi", "خوبی");
        WORD_MAP.put("khubi", "خوبی");
        WORD_MAP.put("chetori", "چطوری");
        WORD_MAP.put("chetor", "چطور");
        WORD_MAP.put("chetory", "چطوری");
        WORD_MAP.put("merci", "مِرسی");
        WORD_MAP.put("mersi", "مِرسی");
        WORD_MAP.put("mersy", "مِرسی");
        WORD_MAP.put("mamnoon", "ممنون");
        WORD_MAP.put("mamnun", "ممنون");
        WORD_MAP.put("mamnon", "ممنون");
        WORD_MAP.put("fadat", "فدات");
        WORD_MAP.put("fedat", "فدات");
        WORD_MAP.put("azizam", "عزیزم");
        WORD_MAP.put("aziz", "عزیز");
        WORD_MAP.put("eshgham", "عشقم");
        WORD_MAP.put("delam", "دلم");
        WORD_MAP.put("ghorbonet", "قربونت");
        WORD_MAP.put("ghorbunet", "قربونت");
        WORD_MAP.put("khabar", "خبر");
        WORD_MAP.put("chiz", "چیز");
        WORD_MAP.put("chizi", "چیزی");
        WORD_MAP.put("man", "من");
        WORD_MAP.put("to", "تو");
        WORD_MAP.put("shoma", "شما");
        WORD_MAP.put("beman", "به من");
        WORD_MAP.put("behem", "بهم");
        WORD_MAP.put("bezang", "بزنگ");
        WORD_MAP.put("zang", "زنگ");
        WORD_MAP.put("bezan", "بزن");
        WORD_MAP.put("omadam", "اومدم");
        WORD_MAP.put("oomadam", "اومدم");
        WORD_MAP.put("umadam", "اومدم");
        WORD_MAP.put("miram", "میرم");
        WORD_MAP.put("miam", "میام");
        WORD_MAP.put("khone", "خونه");
        WORD_MAP.put("khoone", "خونه");
        WORD_MAP.put("khune", "خونه");
        WORD_MAP.put("kar", "کار");
        WORD_MAP.put("sobh", "صبح");
        WORD_MAP.put("sob", "صبح");
        WORD_MAP.put("shab", "شب");
        WORD_MAP.put("bekheir", "بخیر");
        WORD_MAP.put("khosh", "خوش");
        WORD_MAP.put("are", "آره");
        WORD_MAP.put("bale", "بله");
        WORD_MAP.put("na", "نه");
        WORD_MAP.put("kheili", "خیلی");
        WORD_MAP.put("kheyli", "خیلی");
        WORD_MAP.put("babakhshid", "ببخشید");
        WORD_MAP.put("bebakhshid", "ببخشید");
        WORD_MAP.put("lotfan", "لطفاً");
        WORD_MAP.put("dost", "دوست");
        WORD_MAP.put("doost", "دوست");
        WORD_MAP.put("daram", "دارم");
        WORD_MAP.put("dooset", "دوستت");
        WORD_MAP.put("doset", "دوستت");
        WORD_MAP.put("ok", "اوکی");
        WORD_MAP.put("okay", "اوکی");
        WORD_MAP.put("hello", "هلو");
        WORD_MAP.put("hi", "های");
        WORD_MAP.put("hey", "هِی");
        WORD_MAP.put("bye", "بای");
        WORD_MAP.put("good", "گود");
        WORD_MAP.put("morning", "مورنینگ");
        WORD_MAP.put("night", "نایت");
        WORD_MAP.put("please", "پلیز");
        WORD_MAP.put("thanks", "تَنکس");
        WORD_MAP.put("thank", "تَنک");
        WORD_MAP.put("sorry", "ساری");
        WORD_MAP.put("love", "لاو");
        WORD_MAP.put("you", "یو");
        WORD_MAP.put("call", "کال");
        WORD_MAP.put("calling", "کالینگ");
        WORD_MAP.put("incoming", "اینکامینگ");
        WORD_MAP.put("from", "فرام");
        WORD_MAP.put("design", "دیزاین");
        WORD_MAP.put("tech", "تک");
        WORD_MAP.put("support", "ساپورت");
        WORD_MAP.put("manager", "منیجر");
        WORD_MAP.put("office", "آفیس");
        WORD_MAP.put("work", "وُرک");
        WORD_MAP.put("home", "هوم");
        WORD_MAP.put("team", "تیم");
        WORD_MAP.put("project", "پروژه");
        WORD_MAP.put("dr", "دکتر");
        WORD_MAP.put("mr", "آقای");
        WORD_MAP.put("mrs", "خانم");
        WORD_MAP.put("ms", "خانم");
        WORD_MAP.put("sms", "اس ام اس");
        WORD_MAP.put("rcs", "آر سی اس");
        WORD_MAP.put("vpn", "وی پی ان");
        WORD_MAP.put("wifi", "وای فای");
    }

    public static String resolveSenderDisplayName(Context context, String rawSender) {
        if (rawSender == null || rawSender.trim().isEmpty()) {
            return "";
        }
        String trimmed = rawSender.trim();
        try {
            SharedPreferences prefs = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
            String jsonStr = prefs.getString("callers_json", "[]");
            JSONArray arr = new JSONArray(jsonStr);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                String name = obj.optString("name", "").trim();
                String latinAlias = obj.optString("latinAlias", "").trim();
                String phonetic = obj.optString("persianPhonetic", "").trim();
                boolean matches = (!name.isEmpty() && name.equalsIgnoreCase(trimmed))
                        || (!latinAlias.isEmpty() && latinAlias.equalsIgnoreCase(trimmed));
                if (matches && !phonetic.isEmpty()) {
                    return phonetic;
                }
            }
        } catch (Exception ignored) {
        }
        return trimmed;
    }

    public static String transliterateToPersianPhonetic(String input) {
        if (input == null || input.trim().isEmpty()) {
            return "";
        }
        if (!input.matches("(?s).*[A-Za-z].*")) {
            return input;
        }
        Matcher m = LATIN_TOKEN.matcher(input);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String token = m.group();
            String converted = transliterateCompoundToken(token);
            m.appendReplacement(sb, Matcher.quoteReplacement(converted));
        }
        m.appendTail(sb);
        return sb.toString().replaceAll("\\s+", " ").trim();
    }

    private static String transliterateCompoundToken(String token) {
        String[] parts = token.split("['’.-]");
        StringBuilder out = new StringBuilder();
        for (String p : parts) {
            if (p.isEmpty()) continue;
            String conv = transliterateWord(p);
            if (out.length() > 0) out.append(' ');
            out.append(conv);
        }
        return out.toString();
    }

    private static String transliterateWord(String raw) {
        String lower = raw.toLowerCase();
        String mapped = WORD_MAP.get(lower);
        if (mapped != null) {
            return mapped;
        }

        String s = lower
                .replaceAll("tion$", "شِن")
                .replaceAll("sion$", "ژِن")
                .replace("sh", "ش")
                .replace("ch", "چ")
                .replace("kh", "خ")
                .replace("gh", "ق")
                .replace("zh", "ژ")
                .replace("ph", "ف")
                .replace("th", "ت")
                .replace("ck", "ک")
                .replace("qu", "کو")
                .replace("oo", "او")
                .replace("ou", "او")
                .replace("ee", "ای")
                .replace("ea", "ای")
                .replace("ai", "اِی")
                .replace("ay", "اِی")
                .replace("ey", "اِی")
                .replace("ei", "اِی")
                .replace("au", "آ")
                .replace("aw", "آ");

        StringBuilder out = new StringBuilder();
        int len = s.length();
        for (int i = 0; i < len; i++) {
            char ch = s.charAt(i);
            boolean first = (i == 0);
            boolean last = (i == len - 1);
            if (ch >= '\u0600' && ch <= '\u06FF') {
                out.append(ch);
                continue;
            }
            switch (ch) {
                case 'a':
                    out.append(first ? "آ" : (last ? "ا" : "اَ"));
                    break;
                case 'b':
                    out.append("ب");
                    break;
                case 'c':
                    char next = (i + 1 < len) ? s.charAt(i + 1) : '\0';
                    out.append((next == 'e' || next == 'i' || next == 'y') ? "س" : "ک");
                    break;
                case 'd':
                    out.append("د");
                    break;
                case 'e':
                    out.append(first ? "اِ" : (last ? "ه" : "ِ"));
                    break;
                case 'f':
                    out.append("ف");
                    break;
                case 'g':
                    out.append("گ");
                    break;
                case 'h':
                    out.append("ه");
                    break;
                case 'i':
                    out.append(first ? "ای" : "ی");
                    break;
                case 'j':
                    out.append("ج");
                    break;
                case 'k':
                    out.append("ک");
                    break;
                case 'l':
                    out.append("ل");
                    break;
                case 'm':
                    out.append("م");
                    break;
                case 'n':
                    out.append("ن");
                    break;
                case 'o':
                    out.append(first ? "اُ" : "و");
                    break;
                case 'p':
                    out.append("پ");
                    break;
                case 'q':
                    out.append("ق");
                    break;
                case 'r':
                    out.append("ر");
                    break;
                case 's':
                    out.append("س");
                    break;
                case 't':
                    out.append("ت");
                    break;
                case 'u':
                    out.append(first ? "او" : "و");
                    break;
                case 'v':
                case 'w':
                    out.append("و");
                    break;
                case 'x':
                    out.append("کس");
                    break;
                case 'y':
                    out.append("ی");
                    break;
                case 'z':
                    out.append("ز");
                    break;
                default:
                    break;
            }
        }
        return out.length() > 0 ? out.toString() : raw;
    }
}
