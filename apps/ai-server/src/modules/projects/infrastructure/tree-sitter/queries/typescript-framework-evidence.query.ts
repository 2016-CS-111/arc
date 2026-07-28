export const TYPESCRIPT_FRAMEWORK_EVIDENCE_QUERY = `
(decorator) @framework.decorator

(call_expression) @framework.call

(class_declaration) @framework.class

(abstract_class_declaration) @framework.class

(expression_statement
  (string)) @framework.directive
`;
