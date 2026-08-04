export const JAVASCRIPT_SYMBOL_QUERY = `
(class_declaration
  name: (identifier) @name) @definition.class

(function_declaration
  name: (identifier) @name) @definition.function

(generator_function_declaration
  name: (identifier) @name) @definition.function

(method_definition
  name: [
    (property_identifier)
    (private_property_identifier)
  ] @name) @definition.method

(field_definition
  property: [
    (property_identifier)
    (private_property_identifier)
  ] @name) @definition.property

(variable_declarator
  name: (identifier) @name) @definition.binding
`;
