import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * AC3/AC4 (#2257): two mechanisms confirm or soften an action, `ConfirmDialog` (record deletes go
 * through `DeleteConfirmDialog`) and the Undo toast. This guard fails fast when a client source
 * brings back `window.confirm`, a hand-rolled dialog, a hand-built confirmation on `Modal`, or a
 * Delete / Backspace key handler outside the allowlist.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const CLIENT_SRC = path.join(REPO_ROOT, 'client/src');

/** Files allowed to react to the Delete / Backspace key (the key never deletes a record there). */
const DELETE_KEY_ALLOWLIST: readonly string[] = [
  // Removes the selected annotation shape inside the editor (its own Ctrl+Z), not a record.
  'client/src/components/photos/PhotoAnnotator/PhotoAnnotator.tsx',
  // Draws the key cap in the shortcuts help overlay.
  'client/src/components/KeyboardShortcutsHelp/keyCaps.ts',
];

const MODAL_DIR = 'client/src/components/Modal/';

/**
 * Files that call `useDeleteImpact` directly instead of `DeleteConfirmDialog`: the reference lists
 * (areas, trades, categories, ... through ReferenceList) and the attention list's draft discard.
 */
const DELETE_IMPACT_HOSTS: readonly string[] = [
  'client/src/components/ConfirmDialog/DeleteConfirmDialog.tsx',
  'client/src/hooks/useDeleteImpact.ts',
  'client/src/components/ReferenceList/ReferenceList.tsx',
  'client/src/components/AttentionList/AttentionList.tsx',
];

/** Sources that soften an action with the Undo toast: status changes, unlinks and removes (AC2). */
const UNDO_SITES: readonly string[] = [
  'client/src/hooks/useUndoableStatusChange.ts',
  'client/src/components/RelatedList/RelatedList.tsx',
  'client/src/components/DocumentsPanel/DocumentsPanel.tsx',
  'client/src/components/CostLineTable/CostLinesSection.tsx',
  'client/src/pages/DocumentsPage/DocumentLinkedToList.tsx',
  'client/src/pages/InvoicesPage/InvoiceMarkPaid.tsx',
  'client/src/pages/AreasPage/AreasPage.tsx',
];

const CONFIRM_TITLE_RE = /(discard|overwrite|delete|remove|confirm)[A-Za-z]*Title/i;

interface Finding {
  readonly line: number;
  readonly message: string;
}

const toPosix = (p: string) => p.split(path.sep).join('/');
const rel = (file: string) => toPosix(path.relative(REPO_ROOT, file));

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
      ? [full]
      : [];
  });
}

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function walkNodes(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walkNodes(child, visit));
}

function jsxAttributes(node: ts.JsxOpeningLikeElement): ts.JsxAttribute[] {
  return node.attributes.properties.filter(ts.isJsxAttribute);
}

function attrName(attr: ts.JsxAttribute): string {
  return attr.name.getText();
}

function attrLiteral(attr: ts.JsxAttribute): string | undefined {
  const init = attr.initializer;
  if (init && ts.isStringLiteral(init)) return init.text;
  if (init && ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  }
  return undefined;
}

const KEY_NAMES = new Set(['Delete', 'Backspace']);

/** (a) `window.confirm` / `globalThis.confirm` / `self.confirm` calls. */
function findNativeConfirm(sf: ts.SourceFile): Finding[] {
  const out: Finding[] = [];
  walkNodes(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return;
    const { expression, name } = n.expression;
    if (name.text === 'confirm' && ts.isIdentifier(expression)) {
      if (['window', 'globalThis', 'self'].includes(expression.text)) {
        out.push({
          line: lineOf(sf, n),
          message: `${expression.text}.confirm is banned: use ConfirmDialog (or DeleteConfirmDialog for a record delete), or an Undo toast`,
        });
      }
    }
  });
  return out;
}

/** (b) Intrinsic (lowercase) JSX element with a literal dialog role or an `aria-modal` attribute. */
function findHandRolledDialog(sf: ts.SourceFile): Finding[] {
  const out: Finding[] = [];
  walkNodes(sf, (n) => {
    if (!ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) return;
    const tag = n.tagName.getText();
    if (!/^[a-z]/.test(tag)) return;
    for (const attr of jsxAttributes(n)) {
      const name = attrName(attr);
      const literal = attrLiteral(attr);
      if (
        name === 'aria-modal' ||
        (name === 'role' && (literal === 'dialog' || literal === 'alertdialog'))
      ) {
        out.push({
          line: lineOf(sf, attr),
          message: `<${tag}> hand-rolls a dialog (${name}): use Modal, AnchoredPanel (popover) or ConfirmDialog instead`,
        });
      }
    }
  });
  return out;
}

