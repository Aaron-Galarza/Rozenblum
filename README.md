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
| `npm --workspace @rozenblum/api run test:atlas` | Prueba autenticación, CRUD académico, checkout concurrente y transacciones con Mongoose real en una base aleatoria aislada; la elimina al finalizar |
| `npm --workspace @rozenblum/api run bootstrap:admin -- correo@ejemplo.com` | Crea el primer administrador y la configuración inicial de forma idempotente; requiere `BOOTSTRAP_ADMIN_PASSWORD` en el entorno |

## Modelo de identidad

- El checkout registra una **solicitud**, no crea la cuenta. Recibe nombre, correo y DNI; guarda en la orden únicamente un hash `scrypt` con sal del DNI. El DNI legible no se conserva en usuarios ni órdenes ni se devuelve por la API.
- Con Mercado Pago configurado, el checkout crea una preferencia y entrega la URL de pago. El webhook firmado consulta el pago al proveedor; solo un importe y moneda coincidentes con la orden activan la inscripción y crean la cuenta de alumno. Para pagos manuales, el administrador puede confirmar la orden indicando un motivo escrito. El alumno inicia sesión con su correo y el DNI que informó.
- **Ningún alumno se crea a mano.** Antes de aprobar el pago solo existen la orden y la inscripción pendiente.
- El correo no requiere validación. La contraseña se almacena con `scrypt` asíncrono y sal aleatoria por credencial (`scrypt$<sal>$<hash>`).
- **Cambio de contraseña:** cualquier usuario autenticado puede cambiar la suya con `POST /api/auth/password` indicando la clave actual. El cambio incrementa `sessionVersion`, revoca todos los tokens anteriores y devuelve una sesión nueva para no forzar otro login.
- **Recuperación de contraseña:** el flujo con token de un solo uso y proveedor de correo sigue pendiente de definición (ver checklist, bloque 1).
- Si un alumno ya cambió su DNI por una contraseña propia, puede comprar otro curso iniciando sesión: el checkout acepta el token como prueba de identidad además del DNI.
- Los **profesores** son la única alta manual permitida desde el panel admin, porque todavía no tienen un checkout propio. Esta excepción está documentada en el checklist del bloque.
- Cada token incluye `ver` (versión de sesión). Suspender, reactivar o cambiar la contraseña de una cuenta incrementa `sessionVersion` y revoca los tokens anteriores.

## Cursos y profesores

Para crear un curso, el administrador debe seleccionar primero una cuenta de profesor activa. La API recibe su correo, verifica la cuenta y guarda su nombre y correo en el curso. Los cursos nuevos empiezan como borrador; para publicarlos hace falta mantener un profesor activo, al menos una lección y una imagen. Si el profesor deja de estar disponible, el checkout rechaza la solicitud antes de crear registros parciales.

Publicar un curso publica todas sus lecciones. Módulos, lecciones y cursos se pueden borrar mientras el curso siga siendo un borrador nunca publicado y no tenga órdenes ni inscripciones. Después del primer lanzamiento se permite editar, pero no borrar, incluso si el curso vuelve a borrador. Los IDs de lección no se reutilizan; módulos y lecciones nuevos guardan autor y fecha de creación y edición. Las ediciones académicas usan una revisión atómica del curso: si otra edición se guardó primero, la API responde `409` y el cliente debe recargar y reintentar para no sobrescribirla.

## Imágenes

Las imágenes se almacenan en Cloudinary; MongoDB guarda solo sus URL. La API necesita `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` en `apps/api/.env`; estas variables nunca se exponen al navegador. El panel permite elegir imágenes existentes o subir PNG, JPEG, WebP o AVIF de hasta 8 MB. Las carpetas previstas son `Rozenblum/courses`, `Rozenblum/professors`, `Rozenblum/lessons` y `Rozenblum/brand`.

## Pagos

Para habilitar Checkout Pro configurá `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_NOTIFICATION_URL` (URL pública completa de `POST /api/payments/mercadopago/webhook`) y `WEB_PUBLIC_URL` en `apps/api/.env`. En producción, ambas URL deben usar HTTPS. La firma secreta se obtiene de la configuración de Webhooks de la aplicación de Mercado Pago; el token y la firma quedan solo en la API. Sin las cuatro variables, la opción de pago en línea no aparece y sigue disponible el pago manual.

