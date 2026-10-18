import {defineConfig} from 'vite';
import bundleAudioWorklet from 'vite-plugin-bundle-audioworklet';
export default defineConfig({
  root: 'public',
  plugins: [bundleAudioWorklet()],
  build: {outDir: '../dist', emptyOutDir: true, target: 'esnext', rollupOptions:{input:{main:'public/index.html',deck:'public/deck.html'}}},
});
