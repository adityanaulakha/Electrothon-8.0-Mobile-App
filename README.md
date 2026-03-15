# Trynex Mobile App

A React Native + Expo app that uses Gemini API image generation to create outfit looks from user photos.

## 1. Prerequisites

Install these first:

- Node.js 18 or newer (Node.js 20 LTS recommended)
- npm (comes with Node.js)
- Expo Go on your phone (Android/iOS)

Optional for local emulator/simulator testing:

- Android Studio (Android emulator)
- Xcode (iOS simulator on macOS only)

## 2. Get the Project Running

1. Extract the ZIP.
2. Open a terminal inside the project folder.
3. Install dependencies:

```bash
npm install
```

## 3. Run This Inside Their Own Local Project Folder

If someone receives the ZIP and wants to run it on their machine, they can do:

1. Move the extracted folder anywhere they want (for example Desktop or Documents).
2. Open terminal in that folder.
3. Run:

```bash
npm install
npm start
```

Windows example:

```powershell
cd C:\Users\<username>\Desktop\fashion-vton-app
npm install
npm start
```

macOS/Linux example:

```bash
cd ~/Desktop/fashion-vton-app
npm install
npm start
```

After Expo starts, they can scan the QR code in Expo Go or press `a`, `i`, or `w`.

## 4. Environment Variables

Create a `.env` file in the project root with:

```env
EXPO_PUBLIC_GEMINI_API_KEY=YOUR_GEMINI_API_KEY
EXPO_PUBLIC_GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

Notes:

- `EXPO_PUBLIC_GEMINI_API_KEY` is required.
- `EXPO_PUBLIC_GEMINI_IMAGE_MODEL` is optional (the app has fallback models).
- If this ZIP included a real API key, rotate/regenerate it for security.

## 5. Start the App

Start Expo dev server:

```bash
npm start
```

Then choose one:

- Scan the QR code in Expo Go on your phone
- Press `a` for Android emulator
- Press `i` for iOS simulator (macOS only)
- Press `w` for web

## 6. Useful Commands

```bash
npm run android
npm run ios
npm run web
```

## 7. Sharing With Others

If you want others to open the latest version through Expo updates:

```bash
npx eas-cli update --branch production --message "Update message"
```

They can open the app through Expo Go if they have access to your Expo project/update link.

## 8. Troubleshooting

- If Metro cache issues appear:

```bash
npx expo start -c
```

- If image generation fails, verify:
  - `.env` exists in project root
  - API key is valid
  - Internet connection is available

- If Android run fails locally, ensure Android SDK/emulator is properly installed.

## 9. Tech Stack

- Expo SDK 55
- React 19
- React Native 0.83
- Gemini API for image generation
