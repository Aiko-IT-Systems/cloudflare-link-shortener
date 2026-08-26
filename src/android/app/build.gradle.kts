import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val signingProperties = Properties().apply {
    val file = rootProject.file("signing.properties")
    if (file.exists()) file.inputStream().use(::load)
}
fun signingValue(property: String, environment: String): String? =
    signingProperties.getProperty(property)?.takeIf(String::isNotBlank)
        ?: System.getenv(environment)?.takeIf(String::isNotBlank)

val signingStoreFile = signingValue("storeFile", "ANDROID_UPLOAD_KEYSTORE_PATH")
val signingStorePassword = signingValue("storePassword", "ANDROID_UPLOAD_KEYSTORE_PASSWORD")
val signingKeyAlias = signingValue("keyAlias", "ANDROID_UPLOAD_KEY_ALIAS")
val signingKeyPassword = signingValue("keyPassword", "ANDROID_UPLOAD_KEY_PASSWORD")
val signingConfigured = listOf(signingStoreFile, signingStorePassword, signingKeyAlias, signingKeyPassword).all { it != null }
val packageVersionFile = rootProject.file("../../package.json")
val packageVersion = Regex("\"version\"\\s*:\\s*\"(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\"")
    .find(packageVersionFile.readText())
    ?.groupValues
    ?.drop(1)
    ?.let { (major, minor, patch) -> Triple(major.toInt(), minor.toInt(), patch.toInt()) }
    ?: error("Root package.json must contain a release version in major.minor.patch form.")
val canonicalVersionName = listOf(packageVersion.first, packageVersion.second, packageVersion.third).joinToString(".")
val canonicalVersionCode = packageVersion.let { (major, minor, patch) ->
    require(major <= 999 && minor <= 999 && patch <= 999) { "Each package version component must be at most 999 for Android versionCode." }
    major * 1_000_000 + minor * 1_000 + patch
}

android {
    namespace = "dev.aitsys.go"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.aitsys.go"
        minSdk = 29
        targetSdk = 36
		versionCode = canonicalVersionCode
		versionName = canonicalVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        getByName("debug") {
            storeFile = file("C:\\Users\\Lulalaby\\.android\\debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        if (signingConfigured) {
            create("release") {
                storeFile = rootProject.file(signingStoreFile!!)
                storePassword = signingStorePassword
                keyAlias = signingKeyAlias
                keyPassword = signingKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures.compose = true
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging.resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    testOptions.unitTests.isIncludeAndroidResources = true
}

tasks.register("printReleaseVersion") {
    group = "verification"
    description = "Prints the Android release version derived from the root package.json."
    doLast {
        println("AITSYS_GO_VERSION_NAME=$canonicalVersionName")
        println("AITSYS_GO_VERSION_CODE=$canonicalVersionCode")
    }
}

kotlin {
    compilerOptions.jvmTarget.set(JvmTarget.JVM_17)
}

dependencies {
    // AGP 9.1/Gradle 9.3.1 keeps this app on the current stable Android SDK line.
    implementation(platform("androidx.compose:compose-bom:2025.09.01"))
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.09.01"))

    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.datastore:datastore-preferences:1.1.7")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
