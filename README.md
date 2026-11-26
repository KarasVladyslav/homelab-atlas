# homelab-atlas

A self-hosted home page that draws your homelab as it actually is:
the physical network, the machines on it, and what runs on them.

You describe the lab once in an inventory file, and the atlas renders it
as a live diagram. Add a node, re-cable a switch, retire a disk — the
picture follows.

> **Status:** early days. The repo is being built up incrementally.

## Try it

Open `index.html` in a browser — no build step, no server, works from disk.
The toggles in the top-right corner switch the floor (Hardware / Network) and
the camera (Top / Side).

Or run the image:

```sh
docker run --rm -p 8080:8080 ghcr.io/karasvladyslav/homelab-atlas:latest
```

To show your own lab, mount your inventory over the example one:

```sh
docker run --rm -p 8080:8080 \
  -v "$PWD/my-inventory.js:/usr/share/nginx/html/config/inventory.js:ro" \
  ghcr.io/karasvladyslav/homelab-atlas:latest
```

The format is documented at the top of [`config/inventory.js`](config/inventory.js).

## Two floors

- **Hardware** — the floor: zones, boxes, and the cables (copper, fiber, Wi-Fi,
  BLE) lying on it.
- **Network** — a glass plate above it: network outlines, logical links and
  addresses. Every network member points at a hardware node, so the network
  floor follows the hardware layout and never drifts away from it; dashed
  threads drop from each address to the box it lives on.

The floor you are not working on fades: the network turns into faint glass
over the hardware, or the hardware dims under the network.

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
