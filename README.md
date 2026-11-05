# Rozenblum

Plataforma full-stack del Estudio Jurídico Rozenblum: sitio público, aula virtual para alumnos, panel docente y panel de administración.

- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind 4
- **Backend:** Express 5 + Mongoose 9 (MongoDB Atlas)
- **Monorepo:** npm workspaces (`apps/web`, `apps/api`, `packages/shared`)

## Requisitos

- Node.js 20.19+
- npm 10+
- MongoDB Atlas con datos y usuarios configurados

## Puesta en marcha

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/health

Completá `MONGODB_URI`, `AUTH_SECRET` y las tres variables `CLOUDINARY_*` en `apps/api/.env`. La API usa Atlas y detiene el arranque si la conexión falla. El repositorio no incluye datos de ejemplo ni contraseñas.

## Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | Levanta API y web en desarrollo |
| `npm run build` | Build de producción (shared + api + web) |
| `npm run typecheck` | Chequeo de tipos en todos los paquetes |
| `npm run lint` | ESLint (flat config) sobre API, web y shared |
| `npm test` | Tests de integración de la API (repositorios mock, sin Atlas) |
| `npm --workspace @rozenblum/api run test:atlas` | Prueba autenticación, revocación y permisos con Mongoose real en una base aleatoria aislada; la elimina al finalizar |
| `npm --workspace @rozenblum/api run bootstrap:admin -- correo@ejemplo.com` | Crea el primer administrador y la configuración inicial de forma idempotente; requiere `BOOTSTRAP_ADMIN_PASSWORD` en el entorno |

## Modelo de identidad

- El checkout registra una **solicitud**, no crea la cuenta. Recibe nombre, correo y DNI; guarda en la orden únicamente un hash `scrypt` con sal del DNI. El DNI legible no se conserva en usuarios ni órdenes ni se devuelve por la API.
- Cuando el administrador marca la orden como **Pagado**, la API crea la cuenta de alumno con ese hash como contraseña inicial y activa la inscripción. El alumno inicia sesión con su correo y el DNI que informó.
- **Ningún alumno se crea a mano.** Antes de aprobar el pago solo existen la orden y la inscripción pendiente.
- El correo no requiere validación. La contraseña se almacena con `scrypt` asíncrono y sal aleatoria por credencial (`scrypt$<sal>$<hash>`).
- **Cambio de contraseña:** cualquier usuario autenticado puede cambiar la suya con `POST /api/auth/password` indicando la clave actual. El cambio incrementa `sessionVersion`, revoca todos los tokens anteriores y devuelve una sesión nueva para no forzar otro login.
- **Recuperación de contraseña:** el flujo con token de un solo uso y proveedor de correo sigue pendiente de definición (ver checklist, bloque 1).
- Si un alumno ya cambió su DNI por una contraseña propia, puede comprar otro curso iniciando sesión: el checkout acepta el token como prueba de identidad además del DNI.
- Los **profesores** son la única alta manual permitida desde el panel admin, porque todavía no tienen un checkout propio. Esta excepción está documentada en el checklist del bloque.
- Cada token incluye `ver` (versión de sesión). Suspender, reactivar o cambiar la contraseña de una cuenta incrementa `sessionVersion` y revoca los tokens anteriores.

## Cursos y profesores

Para crear un curso, el administrador debe seleccionar primero una cuenta de profesor activa. La API recibe su correo, verifica la cuenta y guarda su nombre y correo en el curso. Los cursos nuevos empiezan como borrador; para publicarlos hace falta mantener un profesor activo, al menos una lección y una imagen. Si el profesor deja de estar disponible, el checkout rechaza la solicitud antes de crear registros parciales.

## Imágenes

Las imágenes se almacenan en Cloudinary; MongoDB guarda solo sus URL. La API necesita `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` en `apps/api/.env`; estas variables nunca se exponen al navegador. El panel permite elegir imágenes existentes o subir PNG, JPEG, WebP o AVIF de hasta 8 MB. Las carpetas previstas son `Rozenblum/courses`, `Rozenblum/professors`, `Rozenblum/lessons` y `Rozenblum/brand`.

`GET /api/media/:category` lista la galería y `POST /api/media/:category` recibe los bytes de la imagen. Ambas rutas requieren sesión de profesor o administrador; solo el administrador gestiona `professors` y `brand`. `GET /api/courses/latest` devuelve el curso publicado creado más recientemente, con su temario público y sin cuerpos de lecciones. La portada consulta este endpoint para el destacado.

### Autenticación de la API

| Método y ruta | Acceso | Resultado |
| --- | --- | --- |
| `POST /api/auth/login` | Público; body `{ role, email, password }` | `200` con `{ data: { token, user } }`; credenciales o rol incorrectos devuelven el mismo `401` |
| `GET /api/auth/session` | Token `Authorization: Bearer <token>` | `200` con el usuario actual; `401` si el token falta, expiró o fue revocado; `403` si la cuenta está suspendida |
| `POST /api/auth/password` | Token `Authorization: Bearer <token>`; body `{ currentPassword, newPassword }` | `200` con una sesión nueva; `400` si la clave actual no coincide o la nueva es inválida; `401` sin sesión válida |
| `POST /api/auth/logout` | Público | `204`; el cliente borra su token local. Este endpoint no revoca el token en el servidor |

El token vence a las ocho horas. Las rutas de alumno, profesor y administrador exigen el rol correspondiente; un rol válido sin permiso devuelve `403`. El login y el cambio de contraseña están limitados por IP a 20 solicitudes cada 15 minutos; al superar el límite devuelve `429`. El checkout está limitado a 15 solicitudes cada 10 minutos.

## Primer administrador

No existe un endpoint público para crear administradores. En una base nueva:

```powershell
$env:BOOTSTRAP_ADMIN_PASSWORD = Read-Host "Clave inicial del administrador" -MaskInput
npm --workspace @rozenblum/api run bootstrap:admin -- admin@estudio.com
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
```

El script es idempotente: si ya existe ese administrador no modifica su cuenta; si existe otro administrador, se detiene. También crea el documento de configuración del sitio si falta, sin publicar un teléfono o texto legal ficticios. Completá esos datos desde el panel antes de usar el sitio públicamente. Requiere `MONGODB_URI` y `AUTH_SECRET` válidos. La clave no se pasa por línea de comandos para evitar que quede en el historial o la lista de procesos.

## Entorno

Las variables se documentan en `apps/api/.env.example` y `apps/web/.env.local.example`. Las credenciales viven únicamente en el backend; el navegador nunca se conecta a Atlas.

En producción, `CORS_ORIGIN` debe ser un origen `https` explícito (la API rechaza `localhost`) y `TRUST_PROXY` define cuántos proxies se confían para calcular la IP real del rate limit.
