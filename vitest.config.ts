import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts'],
    env: { MC_DATA_DIR: path.join(os.tmpdir(), `multicatan-test-${process.pid}`) },
  },
});