/** (c) Comparing a key to 'Delete' / 'Backspace' (`===`, `==`, `!==`, `case`). */
function findDeleteKeyHandling(sf: ts.SourceFile): Finding[] {
  const out: Finding[] = [];
  const isKeyLiteral = (n: ts.Node) =>
    (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && KEY_NAMES.has(n.text);
  walkNodes(sf, (n) => {
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      const isEquality =
        op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        op === ts.SyntaxKind.EqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsToken;
      if (isEquality && (isKeyLiteral(n.left) || isKeyLiteral(n.right))) {
        out.push({
          line: lineOf(sf, n),
          message:
            'a Delete / Backspace key comparison: a list row never deletes on a key press; the key may only open a ConfirmDialog from a detail page shortcut registry',
        });
      }
    } else if (ts.isCaseClause(n) && isKeyLiteral(n.expression)) {
      out.push({
        line: lineOf(sf, n),
        message:
          'a case on the Delete / Backspace key: a list row never deletes on a key press; use the shortcut registry to open a ConfirmDialog',
      });
    }
  });
  return out;
}

/** (d) A `<Modal>` used as a hand-built confirmation. */
function findHandBuiltConfirmation(sf: ts.SourceFile): Finding[] {
  const out: Finding[] = [];
  walkNodes(sf, (n) => {
    if (!(ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))) return;
    if (n.tagName.getText() !== 'Modal') return;
    for (const attr of jsxAttributes(n)) {
      const name = attrName(attr);
      const text = attr.initializer?.getText(sf) ?? '';
      if (name === 'title' && CONFIRM_TITLE_RE.test(text)) {
        out.push({
          line: lineOf(sf, attr),
          message: `<Modal title=${text}> is a hand-built confirmation: use ConfirmDialog (DeleteConfirmDialog for a record delete)`,
        });
      }
      const submitsAForm = /\bform=|type="submit"/.test(text);
      if (
        name === 'footer' &&
        !submitsAForm &&
        /btn(Primary|Danger)/.test(text) &&
        /btnSecondary/.test(text)
      ) {
        out.push({
          line: lineOf(sf, attr),
          message:
            '<Modal footer> pairs a primary/danger button with a secondary one: that is a hand-built confirmation, use ConfirmDialog',
        });
      }
    }
  });
  return out;
}

/** (e) A direct `useDeleteImpact(...)` call outside the hosts that own it. */
function findDirectDeleteImpact(sf: ts.SourceFile): Finding[] {
  const out: Finding[] = [];
  walkNodes(sf, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'useDeleteImpact'
    ) {
      out.push({
        line: lineOf(sf, n),
        message:
          'useDeleteImpact is called directly: render DeleteConfirmDialog so the title and the server counts are the same from a list and from the record page',
      });
    }
  });
  return out;
}

function scan(): { file: string; finding: Finding }[] {
  const hits: { file: string; finding: Finding }[] = [];
  for (const full of walk(CLIENT_SRC)) {
    const file = rel(full);
    const sf = parse(full, fs.readFileSync(full, 'utf8'));
    const rules: Finding[][] = [findNativeConfirm(sf)];
    if (!file.startsWith(MODAL_DIR)) rules.push(findHandRolledDialog(sf));
    if (!DELETE_KEY_ALLOWLIST.includes(file)) rules.push(findDeleteKeyHandling(sf));
    if (!file.startsWith(MODAL_DIR)) rules.push(findHandBuiltConfirmation(sf));
    if (!DELETE_IMPACT_HOSTS.includes(file)) rules.push(findDirectDeleteImpact(sf));
    for (const finding of rules.flat()) hits.push({ file, finding });
  }
  return hits;
}

const report = (hits: { file: string; finding: Finding }[]) =>
  hits.map(({ file, finding }) => `${file}:${finding.line}: ${finding.message}`);

const fixture = (code: string) => parse('fixture.tsx', code);

