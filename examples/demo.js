// Example inventory. Purely fictional — real inventories stay out of this repo.
//
// World coordinates, in px of the floor:
//   x, y  — position of the node's footprint on the floor (top-left corner)
//   w, d  — footprint width (along x) and depth (along y)
//   h     — height above the floor
// Cables are polylines lying on the floor.
window.ATLAS_INVENTORY = {
  floor: { width: 800, height: 520, grid: 20 },

  nodes: [
    { id: 'router', name: 'Router',  subtitle: 'gateway',       x: 80,  y: 80,  w: 110, d: 70,  h: 24 },
    { id: 'switch', name: 'Switch',  subtitle: '8 × 1 GbE',     x: 80,  y: 300, w: 150, d: 50,  h: 16 },
    { id: 'server', name: 'Server',  subtitle: 'hypervisor',    x: 420, y: 140, w: 160, d: 150, h: 130 },
    { id: 'nas',    name: 'NAS',     subtitle: '4 bays',        x: 640, y: 160, w: 90,  d: 110, h: 90 },
    { id: 'laptop', name: 'Laptop',  subtitle: 'client',        x: 440, y: 400, w: 100, d: 66,  h: 6 },
  ],

  cables: [
    { from: 'router', to: 'switch', kind: 'copper', points: [[135, 150], [135, 300]] },
    { from: 'switch', to: 'server', kind: 'copper', points: [[230, 325], [340, 325], [340, 215], [420, 215]] },
    { from: 'server', to: 'nas',    kind: 'copper', points: [[580, 215], [640, 215]] },
    { from: 'switch', to: 'laptop', kind: 'wifi',   points: [[180, 350], [180, 433], [440, 433]] },
  ],
};
