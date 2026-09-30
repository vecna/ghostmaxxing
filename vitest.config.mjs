import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js'],
    setupFiles: ['tests/unit/setup.js'],
    coverage: {
      reporter: ['html', 'text', 'json', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
});
