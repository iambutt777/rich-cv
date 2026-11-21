package com.richcvmaker.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.webkit.WebView;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.segmentation.Segmentation;
import com.google.mlkit.vision.segmentation.SegmentationMask;
import com.google.mlkit.vision.segmentation.Segmenter;
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

/**
 * (v4.66) Photo background cleaner: finds the person in the CV photo with Google ML Kit
 * Selfie Segmentation. The model is packed inside the app, so it works offline and the photo
 * never leaves the phone. The answer is a mask picture (white = person, see-through = background);
 * the web app (js/photobg.js) paints the new background colour behind the person.
 * Answers go to window.RichPhotoBg.onNative(id, maskDataUrl, error).
 */
final class PhotoBg {

    private final Activity act;
    private final WebView web;
    private Segmenter segmenter;

    PhotoBg(Activity act, WebView web) {
        this.act = act;
        this.web = web;
    }

    private Segmenter client() {
        if (segmenter == null) {
            SelfieSegmenterOptions opts = new SelfieSegmenterOptions.Builder()
                    .setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE)
                    .enableRawSizeMask()
                    .build();
            segmenter = Segmentation.getClient(opts);
        }
        return segmenter;
    }

    /** dataUrl: the cropped CV photo (JPEG or PNG data URL). */
    void segment(final String id, final String dataUrl) {
        new Thread(() -> {
            try {
                String b64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bmp == null) { send(id, null, "The photo could not be read."); return; }
                final Bitmap src = bmp.copy(Bitmap.Config.ARGB_8888, false);
                act.runOnUiThread(() -> client().process(InputImage.fromBitmap(src, 0))
                        .addOnSuccessListener(mask -> new Thread(() -> {
                            try { send(id, toPng(mask), null); }
                            catch (Throwable t) { send(id, null, "The background could not be found."); }
                        }).start())
                        .addOnFailureListener(e -> send(id, null, "The background could not be found.")));
            } catch (Throwable t) {
                send(id, null, "The background could not be found.");
            }
        }).start();
    }

    /** The mask as a PNG: white where the person is, see-through elsewhere (soft edges kept). */
    private static String toPng(SegmentationMask mask) {
        int w = mask.getWidth(), h = mask.getHeight();
        ByteBuffer buf = mask.getBuffer();
        buf.rewind();
        int[] px = new int[w * h];
        for (int i = 0; i < px.length; i++) {
            float c = buf.getFloat();
            int a = Math.max(0, Math.min(255, Math.round(c * 255f)));
            px[i] = (a << 24) | 0x00FFFFFF;
        }
        Bitmap out = Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888);
        ByteArrayOutputStream os = new ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.PNG, 100, os);
        return "data:image/png;base64," + Base64.encodeToString(os.toByteArray(), Base64.NO_WRAP);
    }

    private void send(String id, String mask, String error) {
        final String js = "window.RichPhotoBg && window.RichPhotoBg.onNative(" + JSONObject.quote(id) + ","
                + (mask == null ? "null" : JSONObject.quote(mask)) + ","
                + (error == null ? "null" : JSONObject.quote(error)) + ")";
        act.runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    void destroy() {
        if (segmenter != null) { segmenter.close(); segmenter = null; }
    }
}
