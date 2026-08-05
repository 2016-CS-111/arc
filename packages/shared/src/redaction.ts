const sensitiveValuePattern =
  /((?:api[_-]?key|access[_-]?token|client[_-]?secret|password|secret|token)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}&]+)/giu;
const connectionPasswordPattern = /([a-z][a-z0-9+.-]*:\/\/[^:\s/]+:)[^@\s/]+@/giu;
const authorizationHeaderPattern = /(\bauthorization\s*:\s*)(?:Bearer\s+)?[^\s,}&]+/giu;
const bearerTokenPattern = /(\bBearer\s+)[A-Za-z0-9._~+/=-]+/giu;

export function redactSecrets(value: string): string {
  return value
    .replace(connectionPasswordPattern, "$1[REDACTED]@")
    .replace(authorizationHeaderPattern, "$1[REDACTED]")
    .replace(bearerTokenPattern, "$1[REDACTED]")
    .replace(sensitiveValuePattern, "$1[REDACTED]");
}