`POST /api/checkout` acepta `{ courseSlug, nombre, email, dni, paymentMethod? }`, con `paymentMethod` igual a `mercadopago` o `manual`. Si se omite, usa Mercado Pago cuando está configurado; en caso contrario usa manual. Rechaza campos de precio enviados por el cliente: la orden y la preferencia usan el precio en centavos del curso. La respuesta incluye `payment: { provider, preferenceId, url }` para redirigir al comprador cuando corresponde. La orden, inscripción pendiente y conversación se guardan en una transacción de Atlas; un fallo revierte los tres registros. Una preferencia creada antes de un fallo de base puede quedar sin uso, pero no se entrega al comprador.

El webhook valida la firma y su antigüedad, consulta el pago con el SDK oficial y comprueba referencia, ARS e importe exacto. Registra un `PaymentEvent` único por notificación y aplica cambios de estado junto con la cuenta y la inscripción dentro de una transacción. Los avisos duplicados o tardíos no reactivan una orden reembolsada. Una disputa bloquea el aula y pasa la orden a `En disputa`; si Mercado Pago confirma nuevamente el pago, el aula se reactiva. Un reembolso confirmado revoca el acceso de forma definitiva. `PATCH /api/admin/orders/:id` solo admite órdenes manuales y exige `{ estado, motivo }` (motivo de 5 a 500 caracteres); rechaza cambios inválidos como Pagado → Pendiente. `GET /api/admin/orders/:id/events` devuelve la auditoría de actor, motivo, fecha y estado anterior, solo al administrador. Las órdenes de Mercado Pago no se pueden aprobar manualmente.

La prueba de integración usa un proveedor simulado y la de Atlas verifica transacciones y compras simultáneas. Para cerrar la aceptación de sandbox hay que configurar credenciales de prueba, un webhook público y ejecutar un pago, un reembolso y un contracargo de ensayo.

`GET /api/media/:category` lista la galería y `POST /api/media/:category` recibe los bytes de la imagen. Ambas rutas requieren sesión de profesor o administrador; solo el administrador gestiona `professors` y `brand`. `GET /api/courses/latest` devuelve el curso publicado creado más recientemente, con su temario público y sin cuerpos de lecciones. La portada consulta este endpoint para el destacado.

## API pública y contacto

Las respuestas correctas usan `{ "data": ... }`; los errores incluyen `code`, `message` y `requestId` dentro de `error`.

| Método y ruta | Respuesta y casos relevantes |
| --- | --- |
| `GET /api/courses` | `200` con los cursos publicados; `[]` si no hay. No incluye borradores, correo de acceso del profesor ni cuerpos de lecciones. |
| `GET /api/courses/latest` | `200` con detalle público del curso publicado más reciente; `404` si no hay publicados. |
| `GET /api/courses/:slug` | `200` con datos, profesor y esquema de módulos/lecciones, sin contenido de lecciones; `404` para slug inexistente o borrador. |
| `GET /api/content/home` | `200` con contenido institucional de `site_content`, fotos actuales de profesores vinculados y sin IDs internos; `404` si falta el documento `home`. |
| `GET /api/settings` | `200` con nombre, correo de soporte, WhatsApp, logo, privacidad y disponibilidad del proveedor de pagos; nunca devuelve claves. |
| `POST /api/contact` | Body `{ name, email, message }`; `201` con ID y acuse de recepción, `400` si no valida, `429` tras 10 solicitudes en 10 minutos por IP. Guarda el mensaje en Atlas para consulta administrativa; no envía correo ni garantiza un plazo de respuesta. |
| `GET /api/admin/contacts?limit=...&offset=...` | Sólo admin: `200` con mensajes ordenados por fecha, `401` sin sesión, `403` con otro rol. `limit` y `offset` son opcionales. No hay estados de atención ni envío de correos en este MVP. |

El contenido de inicio y los ajustes son fuentes distintas: `site_content` contiene textos e imágenes institucionales; `settings` contiene nombre, soporte, WhatsApp, logo y privacidad. La dirección, el teléfono, el horario y la matrícula aún aparecen como texto fijo en el frontend y requieren revisión en su bloque correspondiente.

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
