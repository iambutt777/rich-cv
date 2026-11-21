package com.richcvmaker.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.os.Parcelable;
import android.content.pm.ResolveInfo;
import android.content.pm.PackageManager;
import android.content.pm.LabeledIntent;
import android.content.ComponentName;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Insets;
import android.view.HapticFeedbackConstants;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.window.OnBackInvokedDispatcher;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Hosts the Rich CV Maker web app (app/src/main/assets/www) in a WebView.
 * Candidate records stay inside the app's own storage on the phone.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/www/index.html";
    private static final int FILE_REQUEST = 1001;
    private static final int SAVE_REQUEST = 1002;

    private WebView web;
    private Ads ads;
    private Cloud cloud;
    private Account account;
    private Billing billing;
    private PhotoBg photoBg;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingSave;          // file waiting for the "Save as" screen
    private String pendingName;
    // the first moment: the logo on the loading-screen colour, exactly where the page's loading screen
    // shows it, until the page has drawn its own (no plain blue screen while the WebView starts)
    private View splashCover;
    private FrameLayout shellView;
    private LinearLayout rootView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xFF070F2E);   // same as the loading screen, no white flash at start
        // Android's own stretch at the ends is off (it stretches the header too); the page draws its own
        // stretch that leaves the header still (js/stretch.js)
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);

        // the app on top, the AdMob banner strip fixed underneath it
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF070F2E);
        // the page, with a layer on top for the Home rectangle ad (touches elsewhere go to the page)
        FrameLayout pageFrame = new FrameLayout(this);
        pageFrame.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        // a drag that starts on an ad still scrolls the page; a tap opens the ad
        FrameLayout adLayer = new DragPassLayout(this, web);
        adLayer.setClipChildren(true);
        pageFrame.addView(adLayer, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(pageFrame, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        FrameLayout cover = new FrameLayout(this);
        cover.setBackgroundColor(0xFF070F2E);
        cover.setClickable(true);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash_logo);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int logoPx = Math.round(95 * getResources().getDisplayMetrics().density);   // same size as the page's loading logo
        cover.addView(logo, new FrameLayout.LayoutParams(logoPx, logoPx, Gravity.CENTER));
        pageFrame.addView(cover, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        splashCover = cover;
        rootView = root;
        cover.postDelayed(this::hideSplashCover, 6000);       // never stay longer than this
        FrameLayout adBox = new DragPassLayout(this, web);
        adBox.setBackgroundColor(0xFFF8FAFD);
        root.addView(adBox, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        // Android 15+ draws apps edge to edge: a navy strip behind the status bar, and room for the
        // navigation bar and the keyboard, so the header and the banner are never hidden under them
        FrameLayout shell = new FrameLayout(this);
        shell.setBackgroundColor(0xFF070F2E);                 // loading-screen colour; the header colour once the page shows
        shellView = shell;
        shell.addView(root, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(shell);
        ads = new Ads(this, adBox, adLayer, web);
        cloud = new Cloud(this, web);
        account = new Account(this, web);
        billing = new Billing(this, web);
        photoBg = new PhotoBg(this, web);
        if (Build.VERSION.SDK_INT >= 35) {
            shell.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                shell.setPadding(bars.left, bars.top, bars.right, 0);
                // (v4.97) a window (dialog) with a text box is open: the keyboard slides over the page instead of
                // squeezing it, so the page behind the window keeps its layout; the window itself moves up (--kb-h)
                root.setPadding(0, 0, 0, kbOverlay ? bars.bottom : Math.max(bars.bottom, ime.bottom));
                float kbCss = Math.max(0, ime.bottom - bars.bottom) / getResources().getDisplayMetrics().density;
                if (web != null) web.evaluateJavascript("document.documentElement.style.setProperty('--kb-h','" + kbCss + "px')", null);
                // (v4.98) tell the page only when the keyboard really opens or closes (not on every insets pass)
                final boolean imeNow = insets.isVisible(WindowInsets.Type.ime());
                if (web != null && imeNow != lastImeVisible) {
                    lastImeVisible = imeNow;
                    web.evaluateJavascript("window.RichKbVisible && window.RichKbVisible(" + imeNow + ")", null);
                }
                ads.setKeyboardOpen(imeNow);
                return WindowInsets.CONSUMED;
            });
        }

        // hide the bottom banner the moment the keyboard opens, so it never jumps up over the form
        if (Build.VERSION.SDK_INT < 35) root.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            android.graphics.Rect r = new android.graphics.Rect();
            root.getWindowVisibleDisplayFrame(r);
            int screen = root.getRootView().getHeight();
            ads.setKeyboardOpen(screen > 0 && (screen - r.bottom) > screen * 0.15f);
        });

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // localStorage / IndexedDB
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);              // no pinch or double-tap zoom on any page
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        web.setWebViewClient(new WebViewClient() {
            // (v4.97) Android may stop the page's engine while the app is in the background to free memory.
            // Without this the whole app would close; now the page simply starts again and the app returns to the open CV.
            @android.annotation.TargetApi(26)
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                runOnUiThread(() -> recreate());
                return true;
            }
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));   // open other links in the browser
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        // Photo, logo and backup uploads (<input type="file">)
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                if (isImagePick(params)) {                  // a picture: gallery apps and file explorers in one sheet
                    askPictureSource(params);
                    return true;
                }
                try {
                    startActivityForResult(buildPickerIntent(params), FILE_REQUEST);
                } catch (ActivityNotFoundException e) {
                    try {                                   // no gallery / photo picker: the plain file chooser
                        startActivityForResult(params.createIntent(), FILE_REQUEST);
                    } catch (ActivityNotFoundException e2) {
                        fileCallback = null;
                        return false;
                    }
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        // Android 13+: the back gesture/button comes here (see enableOnBackInvokedCallback in the manifest)
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        // (v4.97) a fresh start every time: the page itself comes back to the open CV (see richResume in app.js)
        web.loadUrl(START_URL);

        ads.start();
        billing.start();
    }

    @Override
    protected void onPause() {
        // (v4.95) save the open CV before the app goes to the background (it may be closed from there)
        if (web != null) web.evaluateJavascript("window.RichAppPaused && window.RichAppPaused()", null);
        if (ads != null) ads.pause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (ads != null) ads.resume();
        if (billing != null) billing.refresh();          // e.g. a purchase finished outside the app
    }

    /**
     * Android only understands MIME types ("image/*"), not extensions (".json").
     * Keep the valid types; if any extension was given, allow every file so backups can be picked.
     */
    private Intent buildPickerIntent(WebChromeClient.FileChooserParams params) {
        List<String> types = new ArrayList<>();
        boolean hasExtension = false;
        String[] accept = params.getAcceptTypes();
        if (accept != null) {
            for (String a : accept) {
                if (a == null) continue;
                for (String t : a.split(",")) {
                    t = t.trim();
                    if (t.isEmpty()) continue;
                    if (t.contains("/")) types.add(t); else hasExtension = true;
                }
            }
        }
        boolean multiple = params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;

        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        if (multiple) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        if (hasExtension || types.isEmpty()) {
            intent.setType("*/*");
        } else if (types.size() == 1) {
            intent.setType(types.get(0));
        } else {
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
        }
        return Intent.createChooser(intent, "Choose file");
    }

    /** True when the page asks only for pictures (profile photo, Image to PDF). */
    private boolean isImagePick(WebChromeClient.FileChooserParams params) {
        String[] accept = params.getAcceptTypes();
        boolean any = false;
        if (accept == null) return false;
        for (String a : accept) {
            if (a == null) continue;
            for (String t : a.split(",")) {
                t = t.trim();
                if (t.isEmpty()) continue;
                if (!t.startsWith("image/")) return false;
                any = true;
            }
        }
        return any;
    }

    /** Files: the phone's file browser (Downloads, Drive, SD card ...), pictures only. */
    private Intent filesIntent(boolean multiple) {
        Intent files = new Intent(Intent.ACTION_GET_CONTENT);
        files.addCategory(Intent.CATEGORY_OPENABLE);
        files.setType("image/*");
        if (multiple) files.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        return files;
    }

    private void cancelPick() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
    }

    private void launchPick(Intent first, Intent fallback) {
        try {
            startActivityForResult(first, FILE_REQUEST);
        } catch (ActivityNotFoundException e) {
            try { startActivityForResult(fallback, FILE_REQUEST); } catch (ActivityNotFoundException e2) { cancelPick(); }
        }
    }

    /**
     * Android's own "choose an app" sheet for pictures: gallery apps (Gallery, Photos ...) and file
     * explorers (My Files, Files, Drive ...) together, so the user picks either. Title in the app's language.
     */
    private void askPictureSource(WebChromeClient.FileChooserParams params) {
        final boolean multiple = params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;
        String js = "(function(){var t=(window.RichI18n&&RichI18n.t)||function(s){return s};return t('Choose a picture');})()";
        web.evaluateJavascript(js, value -> {
            String title = "Choose a picture";
            try { String v = new JSONArray("[" + value + "]").getString(0); if (!v.isEmpty() && !"null".equals(v)) title = v; } catch (Exception ignored) { }
            launchPick(imageChooser(multiple, title), params.createIntent());
        });
    }

    private Intent imageChooser(boolean multiple, String title) {
        Intent files = filesIntent(multiple);                       // file explorers, and most gallery apps too
        PackageManager pm = getPackageManager();
        Set<String> listed = new HashSet<>();
        try {
            for (ResolveInfo r : pm.queryIntentActivities(files, 0)) listed.add(r.activityInfo.packageName);
        } catch (Exception ignored) { }
        // gallery apps that only answer "pick a photo" are added to the same sheet
        Intent pick = new Intent(Intent.ACTION_PICK);
        pick.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
        if (multiple) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        List<Parcelable> extra = new ArrayList<>();
        // (v4.97) the phone's own photo picker (Android 13 and newer) first: "Photos / Gallery" with every picture on the phone
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                Intent photos = new Intent(MediaStore.ACTION_PICK_IMAGES);
                if (multiple) photos.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(20, MediaStore.getPickImagesMaxLimit()));
                ResolveInfo pr = pm.resolveActivity(photos, 0);
                if (pr != null && pr.activityInfo != null) {
                    photos.setComponent(new ComponentName(pr.activityInfo.packageName, pr.activityInfo.name));
                    extra.add(new LabeledIntent(photos, pr.activityInfo.packageName, "Gallery", pr.getIconResource()));
                }
            } catch (Exception ignored) { }
        }
        try {
            for (ResolveInfo r : pm.queryIntentActivities(pick, 0)) {
                String pkg = r.activityInfo.packageName;
                if (!listed.add(pkg)) continue;
                Intent one = new Intent(pick);
                one.setComponent(new ComponentName(pkg, r.activityInfo.name));
                extra.add(new LabeledIntent(one, pkg, r.loadLabel(pm), r.getIconResource()));
            }
        } catch (Exception ignored) { }
        Intent chooser = Intent.createChooser(files, title);
        if (!extra.isEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toArray(new Parcelable[0]));
        return chooser;
    }

    /** Tells the web page how a save ended: "ok:<where>|<uri>", "cancel" or "error:<reason>". */
    private void notifySaved(String msg) {
        runOnUiThread(() -> web.evaluateJavascript(
                "window.RichAndroidSaved && window.RichAndroidSaved(" + JSONObject.quote(msg) + ")", null));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == Cloud.REQ_AUTH) {              // the Google account screen closed
            cloud.onAuthResult(resultCode, data);
            return;
        }
        if (requestCode == SAVE_REQUEST) {
            byte[] bytes = pendingSave;
            String name = pendingName;
            pendingSave = null;
            pendingName = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) {
                notifySaved("cancel");
                return;
            }
            Uri uri = data.getData();
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IOException("cannot write to that folder");
                out.write(bytes);
                notifySaved("ok:the folder you chose (" + name + ")|" + uri);
            } catch (Exception e) {
                notifySaved("error:" + e.getMessage());
            }
            return;
        }
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            // one file, or several when the page allows choosing more than one
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();                      // Android 12 and older
    }

    /**
     * Back: the page closes an open window or goes to the previous screen.
     * The app only closes when the page says it is on the Home screen ("0").
     */
    private void handleBack() {
        web.evaluateJavascript(
                "(function(){try{return (window.RichAndroidBack && window.RichAndroidBack()) ? 1 : 0;}catch(e){return 1;}})()",
                value -> {
                    if ("0".equals(value)) finish();
                    else if (value == null || "null".equals(value)) {
                        if (web.canGoBack()) web.goBack(); else finish();
                    }
                });
    }

    @Override
    protected void onDestroy() {
        if (ads != null) ads.destroy();
        if (billing != null) billing.destroy();
        if (photoBg != null) photoBg.destroy();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** Functions the web app calls as window.AndroidBridge.* */
    /** The page's own loading screen is on the screen: fade the first logo cover away. */
    private void hideSplashCover() {
        final View c = splashCover;
        if (c == null) return;
        splashCover = null;
        applyBars();
        if (rootView != null) rootView.setBackgroundColor(0xFFF8FAFD);
        c.animate().alpha(0f).setDuration(180).withEndAction(() -> {
            if (c.getParent() instanceof FrameLayout) ((FrameLayout) c.getParent()).removeView(c);
        }).start();
    }

    // (v4.97) colour of the strip behind the phone's status bar, and dark or light status icons (the page decides: light header = white strip)
    private int barColor = 0xFF0A1A47;
    private boolean barDark = true;
    private volatile boolean kbOverlay = false;
    private boolean lastImeVisible = false;
    private void applyBars() {
        if (shellView != null) shellView.setBackgroundColor(barColor);
        try {
            if (Build.VERSION.SDK_INT < 35) getWindow().setStatusBarColor(barColor);
            if (Build.VERSION.SDK_INT >= 30) {
                android.view.WindowInsetsController w = getWindow().getInsetsController();
                if (w != null) w.setSystemBarsAppearance(barDark ? 0 : android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                        android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
            } else if (Build.VERSION.SDK_INT >= 23) {
                View d = getWindow().getDecorView();
                int f = d.getSystemUiVisibility();
                d.setSystemUiVisibility(barDark ? (f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR));
            }
        } catch (Exception ignored) { }
    }

    private class Bridge {

        /** (v4.97) true while a text box inside a window (dialog) has the focus: the keyboard must not resize the page. */
        @JavascriptInterface
        public void setKbOverlay(boolean on) {
            runOnUiThread(() -> {
                if (kbOverlay == on) return;
                kbOverlay = on;
                if (Build.VERSION.SDK_INT >= 35) { if (shellView != null) shellView.requestApplyInsets(); }
                else {
                    getWindow().setSoftInputMode(on ? android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN
                                                    : android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
                    // changing the mode can swallow the keyboard that was about to open: ask for it again
                    if (on && web != null) web.postDelayed(() -> {
                        android.view.inputmethod.InputMethodManager imm = (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                        if (imm != null) imm.showSoftInput(web, 0);
                    }, 80);
                }
            });
        }

        /** (v4.97) true when Android's battery saver does not limit this app (it may then stay open in the background). */
        @JavascriptInterface
        public boolean batteryFree() {
            if (Build.VERSION.SDK_INT < 23) return true;
            try {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
                return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
            } catch (Exception e) { return false; }
        }

        /** (v4.97) Android's own battery page, where the user can set this app to "Unrestricted" / "Don't optimise".
         *  No special permission is used (Google Play allows this for every app). */
        @JavascriptInterface
        public void openBatterySettings() {
            runOnUiThread(() -> {
                Intent[] tries = {
                    new Intent("android.settings.VIEW_ADVANCED_POWER_USAGE_DETAIL").setData(Uri.parse("package:" + getPackageName())),
                    new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
                    new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:" + getPackageName()))
                };
                for (Intent it : tries) {
                    try { startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; } catch (Exception ignored) { }
                }
            });
        }

        /** (v4.97) The page's header colour: the strip behind the status bar matches it ("#RRGGBB", dark = light icons). */
        @JavascriptInterface
        public void setBars(String hex, boolean dark) {
            try { barColor = android.graphics.Color.parseColor(hex); } catch (Exception e) { return; }
            barDark = dark;
            runOnUiThread(() -> { if (splashCover == null) applyBars(); });
        }


        /** A light tick, e.g. when the colour carousel lands on a new theme. */
        @JavascriptInterface
        public void splashShown() {
            runOnUiThread(MainActivity.this::hideSplashCover);
        }

        @JavascriptInterface
        public void haptic() {
            runOnUiThread(() -> { if (web != null) web.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK); });
        }

        /** Tells the web app that real AdMob ads are available (it then hides its own ad boxes). */
        @JavascriptInterface
        public boolean hasAds() {
            return true;
        }

        /** (v4.66) The photo background cleaner can find the person on this phone (offline, ML Kit). */
        @JavascriptInterface
        public boolean hasPhotoBg() { return photoBg != null; }

        /** (v4.66) Finds the person in the CV photo; the answer goes to window.RichPhotoBg.onNative. */
        @JavascriptInterface
        public void photoBg(String id, String dataUrl) { if (photoBg != null) photoBg.segment(id, dataUrl); }

        /** (v4.67) "Watch an ad to unlock" can be offered (real ads are set up and Pro is not bought). */
        @JavascriptInterface
        public boolean hasRewarded() { return ads != null; }

        /** (v4.67) Shows the rewarded ad; the answer goes to window.RichPremium.onRewarded(id, result). */
        @JavascriptInterface
        public void showRewarded(String id) { runOnUiThread(() -> { if (ads != null) ads.showRewarded(id); }); }

        /** Pro bought: no more ads (js/premium.js calls this). */
        /** (v4.94) Settings > Privacy choices: shown only where the law asks for it (Europe / UK). */
        @JavascriptInterface
        public boolean privacyOptionsRequired() { return ads != null && ads.privacyOptionsRequired(); }

        @JavascriptInterface
        public void showPrivacyOptions() { runOnUiThread(() -> { if (ads != null) ads.showPrivacyOptions(); }); }

        @JavascriptInterface
        public void adsPro(boolean on) { if (ads != null) ads.setPro(on); }

        /** "Share app": the phone's share sheet with a short text and the Play Store link. */
        @JavascriptInterface
        public void shareText(String text) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, text);
                try { startActivity(Intent.createChooser(send, null)); } catch (ActivityNotFoundException ignored) { }
            });
        }

        /** "Rate us": the app's page in the Play Store app (or the website if Play is missing). */
        @JavascriptInterface
        public void rateApp() {
            runOnUiThread(() -> {
                String id = getPackageName();
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + id)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (ActivityNotFoundException e) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + id))); } catch (ActivityNotFoundException ignored) { }
                }
            });
        }

        /** "Contact us": the user's email app with the address and subject filled in. */
        @JavascriptInterface
        public void emailUs(String to, String subject, String body) {
            runOnUiThread(() -> {
                Intent mail = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"));
                mail.putExtra(Intent.EXTRA_EMAIL, new String[] { to });
                mail.putExtra(Intent.EXTRA_SUBJECT, subject);
                mail.putExtra(Intent.EXTRA_TEXT, body);
                try { startActivity(mail); } catch (ActivityNotFoundException ignored) { }
            });
        }

        /** Full-screen ad, asked for by js/ads.js after downloads. */
        @JavascriptInterface
        public void showInterstitial(String reason) {
            runOnUiThread(() -> ads.showInterstitial());
        }

        // ---------- Google account + Drive backup (answers arrive in window.RichCloud.onNative) ----------
        @JavascriptInterface
        public String cloudStatus() { return cloud.status(); }

        @JavascriptInterface
        public void cloudSignIn() { runOnUiThread(() -> cloud.signIn()); }

        @JavascriptInterface
        public void cloudSignOut() { runOnUiThread(() -> cloud.signOut()); }

        /** Saves the backup JSON to the user's Google Drive (interactive = may show the Google screen). */
        @JavascriptInterface
        public void cloudUpload(String json, boolean interactive) { runOnUiThread(() -> cloud.upload(json, interactive)); }

        @JavascriptInterface
        public void cloudDownload(boolean interactive) { runOnUiThread(() -> cloud.download(interactive)); }

        // ---------- Account: email or Google login with Firebase (answers in window.RichAuth.onNative) ----------
        @JavascriptInterface
        public String authStatus() { return account == null ? "{\"available\":false}" : account.status(); }

        @JavascriptInterface
        public void authLanguage(String code) { runOnUiThread(() -> account.setLanguage(code)); }

        @JavascriptInterface
        public void authSignUp(String name, String email, String password) { runOnUiThread(() -> account.signUp(name, email, password)); }

        @JavascriptInterface
        public void authSignIn(String email, String password) { runOnUiThread(() -> account.signIn(email, password)); }

        @JavascriptInterface
        public void authGoogle() { runOnUiThread(() -> account.signInWithGoogle()); }

        @JavascriptInterface
        public void authReset(String email) { runOnUiThread(() -> account.resetPassword(email)); }

        @JavascriptInterface
        public void authResendVerify() { runOnUiThread(() -> account.resendVerification()); }

        @JavascriptInterface
        public void authReload() { runOnUiThread(() -> account.reload()); }

        @JavascriptInterface
        public void authSignOut() { runOnUiThread(() -> account.signOut()); }

        @JavascriptInterface
        public void authDelete() { runOnUiThread(() -> account.deleteAccount()); }

        // ---------- Premium (answers arrive in window.RichPremium.onNative) ----------
        @JavascriptInterface
        public String premiumStatus() { return billing.status(); }

        @JavascriptInterface
        public void buyPremium() { billing.buy(); }

        @JavascriptInterface
        public void restorePremium() { runOnUiThread(() -> billing.restore()); }

        /** (v4.96m) Pro page "Try again": reconnect to Google Play billing. */
        @JavascriptInterface
        public void retryBilling() { runOnUiThread(() -> billing.retry()); }

        /** (v4.97) Back on the Home screen: the page asked "Exit the app?" and the user said yes. */
        @JavascriptInterface
        public void exitApp() { runOnUiThread(MainActivity.this::finish); }

        /** Settings > Ads check: what AdMob answered for each ad (JSON). */
        @JavascriptInterface
        public String getAdStatus() {
            return ads.status();
        }

        /** Settings > Ads check: Google's test ads on/off, then restart the screen so they load. */
        @JavascriptInterface
        public void setTestAds(boolean on) {
            Ads.setTest(MainActivity.this, on);
            runOnUiThread(MainActivity.this::recreate);
        }

        /** Puts the Home rectangle ad over the box the page reserved (or hides it). */
        @JavascriptInterface
        public void placeMrec(boolean show, float x, float y, float w, float h, float headerBottom, float viewportWidth) {
            runOnUiThread(() -> ads.placeMrec(show, x, y, w, h, headerBottom, viewportWidth));
        }

        /** Moves the rectangle ad up or down with the page while the page stretches at its top or bottom. */
        @JavascriptInterface
        public void shiftMrec(float dy) {
            runOnUiThread(() -> ads.shiftMrec(dy));
        }

        /** Hides the bottom banner while typing, in Settings and on the intro slides. */
        @JavascriptInterface
        public void setBannerVisible(boolean visible) {
            runOnUiThread(() -> ads.setBannerWanted(visible));
        }

        /**
         * Saves a file to Download/Rich CV Maker.
         * Returns "ok:<where>|<uri>", or "pending" when Android's "Save as" screen was opened instead
         * (the result then arrives through window.RichAndroidSaved), or "error:<reason>".
         */
        @JavascriptInterface
        public String saveFile(String base64, String filename, String mime) {
            final byte[] bytes;
            try {
                bytes = Base64.decode(base64, Base64.DEFAULT);
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    ContentResolver resolver = getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Rich CV Maker");
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new IOException("Download folder not available");
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        if (out == null) throw new IOException("Download folder not available");
                        out.write(bytes);
                    }
                    return "ok:Download/Rich CV Maker/" + filename + "|" + uri;
                } catch (Exception e) {
                    // some phones block this folder: fall back to Android's "Save as" screen
                }
            }
            pendingSave = bytes;
            pendingName = filename;
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, filename);
                try {
                    startActivityForResult(i, SAVE_REQUEST);
                } catch (ActivityNotFoundException e) {
                    pendingSave = null;
                    notifySaved("error:no file manager found on this phone");
                }
            });
            return "pending";
        }

        /** Opens a saved file in a viewer app (for example a PDF viewer). */
        @JavascriptInterface
        public String openFile(String uriString, String mime) {
            try {
                Intent v = new Intent(Intent.ACTION_VIEW);
                v.setDataAndType(Uri.parse(uriString), mime);
                v.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> {
                    try {
                        // (v4.97) Android's own "Open with" list, so the user picks the app
                        startActivity(Intent.createChooser(v, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
                    } catch (ActivityNotFoundException e) {
                        notifySaved("noviewer");
                    }
                });
                return "ok";
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }

        /** Opens a PDF kept in the app (Downloads list) in a PDF viewer app. */
        @JavascriptInterface
        public String viewFile(String base64, String filename, String mime) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                File dir = new File(getCacheDir(), "view");
                if (!dir.exists() && !dir.mkdirs()) return "error:cannot create folder";
                File f = new File(dir, filename);
                try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                Intent v = new Intent(Intent.ACTION_VIEW);
                v.setDataAndType(uri, mime);
                v.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> {
                    try {
                        // (v4.97) Android's own "Open with" list, so the user picks the app
                        startActivity(Intent.createChooser(v, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
                    } catch (ActivityNotFoundException e) {
                        notifySaved("noviewer-open");
                    }
                });
                return "ok";
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }

        /** Opens the Android share sheet (WhatsApp, Viber, Gmail, Drive...). */
        @JavascriptInterface
        public String shareFile(String base64, String filename, String mime) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                File dir = new File(getCacheDir(), "shared");
                if (!dir.exists() && !dir.mkdirs()) return "error:cannot create folder";
                File[] old = dir.listFiles();                       // remove files shared earlier
                if (old != null) {
                    for (File o : old) {
                        //noinspection ResultOfMethodCallIgnored
                        o.delete();
                    }
                }
                File f = new File(dir, filename);
                try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_SUBJECT, filename);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, "Share PDF")));
                return "ok";
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }

        /** Sends the generated PDF to Android printing (printers or "Save as PDF"). */
        @JavascriptInterface
        public void printPdf(String base64, String jobName) {
            final byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                PrintAttributes attrs = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .build();
                pm.print(jobName, new PdfPrintAdapter(bytes, jobName), attrs);
            });
        }
    }

    /** Passes ready-made PDF bytes to the Android print system. */
    private static class PdfPrintAdapter extends PrintDocumentAdapter {
        private final byte[] bytes;
        private final String name;

        PdfPrintAdapter(byte[] bytes, String name) {
            this.bytes = bytes;
            this.name = name;
        }

        @Override
        public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes,
                             CancellationSignal cancellationSignal, LayoutResultCallback callback, Bundle extras) {
            if (cancellationSignal.isCanceled()) {
                callback.onLayoutCancelled();
                return;
            }
            PrintDocumentInfo info = new PrintDocumentInfo.Builder(name + ".pdf")
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .build();
            callback.onLayoutFinished(info, true);
        }

        @Override
        public void onWrite(PageRange[] pages, ParcelFileDescriptor destination,
                            CancellationSignal cancellationSignal, WriteResultCallback callback) {
            try (FileOutputStream out = new FileOutputStream(destination.getFileDescriptor())) {
                out.write(bytes);
                callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
            } catch (IOException e) {
                callback.onWriteFailed(e.getMessage());
            }
        }
    }
}
