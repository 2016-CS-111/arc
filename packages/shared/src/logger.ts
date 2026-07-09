export type LogContext = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

type LogLevel = keyof Logger;

export function createConsoleLogger(scope: string): Logger {
  const format = (level: LogLevel, message: string, context?: LogContext): string => {
    const base = `[${new Date().toISOString()}] ${level.toUpperCase()} ${scope}: ${message}`;
    return context === undefined ? base : `${base} ${JSON.stringify(context)}`;
  };

  return {
    debug: (message, context) => {
      console.debug(format("debug", message, context));
    },
    info: (message, context) => {
      console.info(format("info", message, context));
    },
    warn: (message, context) => {
      console.warn(format("warn", message, context));
    },
    error: (message, context) => {
      console.error(format("error", message, context));
    },
  };
}
