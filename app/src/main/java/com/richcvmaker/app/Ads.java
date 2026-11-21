package com.richcvmaker.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import org.json.JSONObject;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * AdMob ads for Rich CV Maker.
 *  - a banner fixed at the bottom of the screen, below the app (never covers buttons)
 *  - a full-screen ad the web app asks for after downloads and on "Go To Design Section" (js/ads.js decides how often)
 *  - a 300 x 250 rectangle on Home, on PDF Tools and under every Edit page, laid exactly over the box the page reserves for it
 * The App ID is in AndroidManifest.xml. Google's consent form (Europe / UK) is shown first when needed.
 */
final class Ads {

    // ---- your AdMob ad units ----
    static final String BANNER_ID = "ca-app-pub-7598887393134465/2779053958";          // Bottom banner
    static final String INTERSTITIAL_ID = "ca-app-pub-7598887393134465/4054421268";    // After download (full-screen)
    static final String MREC_ID = "ca-app-pub-7598887393134465/2703032334";            // Home + PDF Tools rectangle (300 x 250)
    static final String REWARDED_ID = "ca-app-pub-7598887393134465/1605411382";        // (v4.67) "Watch an ad" to unlock one Pro template / colour for one CV

    // Google's official test ads: switched on from Settings > Ads check, to see that ads work before AdMob approves the app
    private static final String TEST_BANNER = "ca-app-pub-3940256099942544/9214589741";
    private static final String TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712";
    private static final String TEST_MREC = "ca-app-pub-3940256099942544/6300978111";
    private static final String TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917";
    static final String PREFS = "rich_ads";

    private final boolean test;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String stConsent = "checking", stBanner = "waiting", stMrec = "waiting", stInter = "waiting", stReward = "waiting";
    private long retryBanner = 30_000, retryMrec = 30_000, retryInter = 30_000, retryReward = 30_000;
    private RewardedAd rewarded;
    private boolean loadingReward;

    private final Activity act;
    private final FrameLayout box;               // the strip under the app that holds the banner
    private final FrameLayout layer;             // laid over the page; holds the Home rectangle (clips under the header)
    private final android.webkit.WebView web;
    private AdView mrec;
    private boolean mrecLoaded;
    private boolean mrecShown;
    private float mrecX, mrecDocTop;             // where the page's box is, in screen pixels (top = from the start of the page)
    private float mrecScale = 1f, mrecShift;     // page units -> pixels; extra move while the page stretches
    private final AtomicBoolean started = new AtomicBoolean(false);
    private AdView banner;
    private volatile boolean pro;                // Pro bought: no ads at all (nothing is loaded or shown)
    private InterstitialAd interstitial;
    private boolean loading;
    private boolean bannerLoaded;
    private boolean bannerWanted = false;        // (v4.95) hidden until the page asks for it (never on the loading screen)
    private boolean keyboardOpen;                // the app also hides it itself the moment the keyboard opens

    Ads(Activity act, FrameLayout box, FrameLayout layer, android.webkit.WebView web) {
        this.act = act;
        this.box = box;
        this.layer = layer;
        this.web = web;
        SharedPreferences prefs = act.getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
        this.test = prefs.getBoolean("test", false);
        this.pro = act.getSharedPreferences("rich_premium", Activity.MODE_PRIVATE).getBoolean("premium", false);
        box.setVisibility(View.GONE);
        layer.setVisibility(View.GONE);
        // (v4.95) the page scrolls: hide the rectangle at once; the page puts it back on its box when scrolling stops
        web.setOnScrollChangeListener((v, x, y, ox, oy) -> { if (y != oy) hideMrec(); });
    }

