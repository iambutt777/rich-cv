# Rich CV Maker - R8 rules (v4.96)
# Only what R8 cannot see by itself. Everything else is shrunk, optimised and renamed.
# The libraries (AdMob, UMP, Play Billing, Firebase, ML Kit, Play services) bring their own rules.

# 1) The web app calls these Java methods by name through window.AndroidBridge.
#    Keep only the methods marked @JavascriptInterface (the class itself may be renamed).
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# 2) Credential Manager (Google login) finds its Play-services provider by reflection.
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** {
  *;
}

# 3) Readable crash reports in Play Console (upload mapping.txt from the GitHub release).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
