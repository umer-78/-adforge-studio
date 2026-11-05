import pino from 'pino';

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'adforge-worker' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: ['*.accessToken', '*.apiKey', '*.authorization', '*.token'], censor: '[redacted]' },
});

export type Logger = pino.Logger;
