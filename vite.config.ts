import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, pathToFileURL } from 'node:url';

export default defineConfig({
  worker: { format: 'es' },
  plugins: [
    {
      name: 'cubing-worker-url',
      apply: 'build',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('/cubing/') || !code.includes('function searchWorkerURLImportMetaResolve()')) return;
        const original = 'return import.meta.resolve("./search-worker-entry.js");';
        if (!code.includes(original)) throw new Error('cubing worker URL changed; revalidate production scramble generation');
        // cubing 0.63.8's import.meta.resolve is not rewritten by Vite; bundle the module worker and its dynamic imports instead.
        const worker = fileURLToPath(new URL('./search-worker-entry.js', pathToFileURL(id)));
        return `import cubingWorkerURL from ${JSON.stringify(`${worker}?worker&url`)};\n` + code.replace(original, 'return cubingWorkerURL;');
      },
    },
    react(), VitePWA({ registerType: 'autoUpdate', manifest: false }),
  ],
});
