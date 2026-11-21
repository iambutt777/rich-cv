package com.richcvmaker.app;

import android.app.Activity;
import android.os.CancellationSignal;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;

import com.google.android.gms.tasks.Task;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseNetworkException;
import com.google.firebase.auth.AuthCredential;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.GoogleAuthProvider;
import com.google.firebase.auth.UserInfo;
import com.google.firebase.auth.UserProfileChangeRequest;

import org.json.JSONObject;

/**
 * Optional user account (Firebase Authentication): log in with an email + password, or with a
 * Google account. Both are free in Firebase (no SMS).
 *
 * Works only when the Firebase file google-services.json is in android-app/app/ (see SETUP-GOOGLE.md).
 * Without it the app builds and runs as before and simply hides the login.
 *
 * The web app calls the methods through window.AndroidBridge (see MainActivity) and gets the
 * answers in window.RichAuth.onNative(kind, data).
 */
final class Account {

    private final Activity act;
    private final WebView web;
    private final FirebaseAuth auth;          // null when Firebase is not set up

    Account(Activity act, WebView web) {
        this.act = act;
        this.web = web;
        FirebaseAuth a = null;
        try {
            if (FirebaseApp.getApps(act).isEmpty()) FirebaseApp.initializeApp(act);
            if (!FirebaseApp.getApps(act).isEmpty()) a = FirebaseAuth.getInstance();
        } catch (Exception ignored) { }
        this.auth = a;
        if (auth != null) auth.addAuthStateListener(fa -> send("state", status(), null));
    }

    boolean available() { return auth != null; }

    /** {available, signedIn, email, name, provider, verified} */
    String status() {
        try {
            JSONObject o = new JSONObject();
            o.put("available", auth != null);
            FirebaseUser u = auth == null ? null : auth.getCurrentUser();
            o.put("signedIn", u != null);
            if (u != null) {
                o.put("email", u.getEmail() == null ? "" : u.getEmail());
                o.put("name", u.getDisplayName() == null ? "" : u.getDisplayName());
                // (v4.97) the Google profile picture (a larger size than Google's default 96 px)
                String photo = "";
                if (u.getPhotoUrl() != null) photo = u.getPhotoUrl().toString();
                for (UserInfo p : u.getProviderData()) if (photo.isEmpty() && p.getPhotoUrl() != null) photo = p.getPhotoUrl().toString();
                o.put("photo", photo.replaceAll("=s\\d+(-c)?$", "=s256-c"));
                o.put("verified", u.isEmailVerified());
                String provider = "password";
                for (UserInfo p : u.getProviderData()) if (GoogleAuthProvider.PROVIDER_ID.equals(p.getProviderId())) provider = "google";
                o.put("provider", provider);
            }
            return o.toString();
        } catch (Exception e) {
            return "{\"available\":false}";
        }
    }

    /** Emails from Firebase (verification, password reset) in the app's language. */
    void setLanguage(String code) {
        if (auth != null && code != null && !code.isEmpty()) auth.setLanguageCode(code);
    }

    // ---------------- email + password ----------------
    void signUp(String name, String email, String password) {
        if (!ready("signup")) return;
        auth.createUserWithEmailAndPassword(email.trim(), password).addOnCompleteListener(t -> {
            if (!t.isSuccessful()) { fail("signup", t); return; }
            FirebaseUser u = auth.getCurrentUser();
            if (u == null) { send("signup", status(), null); return; }
            Runnable verify = () -> u.sendEmailVerification().addOnCompleteListener(v -> send("signup", status(), null));
            if (name != null && !name.trim().isEmpty()) {
                u.updateProfile(new UserProfileChangeRequest.Builder().setDisplayName(name.trim()).build())
                        .addOnCompleteListener(p -> verify.run());
            } else verify.run();
        });
    }

    void signIn(String email, String password) {
        if (!ready("signin")) return;
        auth.signInWithEmailAndPassword(email.trim(), password).addOnCompleteListener(t -> {
            if (t.isSuccessful()) send("signin", status(), null); else fail("signin", t);
        });
    }

    void resetPassword(String email) {
        if (!ready("reset")) return;
        auth.sendPasswordResetEmail(email.trim()).addOnCompleteListener(t -> {
            if (t.isSuccessful()) send("reset", status(), null); else fail("reset", t);
        });
    }

