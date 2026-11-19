package com.canteencorner.kiosk;

import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enforceKioskMode();
        configureWebViewSecurity();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enforceKioskMode();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        enforceKioskMode();
    }

    /**
     * Enforce Sticky Immersive Fullscreen Mode for institutional kiosk tablets.
     * System bars remain hidden and auto-hide if swiped from the edge.
     */
    private void enforceKioskMode() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
        );
    }

    /**
     * Hardens WebView security per institutional evaluation specifications:
     * - Disables persistent local caching of sensitive records/balances
     * - Disables file scheme access to protect device filesystem
     * - Configures cookie persistence for JWT session authentication
     * - Disables zoom controls for smooth touch interactions
     */
    private void configureWebViewSecurity() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();

            // Strict no-cache rule: sensitive balances/deposits are not stored on flash
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
            settings.setDatabaseEnabled(false);
            settings.setDomStorageEnabled(true);

            // Security: deny access to local device files and content providers
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);

            // Kiosk UX: smooth touch gestures, disable pinch-to-zoom controls
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            settings.setSupportZoom(false);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

            // Authentication: enable HTTP-only session cookies
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }
    }

    /**
     * Institutional Kiosk Back-Button Navigation:
     * Traverses WebView history when available; stays within kiosk on home screen.
     */
    @Override
    public void onBackPressed() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            if (webView.canGoBack()) {
                webView.goBack();
                return;
            }
        }
        // Do not exit to Android OS desktop when on initial login screen
    }
}
