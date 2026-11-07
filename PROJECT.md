# Project: NavalCommand.io

## Architecture
NavalCommand.io is a commercial-grade, clean-room 2D top-down multiplayer tactical naval combat web game.
The architecture is structured into a deterministic shared core (`common/`), an authoritative 15–20 Hz server (`server/`), a clean-room procedural vector WebGL client (`client/`), and an opaque-box multi-tier test harness (`tests/`).

### Module & Package Boundaries
- **`common/`**: Pure TypeScript deterministic simulation, data models, and math utilities.
  - `common/models/`: Entity interfaces, 28-ship definitions, 10-tier tech tree, 10 weapon definitions, loadout rules, game mode states, fleet & karma profiles.
  - `common/simulation/`: Fixed-timestep hydrodynamics (2D surge/sway, quadratic drag, turning slip angle, momentum collision impulses), bathymetric depth / draft collision, island polygon clipping, Arctic ice grinding, weapon kinematics, and projectile ballistic solvers.
  - `common/sensors/`: 3-layer sensor algorithms (visual raycasting, radar island occlusion & ECM deflection, passive acoustic cavitation $Noise_{cav} \propto (v - V_{cav})^{2.5}$, active sonar $2\times$ counter-detection, and 5-state track confidence FSM).
  - `common/protocol/`: Binary packet definitions (`ArrayBuffer` / `DataView`), 8 opcodes, 28-byte vessel serialization format, bitflags, and delta compression.
- **`server/`**: Authoritative Node.js/Bun game server running at 15–20 Hz.
  - `server/core/`: Game tick loop, room/match managers (Sandbox, 15-min KOTH/Escort, 1v1 Arena duel manager).
  - `server/netcode/`: WebSocket server (`ws`), binary packet dispatcher, client connection sessions, snapshot broadcaster.
  - `server/ai/`: Autonomous bot controller with island NavMesh, 5-whisker obstacle avoidance, depth switching, resource harvesting, and tactical weapon/equipment deployment.
  - `server/progression/`: Persistent tech tree, naval credits/XP accounting, server-side loadout validation, and anti-cheat checks.
- **`client/`**: 100% clean-room procedural vector WebGL client (`PixiJS` + `TypeScript` + `Vite`).
  - `client/rendering/`: Procedural parametric warship vector rendering, articulated turrets, dynamic water wakes, depth/biome shading, radar/sonar sweep overlays, particle effects. Zero external bitmap sprites.
  - `client/audio/`: Procedural Web Audio API sound synthesizer (cannon firing, torpedo whoosh, sonar pings, engine hums, water wakes, explosions). Zero external audio files.
  - `client/hud/`: Interactive Minimap, Kill Feed, visual firing arcs, sensor range rings, independent reload bars, Dive/Stealth/ECM controls, Tech Tree & Loadout menus.
  - `client/netcode/`: WebSocket binary client, client-side prediction, entity snapshot interpolation with 100ms jitter buffer.
  - `client/sdk/`: Universal `IPlatformSDK` adapter (CrazyGames, Poki, Playgama, Y8, and resilient `StandaloneMockSDK`).
- **`tests/`**: Comprehensive automated test suites across all 5 tiers and Playwright E2E browser tests.

---

