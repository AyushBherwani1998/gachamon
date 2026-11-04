import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NETWORK: 'mainnet',
      DATABASE_PATH: ':memory:',
    },
  },
});
