export const TYPESCRIPT_DEPENDENCY_QUERY = `
(import_statement
  source: (string) @dependency.specifier) @dependency.import

(import_statement
  (import_require_clause
    source: (string) @dependency.specifier)) @dependency.import

(export_statement
  source: (string) @dependency.specifier) @dependency.reexport

(call_expression
  function: (import)
  arguments: (arguments
    (string) @dependency.specifier)) @dependency.dynamic_import

(call_expression
  function: (identifier) @dependency.require_function
  arguments: (arguments
    (string) @dependency.specifier)) @dependency.require
`;
