// Renders an inventory into a CSS 3D scene with two floors:
//   hardware (z = 0)    — zones, boxes and the cables lying on the floor
//   network  (z = netZ) — floating in the air above it: one rectangle per networked node
//                         (the node's outline seen from above) and the connections between them.
// Data lives in world coordinates; this file only projects it via CSS transforms.
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const inv = window.ATLAS_INVENTORY;
  const stage = document.getElementById('stage');
  const scene = document.getElementById('scene');

  const CORNER_RADIUS = 14;
  const LINK_STYLE = {
    copper: { stroke: 'var(--copper)', width: 3 },
    fiber:  { stroke: 'var(--fiber)',  width: 3 },
    wifi:   { stroke: 'var(--wifi)',   width: 2, dash: '6 6' },
    ble:    { stroke: 'var(--ble)',    width: 2, dash: '2 5' },
  };
  const isRadio = kind => kind === 'wifi' || kind === 'ble';

  const px = n => n + 'px';
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  };

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

  // ---------------------------------------------------------------- line rules
  //
  // 1. Seen from above, every straight piece is horizontal or vertical. A diagonal piece in the
  //    data is split into an L (horizontal first, then vertical) and reported in the console.
  // 2. Every corner is a quarter circle, never a sharp turn.
  // 3. Lines end on a node's outline, not in its centre (the data gives points on box edges).

  function orthogonal(points, name) {
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = out[out.length - 1];
      const [bx, by] = points[i];
      if (ax !== bx && ay !== by) {
        console.warn(`atlas: diagonal segment in ${name}, routed as an L`, [ax, ay], [bx, by]);
        out.push([bx, ay]);
      }
      out.push([bx, by]);
    }
    // Drop repeated points and points in the middle of a straight run (they are not corners).
    return out.filter((p, i, a) => {
      if (i > 0 && p[0] === a[i - 1][0] && p[1] === a[i - 1][1]) return false;
      if (i === 0 || i === a.length - 1) return true;
      const [q, r] = [a[i - 1], a[i + 1]];
      return !((q[0] === p[0] && p[0] === r[0]) || (q[1] === p[1] && p[1] === r[1]));
    });
  }

  // Path with each corner replaced by a circular arc. The radius shrinks on short segments so
  // two neighbouring arcs never overlap.
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

  const linkPath = link => roundedPath(orthogonal(link.points, `${link.from} → ${link.to}`));

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
        d: linkPath(link), fill: 'none', stroke: s.stroke, 'stroke-width': s.width,
        'stroke-linecap': 'round', ...(s.dash ? { 'stroke-dasharray': s.dash } : {}),
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

  function renderNetwork(layer, netZ) {
    const { floor } = inv;
    const nodes = Object.fromEntries(inv.nodes.map(n => [n.id, n]));
    const networks = inv.networks || [];

    // Lines and rectangles share one SVG: separate planes 1px apart would z-fight.
    const svg = sheet(floor);

    // Connections: the cables between members of the same network, in the network's colour.
    for (const net of networks) {
      const ids = new Set(net.members.map(m => m.node));
      for (const link of inv.links || []) {
        if (!ids.has(link.from) || !ids.has(link.to)) continue;
        svg.appendChild(svgEl('path', {
          d: linkPath(link), fill: 'none', stroke: net.color, 'stroke-width': 4,
          'stroke-linecap': 'round', ...(isRadio(link.kind) ? { 'stroke-dasharray': '8 6' } : {}),
        }));
      }
    }

    // Nodes: every node that is a member of at least one network, as its outline from above.
    const perNode = new Map();
    for (const net of networks) {
      for (const m of net.members) {
        if (!nodes[m.node]) continue;
        if (!perNode.has(m.node)) perNode.set(m.node, []);
        perNode.get(m.node).push({ net, m });
      }
    }

    for (const [id, entries] of perNode) {
      const n = nodes[id];
      svg.appendChild(svgEl('rect', {
        class: 'netnode', x: n.x, y: n.y, width: n.w, height: n.d, rx: 6,
        fill: 'var(--net-node-fill)', stroke: 'var(--net-node-stroke)', 'stroke-width': 2,
      }));

      // Threads from the rectangle's corners down to the box: the outline reads as the box's ghost.
      for (const [cx, cy] of [[n.x, n.y], [n.x + n.w, n.y], [n.x, n.y + n.d], [n.x + n.w, n.y + n.d]]) {
        const t = el('div', 'thread fade');
        Object.assign(t.style, { left: px(cx), top: px(cy), height: px(netZ - n.h) });
        layer.appendChild(t);
      }

      // One label per node: its name, then one line per address, marked with the network's colour.
      const l = label(n.name, null, 'netnode');
      for (const { net, m } of entries) {
        if (!m.ip) continue;
        const line = el('span', 'addr');
        line.style.setProperty('--net-color', net.color);
        line.textContent = m.label ? `${m.ip}  ${m.label}` : m.ip;
        l.appendChild(line);
      }
      Object.assign(l.style, { left: px(n.x + n.w / 2), top: px(n.y + n.d / 2) });
      l.style.setProperty('--label-z', '3px');   // just above the sheet, or the rectangles cover it in top view
      layer.appendChild(l);
    }
    layer.appendChild(svg);

    renderLegend(networks);
  }

  // Colour key for the networks (screen overlay, not part of the scene).
  function renderLegend(networks) {
    const legend = document.getElementById('legend');
    if (!legend) return;
    legend.replaceChildren();
    for (const net of networks) {
      const row = el('div', 'legend-row');
      row.style.setProperty('--net-color', net.color);
      row.textContent = net.name;
      if (net.cidr) { const s = el('small'); s.textContent = net.cidr; row.appendChild(s); }
      legend.appendChild(row);
    }
  }

  // ---------------------------------------------------------------- scene

  const netHeight = () => Math.max(0, ...inv.nodes.map(n => n.h)) + 70;   // clears the tallest box

  function render() {
    const { floor } = inv;
    document.getElementById('title').textContent = inv.title || '';
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
  window.addEventListener('resize', () => fit(netHeight()));

  render();
})();
