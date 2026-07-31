# Registro Horas Somtec

Aplicacion estatica para registrar horas por trabajador, proyecto/labor y tarea.

## Uso

- Abre `index.html` en el navegador o publica esta carpeta en GitHub Pages.
- Los datos se sincronizan con Firebase Realtime Database. Si Firebase no carga, la app usa `localStorage` del navegador como respaldo local.
- El historial se puede exportar a CSV o JSON.
- La copia JSON se puede importar para recuperar o mover datos entre navegadores.

## Base de datos compartida

La recomendacion para esta app es Firebase Realtime Database, porque funciona bien desde una web estatica en GitHub Pages y sincroniza cambios entre dispositivos sin montar servidor propio.

Pasos:

La app ya incluye la configuracion del proyecto Firebase `registro-horas-somtec`.

Para que funcione en produccion:

1. Comprobar que Realtime Database esta creada en Firebase.
2. Configurar reglas de seguridad adecuadas.
3. Publicar de nuevo la web.

La configuracion web de Firebase no es una contrasena. La seguridad real debe definirse en las reglas de Realtime Database. Para pruebas se puede abrir temporalmente el acceso, pero para uso real conviene proteger lectura/escritura con autenticacion o restringir el acceso al equipo de Somtec.

## Publicacion automatica

El repositorio incluye:

- Workflow de GitHub Pages en `.github/workflows/pages.yml`: cada `push` a `main` despliega la web automaticamente.
- Hook local en `.githooks/post-commit`: cada commit intenta hacer `push` a `origin/main`.

Para activar el hook local en esta copia:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/post-commit
```

Si algun dia quieres hacer un commit sin autopush:

```bash
SOMTEC_SKIP_AUTO_PUSH=1 git commit -m "mensaje"
```

El autopush necesita que Git tenga permisos de escritura en GitHub desde esta maquina. Si falla por permisos, GitHub Desktop seguira mostrando el commit pendiente y podras hacer `Push origin` desde ahi.
