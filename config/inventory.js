// Default inventory: a fictional example lab. Real inventories stay out of this repo —
// in a deployment, mount your own file over config/inventory.js (e.g. from a ConfigMap).
//
// World coordinates, in px of the floor:
//   x, y  — top-left corner of a footprint on the floor
//   w, d  — footprint width (along x) and depth (along y)
//   h     — height above the floor
//
// Two floors:
//   hardware — zones (areas of the floor), nodes (boxes) and links (cables, radio) lying on the floor
//   network  — floats above the hardware: every member of a network points at a hardware node
//              and is drawn as that node's outline; connections are the links between members.
//
// Link rules: seen from above, every straight piece is horizontal or vertical (a diagonal is
// routed as an L and reported in the console), corners are drawn rounded, and the first/last
// points sit on the edges of the two boxes.
window.ATLAS_INVENTORY = {
  title: 'Example lab',
  floor: { width: 900, height: 560, grid: 20 },

  zones: [
    { id: 'closet', name: 'Network closet', x: 20,  y: 20, w: 360, d: 520 },
    { id: 'office', name: 'Office',         x: 440, y: 20, w: 440, d: 520 },
  ],

  nodes: [
    { id: 'isp',    name: 'Internet', subtitle: 'ISP fiber',     x: 50,  y: 50,  w: 70,  d: 50,  h: 6 },
    { id: 'router', name: 'Router',   subtitle: 'gateway',       x: 150, y: 150, w: 110, d: 70,  h: 24 },
    { id: 'server', name: 'Server',   subtitle: 'hypervisor',    x: 60,  y: 320, w: 160, d: 150, h: 120 },
    { id: 'switch', name: 'Switch',   subtitle: '8 × 1 GbE',     x: 480, y: 160, w: 150, d: 50,  h: 16 },
    { id: 'nas',    name: 'NAS',      subtitle: '4 bays',        x: 720, y: 280, w: 100, d: 120, h: 90 },
    { id: 'ap',     name: 'Wi-Fi AP', subtitle: 'access point',  x: 500, y: 360, w: 90,  d: 60,  h: 14 },
    { id: 'laptop', name: 'Laptop',   subtitle: 'client',        x: 660, y: 460, w: 90,  d: 60,  h: 6 },
  ],

  // kind: copper | fiber | wifi | ble
  links: [
    { from: 'isp',    to: 'router', kind: 'fiber',  points: [[120, 75], [205, 75], [205, 150]] },
    { from: 'router', to: 'server', kind: 'copper', points: [[180, 220], [180, 280], [140, 280], [140, 320]] },
    { from: 'router', to: 'switch', kind: 'copper', points: [[260, 185], [480, 185]] },
    { from: 'switch', to: 'nas',    kind: 'copper', points: [[630, 185], [770, 185], [770, 280]] },
    { from: 'switch', to: 'ap',     kind: 'copper', points: [[545, 210], [545, 360]] },
    { from: 'ap',     to: 'laptop', kind: 'wifi',   points: [[590, 400], [705, 400], [705, 460]] },
  ],

  networks: [
    {
      id: 'wan', name: 'WAN', cidr: 'ISP', color: '#ef9f27',
      members: [{ node: 'isp' }, { node: 'router', ip: '203.0.113.7' }],
    },
    {
      id: 'lan', name: 'LAN', cidr: '10.0.0.0/24', color: '#378add',
      members: [
        { node: 'router', ip: '10.0.0.1' },
        { node: 'server', ip: '10.0.0.10', label: 'host' },
        { node: 'server', ip: '10.0.0.20', label: 'vm' },
        { node: 'switch' },
        { node: 'nas',    ip: '10.0.0.30' },
        { node: 'ap',     ip: '10.0.0.5' },
        { node: 'laptop', ip: 'DHCP' },
      ],
    },
  ],
};
