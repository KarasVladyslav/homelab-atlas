# homelab-atlas

A self-hosted home page that draws your homelab as it actually is:
the physical network, the machines on it, and what runs on them.

You describe the lab once in an inventory file, and the atlas renders it
as a live diagram. Add a node, re-cable a switch, retire a disk — the
picture follows.

> **Status:** early days. The repo is being built up incrementally;
> nothing here is usable yet.

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
