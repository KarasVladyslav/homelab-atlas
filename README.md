# homelab-atlas

A self-hosted home page that draws your homelab as it actually is:
the physical network, the machines on it, and what runs on them.

You describe the lab once in an inventory file, and the atlas renders it
as a live diagram. Add a node, re-cable a switch, retire a disk — the
picture follows.

> **Status:** early days. The repo is being built up incrementally.

## Try it

Open `index.html` in a browser — no build step, no server, works from disk.
Switch between the side (isometric) and top-down views with the toggle in the
top-right corner.

## How it renders

Pseudo-3D with plain CSS 3D transforms — no 3D engine, no canvas, no WebGL.

- Nodes are stored in **world coordinates** (`x`, `y` on the floor, `w`/`d`
  footprint, `h` height). The renderer only projects them.
- The camera is two registered CSS custom properties, `--tilt` and `--spin`.
  Top view is `0deg / 0deg`; side view tilts the floor away and rotates it 45°.
  One CSS transition on those two angles animates the whole scene.
- No `perspective`, so the projection stays orthographic (isometric-like).
- A box is three `div` faces; labels counter-rotate to always face the viewer.
- The floor (grid and cables) is a flat SVG lying on the scene plane.

## Goals

- **Physical first.** Cables, ports, link speeds, switches, routers —
  the network you could trace with your hands.
- **Nodes as data.** Machines, VMs, containers and services are entries
  in an inventory, not boxes drawn by hand.
- **Live, not a screenshot.** The page reflects the current state and
  makes drift visible: something missing or down shows up as such.
- **Your data stays yours.** The app is public; your inventory is not.
  Real addresses, hostnames and hardware live in your own (private)
  config, and this repo ships only example data.

## License

[MIT](LICENSE)
