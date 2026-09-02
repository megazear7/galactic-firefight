export const SPACE_ADJECTIVES = [
  "Astral", "Auroral", "Binary", "Blazing", "Celestial", "Cometary", "Cosmic", "Crimson", "Distant", "Eclipsed",
  "Electric", "Emerald", "Endless", "Eventide", "Falling", "Frozen", "Galactic", "Glowing", "Golden", "Gravity",
  "Hidden", "Hollow", "Hyper", "Infinite", "Ionized", "Jovian", "Lunar", "Magnetic", "Meteoric", "Midnight",
  "Nebular", "Neon", "Orbital", "Pale", "Phantom", "Planetary", "Radiant", "Rapid", "Redshift", "Remote",
  "Rogue", "Satellite", "Scarlet", "Shadowed", "Shooting", "Silent", "Solar", "Stellar", "Stratospheric", "Sublight",
  "Supernova", "Terrestrial", "Titanic", "Ultraviolet", "Uncharted", "Vast", "Venusian", "Violet", "Warped", "White",
  "Wild", "Winding", "Zero-G", "Zenith", "Ashen", "Brilliant", "Burning", "Charged", "Chilled", "Dark",
  "Dawnlit", "Deep", "Drifting", "Dusty", "Faraway", "Flarelit", "Fluxing", "Frontier", "Gaseous", "Glacial",
  "Heliocentric", "Horizon", "Interstellar", "Luminous", "Martian", "Mercurial", "Moonlit", "Nova", "Oort", "Pulsar",
  "Quasar", "Radiating", "Rocketing", "Saturnine", "Solaris", "Spacetime", "Spectral", "Tidal", "Twilight", "Vacuum",
] as const;

export const SPACE_NOUNS = [
  "Adventurer", "Apollo", "Arc", "Asteroid", "Beacon", "Blackhole", "Borealis", "Comet", "Constellation", "Corona",
  "Cosmonaut", "Crater", "Drifter", "Eclipse", "Equinox", "Explorer", "Flare", "Galaxy", "Gazer", "Gravitywell",
  "Horizon", "Jupiter", "Kepler", "Launch", "Lander", "Lighthouse", "Luna", "Meteor", "Moon", "Nebula",
  "Neptune", "Nova", "Orbit", "Outpost", "Oxygen", "Pioneer", "Planet", "Plasma", "Probe", "Pulsar",
  "Quasar", "Ranger", "Redgiant", "Rocket", "Saturn", "Satellite", "Shuttle", "Singularity", "Solstice", "Stargate",
  "Starship", "Sunrise", "Supernova", "Telescope", "Terminus", "Titan", "Trailblazer", "Traveler", "Universe", "Vanguard",
  "Venus", "Voyager", "Wormhole", "Zephyr", "Aether", "Apex", "Atlas", "Canyon", "Chaser", "Circuit",
  "Dynamo", "Ember", "Engine", "Expanse", "Flux", "Forge", "Frontier", "Helix", "Impulse", "Junction",
  "Matrix", "Mirage", "Nexus", "Parallax", "Perihelion", "Phoenix", "Radiance", "Relay", "Rift", "Sentry",
  "Specter", "Spiral", "Station", "Sundial", "Vector", "Vortex", "Waypoint", "Whirlwind", "Zenith", "Zone",
] as const;

export function randomGameName() {
  const adjective = SPACE_ADJECTIVES[Math.floor(Math.random() * SPACE_ADJECTIVES.length)];
  const noun = SPACE_NOUNS[Math.floor(Math.random() * SPACE_NOUNS.length)];
  return `${adjective} ${noun}`;
}
