# Quant Chat - Deployment Guide

Quant Chat is a production-ready, ultra-secure 3-factor authentication chat platform.

## Firebase Setup Instructions

1.  **Create a Firebase Project**
    *   Go to the [Firebase Console](https://console.firebase.google.com/).
    *   Create a new project named `quant-chat`.

2.  **Enable Services**
    *   **Firestore Database:** Enable in "Production Mode".
    *   **Realtime Database:** Enable and set rules to allow public read/write (the app handles security via encryption).
    *   **Cloud Functions:** Requires the "Blaze" (pay-as-you-go) plan.
    *   **Hosting:** Enable for web deployment.

3.  **Configure Environment**
    *   Copy the Firebase configuration from your project settings.
    *   The app uses `firebase-applet-config.json` for configuration.

4.  **Deploy Rules & Functions**
    *   Install Firebase CLI: `npm install -g firebase-tools`
    *   Login: `firebase login`
    *   Initialize: `firebase init` (select Firestore, Functions, Hosting, Database)
    *   Deploy: `firebase deploy`

## Security Features

*   **3-Factor Auth:** QC Number + 10-digit Key + Pattern (Keyword or Chess).
*   **End-to-End Encryption:** AES-256-GCM using Web Crypto API.
*   **Vanish Mode:** Real-time only messages stored in RAM, never in Firestore.
*   **Screenshot Prevention:** Blocks PrintScreen, right-click, and blurs on tab switch.
*   **Identity Erasure:** Complete network purge via Cloud Functions.

## Demo Accounts

*   **QC-4829301756**
    *   Key: `1234567890`
    *   Pattern: `phantom`
*   **QC-9173625840**
    *   Key: `0987654321`
    *   Pattern: `cipher`
