// The inventory model: turns the raw YAML data into something the renderer can draw, and checks it.
// Shared by the browser (window.AtlasModel) and the CI validator (require('./model.js')).
//
// Everything refers to everything else by `id`, never by `name`: names are free display text.
// Ports are addressed as "node:port".
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AtlasModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIDES = {                       // outward direction of each side, seen from above
    east:  [1, 0],                      // +x: the lower-right face in the Side view (default)
    west:  [-1, 0],
    south: [0, 1],
    north: [0, -1],
  };
  const DEFAULT_SIDE = 'east';
  const STUB = 20;                      // a cable leaves a port straight out for this long
  const RADIO = new Set(['radio']);
  const RADIO_LINKS = new Set(['wifi', 'ble']);

  // "100M" → 100, "2.5G" → 2500, "10G" → 10000 (Mbit/s). Unknown → null.
  function parseSpeed(s) {
    if (s === undefined || s === null || s === '') return null;
    const m = /^(\d+(?:\.\d+)?)\s*([MG])$/i.exec(String(s).trim());
    if (!m) return NaN;
    return parseFloat(m[1]) * (m[2].toUpperCase() === 'G' ? 1000 : 1);
  }

  function formatSpeed(mbps) {
    if (mbps === null || mbps === undefined) return '';
    return mbps >= 1000 ? `${+(mbps / 1000).toFixed(1)}G` : `${mbps}M`;
  }

  // Line width on screen by negotiated speed: faster links are visibly fatter.
  function widthFor(mbps) {
    if (!mbps) return 2;
    if (mbps <= 100) return 1.5;
    if (mbps <= 1000) return 3;
    if (mbps <= 2500) return 4.5;
    return 7;
  }

  // ---------------------------------------------------------------- IPv4 helpers

  function ipToInt(ip) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    if (!m) return null;
    const parts = m.slice(1).map(Number);
    if (parts.some(p => p > 255)) return null;
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  }

  function parseCidr(cidr) {
    const m = /^([\d.]+)\/(\d{1,2})$/.exec(cidr || '');
    if (!m) return null;
    const base = ipToInt(m[1]);
    const bits = Number(m[2]);
    if (base === null || bits > 32) return null;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return { base: (base & mask) >>> 0, mask };
  }

  const ipInCidr = (ip, c) => ((ipToInt(ip) & c.mask) >>> 0) === c.base;

  // Short form for labels: inside a /24 (or narrower) network show only the last octet.
  function shortIp(ip, cidr) {
    const c = parseCidr(cidr);
    if (!c || ipToInt(ip) === null || c.mask < 0xffffff00) return ip;
    return '.' + ip.split('.')[3];
  }

  // ---------------------------------------------------------------- orthogonal routing
  //
  // A cable is: port → stub straight out → (via points) → stub → port. Between two points the
  // route is an L; of the two possible Ls we take the one that does not double back on itself.

  const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const dirOf = (a, b) => [sign(b[0] - a[0]), sign(b[1] - a[1])];
  const opposite = (d, e) => d && e && d[0] === -e[0] && d[1] === -e[1] && (d[0] || d[1]);

  function connect(a, b, dirIn, dirOut) {
    if (a[0] === b[0] || a[1] === b[1]) return [b];
    const options = [[b[0], a[1]], [a[0], b[1]]].map(corner => {
      const first = dirOf(a, corner), last = dirOf(corner, b);
      const cost = (opposite(first, dirIn) ? 2 : 0) + (opposite(last, dirOut) ? 2 : 0);
      return { corner, cost };
    });
    options.sort((x, y) => x.cost - y.cost);
    return [options[0].corner, b];
  }

  function route(from, to, via) {
    const a0 = from.point, b0 = to.point;
    const a1 = [a0[0] + from.out[0] * STUB, a0[1] + from.out[1] * STUB];
    const b1 = [b0[0] + to.out[0] * STUB, b0[1] + to.out[1] * STUB];
    const stops = [a1, ...(via || []), b1];
    const pts = [a0, a1];
    let dir = from.out;
    for (let i = 1; i < stops.length; i++) {
      const isLast = i === stops.length - 1;
      const dirOut = isLast ? [-to.out[0], -to.out[1]] : null;
      const seg = connect(stops[i - 1], stops[i], dir, dirOut);
      for (const p of seg) { dir = dirOf(pts[pts.length - 1], p); pts.push(p); }
    }
    pts.push(b0);
    return simplify(pts);
  }

  function simplify(points) {
    const out = [];
    for (const p of points) {
      const last = out[out.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;
      out.push(p);
    }
    return out.filter((p, i, a) => {
      if (i === 0 || i === a.length - 1) return true;
      const [q, r] = [a[i - 1], a[i + 1]];
      return !((q[0] === p[0] && p[0] === r[0]) || (q[1] === p[1] && p[1] === r[1]));
    });
  }

  // Middle of the longest straight piece: where a label on the line has the most room.
  function labelSpot(points) {
    let best = null, bestLen = -1;
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      if (len > bestLen) { bestLen = len; best = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    }
    return best;
  }

  // ---------------------------------------------------------------- build + validate

  function build(raw) {
    const errors = [], warnings = [];
    const err = m => errors.push(m), warn = m => warnings.push(m);
    raw = raw || {};

    const networks = new Map();
    for (const n of raw.networks || []) {
      if (networks.has(n.id)) err(`network "${n.id}": duplicate id`);
      networks.set(n.id, { ...n, parsed: parseCidr(n.cidr) });
    }

    const nodes = new Map();
    const ports = new Map();        // "node:port" → port
    const seenIps = new Map();

    for (const n of raw.nodes || []) {
      if (nodes.has(n.id)) { err(`node "${n.id}": duplicate id`); continue; }
      const L = n.layout || {};
      const node = { ...n, layout: L, ports: [], interfaces: [] };
      nodes.set(n.id, node);

      // Ports, spread evenly along their side.
      const bySide = {};
      for (const p of n.ports || []) {
        const side = p.side || DEFAULT_SIDE;
        if (!SIDES[side]) err(`port "${n.id}:${p.id}": unknown side "${side}"`);
        (bySide[side] = bySide[side] || []).push(p);
      }
      for (const [side, list] of Object.entries(bySide)) {
        list.forEach((p, i) => {
          const key = `${n.id}:${p.id}`;
          if (ports.has(key)) { err(`port "${key}": duplicate id`); return; }
          const t = (i + 1) / (list.length + 1);
          const point =
            side === 'east'  ? [L.x + L.w, L.y + L.d * t] :
            side === 'west'  ? [L.x,       L.y + L.d * t] :
            side === 'south' ? [L.x + L.w * t, L.y + L.d] :
                               [L.x + L.w * t, L.y];
          const speed = parseSpeed(p.speed);
          if (Number.isNaN(speed)) err(`port "${key}": speed "${p.speed}" is not like 100M / 1G / 2.5G`);
          const port = {
            ...p, key, node, side, point, out: SIDES[side] || SIDES.east,
            kind: p.kind || 'copper', speed: Number.isNaN(speed) ? null : speed,
            networks: new Set(p.networks || []), links: [],
          };
          for (const net of port.networks) if (!networks.has(net)) err(`port "${key}": unknown network "${net}"`);
          ports.set(key, port);
          node.ports.push(port);
        });
      }

      // Interfaces: where addresses live. They sit on ports and put those ports into their network.
      for (const i of n.interfaces || []) {
        const where = `interface "${n.id}/${i.id}"`;
        const net = networks.get(i.network);
        if (!net) err(`${where}: unknown network "${i.network}"`);
        const on = Array.isArray(i.on) ? i.on : [i.on];
        for (const pid of on) {
          const port = ports.get(`${n.id}:${pid}`);
          if (!port) err(`${where}: no port "${pid}" on node "${n.id}"`);
          else if (net) port.networks.add(net.id);
        }
        const ip = i.ip === undefined ? null : String(i.ip);
        if (ip && ip !== 'dhcp' && ip !== 'unknown') {
          if (ipToInt(ip) === null) err(`${where}: "${ip}" is not an IPv4 address (or dhcp / unknown)`);
          else {
            if (net && net.parsed && !ipInCidr(ip, net.parsed)) err(`${where}: ${ip} is outside ${net.id} ${net.cidr}`);
            if (seenIps.has(ip)) err(`${where}: ${ip} is already used by ${seenIps.get(ip)}`);
            seenIps.set(ip, where);
          }
        }
        node.interfaces.push({ ...i, ip, net });
      }
    }

    // Links: "node:port" ↔ "node:port".
    const links = [];
    for (const l of raw.links || []) {
      const where = `link ${l.from} → ${l.to}`;
      const a = ports.get(l.from), b = ports.get(l.to);
      if (!a) err(`${where}: no port "${l.from}"`);
      if (!b) err(`${where}: no port "${l.to}"`);
      if (!a || !b) continue;
      const kind = l.kind || (RADIO.has(a.kind) || RADIO.has(b.kind) ? 'wifi' : a.kind === 'fiber' ? 'fiber' : 'copper');
      const radio = RADIO_LINKS.has(kind);
      if (radio && !RADIO.has(a.kind) && !RADIO.has(b.kind)) warn(`${where}: ${kind} link between two wired ports`);
      if (!radio && (RADIO.has(a.kind) || RADIO.has(b.kind))) err(`${where}: a ${kind} cable on a radio port`);

      let speed = parseSpeed(l.speed);
      if (Number.isNaN(speed)) { err(`${where}: speed "${l.speed}" is not like 100M / 1G / 2.5G`); speed = null; }
      const known = [a.speed, b.speed].filter(s => s);
      if (speed === null && !radio && known.length) speed = Math.min(...known);   // negotiates down to the slower end
      if (a.speed && b.speed && a.speed !== b.speed && !radio) {
        warn(`${where}: ports differ (${formatSpeed(a.speed)} / ${formatSpeed(b.speed)}), runs at ${formatSpeed(Math.min(a.speed, b.speed))}`);
      }

      const link = { ...l, a, b, kind, radio, speed, points: route(a, b, l.via) };
      a.links.push(link);
      b.links.push(link);
      links.push(link);
    }

    // A wired port takes one cable; a radio port takes many.
    for (const p of ports.values()) {
      if (!RADIO.has(p.kind) && p.links.length > 1) err(`port "${p.key}": ${p.links.length} cables on one ${p.kind} port`);
    }

    // Network floor: a link belongs to every network that both of its ports carry.
    for (const link of links) {
      link.networks = [...link.a.networks].filter(id => link.b.networks.has(id));
    }
    const netNodes = [...nodes.values()].filter(n => n.ports.some(p => p.networks.size) || n.interfaces.length);

    for (const z of raw.zones || []) if (!z.id) err(`zone "${z.name}": missing id`);

    return {
      title: raw.title || '',
      floor: raw.floor || { width: 800, height: 600, grid: 20 },
      zones: raw.zones || [],
      networks, nodes, ports, links, netNodes, errors, warnings,
    };
  }

  return { build, parseSpeed, formatSpeed, widthFor, shortIp, labelSpot, SIDES, DEFAULT_SIDE };
});
