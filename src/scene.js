// Renders an inventory into a CSS 3D scene.
// Nodes live in world coordinates (x, y, z-up); this file only projects them via CSS transforms.
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const inventory = window.ATLAS_INVENTORY;
  const stage = document.getElementById('stage');
  const scene = document.getElementById('scene');

  function px(n) { return n + 'px'; }

  function renderFloor(floor, cables) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'floor');
    svg.setAttribute('width', floor.width);
    svg.setAttribute('height', floor.height);
    svg.setAttribute('viewBox', `0 0 ${floor.width} ${floor.height}`);

    const g = floor.grid;
    svg.innerHTML = `
      <defs>
        <pattern id="grid" width="${g}" height="${g}" patternUnits="userSpaceOnUse">
          <path d="M${g} 0H0V${g}" fill="none" stroke="var(--grid)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="${floor.width}" height="${floor.height}" fill="url(#grid)" stroke="var(--floor-edge)"/>`;

    for (const cable of cables) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M' + cable.points.map(p => p.join(' ')).join(' L'));
      path.setAttribute('fill', 'none');
      if (cable.kind === 'wifi') {
        path.setAttribute('stroke', 'var(--wifi)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '6 6');
      } else {
        path.setAttribute('stroke', 'var(--cable)');
        path.setAttribute('stroke-width', '3');
      }
      svg.appendChild(path);
    }
    return svg;
  }

  // A box is three faces: the top, plus the two sides the side-view camera can see
  // (+x "east" and +y "south"). In top view the sides collapse to zero width on their own.
  function renderNode(node) {
    const el = document.createElement('div');
    el.className = 'node';
    el.dataset.id = node.id;
    Object.assign(el.style, { left: px(node.x), top: px(node.y), width: px(node.w), height: px(node.d) });

    const top = document.createElement('div');
    top.className = 'face top';
    Object.assign(top.style, { width: px(node.w), height: px(node.d), transform: `translateZ(${node.h}px)` });

    const east = document.createElement('div');
    east.className = 'face east';
    Object.assign(east.style, { left: px(node.w), top: '0', width: px(node.h), height: px(node.d) });

    const south = document.createElement('div');
    south.className = 'face south';
    Object.assign(south.style, { left: '0', top: px(node.d), width: px(node.w), height: px(node.h) });

    const label = document.createElement('div');
    label.className = 'label';
    label.style.left = px(node.w / 2);
    label.style.top = px(node.d / 2);
    label.style.setProperty('--label-z', px(node.h + 2));
    label.textContent = node.name;
    if (node.subtitle) {
      const small = document.createElement('small');
      small.textContent = node.subtitle;
      label.appendChild(small);
    }

    el.append(top, east, south, label);
    return el;
  }

  function render(inv) {
    scene.replaceChildren();
    scene.style.width = px(inv.floor.width);
    scene.style.height = px(inv.floor.height);
    scene.appendChild(renderFloor(inv.floor, inv.cables));
    for (const node of inv.nodes) scene.appendChild(renderNode(node));
    fit(inv.floor);
  }

  // Scale the scene so the floor fits the stage in the side view (the wider of the two views).
  function fit(floor) {
    const rect = stage.getBoundingClientRect();
    const diagonal = (floor.width + floor.height) * Math.SQRT1_2;
    const zoom = Math.min(rect.width / (diagonal + 80), rect.height / (floor.height + 80), 1.5);
    scene.style.setProperty('--zoom', zoom.toFixed(3));
  }

  function setView(view) {
    stage.classList.toggle('side', view === 'side');
    for (const b of document.querySelectorAll('[data-view]')) {
      b.setAttribute('aria-pressed', String(b.dataset.view === view));
    }
  }

  for (const b of document.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => setView(b.dataset.view));
  }
  window.addEventListener('resize', () => fit(inventory.floor));

  render(inventory);
})();
