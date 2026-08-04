export const JAVASCRIPT_FRAMEWORK_EVIDENCE_QUERY = `
(decorator) @framework.decorator

(call_expression) @framework.call

(class_declaration) @framework.class

(expression_statement
  (string)) @framework.directive

(jsx_opening_element) @framework.jsx

(jsx_self_closing_element) @framework.jsx
`;