    /** Ask for consent where the law requires it, then start the ads. */
    void start() {
        ConsentInformation consent = UserMessagingPlatform.getConsentInformation(act);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        consent.requestConsentInfoUpdate(act, params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(act, formError -> {
                    stConsent = consent.canRequestAds() ? "ok" : "not given" + (formError != null ? " (" + formError.getMessage() + ")" : "");
                    if (consent.canRequestAds()) init();
                }),
                requestError -> {
                    stConsent = "check failed (" + requestError.getMessage() + ")" + (consent.canRequestAds() ? ", ads allowed" : "");
                    if (consent.canRequestAds()) init();
                });
        if (consent.canRequestAds()) { stConsent = "ok"; init(); }     // consent given in an earlier session
    }

    /** (v4.94) Europe / UK users must be able to change their ad choice later: Settings > Privacy choices. */
    boolean privacyOptionsRequired() {
        try {
            return UserMessagingPlatform.getConsentInformation(act).getPrivacyOptionsRequirementStatus()
                    == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
        } catch (Throwable t) {
            return false;
        }
    }

    void showPrivacyOptions() {
        UserMessagingPlatform.showPrivacyOptionsForm(act, formError -> {
            ConsentInformation consent = UserMessagingPlatform.getConsentInformation(act);
            stConsent = consent.canRequestAds() ? "ok" : "not given";
            if (consent.canRequestAds()) init();
        });
    }

    private void init() {
        if (pro) return;
        if (!started.compareAndSet(false, true)) return;
        new Thread(() -> MobileAds.initialize(act, status -> act.runOnUiThread(() -> {
            loadBanner();
            loadInterstitial();
            // loadMrec();   (v4.95) the big rectangle ad is no longer used
            loadRewarded();
        }))).start();
    }

    // ---------------- banner ----------------
    private void loadBanner() {
        if (act.isFinishing()) return;
        banner = new AdView(act);
        banner.setAdUnitId(test ? TEST_BANNER : BANNER_ID);
        stBanner = "loading";
        banner.setAdSize(bannerSize());
        banner.setAdListener(new AdListener() {
            @Override
            public void onAdLoaded() {
                bannerLoaded = true;
                stBanner = "showing";
                retryBanner = 30_000;
                applyVisibility();
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                stBanner = describe(error);
                applyVisibility();
                // AdMob does not retry a banner that never loaded: try again a little later
                if (!bannerLoaded) {
                    handler.postDelayed(() -> { if (banner != null && !act.isFinishing()) { stBanner = "loading (retry)"; banner.loadAd(new AdRequest.Builder().build()); } }, retryBanner);
                    retryBanner = Math.min(retryBanner * 2, 300_000);
                }
            }
        });
        box.removeAllViews();
        box.addView(banner, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        banner.loadAd(new AdRequest.Builder().build());
    }

    /** Adaptive banner as wide as the screen (about 50-60 dp high on phones). */
    private AdSize bannerSize() {
        DisplayMetrics m = act.getResources().getDisplayMetrics();
        int widthDp = (int) (m.widthPixels / m.density);
        return AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(act, widthDp);
    }

    void setBannerWanted(boolean wanted) {
        bannerWanted = wanted;
        applyVisibility();
    }

    void setKeyboardOpen(boolean open) {
        if (keyboardOpen == open) return;
        keyboardOpen = open;
        applyVisibility();
    }

    /** Pro bought (or restored): remove every ad straight away. */
    void setPro(boolean on) {
        if (!on || pro) { pro = pro || on; return; }
        pro = true;
        act.runOnUiThread(() -> {
            if (banner != null) { banner.destroy(); banner = null; }
            if (mrec != null) { mrec.destroy(); mrec = null; }
            mrecLoaded = false; bannerLoaded = false; interstitial = null; rewarded = null;
            box.removeAllViews(); layer.removeAllViews();
            box.setVisibility(View.GONE); layer.setVisibility(View.GONE);
        });
    }

    private void applyVisibility() {
        int v = !pro && bannerLoaded && bannerWanted && !keyboardOpen ? View.VISIBLE : View.GONE;
        if (box.getVisibility() != v) box.setVisibility(v);
    }

    // ---------------- Home rectangle (300 x 250) ----------------
    private void loadMrec() {
        if (act.isFinishing()) return;
        mrec = new AdView(act);
        mrec.setAdUnitId(test ? TEST_MREC : MREC_ID);
        stMrec = "loading";
        mrec.setAdSize(AdSize.MEDIUM_RECTANGLE);
        mrec.setVisibility(View.INVISIBLE);
        mrec.setAdListener(new AdListener() {
            @Override
            public void onAdLoaded() {
                mrecLoaded = true;
                stMrec = "ready (shows on PDF Tools and under the Edit pages)";
                retryMrec = 30_000;
                tellPage("loaded");          // the page then makes room for it and says where the box is
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                stMrec = describe(error);
                if (!mrecLoaded) {
                    tellPage("failed");
                    handler.postDelayed(() -> { if (mrec != null && !act.isFinishing()) { stMrec = "loading (retry)"; mrec.loadAd(new AdRequest.Builder().build()); } }, retryMrec);
                    retryMrec = Math.min(retryMrec * 2, 300_000);
                }
            }
        });
        layer.removeAllViews();
        layer.addView(mrec, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START));
        mrec.loadAd(new AdRequest.Builder().build());
    }

