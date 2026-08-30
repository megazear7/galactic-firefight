# Galactic Firefight

Turn-based tactics in a 3D web canvas. Galactic Empire versus the Brood Swarm.

- Single player against a heuristic opponent
- Multiplayer by invite link (Megazear identity; host owns the save)
- Guest play stores data in the browser; multiplayer is disabled until you sign in
- Graphics: image sprites now, 3D model hook ready
- Settings: master / music / effects volume

Play: select a unit with a green ring, click **any point** in range — pathfinding walks them around walls and bodies. Set facing, then fire or strike. Each side gets **five activations** per round. Walls and units block shots; a green overlay shows what the active unit can see. Overwatch fires once per turn from the closest eligible watcher. Tracers and melee slashes mark every hit.

Site: [galactic-firefight.megazear7.com](https://galactic-firefight.megazear7.com)

Hosting and identity env vars: [NEXT_STEPS.md](./NEXT_STEPS.md)
