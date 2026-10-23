plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    // Must differ from the Expo app (io.neuropal.app) so both install side
    // by side on the same phone.
    namespace = "io.neuropal.flutter"
    compileSdk = flutter.compileSdkVersion
    // Flutter's default (28.2): the plugins (flutter_tts, shared_preferences)
    // require it too. Gradle downloads it on first build if it is missing.
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "io.neuropal.flutter"
        // API 26+: the TTS engine reports word ranges (onRangeStart) only
        // from Android 8.0, and the karaoke highlight depends on them.
        minSdk = maxOf(26, flutter.minSdkVersion)
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // Personal side-loaded build: signed with the debug key so
            // `flutter build apk --release` works without a keystore.
            // Use a real upload key before any store submission.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
