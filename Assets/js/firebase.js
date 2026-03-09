var firebaseConfig = {
   apiKey: "AIzaSyC_NSN03-0L1EOeeduMf2bhT5gmJSIk0Cc",
    authDomain: "messagener-413e8.firebaseapp.com",
    projectId: "messagener-413e8",
    storageBucket: "messagener-413e8.firebasestorage.app",
    messagingSenderId: "1022140664083",
    appId: "1:1022140664083:web:5dba99802161409493f2e6",
    measurementId: "G-47HVD9K2Q6"
};

firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db = firebase.firestore();
