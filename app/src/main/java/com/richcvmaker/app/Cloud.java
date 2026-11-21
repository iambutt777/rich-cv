package com.richcvmaker.app;

import android.accounts.Account;
import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import android.content.SharedPreferences;
import android.webkit.WebView;

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * "Sign in with Google" + backup of the CVs to the user's own Google Drive.
 * The backup is one file in the Drive "app data" folder: a hidden folder only this app can see
 * (not visible in the user's Drive, and not visible to the app owner either).
 *
 * The web app calls the methods through window.AndroidBridge (see MainActivity) and gets the
 * answers in window.RichCloud.onNative(kind, data).
 *
 * Setup (Google Cloud console): enable the Google Drive API, set up the OAuth consent screen and
 * create an "Android" OAuth client with the package name and the SHA-1 of the signing key.
 */
final class Cloud {

    static final int REQ_AUTH = 1003;
    private static final String SCOPE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";
    private static final String SCOPE_EMAIL = "https://www.googleapis.com/auth/userinfo.email";
    private static final String FILE_NAME = "rich-cv-backup.json";
    private static final List<Scope> SCOPES = Arrays.asList(new Scope(SCOPE_APPDATA), new Scope(SCOPE_EMAIL));

    private final Activity act;
    private final WebView web;
    private final SharedPreferences prefs;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile String token;
    private Runnable pendingOk;                  // waiting for the Google account screen to finish
    private Consumer<String> pendingFail;

    /** Thrown when Google says the access token is no longer valid. */
    private static final class AuthExpired extends IOException {
        AuthExpired() { super("expired"); }
    }

    Cloud(Activity act, WebView web) {
        this.act = act;
        this.web = web;
        this.prefs = act.getSharedPreferences("rich_cloud", Activity.MODE_PRIVATE);
    }

    // ------------------------------------------------------------------ status
    String status() {
        try {
            JSONObject o = new JSONObject();
            o.put("available", true);
            o.put("signedIn", prefs.getBoolean("in", false));
            o.put("email", prefs.getString("email", ""));
            o.put("lastBackup", prefs.getLong("last", 0));
            return o.toString();
        } catch (Exception e) {
            return "{\"available\":true}";
        }
    }

    // ------------------------------------------------------------------ sign in / out
    void signIn() {
        authorize(true, () -> io.execute(() -> {
            try {
                String email = fetchEmail();
                prefs.edit().putBoolean("in", true).putString("email", email).apply();
                send("signin", ok().put("email", email));
            } catch (Exception e) {
                send("signin", fail(e.getMessage()));
            }
        }), reason -> send("signin", fail(reason)));
    }

    void signOut() {
        String email = prefs.getString("email", "");
        String old = token;
        token = null;
        prefs.edit().clear().apply();
        try {
            if (old != null) Identity.getAuthorizationClient(act).clearToken(ClearTokenRequest.builder().setToken(old).build());
            if (!email.isEmpty()) {
                Identity.getAuthorizationClient(act).revokeAccess(RevokeAccessRequest.builder()
                        .setAccount(new Account(email, "com.google"))
                        .setScopes(SCOPES)
                        .build());
            }
        } catch (Exception ignored) {
            // the app forgets the account either way
        }
        send("signout", ok());
    }

    // ------------------------------------------------------------------ backup / restore
    /** Saves the backup (JSON text made by the web app) to Drive, replacing the previous one. */
    void upload(String json, boolean interactive) {
        withDrive(interactive, () -> {
            String id = findFileId();
            byte[] data = json.getBytes(StandardCharsets.UTF_8);
            if (id == null) {
                String boundary = "rich" + System.currentTimeMillis();
                String meta = new JSONObject().put("name", FILE_NAME).put("parents", new JSONArray().put("appDataFolder")).toString();
                ByteArrayOutputStream body = new ByteArrayOutputStream();
                body.write(("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta + "\r\n--" + boundary
                        + "\r\nContent-Type: application/json\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                body.write(data);
                body.write(("\r\n--" + boundary + "--").getBytes(StandardCharsets.UTF_8));
                http("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
                        "multipart/related; boundary=" + boundary, body.toByteArray(), false);
            } else {
                http("POST", "https://www.googleapis.com/upload/drive/v3/files/" + id + "?uploadType=media&fields=id",
                        "application/json", data, true);           // POST + override = PATCH (update the file)
            }
            long now = System.currentTimeMillis();
            prefs.edit().putLong("last", now).apply();
            send("upload", ok().put("time", now));
        }, reason -> send("upload", fail(reason)));
    }

    /** Reads the backup from Drive and hands it to the web app (which merges it in). */
    void download(boolean interactive) {
        withDrive(interactive, () -> {
            String id = findFileId();
            if (id == null) {
                send("download", ok().put("empty", true));
                return;
            }
            String text = http("GET", "https://www.googleapis.com/drive/v3/files/" + id + "?alt=media", null, null, false);
            send("download", ok().put("data", text));
        }, reason -> send("download", fail(reason)));
    }

    // ------------------------------------------------------------------ Google authorization
    private void authorize(boolean interactive, Runnable onOk, Consumer<String> onFail) {
        AuthorizationRequest req = AuthorizationRequest.builder().setRequestedScopes(SCOPES).build();
        Identity.getAuthorizationClient(act).authorize(req)
                .addOnSuccessListener(res -> {
                    if (res.hasResolution()) {
                        if (!interactive) { onFail.accept("signin-needed"); return; }
                        pendingOk = onOk;
                        pendingFail = onFail;
                        try {
                            act.startIntentSenderForResult(res.getPendingIntent().getIntentSender(), REQ_AUTH, null, 0, 0, 0);
                        } catch (IntentSender.SendIntentException e) {
                            pendingOk = null; pendingFail = null;
                            onFail.accept(e.getMessage());
                        }
                    } else {
                        token = res.getAccessToken();
                        onOk.run();
                    }
                })
                .addOnFailureListener(e -> onFail.accept(e.getMessage()));
    }

    /** MainActivity passes the result of the Google account screen here. */
    void onAuthResult(int resultCode, Intent data) {
        Runnable ok = pendingOk;
        Consumer<String> no = pendingFail;
        pendingOk = null; pendingFail = null;
        if (resultCode != Activity.RESULT_OK || data == null) {
            if (no != null) no.accept("cancelled");
            return;
        }
        try {
            AuthorizationResult r = Identity.getAuthorizationClient(act).getAuthorizationResultFromIntent(data);
            token = r.getAccessToken();
            if (ok != null) ok.run();
        } catch (ApiException e) {
            if (no != null) no.accept("Google sign-in failed (code " + e.getStatusCode() + ")");
        }
    }

    private interface DriveJob { void run() throws Exception; }

    /** Gets a token, runs the job in the background, and retries once with a fresh token if it expired. */
    private void withDrive(boolean interactive, DriveJob job, Consumer<String> onFail) {
        if (!prefs.getBoolean("in", false) && !interactive) { onFail.accept("signin-needed"); return; }
        Runnable run = () -> io.execute(() -> {
            try {
                job.run();
            } catch (AuthExpired e) {
                String old = token;
                token = null;
                act.runOnUiThread(() -> {
                    try { if (old != null) Identity.getAuthorizationClient(act).clearToken(ClearTokenRequest.builder().setToken(old).build()); } catch (Exception ignored) { }
                    authorize(interactive, () -> io.execute(() -> {
                        try { job.run(); } catch (Exception e2) { onFail.accept(msg(e2)); }
                    }), onFail);
                });
            } catch (Exception e) {
                onFail.accept(msg(e));
            }
        });
        if (token != null) run.run();
        else act.runOnUiThread(() -> authorize(interactive, run, onFail));
    }

    // ------------------------------------------------------------------ Drive REST calls
    private String findFileId() throws Exception {
        String q = URLEncoder.encode("name = '" + FILE_NAME + "' and trashed = false", "UTF-8");
        String text = http("GET", "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id)&q=" + q, null, null, false);
        JSONArray files = new JSONObject(text).optJSONArray("files");
        return files != null && files.length() > 0 ? files.getJSONObject(0).getString("id") : null;
    }

    private String fetchEmail() throws Exception {
        String text = http("GET", "https://www.googleapis.com/oauth2/v3/userinfo", null, null, false);
        return new JSONObject(text).optString("email", "");
    }

    private String http(String method, String url, String contentType, byte[] body, boolean patch) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            c.setRequestMethod(method);
            c.setRequestProperty("Authorization", "Bearer " + token);
            if (patch) c.setRequestProperty("X-HTTP-Method-Override", "PATCH");
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", contentType);
                c.setFixedLengthStreamingMode(body.length);
                try (OutputStream out = c.getOutputStream()) { out.write(body); }
            }
            int code = c.getResponseCode();
            String text = read(code >= 400 ? c.getErrorStream() : c.getInputStream());
            if (code == 401) throw new AuthExpired();
            if (code >= 400) throw new IOException("Google Drive error " + code + (text.isEmpty() ? "" : ": " + shorten(text)));
            return text;
        } finally {
            c.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream s = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = s.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }

    private static String shorten(String s) {
        try {
            JSONObject e = new JSONObject(s).optJSONObject("error");
            if (e != null) return e.optString("message", s);
        } catch (Exception ignored) { }
        return s.length() > 160 ? s.substring(0, 160) : s;
    }

    private static String msg(Exception e) {
        return e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
    }

    // ------------------------------------------------------------------ answers to the web app
    private static JSONObject ok() {
        try { return new JSONObject().put("ok", true); } catch (Exception e) { return new JSONObject(); }
    }

    private static JSONObject fail(String reason) {
        try { return new JSONObject().put("ok", false).put("error", reason == null ? "unknown error" : reason); } catch (Exception e) { return new JSONObject(); }
    }

    private void send(String kind, JSONObject data) {
        String js = "window.RichCloud && window.RichCloud.onNative(" + JSONObject.quote(kind) + "," + data.toString() + ")";
        act.runOnUiThread(() -> web.evaluateJavascript(js, null));
    }
}
