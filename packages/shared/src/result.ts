export type Result<TValue, TError extends Error = Error> =
  | {
      readonly ok: true;
      readonly value: TValue;
    }
  | {
      readonly ok: false;
      readonly error: TError;
    };

export function success<TValue>(value: TValue): Result<TValue, never> {
  return {
    ok: true,
    value,
  };
}

export function failure<TError extends Error>(error: TError): Result<never, TError> {
  return {
    ok: false,
    error,
  };
}
