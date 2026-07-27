export const TYPESCRIPT_SYMBOL_QUERY = `
(class_declaration
  name: (type_identifier) @name) @definition.class

(abstract_class_declaration
  name: (type_identifier) @name) @definition.class

(interface_declaration
  name: (type_identifier) @name) @definition.interface

(type_alias_declaration
  name: (type_identifier) @name) @definition.type_alias

(enum_declaration
  name: (identifier) @name) @definition.enum

(internal_module
  name: (_) @name) @definition.scope

(module
  name: (_) @name) @definition.module

(function_declaration
  name: (identifier) @name) @definition.function

(generator_function_declaration
  name: (identifier) @name) @definition.function

(function_signature
  name: (identifier) @name) @definition.function

(method_definition
  name: [
    (property_identifier)
    (private_property_identifier)
  ] @name) @definition.method

(method_signature
  name: [
    (property_identifier)
    (private_property_identifier)
  ] @name) @definition.method

(abstract_method_signature
  name: [
    (property_identifier)
    (private_property_identifier)
  ] @name) @definition.method

(public_field_definition
  name: [
    (property_identifier)
    (private_property_identifier)
  ] @name) @definition.property

(property_signature
  name: [
    (property_identifier)
    (private_property_identifier)
  ] @name) @definition.property

(variable_declarator
  name: (identifier) @name) @definition.binding
`;
