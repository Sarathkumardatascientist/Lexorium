package ai.sprezzatura.lexorium

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var offlineView: View
    private lateinit var offlineTitle: TextView
    private lateinit var offlineBody: TextView
    private lateinit var retryButton: Button

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermissionRequest: PermissionRequest? = null
    private var pendingPermissionResources: Array<String> = emptyArray()

    private val filePickerLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileCallback
        fileCallback = null

        if (callback == null) return@registerForActivityResult

        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            ?: extractUris(result.data)
        callback.onReceiveValue(uris)
    }

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val request = pendingPermissionRequest
        val resources = pendingPermissionResources
        pendingPermissionRequest = null
        pendingPermissionResources = emptyArray()

        if (request == null) return@registerForActivityResult

        val granted = grants.values.all { it }
        if (granted) request.grant(resources) else request.deny()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.lexoriumWebView)
        progressBar = findViewById(R.id.pageProgress)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        offlineView = findViewById(R.id.offlineState)
        offlineTitle = findViewById(R.id.offlineTitle)
        offlineBody = findViewById(R.id.offlineBody)
        retryButton = findViewById(R.id.retryButton)

        retryButton.setOnClickListener { webView.reload() }
        swipeRefresh.setOnRefreshListener { webView.reload() }

        setupWebView()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(BuildConfig.LEXORIUM_BASE_URL)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        pendingPermissionRequest?.deny()
        pendingPermissionRequest = null
        webView.destroy()
        super.onDestroy()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowContentAccess = true
            allowFileAccess = false
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(true)
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "${userAgentString} LexoriumAndroid/1.0"
        }

        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                return handleNavigation(uri)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                showLoading(true)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false
                showOffline(false)
                showLoading(false)
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    showOffline(true)
                    showLoading(false)
                    swipeRefresh.isRefreshing = false
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                showLoading(newProgress < 100)
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                runOnUiThread { handlePermissionRequest(request) }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback

                val intent = try {
                    fileChooserParams?.createIntent()
                } catch (_: Exception) {
                    null
                } ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }

                return try {
                    filePickerLauncher.launch(intent)
                    true
                } catch (_: ActivityNotFoundException) {
                    fileCallback = null
                    Toast.makeText(this@MainActivity, R.string.file_picker_unavailable, Toast.LENGTH_SHORT).show()
                    false
                }
            }
        }

        webView.setDownloadListener(
            DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                queueDownload(url, userAgent, contentDisposition, mimeType)
            }
        )
    }

    private fun handleNavigation(uri: Uri): Boolean {
        return when (uri.scheme?.lowercase()) {
            "http", "https" -> false
            "mailto", "tel", "sms" -> {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
                true
            }
            "intent" -> {
                val fallback = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
                val packageManager = packageManager
                if (fallback.resolveActivity(packageManager) != null) {
                    startActivity(fallback)
                } else {
                    fallback.getStringExtra("browser_fallback_url")?.let { webView.loadUrl(it) }
                }
                true
            }
            else -> {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
                true
            }
        }
    }

    private fun handlePermissionRequest(request: PermissionRequest) {
        val permissions = linkedSetOf<String>()
        request.resources.forEach { resource ->
            when (resource) {
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> permissions += Manifest.permission.RECORD_AUDIO
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> permissions += Manifest.permission.CAMERA
            }
        }

        if (permissions.isEmpty()) {
            request.grant(request.resources)
            return
        }

        val missingPermissions = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isEmpty()) {
            request.grant(request.resources)
            return
        }

        pendingPermissionRequest?.deny()
        pendingPermissionRequest = request
        pendingPermissionResources = request.resources
        permissionLauncher.launch(missingPermissions.toTypedArray())
    }

    private fun queueDownload(url: String, userAgent: String?, contentDisposition: String?, mimeType: String?) {
        val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
        val request = DownloadManager.Request(Uri.parse(url)).apply {
            setMimeType(mimeType)
            addRequestHeader("User-Agent", userAgent)
            CookieManager.getInstance().getCookie(url)?.let { addRequestHeader("Cookie", it) }
            setTitle(fileName)
            setDescription(getString(R.string.download_description))
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                setDestinationInExternalFilesDir(this@MainActivity, Environment.DIRECTORY_DOWNLOADS, fileName)
            } else {
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            }
        }

        val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        manager.enqueue(request)
        Toast.makeText(this, getString(R.string.download_started, fileName), Toast.LENGTH_SHORT).show()
    }

    private fun extractUris(data: Intent?): Array<Uri>? {
        if (data == null) return null
        data.clipData?.let { clip ->
            return Array(clip.itemCount) { index -> clip.getItemAt(index).uri }
        }
        return data.data?.let { arrayOf(it) }
    }

    private fun showLoading(show: Boolean) {
        progressBar.visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun showOffline(show: Boolean) {
        offlineView.visibility = if (show) View.VISIBLE else View.GONE
        if (show) {
            offlineTitle.text = getString(R.string.offline_title)
            offlineBody.text = getString(R.string.offline_body)
        }
    }
}
