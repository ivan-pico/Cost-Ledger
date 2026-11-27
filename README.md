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

La salida queda en `artifacts/economia-familiar/dist/public` (ignorada por git) e
incluye `CNAME` y `404.html` (copia de `index.html`, para el fallback de rutas SPA).

## Despliegue

La app se publica con GitHub Pages en **https://cost-ledger.gohan.cat/** (raíz del
dominio, `BASE_PATH=/`), sirviendo la carpeta `docs/` de la rama `main`. GitHub no
compila nada: el build ya hecho se versiona en `docs/`.

Para publicar una nueva versión:

```sh
pnpm run build:pages   # build con BASE_PATH=/ y copia a docs/ (+ .nojekyll)
git add docs
git commit -m "Update Pages build"
git push origin main
```

`build:pages` borra el contenido anterior de `docs/` y lo sustituye por
`artifacts/economia-familiar/dist/public` (`index.html`, `404.html`, `CNAME`,
`assets/`...) más un `.nojekyll` vacío.

Configuración en GitHub (una sola vez):

- *Settings → Pages → Build and deployment → Source*: **Deploy from a branch**.
- *Branch*: `main`, carpeta **`/docs`**.
- *Custom domain*: `cost-ledger.gohan.cat` y activar **Enforce HTTPS**.
- DNS: `CNAME cost-ledger → ivan-pico.github.io`.
