import { TYPESCRIPT_FRAMEWORK_EVIDENCE_QUERY } from "./typescript-framework-evidence.query.js";

export const TYPESCRIPT_REACT_FRAMEWORK_EVIDENCE_QUERY = `
${TYPESCRIPT_FRAMEWORK_EVIDENCE_QUERY}

(jsx_opening_element) @framework.jsx

(jsx_self_closing_element) @framework.jsx
`;
