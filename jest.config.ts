import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  maxWorkers: 1,
  testTimeout: 30000,
  globalSetup: '<rootDir>/src/support/globalSetup.ts',
  globalTeardown: '<rootDir>/src/support/globalTeardown.ts',
  setupFilesAfterEnv: ['<rootDir>/src/support/matchers.ts'],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'reports', outputName: 'junit.xml', classNameTemplate: '{classname}', titleTemplate: '{title}' }],
    ['jest-html-reporters', { publicPath: 'reports/html', filename: 'index.html', includeFailureMsg: true, includeConsoleLog: true, pageTitle: 'Todoist API tests' }],
  ],
};

export default config;
