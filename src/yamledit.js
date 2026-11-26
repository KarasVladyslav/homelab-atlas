// Surgical edits of YAML text: change only the characters that hold the value being edited, so the
// rest of the file — comments, alignment, quoting, blank lines — stays byte-for-byte as written.
// A re-serialised document would reformat everything and turn every save into a noisy Git diff.
//
// Each function takes the text and returns new text; positions come from the `yaml` library's
// source ranges (node.range = [start, valueEnd, nodeEnd]). Browser: window.YamlEdit; Node: require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('yaml'));
  else root.YamlEdit = factory(root.YAML);
})(typeof self !== 'undefined' ? self : this, function (YAML) {
  'use strict';

  const parse = text => YAML.parseDocument(text, { keepSourceTokens: false });
  const splice = (text, start, end, insert) => text.slice(0, start) + insert + text.slice(end);

  // Plain scalars where possible (`1G`, `south`, `140`), quoted only when YAML would misread them.
  function scalar(v) {
    if (typeof v === 'number') return String(v);
    const s = String(v);
    return /^[a-zA-Z0-9][\w.:/ -]*$/.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s) && !/:\s/.test(s)
      ? s : JSON.stringify(s);
  }

  function nodeAt(doc, path, what) {
    const n = doc.getIn(path, true);
    if (!n) throw new Error(`yamledit: nothing at ${path.join('.')} (${what})`);
    return n;
  }

  // Replace an existing scalar value.
  function setScalar(text, path, value) {
    const n = nodeAt(parse(text), path, 'setScalar');
    if (!YAML.isScalar(n)) throw new Error(`yamledit: ${path.join('.')} is not a scalar`);
    return splice(text, n.range[0], n.range[1], scalar(value));
  }

  // Set key in a map: replace the value if the key exists, otherwise add the pair.
  function setKey(text, mapPath, key, value) {
    const doc = parse(text);
    const map = nodeAt(doc, mapPath, 'setKey');
    const pair = map.items.find(p => p.key && p.key.value === key);
    if (pair) return setScalar(text, [...mapPath, key], value);

    if (map.flow) {
      // { a: 1, b: 2 }  →  { a: 1, b: 2, key: value }
      let close = map.range[1] - 1;                       // the closing brace
      while (close > map.range[0] && text[close] !== '}') close--;
      let at = close;
      while (at > map.range[0] && /\s/.test(text[at - 1])) at--;
      const sep = map.items.length ? ', ' : ' ';
      return splice(text, at, at, `${sep}${key}: ${scalar(value)}`);
    }
    // Block map: a new line after the last pair, with the same indentation.
    const last = map.items[map.items.length - 1];
    const lineStart = text.lastIndexOf('\n', last.key.range[0]) + 1;
    const indent = text.slice(lineStart, last.key.range[0]);
    const end = lineEnd(text, last.value ? last.value.range[2] : last.key.range[2]);
    return splice(text, end, end, `\n${indent}${key}: ${scalar(value)}`);
  }

  // Remove a key (and its value) from a flow or block map. Missing key → text unchanged.
  function deleteKey(text, mapPath, key) {
    const map = nodeAt(parse(text), mapPath, 'deleteKey');
    const i = map.items.findIndex(p => p.key && p.key.value === key);
    if (i < 0) return text;
    const pair = map.items[i];
    const start = pair.key.range[0];
    const end = pair.value ? pair.value.range[1] : pair.key.range[1];

    if (map.flow) {
      if (i > 0) {                                        // ", key: value"
        let from = start;
        while (from > 0 && text[from - 1] !== ',') from--;
        return splice(text, from - 1, end, '');
      }
      let to = end;                                       // "key: value, "
      while (to < text.length && /[\s,]/.test(text[to]) && text[to] !== '}') to++;
      return splice(text, start, to, '');
    }
    const lineStart = text.lastIndexOf('\n', start - 1);
    return splice(text, lineStart, lineEnd(text, end), '');
  }

  // Append an item to a block sequence, written as `- <itemText>` with the same indentation.
  function appendItem(text, seqPath, itemText) {
    const seq = nodeAt(parse(text), seqPath, 'appendItem');
    if (seq.flow || !seq.items.length) throw new Error('yamledit: appendItem needs a non-empty block sequence');
    const last = seq.items[seq.items.length - 1];
    const dash = text.lastIndexOf('-', last.range[0]);
    const lineStart = text.lastIndexOf('\n', dash) + 1;
    const indent = text.slice(lineStart, dash);
    const end = lineEnd(text, last.range[1]);
    return splice(text, end, end, `\n${indent}- ${itemText}`);
  }

  // End of the line containing pos (before the newline), keeping any trailing comment on it.
  function lineEnd(text, pos) {
    const nl = text.indexOf('\n', pos);
    return nl < 0 ? text.length : nl;
  }

  return { setScalar, setKey, deleteKey, appendItem, scalar };
});
