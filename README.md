# Casa en orden (Cost-Ledger)

Aplicación web privada para registrar gastos e ingresos familiares. No tiene backend:
los datos se guardan cifrados en el navegador. El código de la app está en
`artifacts/economia-familiar` (React + Vite + TypeScript, monorepo pnpm).

## Desarrollo

```sh
pnpm install
pnpm --filter @workspace/economia-familiar run dev
```

## Build

```sh
BASE_PATH=/ pnpm --filter @workspace/economia-familiar run build
```

La salida queda en `artifacts/economia-familiar/dist/public` e incluye `CNAME`
y `404.html` (copia de `index.html`, para el fallback de rutas SPA).

## Despliegue

La app se publica con GitHub Pages en **https://cost-ledger.gohan.cat/** (raíz del
dominio, `BASE_PATH=/`). El workflow `.github/workflows/deploy-pages.yml` construye y
despliega automáticamente en cada push a `main` (también se puede lanzar a mano con
*Run workflow*).

Configuración necesaria en GitHub (una sola vez):

- *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
- *Custom domain*: `cost-ledger.gohan.cat` y activar **Enforce HTTPS**.
- DNS: `CNAME cost-ledger → ivan-pico.github.io`.
