// NEXUS M9 — the shared READER for the wire contracts.
//
// Two claims, two languages, one question: do the field names on the wire and the field names in the
// client AGREE? The reader answers it by reading BOTH sides out of their own sources:
//
//   - a Java `record`'s field list, parsed from the Java;
//   - a TypeScript interface's field list, parsed with the TypeScript COMPILER's own parser.
//
// Why read the sources instead of restating the lists? A proof that compares a hand-written list with a
// hand-written list proves only that two people typed the same thing. Every contract proof in this
// repository reads its field lists out of the sources, so a change on either side has to change the
// other.
//
// ONE reader, shared by the proofs: two copies of a reader is two places for a reader to be wrong, and
// the whole point of these proofs is that a reader is checked.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export function tsParseErrors(file) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  return (sf.parseDiagnostics ?? []).map((d) => ({
    code: d.code,
    message: String(d.messageText),
    start: d.start ?? 0,
  }));
}

export function tsExportedFunctionNames(file) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const out = new Set();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      out.add(node.name.text);
    }
    if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const d of node.declarationList.declarations) {
        if (d.name && ts.isIdentifier(d.name)) out.add(d.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (out.size === 0) {
    throw new Error(`${file} exports no functions or const bindings — the reader found nothing to grade`);
  }
  return out;
}

/**
 * The field names of a Java `record`, read out of the source.
 *
 * @param {string} file the Java file
 * @param {string} recordName the record's simple name
 * @returns {{type: string, name: string}[]} the fields, in the order they are declared
 */
export function javaRecordFields(file, recordName) {
  const src = readFileSync(file, 'utf8');
  const record = new RegExp(`public\\s+record\\s+${recordName}\\s*\\(([\\s\\S]*?)\\)\\s*\\{`).exec(src);
  if (!record) {
    throw new Error(`the record ${recordName} was not found in ${file} \u2014 the contract this proof grades has MOVED`);
  }
  const out = record[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^([A-Za-z_][\w.<>\[\]]*)\s+([A-Za-z_]\w*)$/.exec(s);
      if (!m) {
        throw new Error(`the wire field "${s}" is not in the shape "Type name" \u2014 the proof must know how to read it`);
      }
      return { type: m[1], name: m[2] };
    });
  if (out.length === 0) {
    throw new Error(`the record ${recordName} in ${file} read zero fields — the wire contract this proof grades has MOVED or the reader is blind to this record's shape`);
  }
  return out;
}

/**
 * Whether each field in a Java `record` is nullable (reference type, not primitive).
 *
 * @param {string} file the Java file
 * @param {string} recordName the record's simple name
 * @returns {Map<string, boolean>} field name -> true if nullable
 */
export function javaRecordFieldNullability(file, recordName) {
  const fields = javaRecordFields(file, recordName);
  const PRIMITIVE_TYPES = new Set(['long', 'int', 'boolean', 'double', 'float', 'short', 'byte', 'char']);
  const out = new Map();
  for (const f of fields) out.set(f.name, !PRIMITIVE_TYPES.has(f.type));
  return out;
}

/**
 * The field names of a TypeScript interface, read with the compiler's own parser.
 *
 * @param {string} file the TypeScript file
 * @param {string} interfaceName the interface's name
 * @returns {string[]} the field names, in the order they are declared
 */
export function tsInterfaceFields(file, interfaceName) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  let found = null;
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) {
    throw new Error(`the interface ${interfaceName} was not found in ${file} \u2014 the contract this proof grades has MOVED`);
  }
  return found.members
    .filter((m) => ts.isPropertySignature(m) && m.name)
    .map((m) => m.name.getText(sf));
}

/**
 * The TS type written for each field in a TypeScript interface, read with the compiler's parser.
 *
 * @param {string} file the TypeScript file
 * @param {string} interfaceName the interface's name
 * @returns {Map<string, string>} field name -> type text
 */
export function tsInterfaceFieldTypes(file, interfaceName) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  let found = null;
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) {
    throw new Error(`the interface ${interfaceName} was not found in ${file} — the contract this proof grades has MOVED`);
  }
  const out = new Map();
  for (const m of found.members) {
    if (ts.isPropertySignature(m) && m.name && m.type) out.set(m.name.getText(sf), m.type.getText(sf));
  }
  return out;
}

/**
 * Whether each field in a TypeScript interface is optional (has `?`), read with the compiler's parser.
 *
 * @param {string} file the TypeScript file
 * @param {string} interfaceName the interface's name
 * @returns {Map<string, boolean>} field name -> true if optional
 */
export function tsInterfaceFieldOptionality(file, interfaceName) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  let found = null;
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) {
    throw new Error(`the interface ${interfaceName} was not found in ${file} \u2014 the contract this proof grades has MOVED`);
  }
  const out = new Map();
  for (const m of found.members) {
    if (ts.isPropertySignature(m) && m.name) out.set(m.name.getText(sf), !!m.questionToken);
  }
  return out;
}

/**
 * The duplicated field names in a TypeScript interface, if any.
 *
 * @param {string} file the TypeScript file
 * @param {string} interfaceName the interface's name
 * @returns {string[]} field names that appear more than once
 */
export function tsInterfaceDuplicateFields(file, interfaceName) {
  const names = tsInterfaceFields(file, interfaceName);
  const seen = new Map();
  for (const n of names) seen.set(n, (seen.get(n) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name);
}

/**
 * The two sides of a contract, checked against each other.
 *
 * The rule is symmetric on purpose: a client that reads a field the service does not send reads nothing
 * (and a reader that DROPS such a row would drop it silently), and a field the service sends that the
 * client never reads is a field that arrives and is thrown away. Both are the same drift seen from two
 * sides.
 *
 * @param {string[]} wire the fields the service sends
 * @param {string[]} client the fields the client declares
 * @param {string} label what is being graded, for the message
 */
export function assertSameFields(wire, client, label) {
  for (const name of client) {
    if (!wire.includes(name)) {
      throw new Error(
        `${label}: the client reads "${name}", which the service does NOT send \u2014 the service's wire record has ${wire.join(', ')}`,
      );
    }
  }
  for (const name of wire) {
    if (!client.includes(name)) {
      throw new Error(
        `${label}: the service sends "${name}" and the client never reads it \u2014 it would arrive and be dropped without saying so`,
      );
    }
  }
}