## Feature Inventory
Every feature from the Phase 0 Survey is cataloged below with its assigned milestone.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Deterministic 2D Naval Hydrodynamics | Surge/sway velocities, quadratic drag, turning slip angles $\beta = \arctan(w/u)$, momentum transfer collisions | M1 | R1 Survey |
| 2 | 4 Terrain Biomes & Resource Entities | Deep Water, Shallow Water draft grounding, Islands SAT polygons, Arctic Ice Biome grinding & icebreaker immunity; XP Crates and capturable Oil Rigs (+20 XP/s) | M1 | R1 Survey |
| 3 | 10-Tier Ship Progression Roster (28 Vessels) | 28 distinct ships across 8 classes: Patrol/MTB (T1-2), Destroyers (T3-4), Cruisers (T5-6), Battleships (T7-8), Submarines (T4,6,8,10), Carriers (T7,9), Dredger/Icebreaker (T4,7), Support (Mercy Hospital, Tanker, Rig Builder T3,5,6) | M1 | R1 Survey |
| 4 | Naval Artillery Turrets | Caliber-scaled shells, ballistic arcs, traverse rates, dispersion ellipses, port/starboard mount angles | M2 | R1 Survey |
| 5 | Torpedoes & Acoustic Decoys | Straight-running and acoustic-homing torpedoes ($\pm 35^\circ$ seeker cone) plus deployable countermeasure decoys | M2 | R1 Survey |
| 6 | Cruise Missiles & Standoff Weapons | Long-range guided surface/sub-launched missiles, Rocket Barrages, and standoff Rocket Torpedoes | M2 | R1 Survey |
| 7 | SAM & CIWS Point-Defense | Surface-to-Air Missiles and rapid-fire anti-missile/anti-aircraft point defense interception | M2 | R1 Survey |
| 8 | ASW Depth Charges & Naval Mines | Hydrostatic depth charges with sink rates against submerged contacts; moored contact/magnetic sea mines | M2 | R1 Survey |
| 9 | Controllable Aircraft & ASW Helicopters | Cursor-guided attack runs, airstrikes, and deployable persistent Sonar Buoys (1,200m radius, 75s lifespan) | M2 | R1 Survey |
| 10 | Hydraulic Dredger & Sand Depositor | Terrain modification tool excavating channels in shallow water ($D \to 15\text{m}$) or depositing sand ($D \to 1-5\text{m}$) | M2 | R1 Survey |
| 11 | 3-Layer Concurrent Sensor Suite | Visual LoS raycasting, Radar island occlusion & ECM deflection, Passive acoustic cavitation detection, Active sonar $2\times$ counter-detection, 5-state track confidence FSM | M3 | R2 Survey |
| 12 | Submarine & ASW Tactical Balance | 4–6s Dive/Surface transition cooldown (anti-dolphin-hop), periscope/surface missile guidance constraint, Stealth Cruise cavitation toggle ($\le 20\text{ kt}$), aircraft sonobuoy requirement | M3 | R2 Survey |
| 13 | ECM Jamming & Mercy Hospital Mechanics | ECM Jamming (5s active / 25s cooldown, 85% missile deflection, radar blurring); Mercy-class Hospital Ship 50% HP repair on 30s cooldown | M3 | R2 Survey |
| 14 | Anti-Betrayal Fleet & Karma System | Up to 5 visible fleets, join/invite/kick, 15-second Non-Aggression Pact (zero mutual damage), 0–100 Karma score with betrayal penalties and name color shifts | M3 | R3 Survey |
| 15 | Three Playable Game Modes | Free-For-All Sandbox (XP curve T7: 630, T8: 940, T9: 1,430), 15-min King of the Hill & Convoy Escort (900s match clock, sector scoring), 1v1 Arena duel teleportation with global chat continuity | M3 | R3 Survey |
| 16 | 15–20 Hz Authoritative Server & Binary Netcode | Authoritative simulation loop on Node.js/Bun, binary protocol (`ArrayBuffer`/`DataView` 28 bytes/vessel), 8 packet opcodes, snapshot broadcaster | M4 | R5 Survey |
| 17 | Autonomous AI Bots | Island NavMesh + 5-whisker forward raycasting, depth switching, crate collection, oil rig contesting, ECM/buoy usage, cross-mode AI | M4 | R3 Survey |
| 18 | Meta-Progression & Tech Tree | 10-tier tech tree branches, dual-currency (match XP & persistent naval credits), hull unlock persistence | M4 | R4 Survey |
| 19 | Modular Loadout Customization | Slot hardpoint customization (swapping torpedo tubes for SAMs, towed sonar, ECM pods), server-side validation | M4 | R4 Survey |
| 20 | Web Portal SDK Adapter Layer | `IPlatformSDK` abstraction for CrazyGames, Poki, Playgama, Y8 (`commercialBreak`, `rewardedBreak`, `happyTime`) with local mock fallback | M4 | R4 Survey |
| 21 | Clean-Room Procedural Vector Client (`PixiJS`) | 100% procedural vector warships with articulated turrets, hydrodynamic wakes, depth shading, radar/sonar sweep overlays, particle explosions at 60+ FPS | M5 | R5 Survey |
| 22 | Tactical HUD & Interactive Minimap | Interactive Minimap, Kill Feed, visual firing arcs, sensor range rings, independent reload bars, Dive/Stealth/ECM buttons, Tech Tree / Loadout UI | M5 | R5 Survey |
| 23 | Procedural Web Audio Sound Synthesizer | Clean-room synthesized audio (gunfire, torpedoes, sonar pings, engine wakes, explosions) via Web Audio API. Zero external audio files. | M5 | R5 Survey |
| 24 | Client-side Prediction & Interpolation | Client prediction for local vessel, snapshot interpolation with 100ms jitter buffer, finite synchronized positions | M5 | R5 Survey |
| 25 | Production Bundle Size & Clean-Room Compliance | Production build bundle strictly under 15 MB (< 2.5 MB expected), zero copied code or assets from mk48 | M5 / Final | R5 Survey |
| 26 | Multi-Tier Test Suite & E2E Acceptance | Automated unit, BVA, pairwise, multi-client netcode stress tests, and Playwright headless browser E2E tests passing 100% | Final | Acceptance |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Simulation, Physics, Biomes & 28-Ship Roster | Features 1, 2, 3 (`common/models/`, `common/simulation/`) | none | DONE |
| M2 | 10 Weapon & Equipment Systems | Features 4, 5, 6, 7, 8, 9, 10 (`common/models/weapons.ts`, `common/simulation/weapon_kinematics.ts`) | M1 | DONE |
| M3 | 3-Layer Sensors, ASW Balance, ECM, Fleets & Game Modes | Features 11, 12, 13, 14, 15 (`common/sensors/sensor_suite.ts`, `common/models/fleet.ts`, `common/models/game_modes.ts`) | M1, M2 | DONE |
| M4 | Authoritative Server, Binary Netcode, Bots & Meta-Progression | Features 16, 17, 18, 19, 20 (`server/core/`, `server/netcode/ws_server.ts`, `server/progression/loadout_validator.ts`) | M1, M2, M3 | DONE |
| M5 | Clean-Room Vector WebGL Client & Tactical HUD | Features 21, 22, 23, 24, 25 (`client/src/app.ts`, `client/src/rendering/`, `client/src/hud/`, `client/src/audio/`) | M1, M2, M3, M4 | DONE |
| Final | E2E Testing, Adversarial Hardening & Acceptance | Feature 26 (13 test suites / 132 automated tests 100% PASS, bundle < 0.7 MB) | M1–M5 | DONE |

