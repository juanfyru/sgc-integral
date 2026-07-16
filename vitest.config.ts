import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // El mismo alias @/ → src/ de tsconfig.json.
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
