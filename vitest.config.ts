import { defineConfig } from 'vitest/config';

// Convention: tests live in top-level test/, mirroring src/ paths (test/core/run.test.ts
// for src/core/run.ts). Only Phaser-free modules are unit-testable this way — anything
// that imports Phaser (directly or transitively) needs a browser and belongs in the
// headless Playwright checks (scripts/verify.mjs), not here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
