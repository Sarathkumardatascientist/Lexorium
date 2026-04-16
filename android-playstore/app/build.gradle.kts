import java.io.FileInputStream
import java.util.Properties
import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    if (File("app/google-services.json").exists()) {
        id("com.google.gms.google-services")
    }
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    FileInputStream(keystorePropertiesFile).use(keystoreProperties::load)
}

fun signingValue(propertyKey: String, envKey: String): String? {
    return (keystoreProperties.getProperty(propertyKey) ?: System.getenv(envKey))
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
}

val releaseStoreFile = signingValue("storeFile", "LEXORIUM_ANDROID_STORE_FILE")
val releaseStorePassword = signingValue("storePassword", "LEXORIUM_ANDROID_STORE_PASSWORD")
val releaseKeyAlias = signingValue("keyAlias", "LEXORIUM_ANDROID_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "LEXORIUM_ANDROID_KEY_PASSWORD")
val hasReleaseSigning = listOf(
    releaseStoreFile,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }

val hasFirebase = File("app/google-services.json").exists()

android {
    namespace = "ai.sprezzatura.lexorium"
    compileSdk = 35

    defaultConfig {
        applicationId = "ai.sprezzatura.lexorium"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.0.2"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        buildConfigField("String", "LEXORIUM_BASE_URL", "\"https://lexoriumai.com\"")
        buildConfigField("String", "LEXORIUM_APP_URL", "\"https://lexoriumai.com/app.html\"")
        buildConfigField("String", "LEXORIUM_PLAY_PRO_PRODUCT_ID", "\"lexorium_pro_monthly\"")
        buildConfigField("boolean", "HAS_FIREBASE", hasFirebase.toString())
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(requireNotNull(releaseStoreFile))
                storePassword = requireNotNull(releaseStorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.android.billingclient:billing-ktx:7.1.1")
    
    // Firebase - only when google-services.json is present
    if (hasFirebase) {
        implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
        implementation("com.google.firebase:firebase-messaging-ktx")
        implementation("com.google.firebase:firebase-analytics-ktx")
    }
}