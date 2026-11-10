# Cubing agent guide

Cubing is an independent browser-only product. This repository owns its code, dependencies, build, tests, assets, and deployment. It must remain buildable and deployable without its parent checkout. Never import source or configuration from the parent or share its secrets, runtime, or storage.

Use `npm install`, `npm run dev`, `npm test`, and `npm run build`. Data is stored only in the browser. Deployment is a static site; integration with any showcase is a link to its deployed URL. Do not deploy, publish, or create remotes without separate authorization. Protect existing local solve data.

The Vite production build adapts cubing 0.63.8's worker URL; upgrading cubing requires rechecking that adapter. After changes to the build or cubing dependency, serve `npm run preview`, use an isolated browser context, generate a real scramble and cube diagram, then reload after precaching with network emulated offline and generate another. A successful build alone does not validate worker loading. This smoke test does not prove offline behavior across all browsers.
