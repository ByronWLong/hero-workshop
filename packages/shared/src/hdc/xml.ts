/**
 * Lossless XML tree for HDC files.
 *
 * Hero Designer files carry many attributes Hero Workshop never interprets, and downstream
 * consumers (notably the hero6e Foundry VTT system) depend on them. This parser keeps every
 * byte of the source: attribute order, quoting, raw (escaped) values, whitespace and
 * comments. An unmodified tree serializes back to the exact input string; edits only
 * re-escape the values they touch.
 *
 * Dependency-free so it runs unchanged in Node (tests, scripts) and the browser (Foundry).
 */

export type XmlNode = XmlElement | XmlText | XmlRaw;

export interface XmlAttr {
  name: string;
  /** Decoded value */
  value: string;
  /** Source text between the quotes; dropped when the value is changed */
  raw?: string;
  quote: '"' | "'";
  /** Whitespace preceding the attribute name */
  lead: string;
  /** Source text between the name and the opening quote, e.g. "=" or " = " */
  eq: string;
}

export class XmlText {
  readonly type = 'text';
  constructor(public raw: string) {}

  get value(): string {
    return decodeEntities(this.raw);
  }

  set value(v: string) {
    this.raw = escapeText(v);
  }

  get isWhitespace(): boolean {
    return /^\s*$/.test(this.raw);
  }
}

/** Comments, CDATA, processing instructions and doctype: preserved verbatim */
export class XmlRaw {
  readonly type = 'raw';
  constructor(
    public raw: string,
    public kind: 'comment' | 'cdata' | 'pi' | 'doctype',
  ) {}

  /** Text contribution of this node (CDATA only) */
  get textValue(): string {
    return this.kind === 'cdata' ? this.raw.slice(9, -3) : '';
  }
}

export class XmlElement {
  readonly type = 'element';
  attrs: XmlAttr[] = [];
  children: XmlNode[] = [];
  parent: XmlElement | null = null;
  selfClosing = false;
  /** Whitespace before ">" or "/>" in the start tag */
  openTail = '';
  /** Text between "</name" and ">" in the end tag */
  closeTail = '';
  /** Start-tag spacing was not taken from source (created, or collapsed to self-closing) */
  synthetic = false;

  constructor(public name: string) {}

  // ---------------------------------------------------------------------------
  // Attributes
  // ---------------------------------------------------------------------------

  getAttr(name: string): string | undefined {
    return this.attrs.find((a) => a.name === name)?.value;
  }

  hasAttr(name: string): boolean {
    return this.attrs.some((a) => a.name === name);
  }

  /** Sets an attribute; a no-op when the decoded value is unchanged so source bytes survive */
  setAttr(name: string, value: string | number | boolean): this {
    const str = String(value);
    const existing = this.attrs.find((a) => a.name === name);
    if (existing) {
      if (existing.value !== str) {
        existing.value = str;
        existing.raw = undefined;
      }
    } else {
      this.attrs.push({ name, value: str, quote: '"', lead: ' ', eq: '=' });
    }
    return this;
  }

