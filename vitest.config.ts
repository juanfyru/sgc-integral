import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // El mismo alias @/ → src/ de tsconfig.json.
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    // `output: 'standalone'` copia toda la app (tests incluidos) a
    // .next/standalone; sin esto vitest correría cada test dos veces.
    exclude: [...configDefaults.exclude, ".next/**"],
    // Los tests de BD comparten la misma BD dev; sin esto, vitest corre los
    // archivos en paralelo y los fixtures de un test (docs, eventos) son
    // visibles para los lectores concurrentes de otro, ensuciando sus
    // aserciones de conteo. Secuencial → cada afterAll limpia antes del
    // siguiente archivo.
    fileParallelism: false,
  },
});
