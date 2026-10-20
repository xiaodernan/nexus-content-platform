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
  return record[1]
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