    void resendVerification() {
        if (!ready("verify")) return;
        FirebaseUser u = auth.getCurrentUser();
        if (u == null) { send("verify", status(), "signed-out"); return; }
        u.sendEmailVerification().addOnCompleteListener(t -> {
            if (t.isSuccessful()) send("verify", status(), null); else fail("verify", t);
        });
    }

    /** Checks again whether the email has been confirmed (after the user tapped the link). */
    void reload() {
        if (auth == null || auth.getCurrentUser() == null) { send("reload", status(), null); return; }
        auth.getCurrentUser().reload().addOnCompleteListener(t -> send("reload", status(), null));
    }

    /** Deletes the account for good (Google Play requires apps with accounts to offer this). */
    void deleteAccount() {
        if (!ready("delete")) return;
        FirebaseUser u = auth.getCurrentUser();
        if (u == null) { send("delete", status(), null); return; }
        u.delete().addOnCompleteListener(t -> {
            if (t.isSuccessful()) { auth.signOut(); send("delete", status(), null); }
            else fail("delete", t);
        });
    }

    void signOut() {
        if (auth != null) auth.signOut();
        send("signout", status(), null);
    }

    // ---------------- Google account (Credential Manager -> Firebase) ----------------
    void signInWithGoogle() {
        if (!ready("google")) return;
        int id = act.getResources().getIdentifier("default_web_client_id", "string", act.getPackageName());
        if (id == 0) { send("google", status(), "google-not-enabled"); return; }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(act.getString(id)).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager.create(act).getCredentialAsync(act, request, new CancellationSignal(),
                ContextCompat.getMainExecutor(act),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        Credential c = response.getCredential();
                        if (!(c instanceof CustomCredential) || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                            send("google", status(), "google-failed");
                            return;
                        }
                        try {
                            GoogleIdTokenCredential g = GoogleIdTokenCredential.createFrom(c.getData());
                            AuthCredential fc = GoogleAuthProvider.getCredential(g.getIdToken(), null);
                            auth.signInWithCredential(fc).addOnCompleteListener(t -> {
                                if (t.isSuccessful()) send("google", status(), null); else fail("google", t);
                            });
                        } catch (Exception e) {
                            send("google", status(), "google-failed");
                        }
                    }

                    @Override
                    public void onError(@NonNull GetCredentialException e) {
                        send("google", status(), e instanceof GetCredentialCancellationException ? "cancelled"
                                : "google-failed:" + e.getClass().getSimpleName().replace("GetCredential", "").replace("Exception", ""));
                    }
                });
    }

    // ---------------- answers to the web app ----------------
    private boolean ready(String kind) {
        if (auth != null) return true;
        send(kind, status(), "not-set-up");
        return false;
    }

    /** Short error codes; the web app turns them into a clear message in the user's language. */
    private void fail(String kind, Task<?> t) {
        Exception e = t.getException();
        String code = "failed";
        if (e instanceof FirebaseNetworkException) code = "network";
        else if (e instanceof FirebaseAuthException) {
            String c = ((FirebaseAuthException) e).getErrorCode();
            switch (c == null ? "" : c) {
                case "ERROR_EMAIL_ALREADY_IN_USE": code = "email-in-use"; break;
                case "ERROR_WEAK_PASSWORD": code = "weak-password"; break;
                case "ERROR_INVALID_EMAIL": code = "bad-email"; break;
                case "ERROR_WRONG_PASSWORD":
                case "ERROR_USER_NOT_FOUND":
                case "ERROR_INVALID_CREDENTIAL": code = "wrong-login"; break;
                case "ERROR_USER_DISABLED": code = "disabled"; break;
                case "ERROR_TOO_MANY_REQUESTS": code = "too-many"; break;
                case "ERROR_ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL": code = "other-method"; break;
                case "ERROR_OPERATION_NOT_ALLOWED": code = "method-off"; break;
                case "ERROR_REQUIRES_RECENT_LOGIN": code = "recent-login"; break;
                default: code = "failed";
            }
        }
        send(kind, status(), code);
    }

    private void send(String kind, String state, String error) {
        String js = "window.RichAuth && window.RichAuth.onNative(" + JSONObject.quote(kind) + "," + state + ","
                + (error == null ? "null" : JSONObject.quote(error)) + ")";
        act.runOnUiThread(() -> web.evaluateJavascript(js, null));
    }
}
