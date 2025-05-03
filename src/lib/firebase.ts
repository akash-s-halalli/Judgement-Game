// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// Optionally import other Firebase services like auth, storage, functions
// import { getAuth } from "firebase/auth";
// import { getStorage } from "firebase/storage";
// import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
// Read values from environment variables
// IMPORTANT: Ensure these environment variables are set in your `.env.local` file.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Basic check if config variables are loaded
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error("Firebase configuration environment variables are not set. Please check your .env.local file.");
  // Depending on your needs, you might throw an error or handle this differently.
}


// Initialize Firebase
let app;
if (!getApps().length) {
  try {
      console.log("Initializing Firebase app...");
      app = initializeApp(firebaseConfig);
  } catch (error) {
      console.error("Firebase initialization failed:", error);
      // Handle initialization error, maybe show a message to the user
  }

} else {
  console.log("Getting existing Firebase app...");
  app = getApp();
}

let db: any = null; // Initialize db as null
if (app) {
    try {
        db = getFirestore(app);
        console.log("Firestore initialized successfully.");
    } catch (error) {
         console.error("Firestore initialization failed:", error);
    }

} else {
    console.error("Firebase app not available, cannot initialize Firestore.");
}

// const auth = getAuth(app); // Example: Initialize Auth
// const storage = getStorage(app); // Example: Initialize Storage
// const functions = getFunctions(app); // Example: Initialize Functions

// Export the initialized services you need
export { db, app }; // Add auth, storage, functions etc. here if you use them
