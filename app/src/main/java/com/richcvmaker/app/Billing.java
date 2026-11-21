package com.richcvmaker.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

/**
 * "Unlock Premium": a one-time purchase through Google Play (Play Billing Library 8).
 * Create a one-time product with the ID below in Play Console > Monetize > Products > One-time products.
 * The purchase belongs to the user's Google account, so it is restored after reinstalling.
 * Answers go to the web app in window.RichPremium.onNative(state).
 */
final class Billing implements PurchasesUpdatedListener {

    static final String PRODUCT_ID = "premium_unlock";

    private final Activity act;
    private final WebView web;
    private final SharedPreferences prefs;
    private final BillingClient client;
    private ProductDetails details;
    private boolean ready;
    private String lastError = "";

    Billing(Activity act, WebView web) {
        this.act = act;
        this.web = web;
        this.prefs = act.getSharedPreferences("rich_premium", Activity.MODE_PRIVATE);
        this.client = BillingClient.newBuilder(act)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
    }

    void start() {
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    ready = true;
                    loadProduct();
                    refresh();
                } else {
                    lastError = "Google Play billing is not available (" + result.getResponseCode() + ")";
                    send(null);
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                ready = false;                       // reconnects by itself (enableAutoServiceReconnection)
            }
        });
    }

    private void loadProduct() {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(PRODUCT_ID)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()))
                .build();
        client.queryProductDetailsAsync(params, (result, res) -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && res != null
                    && !res.getProductDetailsList().isEmpty()) {
                details = res.getProductDetailsList().get(0);
                lastError = "";
            } else {
                lastError = "Premium is not set up in Play Console yet (product \"" + PRODUCT_ID + "\")";
            }
            send(null);
        });
    }

    /** (v4.96m) "Try again" on the Pro page: reconnect to Google Play and reload the product and its price. */
    void retry() {
        if (!ready) start();
        else if (details == null) loadProduct();
        else { refresh(); send(null); }
    }

    /** Re-checks what the user owns (also undoes Premium after a refund). */
    void refresh() { query(false); }

    /** (v4.95) "Restore purchase": always answers, so the user is never left waiting. */
    void restore() {
        if (!ready) { send("restore:offline"); return; }
        query(true);
    }

    private void query(boolean tell) {
        if (!ready) return;
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                (result, purchases) -> {
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        if (tell) send("restore:offline");
                        return;
                    }
                    boolean owned = false;
                    for (Purchase p : purchases) owned |= handle(p);
                    prefs.edit().putBoolean("premium", owned).apply();
                    send(tell && !owned ? "restore:none" : null);
                });
    }

    void buy() {
        if (!ready || details == null) {
            send(lastError.isEmpty() ? "Premium is not available right now. Check your internet and try again." : lastError);
            if (ready && details == null) loadProduct();
            return;
        }
        BillingFlowParams.ProductDetailsParams.Builder pd = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details);
        List<ProductDetails.OneTimePurchaseOfferDetails> offers = details.getOneTimePurchaseOfferDetailsList();
        if (offers != null && !offers.isEmpty() && offers.get(0).getOfferToken() != null) pd.setOfferToken(offers.get(0).getOfferToken());
        BillingFlowParams flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(pd.build()))
                .build();
        act.runOnUiThread(() -> {
            BillingResult r = client.launchBillingFlow(act, flow);
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) send("Could not open Google Play (" + r.getResponseCode() + ")");
        });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, @Nullable List<Purchase> purchases) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            boolean owned = false;
            for (Purchase p : purchases) owned |= handle(p);
            if (owned) prefs.edit().putBoolean("premium", true).apply();
            send(null);
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            refresh();
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            send("cancelled");
        } else {
            send("The purchase did not go through (" + code + ")");
        }
    }

    /** Grants Premium for a completed purchase and acknowledges it (otherwise Google refunds it after 3 days). */
    private boolean handle(Purchase p) {
        if (!p.getProducts().contains(PRODUCT_ID)) return false;
        if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            prefs.edit().putBoolean("pending", true).apply();
            return false;
        }
        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) return false;
        prefs.edit().putBoolean("pending", false).apply();
        if (!p.isAcknowledged()) {
            client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), r -> { });
        }
        return true;
    }

    String status() {
        try {
            JSONObject o = new JSONObject();
            o.put("available", true);
            o.put("premium", prefs.getBoolean("premium", false));
            o.put("pending", prefs.getBoolean("pending", false));
            o.put("ready", ready && details != null);
            String price = "";
            if (details != null) {
                List<ProductDetails.OneTimePurchaseOfferDetails> offers = details.getOneTimePurchaseOfferDetailsList();
                if (offers != null && !offers.isEmpty()) price = offers.get(0).getFormattedPrice();
            }
            o.put("price", price);
            o.put("error", lastError);
            return o.toString();
        } catch (Exception e) {
            return "{\"available\":true}";
        }
    }

    private void send(@Nullable String message) {
        String js = "window.RichPremium && window.RichPremium.onNative(" + status() + "," + (message == null ? "null" : JSONObject.quote(message)) + ")";
        act.runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    void destroy() {
        try { client.endConnection(); } catch (Exception ignored) { }
    }
}
