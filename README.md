# Rozenblum

Plataforma de cursos del Estudio Jurídico Rozenblum.

- `api/`: API Express, integración con Atlas, Cloudinary y Mercado Pago; `api/shared/` contiene los contratos usados también por la web.
- `web/`: aplicación Next.js.

## Desarrollo

Requiere Node.js 22 y pnpm 9.15.9. Copiá `api/.env.example` a `api/.env` y `web/.env.local.example` a `web/.env.local`; completá los valores privados solo en tu equipo o en el proveedor de hosting.

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

`pnpm run dev` inicia ambos servicios y el túnel local para Mercado Pago. `pnpm --dir api run dev` y `pnpm --dir web run dev` permiten iniciarlos por separado. Para verificar cambios: `pnpm run typecheck`, `pnpm test`, `pnpm run build` y `pnpm audit`.

## Despliegue

Render: servicio web Node desde la raíz del repositorio. Build: `pnpm install --frozen-lockfile && pnpm run build:shared && pnpm --dir api run build`. Start: `pnpm --dir api run start`. Configurá las variables de `api/.env.example` en Render, con `NODE_ENV=production`, `CORS_ORIGIN` igual al origen HTTPS de Vercel y las URL públicas de Mercado Pago.

Vercel: proyecto Next.js con Root Directory `web`. Build Command: `pnpm --dir ../api/shared run build && pnpm run build`. Configurá `NEXT_PUBLIC_API_URL` con la URL HTTPS de Render, sin barra final.

Los archivos `.env` y las carpetas de dependencias y compilación están ignorados por Git.
