// Edit mode: change the hardware floor with the mouse. Every change is a surgical edit of the YAML
// text (yamledit.js), then the scene is rebuilt from that text — so what you see is always exactly
// what the floppy button will save, and the saved file differs from the original only where you
// changed something.
//
//   left-drag a box ............ move it (snaps to the grid)
//   ↻ / ↺ on the floor ......... rotate it 90° (footprint and port sides turn with it)
//   drag the frame edges ....... resize it
//   drag from a port ........... connect it to a port of another box
//   Ctrl+Z / Ctrl+Shift+Z ...... undo / redo        Esc ... cancel the drag, then deselect
(function () {
  'use strict';

  const A = window.Atlas;
  const E = window.YamlEdit;
  const M = window.AtlasModel;
  const stage = A.stage;

  const editBtn = document.getElementById('edit-toggle');
  const saveBtn = document.getElementById('save');
  const toastBox = document.getElementById('toast');

  const CW = { east: 'south', south: 'west', west: 'north', north: 'east' };
  const CCW = { south: 'east', west: 'south', north: 'west', east: 'north' };
  const PORT_SNAP = 18;      // px on the floor: how close to a port a dropped connection must land

  let editing = false;
  let savedText = null;      // what the floppy last saved (or what was loaded)
  let drag = null;
  const undo = [], redo = [];

  // ---------------------------------------------------------------- helpers

  const raw = () => window.YAML.parse(A.text);
  const nodeIndex = id => raw().nodes.findIndex(n => n.id === id);
  const grid = () => (A.model.floor.grid || 20);
  const snap = v => Math.round(v / grid()) * grid();

  function toast(message, level) {
    const t = document.createElement('div');
    t.className = 'toast-item ' + (level || 'info');
    t.textContent = message;
    toastBox.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  // Apply a text change: one undo step per gesture (the text before the gesture is remembered).
  function apply(newText) {
    if (newText === A.text) return;
    A.setText(newText);
    updateDirty();
  }

  function commitGesture(before) {
    if (before !== A.text) { undo.push(before); redo.length = 0; }
  }

  function updateDirty() {
    saveBtn.classList.toggle('dirty', A.text !== savedText);
  }

  // ---------------------------------------------------------------- edits

  function setLayout(text, i, changes) {
    for (const [k, v] of Object.entries(changes)) text = E.setScalar(text, ['nodes', i, 'layout', k], v);
    return text;
  }

  function rotate(id, clockwise) {
    const before = A.text;
    const i = nodeIndex(id);
    const node = raw().nodes[i];
    const L = node.layout;
    const cx = L.x + L.w / 2, cy = L.y + L.d / 2;
    let text = setLayout(A.text, i, { x: snap(cx - L.d / 2), y: snap(cy - L.w / 2), w: L.d, d: L.w });
    (node.ports || []).forEach((p, j) => {
      const next = (clockwise ? CW : CCW)[p.side || M.DEFAULT_SIDE];
      text = next === M.DEFAULT_SIDE
        ? E.deleteKey(text, ['nodes', i, 'ports', j], 'side')     // the default stays implicit
        : E.setKey(text, ['nodes', i, 'ports', j], 'side', next);
    });
    apply(text);
    commitGesture(before);
  }

  function connect(fromKey, toKey) {
    const m = A.model;
    const a = m.ports.get(fromKey), b = m.ports.get(toKey);
    if (!a || !b || a.node === b.node) return;
    const radio = a.kind === 'radio';
    if ((a.kind === 'radio') !== (b.kind === 'radio')) {
      toast(`${fromKey} → ${toKey}: a radio port connects only to a radio port`, 'error');
      return;
    }
    for (const p of [a, b]) {
      if (p.kind !== 'radio' && p.links.length) {
        toast(`${p.key} already has a cable — one cable per wired port`, 'error');
        return;
      }
    }
    if (m.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))) {
      toast(`${fromKey} and ${toKey} are already connected`, 'error');
      return;
    }
    const kind = radio ? ', kind: wifi' : a.kind === 'fiber' && b.kind === 'fiber' ? ', kind: fiber' : '';
    const before = A.text;
    apply(E.appendItem(A.text, ['links'], `{ from: ${fromKey}, to: ${toKey}${kind} }`));
    commitGesture(before);
    toast(`Connected ${fromKey} → ${toKey}`);
  }

  // ---------------------------------------------------------------- handles on the floor

  // Flat elements lying on the hardware floor, just above it (translateZ(1px)).
  function floorEl(cls, x, y, w, d, dataset) {
    const e = document.createElement('div');
    e.className = 'handle ' + cls;
    Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: d + 'px' });
    Object.assign(e.dataset, dataset);
    return e;
  }

  A.decorate = (layer, model) => {
    if (!editing) return;

    // Rubber band while dragging a new connection out of a port.
    if (drag && drag.type === 'connect' && drag.to) {
      const [x1, y1] = drag.fromPoint, [x2, y2] = drag.to;
      const band = floorEl('rubber', x1, y1, Math.hypot(x2 - x1, y2 - y1), 0, {});
      band.style.transform = `translateZ(2px) rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`;
      layer.appendChild(band);
    }

    const node = A.selected && model.nodes.get(A.selected);
    if (!node) return;
    const L = node.layout;
    const S = 12, R = 26, gap = 10;
    layer.append(
      floorEl('frame', L.x - 2, L.y - 2, L.w + 4, L.d + 4, {}),
      floorEl('edge edge-ew', L.x + L.w, L.y, S, L.d, { handle: 'e' }),
      floorEl('edge edge-ew', L.x - S, L.y, S, L.d, { handle: 'w' }),
      floorEl('edge edge-ns', L.x, L.y + L.d, L.w, S, { handle: 's' }),
      floorEl('edge edge-ns', L.x, L.y - S, L.w, S, { handle: 'n' }),
      // Rotate buttons on the front corners — the ones the Side camera always sees.
      Object.assign(floorEl('rotate', L.x + L.w + gap, L.y + L.d + gap, R, R, { handle: 'rotate-cw' }), { textContent: '↻', title: 'Rotate 90° clockwise' }),
      Object.assign(floorEl('rotate', L.x - gap - R, L.y + L.d + gap, R, R, { handle: 'rotate-ccw' }), { textContent: '↺', title: 'Rotate 90° counter-clockwise' }),
    );
  };

  // ---------------------------------------------------------------- pointer

  // A port sits on the edge of its box, so the box's top face often covers half of the dot.
  // Pick ports by screen distance to the dot instead of by what was hit.
  const PORT_PICK = 10;   // screen px
  function portUnder(clientX, clientY) {
    let best = null, bestDist = PORT_PICK;
    for (const c of document.querySelectorAll('.layer.hardware [data-port]')) {
      const r = c.getBoundingClientRect();
      const dist = Math.hypot(r.left + r.width / 2 - clientX, r.top + r.height / 2 - clientY);
      if (dist < bestDist) { best = c.dataset.port; bestDist = dist; }
    }
    return best;
  }

  let frame = 0;
  const rerender = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; A.render(); }); };

  stage.addEventListener('pointerdown', e => {
    if (!editing || e.button !== 0) return;
    const t = e.target;
    const handle = t.closest('[data-handle]');
    const port = handle ? null : portUnder(e.clientX, e.clientY);
    const box = t.closest('.layer.hardware .node');
    const start = A.floorAt(e.clientX, e.clientY);

    if (handle && handle.dataset.handle.startsWith('rotate')) {
      rotate(A.selected, handle.dataset.handle === 'rotate-cw');
      e.preventDefault();
      return;
    }
    if (handle) {
      const n = A.model.nodes.get(A.selected);
      drag = { type: 'resize', edge: handle.dataset.handle, id: n.id, start, orig: { ...n.layout }, before: A.text };
    } else if (port) {
      const p = A.model.ports.get(port);
      drag = { type: 'connect', from: p.key, fromPoint: p.point, to: null, before: A.text };
    } else if (box) {
      A.selected = box.dataset.id;
      const n = A.model.nodes.get(A.selected);
      drag = { type: 'move', id: n.id, start, orig: { ...n.layout }, before: A.text };
      A.render();
    } else {
      if (A.selected) { A.selected = null; A.render(); }
      return;
    }
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    const [x, y] = A.floorAt(e.clientX, e.clientY);
    if (drag.type === 'connect') {
      drag.to = [x, y];
      rerender();
      return;
    }
    const dx = x - drag.start[0], dy = y - drag.start[1];
    const o = drag.orig, i = nodeIndex(drag.id), g = grid();
    let c;
    if (drag.type === 'move') c = { x: snap(o.x + dx), y: snap(o.y + dy) };
    else if (drag.edge === 'e') c = { w: Math.max(g * 2, snap(o.w + dx)) };
    else if (drag.edge === 's') c = { d: Math.max(g * 2, snap(o.d + dy)) };
    else if (drag.edge === 'w') { const nx = Math.min(snap(o.x + dx), o.x + o.w - g * 2); c = { x: nx, w: o.x + o.w - nx }; }
    else if (drag.edge === 'n') { const ny = Math.min(snap(o.y + dy), o.y + o.d - g * 2); c = { y: ny, d: o.y + o.d - ny }; }
    const cur = A.model.nodes.get(drag.id).layout;
    if (Object.entries(c).every(([k, v]) => cur[k] === v)) return;
    A.setText(setLayout(A.text, i, c));
    updateDirty();
  });

  function endDrag(e, cancel) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (e && stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (cancel) { A.setText(d.before); updateDirty(); return; }
    if (d.type === 'connect') {
      const [x, y] = A.floorAt(e.clientX, e.clientY);
      let best = null, bestDist = PORT_SNAP;
      for (const p of A.model.ports.values()) {
        const dist = Math.hypot(p.point[0] - x, p.point[1] - y);
        if (dist < bestDist && p.key !== d.from) { best = p; bestDist = dist; }
      }
      A.render();
      if (best) connect(d.from, best.key);
      return;
    }
    commitGesture(d.before);
  }

  stage.addEventListener('pointerup', e => endDrag(e, false));
  stage.addEventListener('pointercancel', e => endDrag(e, true));

  // ---------------------------------------------------------------- keys, mode, save

  document.addEventListener('keydown', e => {
    if (!editing) return;
    const key = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (drag) endDrag(null, true);
      else if (A.selected) { A.selected = null; A.render(); }
    } else if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey && undo.length) {
      redo.push(A.text); apply(undo.pop()); e.preventDefault();
    } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey)) && redo.length) {
      undo.push(A.text); apply(redo.pop()); e.preventDefault();
    }
  });

  function setEditing(on) {
    editing = on;
    stage.classList.toggle('editing', on);
    editBtn.setAttribute('aria-pressed', String(on));
    saveBtn.hidden = !on;
    if (on) document.querySelector('[data-floor="hardware"]').click();   // editing happens on the hardware floor
    else A.selected = null;
    A.render();
  }

  editBtn.addEventListener('click', () => setEditing(!editing));

  // Floppy: download the edited inventory. Later the same button will open a PR through atlas-api.
  saveBtn.addEventListener('click', () => {
    const blob = new Blob([A.text], { type: 'text/yaml' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'inventory.yaml' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    savedText = A.text;
    updateDirty();
    toast('Saved inventory.yaml — commit it to apply');
  });

  window.addEventListener('beforeunload', e => {
    if (savedText !== null && A.text !== savedText) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('atlas:loaded', () => { savedText = A.loadedText; updateDirty(); });
})();
