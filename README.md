# LalaHari for Doctors

Doctor-facing companion app for the LalaHari Health platform (bare React Native 0.86.3 + TypeScript), mirroring the patient app stack: React Navigation, Zustand, Axios, and Firebase phone auth.

## Features

1. **Sign up / sign in with mobile number** — Firebase phone OTP, then the Firebase ID token is exchanged with the backend for access + refresh tokens (`POST /auth/doctor/phone/firebase/`).
2. **Professional profile** — name, age, gender, optional photo, medical council registration number, qualification, specialization.
3. **Weekly availability** — load and replace the saved week with one to three non-overlapping 15-minute-step windows per open day, totaling at least six hours per day. The editor supports overnight windows and `00:00`–`24:00` full days.
4. **Home dashboard (Schedule tab)** — welcome message, notification bell with unread badge, profile shortcut, and a Teams-style day calendar timeline of appointments. Video Join follows the backend's `can_join` flag.
5. **Earnings tab** — completed consultation totals, average, chart and video/audio/chat breakdown from `GET /doctors/me/earnings/`. Toggle **Daily**, **Monthly** and **Financial Year** (April–March); period navigation uses the dates supplied by the server.
6. **Profile screen** — edit details, upload or remove a photo, and upload, replace or delete verification documents (registration certificate, degree, ID, or up to five other documents).
7. **Notifications screen** — server notifications with pagination, read/unread state and mark-all-read. Tapping an appointment notification opens its appointment.
8. **Video call** — custom one-to-one call screen using the 100ms React Native core SDK, including front/back camera switching.
9. **Appointment detail** — patient intake info, time window, and the server-gated Join button.

## Authentication and demo data

Authentication uses Firebase phone OTP and the live doctor API by default. Access
and rotating refresh tokens are stored in the device Keychain/Keystore. On launch,
the app refreshes the session and retrieves the doctor profile and onboarding step.
An expired session returns to sign-in; a network failure leaves the saved session
intact and offers a retry. Logging out removes the push device registration and
revokes the refresh token before clearing the session locally.

Appointments use the live doctor schedule and appointment detail APIs by default;
`USE_MOCK_APPOINTMENTS` enables demo appointments, which cannot start video calls.
Earnings uses the authenticated live API and requires a verified doctor. Its
totals exclude other currencies, which are listed separately. Notifications use
the authenticated `/notifications/` APIs; the bell uses the server unread count.
Profile, document and availability writes use the live API:

Availability uses `GET` and `PUT /doctors/me/availability/`. Profile photos use
`PUT`/`DELETE /doctors/me/photo/`; documents use `POST /doctors/me/documents/`
and `DELETE /doctors/me/documents/{id}/`. Photo uploads accept JPG, PNG or WEBP
up to 5 MB; documents accept PDF, JPG or PNG up to 10 MB.

Availability uses India time. Overnight windows belong to the day they start,
and must not overlap the next day's windows, including across Sunday/Monday.
`24:00` is an end-of-day boundary, not a start time. The published API does not
specify whether it accepts `24:00` or overnight windows: confirm backend support
before relying on these options. Backend validation errors are shown to the user.
The timeline shows all 24 hours and includes consultations starting on the
previous day when they continue into the selected day.

For local authentication demos only, set `USE_MOCK_AUTH = true` to use OTP
**123456** without sending an SMS. Do not ship demo authentication in production.

### Video consultation setup

The backend must be configured with 100ms credentials and a private-room template
with doctor and patient roles, and must expose the authenticated join, schedule,
appointment-detail and call-update endpoints. Provider credentials and room creation
stay on the backend; the short-lived participant token is held only in memory.
The patient app must join the same backend-managed appointment room. The app does
not request recording or transcription.

The core SDK is used rather than the prebuilt UI because the latter declares a
React Navigation 6 peer dependency while this app uses version 7. Android requires
API 24 or later; install dependencies and rebuild the native app. On iOS, run
`pod install` from `ios` on a Mac and rebuild. Camera and microphone permission
are required; if denied, enable them in system settings. The schedule and detail
screen refresh eligibility every 30 seconds; the server remains authoritative.
When joining fails, the screen shows a shareable diagnostic stage and, when
available, an HTTP status or numeric 100ms SDK error code. It does not include
tokens, appointment identifiers, request bodies or server response bodies.

Call events are sent after the SDK connects and after a successful leave or a
terminal removal. If reporting fails, the app alerts the doctor; it does not
currently queue events for offline retry. Android and iOS device testing, backend
configuration and an actual doctor-to-patient call are required before production
use, including verification of permissions, reconnection, media and lifecycle
reporting. No iOS native build can be performed on Windows.

## Setup

```bash
npm install
npm start          # Metro
npm run android    # build & run on Android
```

The Ionicons and MaterialCommunityIcons fonts used by the app are bundled in the Android
and iOS native projects. Rebuild the app after changing native icon-font configuration.

### Prepare an Android Play Store release

Google Play releases should be uploaded as a signed Android App Bundle (AAB), not
the debug-signed APK. Release builds now require a dedicated upload keystore;
they never fall back to the debug key.

