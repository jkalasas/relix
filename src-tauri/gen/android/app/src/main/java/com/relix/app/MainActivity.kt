package com.relix.app

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.max

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }

    val rootView = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, windowInsets ->
      val bars = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
      )
      val ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
      // Pad the web content above the keyboard so the terminal can shrink.
      view.setPadding(bars.left, bars.top, bars.right, max(bars.bottom, ime.bottom))
      dispatchWebResize()
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(rootView)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.overScrollMode = View.OVER_SCROLL_NEVER
    webView.isVerticalScrollBarEnabled = false
    webView.isHorizontalScrollBarEnabled = false
    webView.isNestedScrollingEnabled = false
    webView.scrollBarStyle = View.SCROLLBARS_INSIDE_OVERLAY
    // Keep the page pinned; Android otherwise pans when the xterm textarea focuses.
    webView.setOnScrollChangeListener { view, _, _, _, _ ->
      if (view.scrollX != 0 || view.scrollY != 0) {
        view.scrollTo(0, 0)
      }
    }
  }

  private fun dispatchWebResize() {
    val webView = findWebView(window.decorView) ?: return
    webView.post {
      webView.evaluateJavascript(
        """
        try {
          window.dispatchEvent(new Event('resize'));
          if (window.visualViewport) {
            window.visualViewport.dispatchEvent(new Event('resize'));
          }
        } catch (e) {}
        """.trimIndent(),
        null,
      )
    }
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        findWebView(view.getChildAt(index))?.let { return it }
      }
    }
    return null
  }
}
