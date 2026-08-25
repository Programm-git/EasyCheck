import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBtIeYqRdxPP9ZxMaaQS5__Z1ze-t6TAjI",
  authDomain: "easycontrol-8506c.firebaseapp.com",
  projectId: "easycontrol-8506c",
  storageBucket: "easycontrol-8506c.firebasestorage.app",
  messagingSenderId: "353124144022",
  appId: "1:353124144022:web:6082ec796952325bba83b7",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.easyCheckFirebase = {
  db,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
};
window.dispatchEvent(new Event("easycheck-firebase-ready"));