describe('confirmation sweep guard (#2257)', () => {
  describe('the client sources', () => {
    const hits = scan();

    it('never calls window.confirm', () => {
      expect(report(hits.filter((h) => h.finding.message.includes('.confirm is banned')))).toEqual(
        [],
      );
    });

    it('never hand-rolls a dialog outside components/Modal', () => {
      expect(report(hits.filter((h) => h.finding.message.includes('hand-rolls a dialog')))).toEqual(
        [],
      );
    });

    it('never reacts to the Delete or Backspace key outside the allowlist', () => {
      expect(report(hits.filter((h) => /Delete \/ Backspace/.test(h.finding.message)))).toEqual([]);
    });

    it('never builds a confirmation from a raw Modal', () => {
      expect(report(hits.filter((h) => /hand-built confirmation/.test(h.finding.message)))).toEqual(
        [],
      );
    });

    it('renders record deletes through DeleteConfirmDialog, not a hand-assembled dialog', () => {
      expect(
        report(hits.filter((h) => /useDeleteImpact is called directly/.test(h.finding.message))),
      ).toEqual([]);
    });

    it('keeps the status-change, unlink and remove sites on the Undo toast (AC2)', () => {
      const missing = UNDO_SITES.filter(
        (file) =>
          !/showUndoToast|runStatusChange|useUndoableStatusChange/.test(
            fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'),
          ),
      );
      expect(missing).toEqual([]);
    });

    it('keeps the allowlists pointing at files that exist', () => {
      for (const file of [...DELETE_KEY_ALLOWLIST, ...DELETE_IMPACT_HOSTS, ...UNDO_SITES]) {
        expect(fs.existsSync(path.join(REPO_ROOT, file))).toBe(true);
      }
    });

    it('scans a real tree (not vacuous)', () => {
      expect(walk(CLIENT_SRC).length).toBeGreaterThan(200);
    });
  });

  describe('matchers (self-test: no rule is vacuous)', () => {
    it('(a) matches window/globalThis/self confirm and ignores other calls', () => {
      expect(findNativeConfirm(fixture('window.confirm("x");'))).toHaveLength(1);
      expect(findNativeConfirm(fixture('globalThis.confirm("x");'))).toHaveLength(1);
      expect(findNativeConfirm(fixture('self.confirm("x");'))).toHaveLength(1);
      expect(findNativeConfirm(fixture('dialog.confirm("x"); other.confirm("y");'))).toHaveLength(
        0,
      );
    });

    it('(b) matches intrinsic elements with a dialog role or aria-modal', () => {
      expect(findHandRolledDialog(fixture('const a = <div role="dialog">x</div>;'))).toHaveLength(
        1,
      );
      expect(findHandRolledDialog(fixture("const a = <div role={'alertdialog'} />;"))).toHaveLength(
        1,
      );
      expect(
        findHandRolledDialog(fixture('const a = <section aria-modal="true" />;')),
      ).toHaveLength(1);
      expect(
        findHandRolledDialog(fixture('const a = <AnchoredPanel role="dialog" />;')),
      ).toHaveLength(0);
      expect(findHandRolledDialog(fixture('const a = <div role="list" />;'))).toHaveLength(0);
      expect(findHandRolledDialog(fixture('const a = <div role={r} />;'))).toHaveLength(0);
    });

    it('(c) matches key comparisons and cases, not shortcut registrations', () => {
      expect(findDeleteKeyHandling(fixture("if (e.key === 'Delete') go();"))).toHaveLength(1);
      expect(findDeleteKeyHandling(fixture("if ('Backspace' == e.key) go();"))).toHaveLength(1);
      expect(findDeleteKeyHandling(fixture("if (e.key !== 'Delete') go();"))).toHaveLength(1);
      expect(findDeleteKeyHandling(fixture("switch (k) { case 'Delete': break; }"))).toHaveLength(
        1,
      );
      expect(
        findDeleteKeyHandling(fixture("const s = { key: 'Delete', handler: openDelete };")),
      ).toHaveLength(0);
      expect(findDeleteKeyHandling(fixture("if (e.key === 'Enter') go();"))).toHaveLength(0);
    });

    it('(e) matches a direct useDeleteImpact call, not a mere mention', () => {
      expect(
        findDirectDeleteImpact(fixture("const c = useDeleteImpact('area', id);")),
      ).toHaveLength(1);
      expect(
        findDirectDeleteImpact(fixture("import { useDeleteImpact } from './x.js';")),
      ).toHaveLength(0);
      expect(findDirectDeleteImpact(fixture('const c = other.useDeleteImpact(1);'))).toHaveLength(
        0,
      );
    });

    it('(d) matches a Modal titled like a confirmation or with a primary+secondary footer', () => {
      expect(
        findHandBuiltConfirmation(fixture("const a = <Modal title={t('discardConfirmTitle')} />;")),
      ).toHaveLength(1);
      expect(
        findHandBuiltConfirmation(
          fixture("const a = <Modal title={t('aiOverwriteConfirmTitle')} />;"),
        ),
      ).toHaveLength(1);
      expect(
        findHandBuiltConfirmation(
          fixture(
            'const a = <Modal title="x" footer={<><button className={s.btnSecondary} /><button className={s.btnPrimary} /></>} />;',
          ),
        ),
      ).toHaveLength(1);
      expect(
        findHandBuiltConfirmation(
          fixture('const a = <Modal title="x" footer={<button className={s.btnPrimary} />} />;'),
        ),
      ).toHaveLength(0);
      // A form dialog (Cancel + Save submitting a form) is not a confirmation.
      expect(
        findHandBuiltConfirmation(
          fixture(
            'const a = <Modal title="x" footer={<><button className={s.btnSecondary} /><button type="submit" form="f" className={s.btnPrimary} /></>} />;',
          ),
        ),
      ).toHaveLength(0);
      expect(
        findHandBuiltConfirmation(fixture("const a = <Modal title={t('editTitle')} />;")),
      ).toHaveLength(0);
      expect(
        findHandBuiltConfirmation(fixture("const a = <Other title={t('deleteTitle')} />;")),
      ).toHaveLength(0);
    });
  });
});
