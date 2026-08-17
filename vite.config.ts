import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the same build works whether it is served from a
  // domain root or from a project subdirectory like GitHub Pages gives you.
  base: './',
  build: {
    // The game generates every texture and sound at runtime, so the bundle is
    // all there is; splitting it would only add round trips.
    chunkSizeWarningLimit: 1200,
  },
});
