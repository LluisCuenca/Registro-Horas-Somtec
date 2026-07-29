window.SOMTEC_FIREBASE_CONFIG = null;

/*
  Para activar la base de datos compartida:

  1. Crea un proyecto en Firebase.
  2. Activa Realtime Database.
  3. Sustituye null por la configuracion web del proyecto:

  window.SOMTEC_FIREBASE_CONFIG = {
    apiKey: "...",
    authDomain: "...",
    databaseURL: "https://....firebasedatabase.app",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  };

  Esta configuracion no es una contrasena. La seguridad real debe estar en las
  reglas de Realtime Database.
*/
