const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function write(level, event, fields = {}) {
  if ((LEVELS[level] ?? 20) < (LEVELS[process.env.LOG_LEVEL] ?? 20)) return;
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level,
    event,
    ...fields
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event, fields) => write('debug', event, fields),
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields)
};
