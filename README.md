# homelab-atlas

A self-hosted home page that draws your homelab as it actually is:
the physical network, the machines on it, and what runs on them.

You describe the lab once in an inventory file, and the atlas renders it
as a live diagram. Add a node, re-cable a switch, retire a disk — the
picture follows.

> **Status:** early days. The repo is being built up incrementally.

## Try it

The page has no build step, but it fetches `config/inventory.yaml`, so serve the
folder over http (any static server):

```sh
python3 -m http.server 8000     # then open http://localhost:8000/
```

The toggles in the top-right corner switch the floor (Hardware / Network) and
the camera (Top / Side). Hold the right mouse button and drag to move around;
the mouse wheel zooms towards the cursor.

Or run the image:

```sh
docker run --rm -p 8080:8080 ghcr.io/karasvladyslav/homelab-atlas:latest
```

## Your own lab

Describe it in a YAML file and mount it over the example:

```sh
docker run --rm -p 8080:8080 \
  -v "$PWD/my-lab.yaml:/usr/share/nginx/html/config/inventory.yaml:ro" \
  ghcr.io/karasvladyslav/homelab-atlas:latest
```

The format is documented at the top of [`config/inventory.yaml`](config/inventory.yaml)
and in [`schema/inventory.schema.json`](schema/inventory.schema.json) (point your
editor's YAML plugin at it for autocompletion). In short:

- **nodes** — boxes with a `layout` (position and size), **ports** (speed, side,
  kind: copper / fiber / radio) and **interfaces** (addresses, which sit on ports
  and put them into a network);
- **links** — cables and radio links between ports, `node:port` to `node:port`;
- **networks** — the network floor is derived from them: a link shows up in every
  network both of its ports carry.

Everything is referenced by `id`; `name` is display text you can change freely.
Check a file before deploying it — the same checks the page runs:

```sh
npm ci
node tools/validate.mjs my-lab.yaml
```

It fails on broken references, duplicate ids or IPs, an address outside its
network, or two cables on one port; it warns about speed mismatches.

## Two floors

- **Hardware** — the floor: zones, boxes, and the cables (copper, fiber, Wi-Fi,
  BLE) lying on it.
- **Network** — floating above it: every networked node as its outline seen from
  above, with its ports (speed on each) and addresses, and the links that carry
  each network in that network's colour. Dashed threads drop from each outline to
  its box, so the two floors never drift apart.

Lines follow the same rules on both floors: only horizontal and vertical pieces
seen from above, rounded corners, ending on a port. Line width shows the
negotiated speed (the slower of the two ports): 100M thin, 1G, 2.5G, 10G thick;
Wi-Fi and BLE are dashed.

The floor you are not working on fades.

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
