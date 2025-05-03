import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error("Firebase configuration environment variables are not set. Please check your .env.local file.");
  
}

let app;
if (!getApps().length) {
  try {
      console.log("Initializing Firebase app...");
      app = initializeApp(firebaseConfig);
  } catch (error) {
      console.error("Firebase initialization failed:", error);
      
  }

} else {
  console.log("Getting existing Firebase app...");
  app = getApp();
}

let db: any = null; 
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

export { db, app };