  removeAttr(name: string): boolean {
    const index = this.attrs.findIndex((a) => a.name === name);
    if (index < 0) return false;
    this.attrs.splice(index, 1);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Children
  // ---------------------------------------------------------------------------

  elements(name?: string): XmlElement[] {
    return this.children.filter(
      (c): c is XmlElement => c.type === 'element' && (name === undefined || c.name === name),
    );
  }

  firstElement(name: string): XmlElement | undefined {
    return this.children.find((c): c is XmlElement => c.type === 'element' && c.name === name);
  }

  /** Depth-first walk over descendant elements (excluding this) */
  *descendants(): Generator<XmlElement> {
    for (const child of this.children) {
      if (child.type === 'element') {
        yield child;
        yield* child.descendants();
      }
    }
  }

  get text(): string {
    return this.children
      .map((c) => (c.type === 'text' ? c.value : c.type === 'raw' ? c.textValue : c.text))
      .join('');
  }

  /** Replaces all content with a single text node (or nothing, for an empty string) */
  set text(value: string) {
    if (this.text === value) return;
    for (const child of this.children) if (child.type === 'element') child.parent = null;
    this.children = value ? [new XmlText(escapeText(value))] : [];
    this.markSelfClosing(value === '');
  }

  private markSelfClosing(selfClosing: boolean): void {
    if (selfClosing && !this.selfClosing) this.synthetic = true;
    // "<X />" gaining content must not become "<X >"
    if (!selfClosing && this.selfClosing && !this.synthetic) this.openTail = '';
    this.selfClosing = selfClosing;
  }

  /**
   * Appends a child element, matching the indentation of existing siblings.
   * Freshly-built subtrees (no whitespace nodes) are pretty-printed to fit in.
   */
  appendElement(child: XmlElement, before?: XmlElement): XmlElement {
    child.parent = this;
    const unit = detectIndentUnit(this);
    const ownIndent = indentOf(this);
    const childIndent = ownIndent + unit;
    formatFresh(child, childIndent, unit);

    const hasElementChildren = this.children.some((c) => c.type === 'element');
    if (!hasElementChildren && this.children.every((c) => c.type === 'text' && c.isWhitespace)) {
      this.children = [new XmlText('\n' + childIndent), child, new XmlText('\n' + ownIndent)];
      this.selfClosing = false;
      return child;
    }

    if (before) {
      const index = this.children.indexOf(before);
      if (index >= 0) {
        // Insert "<child>\n<indent>" ahead of `before`, reusing the whitespace that precedes it
        this.children.splice(index, 0, child, new XmlText('\n' + childIndent));
        return child;
      }
    }

    // Append after the last element, before the trailing whitespace (closing-tag indent)
    const last = this.children[this.children.length - 1];
    if (last && last.type === 'text' && last.isWhitespace) {
      this.children.splice(this.children.length - 1, 0, new XmlText('\n' + childIndent), child);
    } else {
      this.children.push(new XmlText('\n' + childIndent), child, new XmlText('\n' + ownIndent));
    }
    this.selfClosing = false;
    return child;
  }

  /** Removes a child element together with the whitespace that introduced it */
  removeElement(child: XmlElement): boolean {
    const index = this.children.indexOf(child);
    if (index < 0) return false;
    const prev = this.children[index - 1];
    if (prev && prev.type === 'text' && prev.isWhitespace) {
      this.children.splice(index - 1, 2);
    } else {
      this.children.splice(index, 1);
    }
    child.parent = null;
    if (this.children.every((c) => c.type === 'text' && c.isWhitespace)) {
      this.children = [];
      this.markSelfClosing(true);
    }
    return true;
  }

  toString(): string {
    return serializeNode(this);
  }
}

export class XmlDocument {
  children: XmlNode[] = [];
  /** Leading byte-order mark, if the source had one */
  bom = '';

  get root(): XmlElement {
    const root = this.children.find((c): c is XmlElement => c.type === 'element');
    if (!root) throw new XmlParseError('Document has no root element', 0);
    return root;
  }

