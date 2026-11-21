package com.richcvmaker.app;

import android.content.Context;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.webkit.WebView;
import android.widget.FrameLayout;

/**
 * Holds an ad (the rectangle over the page, or the banner under it).
 * A tap goes to the ad as usual. A finger that starts on the ad and then moves up or down is handed
 * to the page instead, so the page scrolls (and stretches at its ends) as if the finger were on the page.
 */
final class DragPassLayout extends FrameLayout {
    private final WebView web;
    private final int slop;
    private final float headerX, headerY;     // where a drag from below the page enters it (the header row)
    private float downX, downY;
    private boolean tracking, passing;
    private float offX, offY;                 // from this layout to the page
    private final int[] me = new int[2], page = new int[2];

    DragPassLayout(Context c, WebView web) {
        super(c);
        this.web = web;
        slop = ViewConfiguration.get(c).getScaledTouchSlop();
        float d = c.getResources().getDisplayMetrics().density;
        headerX = 4 * d;
        headerY = 6 * d;
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        int action = e.getActionMasked();
        if (passing) {
            send(e);
            if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) passing = false;
            return true;
        }
        if (action == MotionEvent.ACTION_DOWN) {
            downX = e.getX();
            downY = e.getY();
        } else if (tracking && action == MotionEvent.ACTION_MOVE && e.getPointerCount() == 1) {
            float dx = e.getX() - downX, dy = e.getY() - downY;
            if (Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx) * 1.2f) {
                // the finger is scrolling: the ad gets a cancel (no click), the page gets the touch
                MotionEvent cancel = MotionEvent.obtain(e);
                cancel.setAction(MotionEvent.ACTION_CANCEL);
                super.dispatchTouchEvent(cancel);
                cancel.recycle();
                tracking = false;
                passing = true;
                startPassing(e);
                return true;
            }
        }
        boolean handled = super.dispatchTouchEvent(e);
        if (action == MotionEvent.ACTION_DOWN) tracking = handled;      // only touches the ad took (others reach the page anyway)
        else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) tracking = false;
        return handled;
    }

    private void startPassing(MotionEvent e) {
        getLocationOnScreen(me);
        web.getLocationOnScreen(page);
        offX = me[0] - page[0];
        offY = me[1] - page[1];
        float x = downX + offX, y = downY + offY;
        if (y < 0 || y >= web.getHeight() || x < 0 || x >= web.getWidth()) {
            // started outside the page (the banner under it): enter the page at the header row
            offX = headerX - downX;
            offY = headerY - downY;
        }
        MotionEvent down = MotionEvent.obtain(e);
        down.setAction(MotionEvent.ACTION_DOWN);
        down.setLocation(downX + offX, downY + offY);
        web.dispatchTouchEvent(down);
        down.recycle();
        send(e);
    }

    private void send(MotionEvent e) {
        MotionEvent m = MotionEvent.obtain(e);
        m.offsetLocation(offX, offY);
        web.dispatchTouchEvent(m);
        m.recycle();
    }
}
