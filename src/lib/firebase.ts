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
  apiKey: "AIzaSyAY4ewLJFzN7qZqzJDH3RtR8GAZYZIBWZA",
  authDomain: "judgement-89152.firebaseapp.com",
  projectId: "judgement-89152",
  storageBucket: "judgement-89152.firebasestorage.app",
  messagingSenderId: "788488672170",
  appId: "1:788488672170:web:ec3cd8dd558dd6d2aa11d3",
  measurementId: "G-HBYXE6J0BQ"
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
console.log("Firestore initialized successfully.");
// const auth = getAuth(app); // Example: Initialize Auth
// const storage = getStorage(app); // Example: Initialize Storage
// const functions = getFunctions(app); // Example: Initialize Functions

// Export the initialized services you need
export { db, app }; // Add auth, storage, functions etc. here if you use them
