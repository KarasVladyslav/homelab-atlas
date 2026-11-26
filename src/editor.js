// Edit mode: change the floors with the mouse. Every change is a surgical edit of the YAML text
// (yamledit.js), then the scene is rebuilt from that text — so what you see is always exactly what
// the floppy button will save, and the saved file differs from the original only where you changed
// something.
//
// Hardware floor:
//   left-drag a box ............ move it (snaps to the grid)
//   ↻ / ↺ on the floor ......... rotate it 90° (footprint and port sides turn with it)
//   drag the ↔ / ↕ strips ...... resize it
//   drag from a port ........... connect it to a port of another box
//   Moving, rotating or resizing a box drops the `via` hints of its cables: the autorouter
//   re-routes them around the boxes anyway, and stale waypoints would leave long tails.
// Plan floor:
//   left-drag a zone ........... move it;   drag the ↔ / ↕ strips ... resize it
// Everywhere: Ctrl+Z / Ctrl+Shift+Z undo / redo, Esc cancels the drag, then deselects.
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
  const PORT_SNAP = 18;      // floor px: how close to a port a dropped connection must land
  const PORT_PICK = 10;      // screen px: how close to a port dot a press must be to grab it

  let editing = false;
  let savedText = null;      // what the floppy last saved (or what was loaded)
  let drag = null;
  const undo = [], redo = [];

  // ---------------------------------------------------------------- helpers

  const raw = () => window.YAML.parse(A.text);
  const grid = () => (A.model.floor.grid || 20);
  const snap = v => Math.round(v / grid()) * grid();

  // A rectangle on a floor the editor can move and resize: a box (hardware) or a zone (plan).
  const target = {
    node: {
      index: id => raw().nodes.findIndex(n => n.id === id),
      rect: id => A.model.nodes.get(id).layout,
      path: (i, k) => ['nodes', i, 'layout', k],
    },
    zone: {
      index: id => raw().zones.findIndex(z => z.id === id),
      rect: id => A.model.zones.find(z => z.id === id),
      path: (i, k) => ['zones', i, k],
    },
  };

  function toast(message, level) {
    const t = document.createElement('div');
    t.className = 'toast-item ' + (level || 'info');
    t.textContent = message;
    toastBox.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function apply(newText) {
    if (newText === A.text) return;
    A.setText(newText);
    updateDirty();
  }

  // One undo step per gesture: remember the text from before it started.
  function commitGesture(before) {
    if (before !== A.text) { undo.push(before); redo.length = 0; }
  }

  function updateDirty() {
    saveBtn.classList.toggle('dirty', A.text !== savedText);
  }

  // ---------------------------------------------------------------- edits

  function setRect(text, kind, i, changes) {
    for (const [k, v] of Object.entries(changes)) text = E.setScalar(text, target[kind].path(i, k), v);
    return text;
  }

  // Drop the `via` hints of every cable attached to a box (its geometry is about to change).
  function clearVia(text, nodeId) {
    const links = raw().links || [];
    for (let j = links.length - 1; j >= 0; j--) {
      const l = links[j];
      if (l.via && [l.from, l.to].some(ref => String(ref).split(':')[0] === nodeId)) {
        text = E.deleteKey(text, ['links', j], 'via');
      }
    }
    return text;
  }

  function rotate(id, clockwise) {
    const before = A.text;
    const i = target.node.index(id);
    const node = raw().nodes[i];
    const L = node.layout;
    const cx = L.x + L.w / 2, cy = L.y + L.d / 2;
    let text = clearVia(A.text, id);
    text = setRect(text, 'node', i, { x: snap(cx - L.d / 2), y: snap(cy - L.w / 2), w: L.d, d: L.w });
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
    const kind = a.kind === 'radio' ? ', kind: wifi' : a.kind === 'fiber' && b.kind === 'fiber' ? ', kind: fiber' : '';
    const before = A.text;
    apply(E.appendItem(A.text, ['links'], `{ from: ${fromKey}, to: ${toKey}${kind} }`));
    commitGesture(before);
    toast(`Connected ${fromKey} → ${toKey}`);
  }

  // ---------------------------------------------------------------- handles on the floor

  // Flat elements lying on the floor, just above it.
  function floorEl(cls, x, y, w, d, dataset) {
    const e = document.createElement('div');
    e.className = 'handle ' + cls;
    Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: d + 'px' });
    Object.assign(e.dataset, dataset || {});
    return e;
  }

  // Frame plus resize strips (with a ↔ / ↕ grip in the middle) around a rectangle.
  function frameHandles(R) {
    const S = 16;
    const edge = (cls, x, y, w, d, handle, arrow) => {
      const e = floorEl('edge ' + cls, x, y, w, d, { handle });
      const grip = document.createElement('span');
      grip.className = 'grip';
      grip.textContent = arrow;
      e.appendChild(grip);
      return e;
    };
    return [
      floorEl('frame', R.x - 2, R.y - 2, R.w + 4, R.d + 4),
      edge('edge-ew', R.x + R.w + 2, R.y, S, R.d, 'e', '↔'),
      edge('edge-ew', R.x - S - 2, R.y, S, R.d, 'w', '↔'),
      edge('edge-ns', R.x, R.y + R.d + 2, R.w, S, 's', '↕'),
      edge('edge-ns', R.x, R.y - S - 2, R.w, S, 'n', '↕'),
    ];
  }

  A.decorate = (layer, model) => {
    if (!editing) return;

    // Rubber band while dragging a new connection out of a port.
    if (drag && drag.type === 'connect' && drag.to) {
      const [x1, y1] = drag.fromPoint, [x2, y2] = drag.to;
      const band = floorEl('rubber', x1, y1, Math.hypot(x2 - x1, y2 - y1), 0);
      band.style.transform = `translateZ(3px) rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`;
      layer.appendChild(band);
    }

    const node = A.selected && model.nodes.get(A.selected);
    if (!node || A.floor !== 'hardware') return;
    const L = node.layout;
    const R = 26, gap = 10;
    layer.append(
      ...frameHandles(L),
      // Rotate buttons on the front corners — the ones the Side camera always sees.
      Object.assign(floorEl('rotate', L.x + L.w + gap, L.y + L.d + gap, R, R, { handle: 'rotate-cw' }), { textContent: '↻', title: 'Rotate 90° clockwise' }),
      Object.assign(floorEl('rotate', L.x - gap - R, L.y + L.d + gap, R, R, { handle: 'rotate-ccw' }), { textContent: '↺', title: 'Rotate 90° counter-clockwise' }),
    );
  };

  A.decoratePlan = (layer, model) => {
    if (!editing || A.floor !== 'plan' || !A.selectedZone) return;
    const z = model.zones.find(z => z.id === A.selectedZone);
    if (z) layer.append(...frameHandles(z));
  };

  // ---------------------------------------------------------------- pointer

  let frame = 0;
  const rerender = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; A.render(); }); };

  // A port sits on the edge of its box, so the box's top face often covers half of the dot.
  // Pick ports by screen distance to the dot instead of by what was hit.
  function portUnder(clientX, clientY) {
    let best = null, bestDist = PORT_PICK;
    for (const c of document.querySelectorAll('.layer.hardware [data-port]')) {
      const r = c.getBoundingClientRect();
      const dist = Math.hypot(r.left + r.width / 2 - clientX, r.top + r.height / 2 - clientY);
      if (dist < bestDist) { best = c.dataset.port; bestDist = dist; }
    }
    return best;
  }

  function startRectDrag(kind, id, handle, start) {
    drag = {
      type: handle ? 'resize' : 'move', edge: handle, kind, id, start,
      orig: { ...target[kind].rect(id) }, before: A.text, viaCleared: kind !== 'node',
    };
  }

  stage.addEventListener('pointerdown', e => {
    if (!editing || e.button !== 0) return;
    const t = e.target;
    const handle = t.closest('[data-handle]');
    const start = A.floorAt(e.clientX, e.clientY);

    if (A.floor === 'plan') {
      const zone = t.closest('[data-zone]');
      if (handle && A.selectedZone) startRectDrag('zone', A.selectedZone, handle.dataset.handle, start);
      else if (zone) { A.selectedZone = zone.dataset.zone; startRectDrag('zone', A.selectedZone, null, start); A.render(); }
      else { if (A.selectedZone) { A.selectedZone = null; A.render(); } return; }
    } else {
      const port = handle ? null : portUnder(e.clientX, e.clientY);
      const box = t.closest('.layer.hardware .node');
      if (handle && handle.dataset.handle.startsWith('rotate')) {
        rotate(A.selected, handle.dataset.handle === 'rotate-cw');
        e.preventDefault();
        return;
      }
      if (handle) startRectDrag('node', A.selected, handle.dataset.handle, start);
      else if (port) {
        const p = A.model.ports.get(port);
        drag = { type: 'connect', from: p.key, fromPoint: p.point, to: null, before: A.text };
      } else if (box) { A.selected = box.dataset.id; startRectDrag('node', A.selected, null, start); A.render(); }
      else { if (A.selected) { A.selected = null; A.render(); } return; }
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
    const o = drag.orig, g = grid();
    let c;
    if (drag.type === 'move') c = { x: snap(o.x + dx), y: snap(o.y + dy) };
    else if (drag.edge === 'e') c = { w: Math.max(g * 2, snap(o.w + dx)) };
    else if (drag.edge === 's') c = { d: Math.max(g * 2, snap(o.d + dy)) };
    else if (drag.edge === 'w') { const nx = Math.min(snap(o.x + dx), o.x + o.w - g * 2); c = { x: nx, w: o.x + o.w - nx }; }
    else if (drag.edge === 'n') { const ny = Math.min(snap(o.y + dy), o.y + o.d - g * 2); c = { y: ny, d: o.y + o.d - ny }; }
    const cur = target[drag.kind].rect(drag.id);
    if (Object.entries(c).every(([k, v]) => cur[k] === v)) return;
    let text = A.text;
    if (!drag.viaCleared) { text = clearVia(text, drag.id); drag.viaCleared = true; }
    A.setText(setRect(text, drag.kind, target[drag.kind].index(drag.id), c));
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
      else if (A.selected || A.selectedZone) { A.selected = A.selectedZone = null; A.render(); }
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
    if (on && A.floor === 'network') A.setFloor('hardware');   // the network floor is derived, not edited
    if (!on) A.selected = A.selectedZone = null;
    A.render();
  }

  editBtn.addEventListener('click', () => setEditing(!editing));
  document.addEventListener('atlas:floor', e => {
    if (!editing) return;
    if (e.detail === 'network') { setEditing(false); return; }
    A.selected = A.selectedZone = null;
    A.render();
  });

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
