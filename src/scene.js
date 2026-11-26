// Renders the inventory model (model.js) into a CSS 3D scene with two floors:
//   hardware (z = 0)    — zones, boxes, ports at the foot of each box, cables on the floor
//   network  (z = netZ) — floating above it: one rectangle per networked node with its ports,
//                         and the links that carry each network, in that network's colour.
// Data lives in world coordinates; this file only projects it via CSS transforms.
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const M = window.AtlasModel;
  const stage = document.getElementById('stage');
  const scene = document.getElementById('scene');
  const INVENTORY_URL = 'config/inventory.yaml';

  const CORNER_RADIUS = 14;
  const KIND_STROKE = { copper: 'var(--copper)', fiber: 'var(--fiber)', wifi: 'var(--wifi)', ble: 'var(--ble)' };
  const DASH = { wifi: '6 6', ble: '2 5' };

  let model = null;
  let text = null;          // the inventory as YAML text — the editor changes this, then we re-render
  let fitted = false;

  const px = n => n + 'px';
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined) e.setAttribute(k, v);
    return e;
  };

  function label(text, sub, extraClass) {
    const l = el('div', 'label fade' + (extraClass ? ' ' + extraClass : ''));
    l.textContent = text;
    if (sub) { const s = el('small'); s.textContent = sub; l.appendChild(s); }
    return l;
  }

  function placeLabel(l, x, y, z) {
    Object.assign(l.style, { left: px(x), top: px(y) });
    l.style.setProperty('--label-z', px(z));
    return l;
  }

  function sheet(floor) {
    return svgEl('svg', {
      class: 'sheet fade', width: floor.width, height: floor.height,
      viewBox: `0 0 ${floor.width} ${floor.height}`,
    });
  }

  // Path with each (right-angle) corner replaced by a circular arc. The radius shrinks on short
  // pieces so two neighbouring arcs never overlap.
  function roundedPath(points) {
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = `M${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length - 1; i++) {
      const [a, p, b] = [points[i - 1], points[i], points[i + 1]];
      const r = Math.min(CORNER_RADIUS, len(a, p) / 2, len(p, b) / 2);
      const d1 = [(p[0] - a[0]) / len(a, p), (p[1] - a[1]) / len(a, p)];
      const d2 = [(b[0] - p[0]) / len(p, b), (b[1] - p[1]) / len(p, b)];
      const sweep = d1[0] * d2[1] - d1[1] * d2[0] > 0 ? 1 : 0;   // y points down: positive = clockwise
      d += ` L${p[0] - d1[0] * r} ${p[1] - d1[1] * r}`;
      d += ` A${r} ${r} 0 0 ${sweep} ${p[0] + d2[0] * r} ${p[1] + d2[1] * r}`;
    }
    const last = points[points.length - 1];
    return d + ` L${last[0]} ${last[1]}`;
  }

  // ---------------------------------------------------------------- hardware floor

  function renderHardware(layer) {
    const { floor } = model;
    const svg = sheet(floor);
    const g = floor.grid || 20;
    svg.innerHTML = `
      <defs><pattern id="grid" width="${g}" height="${g}" patternUnits="userSpaceOnUse">
        <path d="M${g} 0H0V${g}" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern></defs>
      <rect width="${floor.width}" height="${floor.height}" fill="url(#grid)" stroke="var(--floor-edge)"/>`;

    for (const z of model.zones) {
      svg.appendChild(svgEl('rect', {
        x: z.x, y: z.y, width: z.w, height: z.d, rx: 10,
        fill: 'none', stroke: 'var(--zone)', 'stroke-width': 2, 'stroke-dasharray': '10 8',
      }));
      const t = svgEl('text', { x: z.x + 12, y: z.y + z.d - 14, fill: 'var(--text-muted)', 'font-size': 14 });
      t.textContent = z.name;
      svg.appendChild(t);
    }

    for (const link of model.links) {
      svg.appendChild(svgEl('path', {
        d: roundedPath(link.points), fill: 'none', stroke: KIND_STROKE[link.kind] || KIND_STROKE.copper,
        'stroke-width': link.radio ? 2 : M.widthFor(link.speed), 'stroke-linecap': 'round',
        'stroke-dasharray': DASH[link.kind],
      }));
    }

    // Ports at the foot of each box.
    for (const p of model.ports.values()) {
      svg.appendChild(svgEl('circle', { cx: p.point[0], cy: p.point[1], r: 3.5, class: 'hw-port', 'data-port': p.key }));
    }
    layer.appendChild(svg);

    for (const node of model.nodes.values()) layer.appendChild(renderBox(node));
    if (Atlas.decorate) Atlas.decorate(layer, model);    // editor handles (selection, rotate, resize, …)
  }

  // A box is three faces: the top plus the two sides the side-view camera can see
  // (+x "east", +y "south"). In top view the sides collapse to zero width on their own.
  function renderBox(node) {
    const L = node.layout;
    const box = el('div', 'node' + (Atlas.selected === node.id ? ' selected' : ''));
    box.dataset.id = node.id;
    Object.assign(box.style, { left: px(L.x), top: px(L.y), width: px(L.w), height: px(L.d) });

    const top = el('div', 'face top fade');
    Object.assign(top.style, { width: px(L.w), height: px(L.d), transform: `translateZ(${L.h}px)` });

    const east = el('div', 'face east fade');
    Object.assign(east.style, { left: px(L.w), top: '0', width: px(L.h), height: px(L.d) });

    const south = el('div', 'face south fade');
    Object.assign(south.style, { left: '0', top: px(L.d), width: px(L.w), height: px(L.h) });

    box.append(top, east, south, placeLabel(label(node.name, node.subtitle), L.w / 2, L.d / 2, L.h + 2));
    return box;
  }

  // ---------------------------------------------------------------- network floor

  function renderNetwork(layer, netZ) {
    const svg = sheet(model.floor);
    const color = id => (model.networks.get(id) || {}).color || 'var(--net-node-stroke)';

    // Links: one stroke per network the link carries; several networks are drawn as concentric
    // strokes (widest first), so a trunk shows all of its colours.
    for (const link of model.links) {
      if (!link.networks.length) continue;
      const w = (link.radio ? 2.5 : M.widthFor(link.speed)) + 1;
      link.networks.forEach((id, i) => {
        svg.appendChild(svgEl('path', {
          d: roundedPath(link.points), fill: 'none', stroke: color(id),
          'stroke-width': w + (link.networks.length - 1 - i) * 4, 'stroke-linecap': 'round',
          'stroke-dasharray': link.radio ? '8 6' : undefined,
        }));
      });
      if (!link.radio && link.speed) {
        const [x, y] = M.labelSpot(link.points);
        layer.appendChild(placeLabel(label(M.formatSpeed(link.speed), null, 'speed link-speed'), x, y, 3));
      }
    }

    for (const node of model.netNodes) {
      const L = node.layout;
      svg.appendChild(svgEl('rect', {
        class: 'netnode', x: L.x, y: L.y, width: L.w, height: L.d, rx: 6,
        fill: 'var(--net-node-fill)', stroke: 'var(--net-node-stroke)', 'stroke-width': 2,
      }));

      // Threads from the rectangle's corners down to the box: the outline reads as the box's ghost.
      for (const [cx, cy] of [[L.x, L.y], [L.x + L.w, L.y], [L.x, L.y + L.d], [L.x + L.w, L.y + L.d]]) {
        const t = el('div', 'thread fade');
        Object.assign(t.style, { left: px(cx), top: px(cy), height: px(netZ - L.h) });
        layer.appendChild(t);
      }

      // Ports: dots on the rectangle's edge, coloured by the first network they carry; speed above.
      for (const p of node.ports) {
        const [x, y] = p.point;
        const first = [...p.networks][0];
        svg.appendChild(svgEl('circle', {
          cx: x, cy: y, r: 5, class: 'net-port',
          fill: first ? color(first) : 'var(--net-node-fill)', stroke: 'var(--net-node-stroke)', 'stroke-width': 1.5,
        }));
        // The label sits just inside the rectangle, next to its dot: outside is where the cable runs.
        const text = p.kind === 'radio' ? 'radio' : M.formatSpeed(p.speed);
        const inset = p.kind === 'radio' ? 24 : 18;
        if (text) layer.appendChild(placeLabel(label(text, null, 'speed port-speed'), x - p.out[0] * inset, y - p.out[1] * inset, 3));
      }

      // One label per node: the name, then one line per address, marked with the network's colour.
      const l = label(node.name, null, 'netnode');
      for (const i of node.interfaces) {
        if (!i.ip) continue;
        const line = el('span', 'addr');
        line.style.setProperty('--net-color', i.net ? i.net.color : 'var(--text-muted)');
        const ip = i.net ? M.shortIp(i.ip, i.net.cidr) : i.ip;
        line.textContent = i.label ? `${ip}  ${i.label}` : ip;
        l.appendChild(line);
      }
      layer.appendChild(placeLabel(l, L.x + L.w / 2, L.y + L.d / 2, 3));
    }
    layer.appendChild(svg);
    renderLegend();
  }

  // Colour key for the networks (screen overlay, not part of the scene).
  function renderLegend() {
    const legend = document.getElementById('legend');
    legend.replaceChildren();
    for (const net of model.networks.values()) {
      const row = el('div', 'legend-row');
      row.style.setProperty('--net-color', net.color);
      row.textContent = net.name;
      if (net.cidr) { const s = el('small'); s.textContent = net.cidr; row.appendChild(s); }
      legend.appendChild(row);
    }
  }

  // Problems found in the inventory: shown on the page, not only in the console.
  function renderProblems() {
    const box = document.getElementById('problems');
    box.replaceChildren();
    const all = [...model.errors.map(m => ['error', m]), ...model.warnings.map(m => ['warning', m])];
    box.hidden = all.length === 0;
    for (const [level, m] of all) {
      const row = el('div', 'problem ' + level);
      row.textContent = m;
      box.appendChild(row);
      (level === 'error' ? console.error : console.warn)('atlas:', m);
    }
  }

  // ---------------------------------------------------------------- scene

  const netHeight = () => Math.max(0, ...[...model.nodes.values()].map(n => n.layout.h || 0)) + 70;

  function render() {
    const { floor } = model;
    document.getElementById('title').textContent = model.title;
    const netZ = netHeight();

    scene.replaceChildren();
    scene.style.width = px(floor.width);
    scene.style.height = px(floor.height);
    scene.style.setProperty('--net-z', px(netZ));

    const hw = el('div', 'layer hardware');
    const net = el('div', 'layer network');
    renderHardware(hw);
    renderNetwork(net, netZ);
    scene.append(hw, net);
    renderProblems();
    if (!fitted) { fit(netZ); fitted = true; }
  }

  function setText(newText) {
    text = newText;
    model = M.build(window.YAML.parse(text));
    render();
  }

  // What the user did to the camera: pan (world coordinates, along the floor) and zoom (a factor
  // on top of the zoom that fits the floor on screen).
  const view = { fitZoom: 1, zoom: 1, panX: 0, panY: 0 };

  function applyView() {
    scene.style.setProperty('--zoom', (view.fitZoom * view.zoom).toFixed(4));
    scene.style.setProperty('--pan-x', px(view.panX));
    scene.style.setProperty('--pan-y', px(view.panY));
  }

  // One zoom that fits both views, so switching the camera never needs a re-fit.
  function fit(netZ) {
    const { width: W, height: D } = model.floor;
    const r = stage.getBoundingClientRect();
    const sideW = (W + D) * Math.SQRT1_2;
    const sideH = sideW * Math.cos(58 * Math.PI / 180) + netZ * Math.sin(58 * Math.PI / 180);
    view.fitZoom = Math.min(r.width / (sideW + 60), r.height / (sideH + 160), r.width / (W + 60), r.height / (D + 60), 1.6);
    applyView();
  }

  function press(attr, value) {
    for (const b of document.querySelectorAll(`[data-${attr}]`)) {
      b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
    }
  }

  for (const b of document.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => { stage.classList.toggle('side', b.dataset.view === 'side'); press('view', b.dataset.view); });
  }
  for (const b of document.querySelectorAll('[data-floor]')) {
    b.addEventListener('click', () => { stage.classList.toggle('on-network', b.dataset.floor === 'network'); press('floor', b.dataset.floor); });
  }
  window.addEventListener('resize', () => model && fit(netHeight()));

  // ---------------------------------------------------------------- API for the editor

  const Atlas = window.Atlas = {
    get model() { return model; },
    get text() { return text; },
    setText,
    render: () => model && render(),
    stage, scene, view,
    selected: null,
    decorate: null,
    // Floor point (hardware floor, z = 0) under a screen point. The camera maps a floor point p to
    // screen = stageCentre + zoom · Rx(tilt) · Rz(spin) · (p − floorCentre + pan), so invert that.
    floorAt(clientX, clientY) {
      const r = stage.getBoundingClientRect();
      const [fx, fy] = screenToFloor(clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2),
        view.fitZoom * view.zoom, cameraNow());
      return [model.floor.width / 2 - view.panX + fx, model.floor.height / 2 - view.panY + fy];
    },
  };

  // ---------------------------------------------------------------- pan and zoom
  //
  // The camera maps the active floor to the screen as  screen = zoom · Rx(tilt) · Rz(spin) · floor
  // (around the stage centre). For a point on the floor Rx only squashes y by cos(tilt), so a screen
  // vector turns back into a floor vector by: ÷zoom, y ÷cos(tilt), rotate by −spin.
  function cameraNow() {
    const cs = getComputedStyle(scene);
    const rad = v => parseFloat(v) * Math.PI / 180;
    return { tilt: rad(cs.getPropertyValue('--tilt')), spin: rad(cs.getPropertyValue('--spin')) };
  }

  function screenToFloor(dx, dy, zoom, cam) {
    const a = dx / zoom;
    const b = dy / (zoom * Math.max(Math.cos(cam.tilt), 0.2));
    return [a * Math.cos(cam.spin) + b * Math.sin(cam.spin), -a * Math.sin(cam.spin) + b * Math.cos(cam.spin)];
  }

  // Pan: hold the right button and drag. The scene follows the cursor 1:1.
  let drag = null;
  stage.addEventListener('contextmenu', e => e.preventDefault());
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 2) return;
    drag = { x: e.clientX, y: e.clientY, cam: cameraNow() };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('panning');
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    const [fx, fy] = screenToFloor(e.clientX - drag.x, e.clientY - drag.y, view.fitZoom * view.zoom, drag.cam);
    view.panX += fx;
    view.panY += fy;
    drag.x = e.clientX;
    drag.y = e.clientY;
    applyView();
  });
  const endDrag = e => {
    if (!drag) return;
    drag = null;
    stage.classList.remove('panning');
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // Zoom: mouse wheel, towards the point under the cursor. That point must stay under the cursor,
  // so the pan moves by  floor(cursor offset) · (1/newZoom − 1/oldZoom).
  const ZOOM_MIN = 0.3, ZOOM_MAX = 6;
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const cam = cameraNow();
    const oldZoom = view.fitZoom * view.zoom;
    view.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom * Math.exp(-e.deltaY * 0.0015)));
    const newZoom = view.fitZoom * view.zoom;
    const [fx, fy] = screenToFloor(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), 1, cam);
    view.panX += fx * (1 / newZoom - 1 / oldZoom);
    view.panY += fy * (1 / newZoom - 1 / oldZoom);
    applyView();
  }, { passive: false });

  // ---------------------------------------------------------------- load

  function fail(message) {
    const box = document.getElementById('problems');
    box.hidden = false;
    box.replaceChildren(Object.assign(el('div', 'problem error'), { textContent: message }));
    console.error('atlas:', message);
  }

  fetch(INVENTORY_URL, { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(`${INVENTORY_URL}: HTTP ${r.status}`); return r.text(); })
    .then(t => { setText(t); Atlas.loadedText = t; document.dispatchEvent(new Event('atlas:loaded')); })
    .catch(e => fail(location.protocol === 'file:'
      ? 'Open the page over http, not from disk: e.g. `python3 -m http.server` in the repo, then http://localhost:8000/'
      : `Could not load the inventory — ${e.message}`));
})();