---

## Interface Contracts

### M1 (`common/models` & `common/simulation`) ↔ M2 (`common/weapons`)
- `ShipDef`: specifies `mounts: WeaponMountDef[]` with `mountId`, `type: WeaponCategory`, `offset: Vector2`, `arcAngle: number`, `facingAngle: number`, `caliberMm?: number`.
- `PhysicsState`: provides `position: Vector2`, `velocity: Vector2`, `heading: number`, `depth: SubmarineDepthState`, `speedKnots: number`.
- `WeaponState`: tracks `mountId`, `currentAmmo`, `maxAmmo`, `reloadTimerRemaining`, `ammoRegenTimer`, `currentHeading`.
- `FiringCommand`: contains `mountId`, `targetCoords: Vector2`, `launchVector: Vector2`.

### M2 (`common/weapons`) ↔ M3 (`common/sensors`)
- `SubmarineTacticalState`: `{ depth: SubmarineDepthState, diveTransitionTimer: number, isStealthCruise: boolean, missileGuidanceActive: boolean }`.
- Submarine diving below `PERISCOPE_DEPTH` ($< -5.0\text{ m}$) immediately triggers `abortMissileGuidance()`.
- Sonar Buoy deployment creates persistent acoustic entity `{ buoyId, position: Vector2, radius: 1200, expiresAtTick: number }`.
- Active ECM jamming creates `{ active: boolean, timerRemaining: number, deflectionProbability: 0.85 }` impacting guided missile tracking.

### M3 (`common/sensors` & `common/game`) ↔ M4 (`server/`)
- `SensorState`: `{ contacts: TrackedContact[], activeSonarPinging: boolean, ecmActive: boolean }`.
- `FleetState`: `{ fleetId, name, leaderId, memberIds: Set<string>, napTimers: Map<string, number> }`.
- `NonAggressionPact`: `canDamage(attackerId: string, victimId: string): boolean` returns `false` if `napTimers.get(pair) > 0`.
- `KarmaProfile`: `{ playerId, karmaScore: number, status: 'LOYAL' | 'SUSPECT' | 'TRAITOR' }`.
- `GameModeController`: `tick(dt: number)`, `handleKill(killerId, victimId)`, `teleportDuel(player1, player2)`.

