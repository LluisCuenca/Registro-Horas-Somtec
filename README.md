# Registro Horas Somtec

Aplicacion estatica para registrar horas por trabajador, proyecto/labor y tarea.

## Uso

- Abre `index.html` en el navegador o publica esta carpeta en GitHub Pages.
- Los datos se guardan en `localStorage` del navegador.
- El historial se puede exportar a CSV o JSON.
- La copia JSON se puede importar para recuperar o mover datos entre navegadores.

## Limitacion actual

No incluye una base de datos compartida. Para que varios trabajadores usen la misma informacion desde distintos dispositivos hace falta crear una base de datos propia de Somtec, por ejemplo Firebase, Supabase o un backend interno, y conectar sus credenciales.
