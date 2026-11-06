import pino from 'pino';

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'adforge-worker' },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Hosts such as Railway read the level as a word to colour errors; pino writes numbers by default.
  formatters: { level: (label) => ({ level: label === 'fatal' ? 'error' : label === 'trace' ? 'debug' : label }) },
  redact: { paths: ['*.accessToken', '*.apiKey', '*.authorization', '*.token'], censor: '[redacted]' },
});

export type Logger = pino.Logger;
