# React + Vite

## Mywork API

Authenticated server API: see [API.md](./API.md). Run `npm run test:api` for
security/route tests and `npm run dev:api` for the local API on port 8788.
Use `.dev.vars.example` for server configuration; secrets must never use VITE_.
For another AI/client, share [AI-API-GUIDE.md](./AI-API-GUIDE.md) and provision
only its bot key separately. `npm run test:api:integration` performs read-only
checks against the configured database; never share `.dev.vars`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## 📝 Project Notes (Obsidian)

Maklumat penuh projek ni — status, deployment, warnings & sejarah kerja — disimpan dalam Obsidian vault:

```
~/Obsidian/01_Projects/mywork.md
```