  toString(): string {
    return this.bom + this.children.map(serializeNode).join('');
  }
}

export class XmlParseError extends Error {
  constructor(
    message: string,
    public position: number,
  ) {
    super(`${message} (at offset ${position})`);
    this.name = 'XmlParseError';
  }
}

// =============================================================================
// Parsing
// =============================================================================

const NAME_CHAR = /[A-Za-z0-9_:.\-·À-￿]/;

export function parseXml(source: string): XmlDocument {
  const doc = new XmlDocument();
  let text = source;
  if (text.charCodeAt(0) === 0xfeff) {
    doc.bom = '﻿';
    text = text.slice(1);
  }

  let pos = 0;
  const stack: XmlElement[] = [];
  const append = (node: XmlNode) => {
    const parent = stack[stack.length - 1];
    if (parent) {
      if (node.type === 'element') node.parent = parent;
      parent.children.push(node);
    } else {
      doc.children.push(node);
    }
  };

  const readUntil = (terminator: string, what: string): string => {
    const end = text.indexOf(terminator, pos);
    if (end < 0) throw new XmlParseError(`Unterminated ${what}`, pos);
    const chunk = text.slice(pos, end + terminator.length);
    pos = end + terminator.length;
    return chunk;
  };

  const readName = (): string => {
    const start = pos;
    while (pos < text.length && NAME_CHAR.test(text[pos]!)) pos++;
    if (pos === start) throw new XmlParseError('Expected a name', pos);
    return text.slice(start, pos);
  };

  const readWhitespace = (): string => {
    const start = pos;
    while (pos < text.length && /\s/.test(text[pos]!)) pos++;
    return text.slice(start, pos);
  };

  while (pos < text.length) {
    const lt = text.indexOf('<', pos);
    if (lt < 0) {
      append(new XmlText(text.slice(pos)));
      break;
    }
    if (lt > pos) {
      append(new XmlText(text.slice(pos, lt)));
      pos = lt;
    }

    if (text.startsWith('<!--', pos)) {
      append(new XmlRaw(readUntil('-->', 'comment'), 'comment'));
    } else if (text.startsWith('<![CDATA[', pos)) {
      append(new XmlRaw(readUntil(']]>', 'CDATA section'), 'cdata'));
    } else if (text.startsWith('<?', pos)) {
      append(new XmlRaw(readUntil('?>', 'processing instruction'), 'pi'));
    } else if (text.startsWith('<!', pos)) {
      // DOCTYPE, possibly with an internal subset
      const start = pos;
      let depth = 0;
      while (pos < text.length) {
        const ch = text[pos++];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth <= 0) break;
      }
      append(new XmlRaw(text.slice(start, pos), 'doctype'));
    } else if (text.startsWith('</', pos)) {
      pos += 2;
      const name = readName();
      const tailStart = pos;
      readWhitespace();
      if (text[pos] !== '>') throw new XmlParseError(`Malformed end tag </${name}>`, pos);
      const closeTail = text.slice(tailStart, pos);
      pos++;
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new XmlParseError(`Mismatched end tag </${name}>; expected </${open?.name ?? '(none)'}>`, pos);
      }
      open.closeTail = closeTail;
    } else {
      pos++;
      const el = new XmlElement(readName());
      for (;;) {
        const ws = readWhitespace();
        const ch = text[pos];
        if (ch === '>' || (ch === '/' && text[pos + 1] === '>')) {
          el.openTail = ws;
          el.selfClosing = ch === '/';
          pos += el.selfClosing ? 2 : 1;
          break;
        }
        if (ch === undefined) throw new XmlParseError(`Unterminated start tag <${el.name}>`, pos);
        if (!ws) throw new XmlParseError(`Expected whitespace before attribute in <${el.name}>`, pos);
        const attrName = readName();
        const eqStart = pos;
        readWhitespace();
        if (text[pos] !== '=') throw new XmlParseError(`Expected "=" after ${attrName}`, pos);
        pos++;
        readWhitespace();
        const eq = text.slice(eqStart, pos);
        const quote = text[pos];
        if (quote !== '"' && quote !== "'") throw new XmlParseError(`Expected quoted value for ${attrName}`, pos);
        const end = text.indexOf(quote, pos + 1);
        if (end < 0) throw new XmlParseError(`Unterminated value for ${attrName}`, pos);
        const raw = text.slice(pos + 1, end);
        pos = end + 1;
        el.attrs.push({ name: attrName, value: decodeAttrValue(raw), raw, quote, lead: ws, eq });
      }
      append(el);
      if (!el.selfClosing) stack.push(el);
    }
  }

  if (stack.length > 0) {
    throw new XmlParseError(`Unclosed element <${stack[stack.length - 1]!.name}>`, text.length);
  }
  if (!doc.children.some((c) => c.type === 'element')) {
    throw new XmlParseError('Document has no root element', 0);
  }
  return doc;
}