1. In Play Console, create the app using package name `com.lalaharidoctor` and
   enroll in Play App Signing. Package names are permanent.
2. If you do not already have an upload key for this app, create one and store
   the keystore outside this checkout. Keep a secure backup:

   ```powershell
   keytool -genkeypair -v -keystore "$HOME\lalahari-doctor-upload.jks" `
     -alias lalahari-upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Do not commit the keystore or put its passwords in this repository. If an
   upload key already exists, continue using that key for future updates.
3. Add these entries to your user-level Gradle properties file, normally
   `$HOME\.gradle\gradle.properties` (create the file if needed). Use the actual
   absolute path and values from your key; do not share or commit this file:

   ```properties
   LALAHARI_UPLOAD_STORE_FILE=C:/Users/YOUR_USER/lalahari-doctor-upload.jks
   LALAHARI_UPLOAD_STORE_PASSWORD=your-keystore-password
   LALAHARI_UPLOAD_KEY_ALIAS=lalahari-upload
   LALAHARI_UPLOAD_KEY_PASSWORD=your-key-password
   ```

4. Ensure the app's Firebase Android configuration exists at
   `android/app/google-services.json` and has a client for
   `com.lalaharidoctor`. After the first Play upload, register the Play Console
   **app signing certificate SHA-1** in Firebase for phone authentication.
   Register the upload certificate as well if your Firebase setup requires it.
5. From PowerShell, build the bundle:

   ```powershell
   Set-Location android
   .\gradlew.bat :app:bundleRelease
   ```

   The bundle is generated at
   `android\app\build\outputs\bundle\release\app-release.aab`. Upload it to
   Play Console's internal testing track first and test sign-in, notifications,
   availability, appointments and video calls on real devices.

Before production rollout, complete Play Console's store listing, app icon and
screenshots, privacy policy, Data safety form, content rating, app access
instructions for reviewers, health-app declaration and any account testing
requirements shown in the Console. This app handles health-related consultation
data and camera/microphone access; ensure the privacy policy and disclosures
accurately describe the backend, Firebase and 100ms data handling. The Play
Console account owner must submit and roll out the release.

The Android launcher icons are generated from the supplied LalaHari logo. The
512x512 Play listing icon is at `store-assets/play/icon-512.png`; the store
listing title is `LalaHari Doctor App`. Before submission, update the published
privacy policy to explicitly cover doctor-app data, 100ms video/audio calls,
camera and microphone use, and Firebase Cloud Messaging. The current policy
does not yet describe those app-specific disclosures.

Run only one Android build at a time in this checkout. Overlapping terminal or IDE
builds can lock CMake log files on Windows and fail with "Unable to delete
directory". Let the active build finish, or cancel it in its terminal/IDE before
retrying. If the error persists with no builds running, close the process holding
the files before deleting the affected generated logs and rebuilding.

If you move or copy the project and Gradle reports a dependency directory at the
old location, delete the generated autolinking configuration before rebuilding.
React Native caches absolute paths and does not invalidate them just because the
project moved. From the project root:

```powershell
Remove-Item -LiteralPath .\android\build\generated\autolinking\autolinking.json
Set-Location android
.\gradlew.bat assembleRelease
```

### Firebase (required for real OTP)

This app needs its **own** Firebase app registration — the patient app's `google-services.json` will not work:

1. In the LalaHari Firebase project, add an Android app with package name **`com.lalaharidoctor`**.
2. Download its `google-services.json` into `android/app/`.
3. Enable **Phone** sign-in in Firebase Console → Authentication.
4. Add your debug SHA-1 (and release SHA-1) in Firebase project settings, or OTP will fail.

The `com.google.gms.google-services` plugin is applied **only if** `android/app/google-services.json` exists — the app builds without it (a warning is printed during the build). Real phone OTP requires the file and a rebuild. For iOS, add the app's `GoogleService-Info.plist` to the Xcode target, configure Firebase Phone Auth's APNs or reCAPTCHA requirements, and run `pod install` in `ios` after installing dependencies.

### Push notifications

The app requests notification permission, registers its Firebase Messaging token
after sign-in and on token refresh, and removes the current device token before
logging out. Android 13+ requires notification permission. Foreground messages
refresh the badge and show a notice; tapping a system notification opens the
appointment when its data contains a numeric `appointment_id`. If device-token
retrieval or removal fails, logout reports the error and can be retried.

For iOS push delivery, configure Push Notifications and Background Modes / Remote
notifications in the signed Xcode target, upload the APNs key to Firebase, add
the iOS Firebase configuration and install pods. A physical iOS device and valid
signing are required for verification. The backend must send the appointment ID
in the FCM data payload. Device registration and delivery cannot be verified
without configured Firebase, backend access and real devices.

## Notes

- The project lives at `C:\dev\LalaHariDoctor` — a short, space-free path is required because the Android CMake/Ninja native build fails on Windows when paths exceed 260 characters.
- Authentication tokens persist locally. The doctor profile, onboarding state and notifications are reloaded from the server; demo data remains in memory.
