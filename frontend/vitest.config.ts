import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Pruebas de la lógica del frontend (src/lib y los efectos de src/components/fx).
 * Las pantallas (.tsx) se validan en el navegador y quedan fuera de la cobertura,
 * igual que en sonar-project.properties.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/lib/**/*.ts', 'src/components/fx/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/types.ts', 'src/lib/hooks.ts'],
    },
  },
});
