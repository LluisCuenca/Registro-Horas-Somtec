# Registro Horas Somtec

Aplicacion estatica para registrar horas por trabajador, proyecto/labor y tarea.

## Uso

- Abre `index.html` en el navegador o publica esta carpeta en GitHub Pages.
- Los datos se guardan en `localStorage` del navegador si no hay base de datos configurada.
- El historial se puede exportar a CSV o JSON.
- La copia JSON se puede importar para recuperar o mover datos entre navegadores.

## Base de datos compartida

La recomendacion para esta app es Firebase Realtime Database, porque funciona bien desde una web estatica en GitHub Pages y sincroniza cambios entre dispositivos sin montar servidor propio.

Pasos:

1. Crear un proyecto en Firebase.
2. Activar Realtime Database.
3. Crear una app web dentro del proyecto Firebase.
4. Copiar la configuracion web en `firebase-config.js`, sustituyendo `null`.
5. Publicar de nuevo la web.

La configuracion web de Firebase no es una contrasena. La seguridad real debe definirse en las reglas de Realtime Database. Para pruebas se puede abrir temporalmente el acceso, pero para uso real conviene proteger lectura/escritura con autenticacion o restringir el acceso al equipo de Somtec.
