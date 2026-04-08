import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.{js,ts}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/js/mv3/**/*.{js,ts}'],
            exclude: ['src/js/mv3/sw-entry.{js,ts}']
        }
    }
});
