// Renders the inventory model (model.js) into a CSS 3D scene with three floors:
//   plan     (z = 0)    — the drawing on the floor: grid and zones (rooms, cabinets)
//   hardware (z = 0)    — boxes, ports at the foot of each box, cables on the floor
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

  // ---------------------------------------------------------------- plan floor

  function renderPlan(layer) {
    const { floor } = model;
    const svg = sheet(floor);
    const g = floor.grid || 20;
    svg.innerHTML = `
      <defs><pattern id="grid" width="${g}" height="${g}" patternUnits="userSpaceOnUse">
        <path d="M${g} 0H0V${g}" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern></defs>
      <rect width="${floor.width}" height="${floor.height}" fill="url(#grid)" stroke="var(--floor-edge)"/>`;

    for (const z of model.zones) {
      svg.appendChild(svgEl('rect', {
        class: 'zone' + (Atlas.selectedZone === z.id ? ' selected' : ''), 'data-zone': z.id,
        x: z.x, y: z.y, width: z.w, height: z.d, rx: 10,
        fill: 'transparent', stroke: 'var(--zone)', 'stroke-width': 2, 'stroke-dasharray': '10 8',
      }));
      const t = svgEl('text', { x: z.x + 12, y: z.y + z.d - 14, fill: 'var(--text-muted)', 'font-size': 14 });
      t.textContent = z.name;
      svg.appendChild(t);
    }
    layer.appendChild(svg);
    if (Atlas.decoratePlan) Atlas.decoratePlan(layer, model);
  }

  // ---------------------------------------------------------------- hardware floor

  function renderHardware(layer) {
    const { floor } = model;
    const svg = sheet(floor);
    svg.style.transform = 'translateZ(1px)';    // just above the plan, or the two sheets z-fight

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

    const plan = el('div', 'layer plan');
    const hw = el('div', 'layer hardware');
    const net = el('div', 'layer network');
    renderPlan(plan);
    renderHardware(hw);
    renderNetwork(net, netZ);
    scene.append(plan, hw, net);
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

  // ---------------------------------------------------------------- camera
  //
  // The camera is two angles on the stage, --tilt (0° = straight down, up to 80°) and --spin
  // (around the vertical). The scene and the camera cube both read them, and the stage animates
  // them over --camera-duration — except while orbiting, when they follow the mouse directly.
  const SIDE = { tilt: 58, spin: 45 };
  const cam = { ...SIDE };
  const VIEWS = {                               // what clicking a part of the camera cube does
    top:     { tilt: 0,  spin: 0 },
    south:   { tilt: 62, spin: 0 },     east:    { tilt: 62, spin: 90 },
    north:   { tilt: 62, spin: 180 },   west:    { tilt: 62, spin: -90 },
    'iso-se': SIDE,                     'iso-sw': { tilt: 58, spin: -45 },
    'iso-ne': { tilt: 58, spin: 135 },  'iso-nw': { tilt: 58, spin: -135 },
  };

  function setCamera(tilt, spin, animate) {
    // Spin is free-running: always take the short way round to the target angle.
    const delta = ((((spin - cam.spin) % 360) + 540) % 360) - 180;
    cam.tilt = Math.min(80, Math.max(0, tilt));
    cam.spin = cam.spin + delta;
    stage.classList.toggle('orbiting', !animate);
    stage.style.setProperty('--tilt', cam.tilt + 'deg');
    stage.style.setProperty('--spin', cam.spin + 'deg');
  }

  function resetView() {
    view.zoom = 1; view.panX = 0; view.panY = 0;
    applyView();
    setCamera(SIDE.tilt, SIDE.spin, true);
  }

  // Orbit: middle button, or Ctrl + right / left button, anywhere on the stage — or drag the cube.
  let orbit = null;
  function startOrbit(e) {
    orbit = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, source: e.currentTarget };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveOrbit(e) {
    if (!orbit) return false;
    const dx = e.clientX - orbit.x, dy = e.clientY - orbit.y;
    if (!orbit.moved && Math.hypot(dx, dy) < 4) return true;
    orbit.moved = true;
    orbit.x = e.clientX; orbit.y = e.clientY;
    setCamera(cam.tilt - dy * 0.3, cam.spin + dx * 0.4, false);
    return true;
  }
  function endOrbit() {
    const o = orbit;
    orbit = null;
    stage.classList.remove('orbiting');
    return o;
  }

  stage.addEventListener('pointerdown', e => {
    if (e.button === 1 || (e.ctrlKey && (e.button === 0 || e.button === 2))) {
      e.preventDefault();                      // no Windows autoscroll on the middle button
      e.stopImmediatePropagation();            // and no pan / edit for this press
      startOrbit(e);
    }
  }, true);
  // Capture phase on the stage, but only for an orbit started on the stage (the cube handles its own).
  const stageOrbit = () => orbit && orbit.source === stage;
  stage.addEventListener('pointermove', e => { if (stageOrbit()) { moveOrbit(e); e.stopImmediatePropagation(); } }, true);
  stage.addEventListener('pointerup', e => { if (stageOrbit()) { endOrbit(); e.stopImmediatePropagation(); } }, true);

  // The camera cube: a little CSS 3D cube in the corner that turns with the camera.
  function buildCube() {
    const wrap = document.getElementById('cube');
    const cube = el('div', 'cube');
    const face = (cls, text, viewName) => {
      const f = el('div', 'cube-face ' + cls);
      f.textContent = text;
      f.dataset.view = viewName;
      return f;
    };
    const top = face('top', 'TOP', 'top');
    const s = 50;
    for (const [x, y, v] of [[s, s, 'iso-se'], [0, s, 'iso-sw'], [s, 0, 'iso-ne'], [0, 0, 'iso-nw']]) {
      const c = el('div', 'cube-corner');
      Object.assign(c.style, { left: px(x), top: px(y) });
      c.dataset.view = v;
      cube.appendChild(c);
    }
    cube.append(el('div', 'cube-floor'), top,
      face('south', 'FRONT', 'south'), face('east', 'RIGHT', 'east'),
      face('north', 'BACK', 'north'), face('west', 'LEFT', 'west'));
    wrap.appendChild(cube);

    wrap.addEventListener('pointerdown', e => { e.stopPropagation(); startOrbit(e); });
    wrap.addEventListener('pointermove', e => { e.stopPropagation(); moveOrbit(e); });
    wrap.addEventListener('pointerup', e => {
      e.stopPropagation();
      const o = endOrbit();
      if (o && !o.moved) {                     // a click, not a drag: go to that view
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const v = hit && hit.closest('[data-view]');
        if (v && VIEWS[v.dataset.view]) setCamera(VIEWS[v.dataset.view].tilt, VIEWS[v.dataset.view].spin, true);
      }
    });
    document.getElementById('home').addEventListener('click', resetView);
  }

  // ---------------------------------------------------------------- floors
  //
  // An elevator panel on the right: one stop per floor, bottom to top. Dragging the thumb blends
  // the floors continuously (camera height and fades); releasing snaps to the nearest floor.
  const FLOORS = [
    { id: 'plan', name: 'Plan' },
    { id: 'hardware', name: 'Hardware' },
    { id: 'network', name: 'Network' },
  ];
  const floorsEl = document.getElementById('floors');
  const STOP = 56;
  const stopY = i => (FLOORS.length - 1 - i) * STOP + STOP / 2;     // px from the panel top

  function setFloor(floor) {
    stage.dataset.floor = floor;
    const i = FLOORS.findIndex(f => f.id === floor);
    floorsEl.setAttribute('aria-valuenow', i);
    floorsEl.setAttribute('aria-valuetext', FLOORS[i].name);
    floorsEl.querySelector('.thumb').style.top = px(stopY(i));
    for (const b of floorsEl.querySelectorAll('.stop')) b.classList.toggle('active', b.dataset.floor === floor);
    document.dispatchEvent(new CustomEvent('atlas:floor', { detail: floor }));
  }

  // Continuous floor position t (0 = plan, 1 = hardware, 2 = network) → camera height and fades,
  // the same values the CSS gives each floor, interpolated in between.
  function blendFloors(t) {
    const netZ = parseFloat(scene.style.getPropertyValue('--net-z')) || 0;
    const lerp = (a, b, u) => a + (b - a) * u;
    const DIM = 0.22, GLASS = 0.35, PLAN_HW = 0.45;
    const u = Math.min(1, Math.max(0, t - 1)), v = Math.min(1, Math.max(0, t));
    const vars = {
      '--focus-z': px(u * netZ),
      '--hw-alpha': t <= 1 ? lerp(PLAN_HW, 1, v) : lerp(1, DIM, u),
      '--plan-alpha': lerp(1, DIM, u),
      '--net-alpha': lerp(GLASS, 1, u),
    };
    for (const [k, val] of Object.entries(vars)) scene.style.setProperty(k, val);
  }
  function clearBlend() {
    for (const k of ['--focus-z', '--hw-alpha', '--plan-alpha', '--net-alpha']) scene.style.removeProperty(k);
  }

  function buildFloors() {
    floorsEl.style.setProperty('--stops', FLOORS.length);
    floorsEl.setAttribute('aria-valuemin', 0);
    floorsEl.setAttribute('aria-valuemax', FLOORS.length - 1);
    floorsEl.appendChild(el('div', 'rail'));
    FLOORS.forEach((f, i) => {
      const b = el('button', 'stop');
      b.type = 'button';
      b.textContent = f.name;
      b.dataset.floor = f.id;
      b.style.top = px(stopY(i));
      b.tabIndex = -1;
      floorsEl.appendChild(b);
    });
    floorsEl.appendChild(el('div', 'thumb'));

    let scrub = null;
    const tAt = clientY => {
      const r = floorsEl.getBoundingClientRect();
      const y = clientY - r.top;
      return Math.min(FLOORS.length - 1, Math.max(0, (FLOORS.length - 1) - (y - STOP / 2) / STOP));
    };
    floorsEl.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const stop = e.target.closest('.stop');
      if (stop) { setFloor(stop.dataset.floor); return; }
      scrub = { id: e.pointerId };
      floorsEl.setPointerCapture(e.pointerId);
      floorsEl.classList.add('scrubbing');
      scene.classList.add('scrubbing');
      const t = tAt(e.clientY);
      floorsEl.querySelector('.thumb').style.top = px(stopY(t));
      blendFloors(t);
    });
    floorsEl.addEventListener('pointermove', e => {
      if (!scrub) return;
      e.stopPropagation();
      const t = tAt(e.clientY);
      floorsEl.querySelector('.thumb').style.top = px(stopY(t));
      blendFloors(t);
    });
    floorsEl.addEventListener('pointerup', e => {
      if (!scrub) return;
      e.stopPropagation();
      scrub = null;
      const i = Math.round(tAt(e.clientY));
      floorsEl.classList.remove('scrubbing');
      scene.classList.remove('scrubbing');   // from here the CSS takes the last stretch, animated
      clearBlend();
      setFloor(FLOORS[i].id);
    });
    floorsEl.addEventListener('keydown', e => {
      const i = FLOORS.findIndex(f => f.id === stage.dataset.floor);
      const next = e.key === 'ArrowUp' || e.key === 'PageUp' ? i + 1 : e.key === 'ArrowDown' || e.key === 'PageDown' ? i - 1 : null;
      if (next === null || next < 0 || next >= FLOORS.length) return;
      e.preventDefault();
      setFloor(FLOORS[next].id);
    });
  }

  // Overlays (tools, cube, slider) are not part of the scene: presses on them must not pan or edit.
  for (const o of document.querySelectorAll('.toolbar, .nav, .floors')) {
    o.addEventListener('pointerdown', e => e.stopPropagation());
    o.addEventListener('wheel', e => e.stopPropagation());
  }

  buildCube();
  buildFloors();
  setFloor(stage.dataset.floor);
  window.addEventListener('resize', () => model && fit(netHeight()));

  // ---------------------------------------------------------------- API for the editor

  const Atlas = window.Atlas = {
    get model() { return model; },
    get text() { return text; },
    setText,
    render: () => model && render(),
    stage, scene, view,
    selected: null,
    selectedZone: null,
    decorate: null,
    decoratePlan: null,
    get floor() { return stage.dataset.floor; },
    setFloor: f => setFloor(f),
    setCamera, resetView, views: VIEWS,
    get camera() { return { ...cam }; },
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
    if (e.button !== 2 || e.ctrlKey) return;
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
