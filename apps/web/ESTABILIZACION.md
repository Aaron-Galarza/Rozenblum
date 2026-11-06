# Frontend: entorno y decisiones de seguridad

## Desarrollo

Desde la raíz del monorepo, con las dependencias ya instaladas:

```sh
pnpm run build:shared
pnpm --dir apps/web run dev
pnpm --dir apps/web run typecheck
pnpm --dir apps/web run build
pnpm --dir apps/web run lint
```

Los scripts de raíz `pnpm run dev`, `pnpm run typecheck` y `pnpm run build` también involucran otros workspaces. El lint usa ESLint y la configuración raíz; requiere que estén instaladas las dependencias de desarrollo del monorepo. No hay un formatter configurado para el frontend.

`NEXT_PUBLIC_API_URL` es la URL pública de la API: se incorpora al código del navegador y nunca debe contener credenciales o secretos. En desarrollo, si no está definida, se usa `http://localhost:4000`. En producción configurar una URL HTTPS accesible desde el navegador. Los errores de red, HTTP y respuesta inválida se distinguen en `ApiClientError`; el contenido vacío depende de cada pantalla. El build no verifica la conectividad con la API.

## Sesión y contenido externo

La sesión sigue en `localStorage` por compatibilidad con el contrato Bearer actual. Cualquier JavaScript que se ejecute en el origen, incluido código inyectado por XSS, puede leerla; las guardas del frontend no sustituyen la autorización del servidor. No guardar secretos en variables `NEXT_PUBLIC_*`, logs ni URLs. Los secretos compartidos accidentalmente deben rotarse.

La revisión del frontend no encontró usos propios de `dangerouslySetInnerHTML` o `innerHTML`; eso no garantiza la ausencia de XSS en dependencias ni en documentos enriquecidos. El visor usa BlockNote y contenido externo: se validan protocolos en enlaces propios y el identificador de YouTube, pero debe verificarse la sanitización y las políticas de contenido al integrar el editor. Las URL de pago deben provenir de una API confiable; validar el esquema no demuestra que el dominio sea legítimo.

### Migración de cookies: requiere backend

Coordinar cookies `HttpOnly`, `Secure` y `SameSite` apropiado a los dominios reales, expiración y renovación, además de login/logout y autorización del lado servidor. Para orígenes distintos se necesitan `credentials: "include"` y CORS con origen explícito y credenciales; `SameSite=None` requiere `Secure` y puede verse afectado por restricciones de cookies de terceros. Definir protección CSRF para operaciones con estado (por ejemplo, token y validación de origen) y probar escritorio y móvil. No se ha migrado ni se considera implementada esa protección.

## Contraseñas: coordinación pendiente

Mantener el login actual sin cambiar el contrato: confirmar con backend si el identificador autorizado será email o DNI. Usar contraseñas individuales no predecibles, nunca el DNI como contraseña. Proponer recuperación asistida por administración tras verificar identidad, con credenciales temporales de un solo uso o enlace de restablecimiento de vida corta, y mensajes uniformes que no permitan enumerar cuentas. La implementación y los mecanismos de entrega corresponden a coordinación con backend.

## Login único: contrato pendiente

`POST /api/auth/login` admite `{ email, password }`; el servidor autentica e identifica el rol y responde `{ data: { token, user: { role, ... } } }`. Para compatibilidad, el campo `role` anterior sigue admitiéndose y, si se envía, debe coincidir con el rol real. El frontend no lo envía. Credenciales inválidas, rol incorrecto y cuentas suspendidas reciben el mismo mensaje para evitar enumeración. Mantener autorización por rol en el servidor. Desplegar backend y contratos actualizados antes del frontend: una API anterior aún exige `role`.
