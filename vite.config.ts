import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Prevent Vite dev server from ever reading Edge Function source files
    fs: {
      deny: ["supabase/functions/**"],
    },
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // Strip console.log and debugger statements in production builds
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      // Never bundle Supabase Edge Functions into the frontend build
      external: [/supabase\/functions/],
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 500,
  },
}));
