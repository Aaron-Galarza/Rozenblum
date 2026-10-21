# Rozenblum

Plataforma full-stack del Estudio Jurídico Rozenblum: sitio público, aula virtual para alumnos, panel docente y panel de administración.

- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind 4
- **Backend:** Express 5 + Mongoose 9 (MongoDB Atlas)
- **Monorepo:** npm workspaces (`apps/web`, `apps/api`, `packages/shared`)

## Requisitos

- Node.js 20+
- npm 10+
- MongoDB Atlas (solo para `APP_MODE=atlas`)

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

Por defecto la API corre en `APP_MODE=mock` (datos en memoria). Para usar Atlas, completá `MONGODB_URI` y `AUTH_SECRET` en `apps/api/.env` y definí `APP_MODE=atlas`.

## Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | Levanta API y web en desarrollo |
| `npm run build` | Build de producción (shared + api + web) |
| `npm run typecheck` | Chequeo de tipos en todos los paquetes |
| `npm test` | Tests de integración de la API |
| `npm run seed:atlas` | Siembra idempotente en MongoDB Atlas |

## Entorno

Las variables se documentan en `apps/api/.env.example` y `apps/web/.env.local.example`. Las credenciales viven únicamente en el backend; el navegador nunca se conecta a Atlas.