    private void tellPage(String state) {
        web.evaluateJavascript("window.RichAdsMrec && window.RichAdsMrec('" + state + "')", null);
    }

    /**
     * Called by the page: where the reserved box is, in page units of the visible screen.
     * x, y, w, h: the box; headerBottom: the bottom of the app header; viewportWidth: the page width.
     */
    void placeMrec(boolean show, float x, float y, float w, float h, float headerBottom, float viewportWidth) {
        if (pro || mrec == null || !mrecLoaded || !show || viewportWidth <= 0 || web.getWidth() <= 0) {
            mrecShown = false;
            mrecShift = 0;
            layer.setVisibility(View.GONE);
            if (mrec != null) mrec.setVisibility(View.INVISIBLE);
            return;
        }
        float scale = web.getWidth() / viewportWidth;     // page units -> screen pixels
        mrecScale = scale;
        int clipTop = Math.round(headerBottom * scale);
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) layer.getLayoutParams();
        if (lp.topMargin != clipTop) {
            lp.topMargin = clipTop;
            layer.setLayoutParams(lp);
        }
        int adW = mrec.getWidth() > 0 ? mrec.getWidth() : Math.round(300 * act.getResources().getDisplayMetrics().density);
        mrecX = x * scale + (w * scale - adW) / 2f;        // centred on the box
        mrecDocTop = y * scale + web.getScrollY();         // (v4.95) y is the box's top on the screen right now
        mrecShown = true;
        layer.setVisibility(View.VISIBLE);
        mrec.setVisibility(View.VISIBLE);
        moveMrec();
    }

    private void hideMrec() {
        if (!mrecShown || mrec == null) return;
        mrecShown = false;
        mrec.setVisibility(View.INVISIBLE);
        layer.setVisibility(View.GONE);
    }

    private void moveMrec() {
        if (!mrecShown || mrec == null) return;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) layer.getLayoutParams();
        mrec.setTranslationX(mrecX);
        mrec.setTranslationY(mrecDocTop - web.getScrollY() - lp.topMargin + mrecShift);
    }

    /** The page is stretching at its top or bottom: move the ad with it (dy in page units, 0 = back in place). */
    void shiftMrec(float dy) {
        mrecShift = dy * mrecScale;
        moveMrec();
    }

    // ---------------- full-screen ad ----------------
    private void loadInterstitial() {
        if (loading || interstitial != null || !started.get() || act.isFinishing()) return;
        loading = true;
        stInter = "loading";
        InterstitialAd.load(act, test ? TEST_INTERSTITIAL : INTERSTITIAL_ID, new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull InterstitialAd ad) {
                loading = false;
                interstitial = ad;
                stInter = "ready (shows after downloads, Go To Design and leaving Edit page 3)";
                retryInter = 30_000;
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                loading = false;
                interstitial = null;
                stInter = describe(error);
                handler.postDelayed(Ads.this::loadInterstitial, retryInter);
                retryInter = Math.min(retryInter * 2, 300_000);
            }
        });
    }

    /** Shows the full-screen ad if one is ready (the web app already applied its "how often" rules). */
    void showInterstitial() {
        if (pro) return;
        InterstitialAd ad = interstitial;
        if (ad == null) {
            loadInterstitial();
            return;
        }
        interstitial = null;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                loadInterstitial();
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                loadInterstitial();
            }
        });
        ad.show(act);
    }

    // ---------------- (v4.67) rewarded ad: the user chooses to watch it, then gets one unlock ----------------
    private void loadRewarded() {
        if (pro || loadingReward || rewarded != null || !started.get() || act.isFinishing()) return;
        loadingReward = true;
        stReward = "loading";
        RewardedAd.load(act, test ? TEST_REWARDED : REWARDED_ID, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull RewardedAd ad) {
                loadingReward = false;
                rewarded = ad;
                stReward = "ready (Watch an ad to unlock)";
                retryReward = 30_000;
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                loadingReward = false;
                rewarded = null;
                stReward = describe(error);
                handler.postDelayed(Ads.this::loadRewarded, retryReward);
                retryReward = Math.min(retryReward * 2, 300_000);
            }
        });
    }

    /** Shows the rewarded ad; the page hears "earned", "closed" (left before the end), "notready" or "failed". */
    void showRewarded(final String id) {
        if (pro) { tellReward(id, "failed"); return; }
        RewardedAd ad = rewarded;
        if (ad == null) {
            tellReward(id, "notready");
            loadRewarded();
            return;
        }
        rewarded = null;
        final boolean[] earned = { false };
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                tellReward(id, earned[0] ? "earned" : "closed");
                loadRewarded();
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                tellReward(id, "failed");
                loadRewarded();
            }
        });
        ad.show(act, item -> earned[0] = true);
    }

    private void tellReward(String id, String result) {
        final String js = "window.RichPremium && window.RichPremium.onRewarded(" + JSONObject.quote(id) + "," + JSONObject.quote(result) + ")";
        act.runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    // ---------------- Settings > Ads check ----------------
    private static String describe(LoadAdError e) {
        String why;
        switch (e.getCode()) {
            case 0: why = "internal error at Google"; break;
            case 1: why = "invalid request (check the ad unit ID)"; break;
            case 2: why = "no internet connection"; break;
            case 3: why = "no ad available yet (normal for new apps until AdMob approves them)"; break;
            case 8: why = "App ID missing or wrong"; break;
            case 9: why = "no ad available yet"; break;
            default: why = e.getMessage();
        }
        return "not loaded: code " + e.getCode() + ", " + why;
    }

    /** What the app knows about its ads, for Settings > Ads check. */
    String status() {
        try {
            JSONObject o = new JSONObject();
            o.put("test", test);
            o.put("sdk", MobileAds.getVersion().toString());
            o.put("consent", stConsent);
            o.put("banner", stBanner);
            o.put("rectangle", stMrec);
            o.put("fullscreen", stInter);
            o.put("rewarded", stReward);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /** Switch Google's test ads on or off; the screen restarts so the new ads load. */
    static void setTest(Activity act, boolean on) {
        act.getSharedPreferences(PREFS, Activity.MODE_PRIVATE).edit().putBoolean("test", on).apply();
    }

    // ---------------- lifecycle ----------------
    void pause() {
        if (banner != null) banner.pause();
        if (mrec != null) mrec.pause();
    }

    void resume() {
        if (banner != null) banner.resume();
        if (mrec != null) mrec.resume();
    }

    void destroy() {
        handler.removeCallbacksAndMessages(null);
        if (banner != null) banner.destroy();
        if (mrec != null) mrec.destroy();
    }
}
