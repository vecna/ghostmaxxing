import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Use Playwright's matching browser by default, including on Linux. A system
// browser is an explicit opt-in rather than an automatic distro dependency.
const systemChromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
if (systemChromePath && !existsSync(systemChromePath)) {
  throw new Error(`Chromium executable does not exist: ${systemChromePath}`);
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Real inference uses SwiftShader. Running one browser per CPU core can
  // starve even UI-only tests; --workers remains available as an override.
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: systemChromePath,
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${require('path').join(__dirname, 'tests/fixtures/mock-face.y4m')}`,
            '--autoplay-policy=no-user-gesture-required',
            '--use-angle=swiftshader',
            '--use-gl=angle',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
          ],
        },
        permissions: ['camera', 'microphone'],
      },
    },
  ],
  webServer: {
    command: 'node scripts-dev/static-server.cjs --port 8080 --silent',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },
});