// =============================================================================
// Serialization
// =============================================================================

function serializeNode(node: XmlNode): string {
  if (node.type !== 'element') return node.raw;

  let out = '<' + node.name;
  for (const attr of node.attrs) {
    const raw = attr.raw ?? escapeAttr(attr.value, attr.quote);
    out += `${attr.lead}${attr.name}${attr.eq}${attr.quote}${raw}${attr.quote}`;
  }
  if (node.selfClosing && node.children.length === 0) {
    // Parsed tags keep their own spacing; tags we collapse or create use Hero Designer's " />"
    return out + (node.synthetic ? ' ' : node.openTail) + '/>';
  }
  out += (node.synthetic ? '' : node.openTail) + '>';
  for (const child of node.children) out += serializeNode(child);
  return out + `</${node.name}${node.closeTail}>`;
}

// =============================================================================
// Entities
// =============================================================================

const NAMED_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(raw: string): string {
  if (!raw.includes('&')) return raw;
  return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (match, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[ref] ?? match;
  });
}

/** Attribute values: XML normalizes literal whitespace characters to spaces */
function decodeAttrValue(raw: string): string {
  return decodeEntities(raw.replace(/\r\n|[\r\n\t]/g, ' '));
}

export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(value: string, quote: '"' | "'" = '"'): string {
  let out = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  out = quote === '"' ? out.replace(/"/g, '&quot;') : out.replace(/'/g, '&apos;');
  // Escape whitespace controls so they survive attribute-value normalization
  return out.replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
}

// =============================================================================
// Indentation helpers
// =============================================================================

/** Indentation (the whitespace after the last newline) preceding an element's start tag */
function indentOf(el: XmlElement): string {
  const siblings = el.parent?.children;
  if (!siblings) return '';
  const index = siblings.indexOf(el);
  const prev = siblings[index - 1];
  if (prev && prev.type === 'text' && prev.isWhitespace) {
    const nl = prev.raw.lastIndexOf('\n');
    return nl >= 0 ? prev.raw.slice(nl + 1) : '';
  }
  return '';
}

/** The per-level indent unit used near `el`, defaulting to Hero Designer's two spaces */
function detectIndentUnit(el: XmlElement): string {
  for (let node: XmlElement | null = el; node; node = node.parent) {
    const child = node.elements()[0];
    if (child) {
      const childIndent = indentOf(child);
      const ownIndent = indentOf(node);
      if (childIndent.length > ownIndent.length && childIndent.startsWith(ownIndent)) {
        return childIndent.slice(ownIndent.length);
      }
    }
  }
  return '  ';
}

/** Adds indentation whitespace to a freshly-built subtree that has element children but no text */
function formatFresh(el: XmlElement, indent: string, unit: string): void {
  const elementChildren = el.elements();
  if (elementChildren.length === 0 || el.children.some((c) => c.type !== 'element')) return;
  const childIndent = indent + unit;
  el.children = [];
  for (const child of elementChildren) {
    formatFresh(child, childIndent, unit);
    el.children.push(new XmlText('\n' + childIndent), child);
  }
  el.children.push(new XmlText('\n' + indent));
  el.selfClosing = false;
}

/** Builds a detached element from attribute pairs; `undefined` values are skipped */
export function createElement(
  name: string,
  attrs: Record<string, string | number | boolean | undefined> = {},
  children: XmlElement[] = [],
): XmlElement {
  const el = new XmlElement(name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) el.setAttr(key, value);
  }
  for (const child of children) {
    child.parent = el;
    el.children.push(child);
  }
  el.selfClosing = children.length === 0;
  el.synthetic = true;
  return el;
}
