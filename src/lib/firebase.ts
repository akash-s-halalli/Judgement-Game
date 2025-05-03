// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// Optionally import other Firebase services like auth, storage, functions
// import { getAuth } from "firebase/auth";
// import { getStorage } from "firebase/storage";
// import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
// IMPORTANT: Replace placeholder values with your actual Firebase project configuration.
// These should ideally be stored in environment variables for security.
// Ensure environment variables used on the client-side start with NEXT_PUBLIC_.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY", // Replace with actual or env var
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN.firebaseapp.com", // Replace with actual or env var
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID", // Replace with actual or env var
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET.appspot.com", // Replace with actual or env var
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID", // Replace with actual or env var
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID" // Replace with actual or env var
};

// Initialize Firebase
let app;
if (!getApps().length) {
  console.log("Initializing Firebase app...");
  app = initializeApp(firebaseConfig);
} else {
  console.log("Getting existing Firebase app...");
  app = getApp();
}

const db = getFirestore(app);
// const auth = getAuth(app); // Example: Initialize Auth
// const storage = getStorage(app); // Example: Initialize Storage
// const functions = getFunctions(app); // Example: Initialize Functions

// Export the initialized services you need
export { db, app }; // Add auth, storage, functions etc. here if you use them