### M4 (`server/netcode`) ↔ M5 (`client/netcode`)
- Fixed binary packet structure with 1-byte opcode:
  - `0x01` (`OP_SNAPSHOT`): 28 bytes per vessel (vesselId: u16, posX: i16, posY: i16, heading: u16, speedKnots: u8, hullHpPct: u8, flags: u8, depth: u8, mountAngles: u16[4]).
  - `0x02` (`OP_INPUT`): sequence: u32, thrust: i8, rudder: i8, depthTarget: u8, weaponFireMask: u16, targetX: i16, targetY: i16.
  - `0x03` (`OP_EVENT`): eventType: u8, sourceId: u16, targetId: u16, data: u32.
  - `0x04` (`OP_SPAWN_REQ`): shipClassId: u8, camoId: u8, loadoutMask: u32.
  - `0x05` (`OP_FLEET_ACTION`): action: u8, targetId: u16.
  - `0x06` (`OP_DUEL_ACTION`): action: u8, targetPlayerId: u16.
  - `0x07` (`OP_LOADOUT_SAVE`): shipId: u8, slotIndices: u8[4], moduleIds: u16[4].
  - `0x08` (`OP_CHAT`): channel: u8, senderName: str16, message: str64.

---

## Code Layout
```
naval_warfare_io/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── PROJECT.md
├── TEST_INFRA.md
├── TEST_READY.md (published upon test suite completion)
├── common/
│   ├── index.ts
│   ├── models/
│   │   ├── ships.ts
│   │   ├── weapons.ts
│   │   ├── terrain.ts
│   │   ├── progression.ts
│   │   ├── fleet.ts
│   │   └── game_modes.ts
│   ├── simulation/
│   │   ├── hydrodynamics.ts
│   │   ├── collision.ts
│   │   ├── terrain_engine.ts
│   │   └── weapon_kinematics.ts
│   ├── sensors/
│   │   ├── sensor_suite.ts
│   │   ├── raycasting.ts
│   │   └── acoustic_model.ts
│   └── protocol/
│       ├── binary_protocol.ts
│       ├── packet_types.ts
│       └── serializer.ts
├── server/
│   ├── index.ts
│   ├── core/
│   │   ├── game_server.ts
│   │   ├── game_loop.ts
│   │   └── spatial_grid.ts
│   ├── netcode/
│   │   ├── ws_server.ts
│   │   └── session.ts
│   ├── ai/
│   │   ├── bot_controller.ts
│   │   ├── navmesh.ts
│   │   └── bot_tactics.ts
│   ├── progression/
│   │   ├── tech_tree_service.ts
│   │   └── loadout_validator.ts
│   └── modes/
│       ├── ffa_sandbox.ts
│       ├── koth_convoy.ts
│       └── duel_arena.ts
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.ts
│   │   ├── rendering/
│   │   │   ├── pixi_renderer.ts
│   │   │   ├── vector_hulls.ts
│   │   │   ├── wake_fx.ts
│   │   │   ├── sensor_overlays.ts
│   │   │   └── particle_system.ts
│   │   ├── audio/
│   │   │   └── sound_synthesizer.ts
│   │   ├── hud/
│   │   │   ├── hud_controller.ts
│   │   │   ├── minimap.ts
│   │   │   ├── kill_feed.ts
│   │   │   ├── weapon_controls.ts
│   │   │   └── menus.ts
│   │   ├── netcode/
│   │   │   ├── binary_client.ts
│   │   │   ├── predictor.ts
│   │   │   └── interpolator.ts
│   │   └── sdk/
│   │       ├── platform_sdk.ts
│   │       └── mock_sdk.ts
├── tests/
│   ├── unit/
│   │   ├── hydrodynamics.test.ts
│   │   ├── ship_roster.test.ts
│   │   ├── weapons.test.ts
│   │   ├── sensors_asw.test.ts
│   │   ├── fleet_karma.test.ts
│   │   ├── game_modes.test.ts
│   │   ├── progression_loadout.test.ts
│   │   └── binary_protocol.test.ts
│   ├── integration/
│   │   ├── multi_client_netcode.test.ts
│   │   └── bot_simulation.test.ts
│   └── e2e/
│       └── browser_client.spec.ts
└── scripts/
    ├── clean_room_audit.ts
    └── verify_bundle_size.ts
```
