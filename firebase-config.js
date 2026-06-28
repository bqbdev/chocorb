const firebaseConfig = {
  apiKey: "AIzaSyDHKwxKJl3n7ccscWSWzGPKXacKpMN0MjY",
  authDomain: "chocorb.firebaseapp.com",
  projectId: "chocorb",
  storageBucket: "chocorb.firebasestorage.app",
  messagingSenderId: "493821151534",
  appId: "1:493821151534:web:addac7791c7b33a55592bf"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
