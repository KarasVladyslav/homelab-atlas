// Renders an inventory into a CSS 3D scene with two floors:
//   hardware (z = 0)      — zones, boxes and the cables lying on the floor
//   network  (z = netZ)   — a glass plate with network outlines, logical links and addresses,
//                           every element anchored to the hardware right below it.
// Data lives in world coordinates; this file only projects it via CSS transforms.
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const inv = window.ATLAS_INVENTORY;
  const stage = document.getElementById('stage');
  const scene = document.getElementById('scene');

  const LINK_STYLE = {
    copper: { stroke: 'var(--copper)', width: 3 },
    fiber:  { stroke: 'var(--fiber)',  width: 3 },
    wifi:   { stroke: 'var(--wifi)',   width: 2, dash: '6 6' },
    ble:    { stroke: 'var(--ble)',    width: 2, dash: '2 5' },
  };

  const px = n => n + 'px';
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  };
  const pathD = points => 'M' + points.map(p => p.join(' ')).join(' L');

  function label(text, sub, extraClass) {
    const l = el('div', 'label fade' + (extraClass ? ' ' + extraClass : ''));
    l.textContent = text;
    if (sub) { const s = el('small'); s.textContent = sub; l.appendChild(s); }
    return l;
  }

  function sheet(floor) {
    return svgEl('svg', {
      class: 'sheet fade', width: floor.width, height: floor.height,
      viewBox: `0 0 ${floor.width} ${floor.height}`,
    });
  }

  // ---------------------------------------------------------------- hardware floor

  function renderHardware(layer) {
    const { floor } = inv;
    const svg = sheet(floor);
    const g = floor.grid || 20;
    svg.innerHTML = `
      <defs><pattern id="grid" width="${g}" height="${g}" patternUnits="userSpaceOnUse">
        <path d="M${g} 0H0V${g}" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern></defs>
      <rect width="${floor.width}" height="${floor.height}" fill="url(#grid)" stroke="var(--floor-edge)"/>`;

    for (const z of inv.zones || []) {
      svg.appendChild(svgEl('rect', {
        x: z.x, y: z.y, width: z.w, height: z.d, rx: 10,
        fill: 'none', stroke: 'var(--zone)', 'stroke-width': 2, 'stroke-dasharray': '10 8',
      }));
      const t = svgEl('text', { x: z.x + 12, y: z.y + z.d - 14, fill: 'var(--text-muted)', 'font-size': 14 });
      t.textContent = z.name;
      svg.appendChild(t);
    }

    for (const link of inv.links || []) {
      const s = LINK_STYLE[link.kind] || LINK_STYLE.copper;
      svg.appendChild(svgEl('path', {
        d: pathD(link.points), fill: 'none', stroke: s.stroke, 'stroke-width': s.width,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...(s.dash ? { 'stroke-dasharray': s.dash } : {}),
      }));
    }
    layer.appendChild(svg);

    for (const node of inv.nodes) layer.appendChild(renderBox(node));
  }

  // A box is three faces: the top plus the two sides the side-view camera can see
  // (+x "east", +y "south"). In top view the sides collapse to zero width on their own.
  function renderBox(node) {
    const box = el('div', 'node');
    box.dataset.id = node.id;
    Object.assign(box.style, { left: px(node.x), top: px(node.y), width: px(node.w), height: px(node.d) });

    const top = el('div', 'face top fade');
    Object.assign(top.style, { width: px(node.w), height: px(node.d), transform: `translateZ(${node.h}px)` });

    const east = el('div', 'face east fade');
    Object.assign(east.style, { left: px(node.w), top: '0', width: px(node.h), height: px(node.d) });

    const south = el('div', 'face south fade');
    Object.assign(south.style, { left: '0', top: px(node.d), width: px(node.w), height: px(node.h) });

    const l = label(node.name, node.subtitle);
    Object.assign(l.style, { left: px(node.w / 2), top: px(node.d / 2) });
    l.style.setProperty('--label-z', px(node.h + 2));

    box.append(top, east, south, l);
    return box;
  }

  // ---------------------------------------------------------------- network floor

  // Convex hull (monotone chain) — the outline of a network around its members' footprints.
  function hull(points) {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  function renderNetwork(layer, netZ) {
    const { floor } = inv;
    const nodes = Object.fromEntries(inv.nodes.map(n => [n.id, n]));
    const networks = inv.networks || [];

    // The glass is part of the same SVG as the outlines: two planes 1px apart would z-fight
    // and chew holes in the lines.
    const svg = sheet(floor);
    svg.appendChild(svgEl('rect', {
      width: floor.width, height: floor.height, rx: 6,
      fill: 'var(--glass)', 'fill-opacity': .14, stroke: 'var(--glass)',
    }));

    networks.forEach((net, i) => {
      const members = net.members.filter(m => nodes[m.node]);
      const ids = new Set(members.map(m => m.node));
      const pad = 16 + i * 10;
      const corners = [];
      for (const id of ids) {
        const n = nodes[id];
        corners.push([n.x - pad, n.y - pad], [n.x + n.w + pad, n.y - pad],
                     [n.x + n.w + pad, n.y + n.d + pad], [n.x - pad, n.y + n.d + pad]);
      }
      const outline = hull(corners);
      svg.appendChild(svgEl('path', {
        d: pathD(outline) + 'Z', fill: net.color, 'fill-opacity': .10,
        stroke: net.color, 'stroke-width': 2, 'stroke-linejoin': 'round',
      }));

      // Logical links follow the cables they ride on, so the two floors line up. Cables stop at
      // box edges; up here there are no boxes, so extend each one to the centres of its ends.
      const centre = n => [n.x + n.w / 2, n.y + n.d / 2];
      for (const link of inv.links || []) {
        if (!ids.has(link.from) || !ids.has(link.to)) continue;
        const points = [centre(nodes[link.from]), ...link.points, centre(nodes[link.to])];
        svg.appendChild(svgEl('path', {
          d: pathD(points), fill: 'none', stroke: net.color, 'stroke-width': 5,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-opacity': .9,
          ...(link.kind === 'wifi' || link.kind === 'ble' ? { 'stroke-dasharray': '8 6' } : {}),
        }));
      }

      // Network name on the left-most corner of its outline, away from the address labels.
      const anchor = outline.reduce((a, b) => (b[0] < a[0] ? b : a));
      const nl = label(net.name, net.cidr, 'net');
      nl.style.setProperty('--pin-color', net.color);
      Object.assign(nl.style, { left: px(anchor[0] + 10), top: px(anchor[1]) });
      layer.appendChild(nl);
    });
    layer.appendChild(svg);

    // Addresses: one pin per (network, member), spread across the member's footprint,
    // with a thread down to the box it lives on.
    const perNode = {};
    for (const net of networks) {
      for (const m of net.members) {
        if (!nodes[m.node]) continue;
        (perNode[m.node] = perNode[m.node] || []).push({ net, m });
      }
    }
    for (const [id, entries] of Object.entries(perNode)) {
      const n = nodes[id];
      entries.forEach(({ net, m }, i) => {
        const x = n.x + n.w * (i + 1) / (entries.length + 1);
        const y = n.y + n.d / 2;

        const thread = el('div', 'thread fade');
        Object.assign(thread.style, { left: px(x), top: px(y), height: px(netZ - n.h) });
        thread.style.setProperty('--thread-color', net.color);

        const pin = el('div', 'pin fade');
        Object.assign(pin.style, { left: px(x), top: px(y) });
        pin.style.setProperty('--pin-color', net.color);

        layer.append(thread, pin);
        if (m.ip) {
          const l = label(m.ip, m.label || n.name, 'addr');
          l.style.setProperty('--pin-color', net.color);
          Object.assign(l.style, { left: px(x), top: px(y) });
          l.style.setProperty('--lift', px(i * 40));   // several addresses on one box: stack them
          layer.appendChild(l);
        }
      });
    }
  }

  // ---------------------------------------------------------------- scene

  function render() {
    const { floor } = inv;
    document.getElementById('title').textContent = inv.title || '';
    const netZ = Math.max(0, ...inv.nodes.map(n => n.h)) + 70;   // glass clears the tallest box

    scene.replaceChildren();
    scene.style.width = px(floor.width);
    scene.style.height = px(floor.height);
    scene.style.setProperty('--net-z', px(netZ));

    const hw = el('div', 'layer hardware');
    const net = el('div', 'layer network');
    renderHardware(hw);
    renderNetwork(net, netZ);
    scene.append(hw, net);
    fit(netZ);
  }

  // One zoom that fits both views, so switching the camera never needs a re-fit.
  function fit(netZ) {
    const { width: W, height: D } = inv.floor;
    const r = stage.getBoundingClientRect();
    const sideW = (W + D) * Math.SQRT1_2;
    const sideH = sideW * Math.cos(58 * Math.PI / 180) + netZ * Math.sin(58 * Math.PI / 180);
    const zoom = Math.min(r.width / (sideW + 60), r.height / (sideH + 160), r.width / (W + 60), r.height / (D + 60), 1.6);
    scene.style.setProperty('--zoom', zoom.toFixed(3));
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
  window.addEventListener('resize', () => fit(Math.max(0, ...inv.nodes.map(n => n.h)) + 70));

  render();
})();
