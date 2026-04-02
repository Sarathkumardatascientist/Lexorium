package ai.sprezzatura.lexorium

import android.app.Activity
import android.util.Log
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class LexoriumPlayBillingManager(
    private val activity: Activity,
    private val webView: WebView,
    private val baseUrl: String,
) : PurchasesUpdatedListener {

    companion object {
        private const val TAG = "LexoriumPlayBilling"
        private const val ACTIVATE_PATH = "/api/billing/google-play-activate"
    }

    private var billingClient: BillingClient? = null
    private var proProductDetails: ProductDetails? = null
    private var pendingUpgradeUid: String? = null

    private val bridge = AndroidBridge()

    fun getJavascriptBridge(): Any = bridge

    fun start() {
        connectBillingClient {
            queryProProductDetails()
            queryExistingPurchases(false)
        }
    }

    fun destroy() {
        billingClient?.endConnection()
        billingClient = null
    }

    private fun getBillingClient(): BillingClient {
        val existing = billingClient
        if (existing != null) return existing

        val created = BillingClient.newBuilder(activity)
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .enablePrepaidPlans()
                    .build()
            )
            .build()

        billingClient = created
        return created
    }

    private fun connectBillingClient(onReady: (() -> Unit)? = null) {
        val client = getBillingClient()
        if (client.isReady) {
            dispatchStatus(true, null)
            onReady?.invoke()
            return
        }

        client.startConnection(object : BillingClientStateListener {
            override fun onBillingServiceDisconnected() {
                dispatchStatus(false, "Google Play Billing disconnected. Reconnect and retry.")
            }

            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingResponseCode.OK) {
                    dispatchStatus(true, null)
                    onReady?.invoke()
                } else {
                    dispatchStatus(false, billingResult.debugMessage ?: "Google Play Billing is unavailable.")
                }
            }
        })
    }

    private fun queryProProductDetails(onLoaded: (() -> Unit)? = null) {
        val client = getBillingClient()
        if (!client.isReady) {
            connectBillingClient { queryProProductDetails(onLoaded) }
            return
        }

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                listOf(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(BuildConfig.LEXORIUM_PLAY_PRO_PRODUCT_ID)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()
                )
            )
            .build()

        client.queryProductDetailsAsync(params) { billingResult, products ->
            if (billingResult.responseCode == BillingResponseCode.OK) {
                proProductDetails = products.firstOrNull()
                if (proProductDetails == null) {
                    dispatchStatus(false, "Lexorium Pro is not configured in Google Play yet.")
                } else {
                    dispatchStatus(true, null)
                    onLoaded?.invoke()
                }
            } else {
                dispatchStatus(false, billingResult.debugMessage ?: "Could not load Google Play subscription details.")
            }
        }
    }

    private fun queryExistingPurchases(announce: Boolean) {
        val client = getBillingClient()
        if (!client.isReady) return

        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()

        client.queryPurchasesAsync(params) { billingResult, purchases ->
            if (billingResult.responseCode != BillingResponseCode.OK) return@queryPurchasesAsync
            purchases.forEach { purchase ->
                if (purchase.products.contains(BuildConfig.LEXORIUM_PLAY_PRO_PRODUCT_ID)) {
                    handlePurchase(purchase, announce)
                }
            }
        }
    }

    private fun launchProUpgrade(uid: String?) {
        pendingUpgradeUid = uid?.trim()?.ifEmpty { null }
        connectBillingClient {
            if (proProductDetails == null) {
                queryProProductDetails { launchBillingFlow() }
            } else {
                launchBillingFlow()
            }
        }
    }

    private fun launchBillingFlow() {
        val client = getBillingClient()
        val details = proProductDetails
        if (!client.isReady || details == null) {
            dispatchResult("error", "Google Play subscription details are still loading.")
            return
        }

        val offer = details.subscriptionOfferDetails?.firstOrNull()
        if (offer == null) {
            dispatchResult("error", "No eligible Google Play offer is available for Lexorium Pro yet.")
            return
        }

        val flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .setOfferToken(offer.offerToken)
                        .build()
                )
            )
            .apply {
                val uid = pendingUpgradeUid
                if (!uid.isNullOrBlank()) {
                    setObfuscatedAccountId(hashUid(uid))
                }
            }
            .build()

        val result = client.launchBillingFlow(activity, flowParams)
        if (result.responseCode != BillingResponseCode.OK && result.responseCode != BillingResponseCode.USER_CANCELED) {
            dispatchResult("error", result.debugMessage ?: "Could not start Google Play Billing.")
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: MutableList<Purchase>?) {
        when (billingResult.responseCode) {
            BillingResponseCode.OK -> purchases?.forEach { handlePurchase(it, true) }
            BillingResponseCode.USER_CANCELED -> dispatchResult("cancelled", "Google Play purchase was cancelled.")
            BillingResponseCode.ITEM_ALREADY_OWNED -> queryExistingPurchases(true)
            else -> dispatchResult("error", billingResult.debugMessage ?: "Google Play purchase failed.")
        }
    }

    private fun handlePurchase(purchase: Purchase, announce: Boolean) {
        if (!purchase.products.contains(BuildConfig.LEXORIUM_PLAY_PRO_PRODUCT_ID)) return
        when (purchase.purchaseState) {
            Purchase.PurchaseState.PURCHASED -> {
                if (announce) {
                    dispatchResult("processing", "Finalising your Google Play upgrade...")
                }
                activatePurchaseOnBackend(purchase, announce)
            }
            Purchase.PurchaseState.PENDING -> {
                if (announce) {
                    dispatchResult("pending", "Your Google Play purchase is pending confirmation.")
                }
            }
            else -> Unit
        }
    }

    private fun activatePurchaseOnBackend(purchase: Purchase, announce: Boolean) {
        Thread {
            try {
                val endpoint = URL("${baseUrl.trimEnd('/')}$ACTIVATE_PATH")
                val connection = endpoint.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.connectTimeout = 15000
                connection.readTimeout = 20000
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Accept", "application/json")
                CookieManager.getInstance().getCookie(baseUrl)?.let {
                    connection.setRequestProperty("Cookie", it)
                }

                val payload = JSONObject()
                    .put("purchaseToken", purchase.purchaseToken)
                    .put("productId", purchase.products.firstOrNull() ?: BuildConfig.LEXORIUM_PLAY_PRO_PRODUCT_ID)
                    .put("orderId", purchase.orderId ?: "")
                    .put("purchaseState", purchase.purchaseState)
                    .put("isAcknowledged", purchase.isAcknowledged)
                    .put("packageName", activity.packageName)
                    .put("purchaseJson", purchase.originalJson)

                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(payload.toString())
                    writer.flush()
                }

                val responseText = readResponseBody(connection)
                val responseJson = runCatching { JSONObject(responseText) }.getOrElse { JSONObject() }

                if (connection.responseCode in 200..299) {
                    if (!purchase.isAcknowledged) {
                        acknowledgePurchase(purchase)
                    }
                    if (announce) {
                        dispatchResult("success", responseJson.optString("message").ifBlank { "Lexorium Pro is now active for this account." })
                    }
                } else {
                    if (announce) {
                        dispatchResult("error", responseJson.optString("message").ifBlank { "Google Play purchase was completed, but Lexorium could not activate Pro yet." })
                    }
                }
            } catch (error: Exception) {
                Log.e(TAG, "Failed to activate Google Play purchase", error)
                if (announce) {
                    dispatchResult("error", "Your Google Play purchase completed, but Lexorium could not confirm the Pro subscription yet.")
                }
            }
        }.start()
    }

    private fun acknowledgePurchase(purchase: Purchase) {
        val client = getBillingClient()
        if (!client.isReady || purchase.isAcknowledged) return
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()
        client.acknowledgePurchase(params) { result ->
            if (result.responseCode != BillingResponseCode.OK) {
                Log.w(TAG, "Purchase acknowledgement failed: ${result.debugMessage}")
            }
        }
    }

    private fun readResponseBody(connection: HttpURLConnection): String {
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        if (stream == null) return ""
        BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { reader ->
            return reader.readText()
        }
    }

    private fun dispatchStatus(available: Boolean, message: String?) {
        val detail = JSONObject()
            .put("available", available)
            .put("productId", BuildConfig.LEXORIUM_PLAY_PRO_PRODUCT_ID)
            .put("message", message ?: "")
        dispatchEvent("lexorium:play-billing-status", detail)
    }

    private fun dispatchResult(status: String, message: String) {
        val detail = JSONObject()
            .put("status", status)
            .put("message", message)
            .put("productId", BuildConfig.LEXORIUM_PLAY_PRO_PRODUCT_ID)
            .put("planId", "pro")
        dispatchEvent("lexorium:play-billing-result", detail)
    }

    private fun dispatchEvent(name: String, detail: JSONObject) {
        val script = "window.dispatchEvent(new CustomEvent(${JSONObject.quote(name)}, { detail: ${detail} }));"
        activity.runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }

    private fun hashUid(uid: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(uid.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun startProUpgrade(uid: String?) {
            activity.runOnUiThread {
                launchProUpgrade(uid)
            }
        }

        @JavascriptInterface
        fun isPlayBillingAvailable(): Boolean = true
    }
}
