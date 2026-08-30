# Next steps — Galactic Firefight

The game, guest saves, sprite battlefield, and Megazear identity client are in this repo. Source: [https://github.com/megazear7/galactic-firefight](https://github.com/megazear7/galactic-firefight). Remaining work is operator setup on your accounts.

Production URL: [https://galactic-firefight.megazear7.com](https://galactic-firefight.megazear7.com)

## 1. Hosting on Netlify

Nitro uses the `netlify` preset when `NETLIFY` or `NITRO_PRESET=netlify` is set (`vite.config.ts` + `netlify.toml`).

- Build command: `npm run build`
- Publish directory: `dist`
- Node 22

DNS: `galactic-firefight.megazear7.com` CNAME → the Netlify site hostname. Add the custom domain in Netlify → Domain management.

If dashboard Build settings still say publish `.vercel/output/static` or a `/* → /index.html` redirect, clear those so `netlify.toml` wins, then trigger a new deploy.

Guest play works with no keys. Identity is required for cross-device saves and multiplayer.

## 2. Megazear identity environment variables

Follow [megazear-users README](https://github.com/megazear7/megazear-users). This app copies `src/client.ts` to `src/lib/identity/megazear-users.ts` and uses app slug `galactic-firefight`.

1. **Auth0** → Applications → **Create Application** (SPA) named `Galactic Firefight`.
2. Allowed Callback URLs, Logout URLs, Web Origins, CORS:
   - `https://galactic-firefight.megazear7.com`
   - `http://localhost:8080`
3. Authorization: audience `https://identity.megazear7.com`.
4. **Netlify env vars** (Site configuration → Environment variables). All must be `VITE_`-prefixed so the browser build can read them:

   | Variable | Value |
   | --- | --- |
   | `VITE_AUTH0_DOMAIN` | Tenant host (`login.megazear7.com` or `YOUR_TENANT.us.auth0.com`) |
   | `VITE_AUTH0_CLIENT_ID` | This SPA’s client id |
   | `VITE_AUTH0_AUDIENCE` | `https://identity.megazear7.com` |
   | `VITE_IDENTITY_URL` | `https://identity.megazear7.com/data` |

5. **Identity service (`identity.megazear7.com`)** → add `https://galactic-firefight.megazear7.com` to `AUTHORIZED_ORIGINS` (comma-separated, no trailing slash). **Redeploy identity.**
6. Optional: add a catalog entry in `megazear-users/src/catalog.ts` for slug `galactic-firefight` (name, href `https://galactic-firefight.megazear7.com`).
7. Redeploy Firefight. Sign in, start a skirmish, confirm it appears on another browser under the same Auth0 user. For multiplayer, create an invite, admit the guest email if needed, and confirm turns persist under the **host** `shared/games/{id}/state` document.

Leave the vars unset for local/guest-only play (localStorage).

## 3. 3D models

Graphics settings already toggle **Image sprites** vs **3D models**. Models are geometric stand-ins. To plug in glTF:

1. Drop files under `public/assets/models/{unit}.glb` (captain, soldier, machine_gunner, sniper, tyrant, broodling, spatling).
2. Fill `MODEL_URLS` in `src/components/game/PlaceholderModel.tsx` (or a small `src/game/models.ts`) and load with drei `useGLTF`.
3. Keep the same footprint and facing (+X forward in unit local space).

## 4. GitHub

Repo: [https://github.com/megazear7/galactic-firefight](https://github.com/megazear7/galactic-firefight)

Connect the Netlify site to this repo so deploys follow `main`.
