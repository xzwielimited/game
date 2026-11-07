# E2E Test Infra: NavalCommand.io

## Test Philosophy
- Opaque-box, requirement-driven test engineering derived directly from `ORIGINAL_REQUEST.md` and user specifications.
- Complete independence from implementation design and internal structures.
- Methodology: Category-Partition Equivalence Testing + Boundary Value Analysis (BVA) + Pairwise Combinatorial Interaction Testing + Real-World Workload Simulation.

---

## Feature Inventory & Test Coverage Matrix

| # | Feature | Source | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---------|--------|:----------------:|:-----------------:|:-----------------:|:-----------------:|
| 1 | 2D Naval Hydrodynamics & Physics | R1 (Lines 14-15) | 5 tests | 5 tests | ✓ | S1, S4 |
| 2 | 4 Terrain Biomes & Grinding/Grounding | R1 (Lines 14-15) | 5 tests | 5 tests | ✓ | S2, S3 |
| 3 | 28-Ship Roster across 10 Tiers & 8 Classes | R1 (Lines 16-24) | 5 tests | 5 tests | ✓ | S1, S2, S4 |
| 4 | Naval Artillery Turrets & Arcs | R1 (Lines 25-26) | 5 tests | 5 tests | ✓ | S1, S3 |
| 5 | Torpedoes & Acoustic Decoys | R1 (Line 27) | 5 tests | 5 tests | ✓ | S2, S5 |
| 6 | Cruise Missiles & Standoff Weapons | R1 (Lines 28-30) | 5 tests | 5 tests | ✓ | S2, S4 |
| 7 | SAM & CIWS Point-Defense | R1 (Line 31) | 5 tests | 5 tests | ✓ | S2, S4 |
| 8 | Depth Charges & Naval Mines | R1 (Lines 32-33) | 5 tests | 5 tests | ✓ | S2, S5 |
| 9 | Aircraft / ASW Helis & Sonar Buoys | R1 (Line 34), R2 | 5 tests | 5 tests | ✓ | S2, S5 |
| 10 | Hydraulic Dredger & Sand Depositor | R1 (Line 35) | 5 tests | 5 tests | ✓ | S3 |
| 11 | 3-Layer Sensor Suite (Visual, Radar, Sonar) | R2 (Line 38) | 5 tests | 5 tests | ✓ | S2, S5 |
| 12 | Submarine & ASW Balance (Dive/Guidance/Stealth) | R2 (Lines 39-43) | 5 tests | 5 tests | ✓ | S2, S5 |
| 13 | ECM Jamming & Mercy Hospital Ship | R2 (Line 44), R1 | 5 tests | 5 tests | ✓ | S1, S2, S4 |
| 14 | Anti-Betrayal Fleet 15s NAP & Karma | R3 (Lines 51-54) | 5 tests | 5 tests | ✓ | S1 |
| 15 | 3 Game Modes (FFA, KOTH/Escort, 1v1 Arena) | R3 (Lines 47-50) | 5 tests | 5 tests | ✓ | S1, S4 |
| 16 | 15–20 Hz Server & Binary Netcode | R5 (Line 68) | 5 tests | 5 tests | ✓ | S4 |
| 17 | Autonomous AI Bot Tactics | R3 (Line 55) | 5 tests | 5 tests | ✓ | S1, S4 |
| 18 | Meta-Progression & Tech Tree | R4 (Lines 58-59) | 5 tests | 5 tests | ✓ | S1 |
| 19 | Modular Loadout Customization | R4 (Line 60) | 5 tests | 5 tests | ✓ | S1, S4 |
| 20 | Web Portal SDK Adapter Layer | R4 (Line 62) | 5 tests | 5 tests | ✓ | S1 |
| 21 | Clean-Room Vector WebGL Rendering & HUD | R5 (Lines 65-67) | 5 tests | 5 tests | ✓ | S4 |

---

## Test Architecture

### 1. Test Runner & Framework
- Framework: `Vitest` (for fast deterministic simulation & netcode tests) + `Playwright` (for headless WebGL browser verification).
- Invocations:
  - Unit & Functional Tiers 1–3: `npx vitest run tests/unit/`
  - Integration & Netcode Multi-Client Tier 3–4: `npx vitest run tests/integration/`
  - Playwright Headless Browser E2E: `npx playwright test`
- Pass/Fail Semantics: Exit code 0, 0 unhandled promise rejections, 0 uncaught browser exceptions, 100% assertions green.

### 2. Test Directory Layout
```
tests/
├── unit/
│   ├── hydrodynamics.test.ts
│   ├── ship_roster.test.ts
│   ├── weapons.test.ts
│   ├── terrain_biomes.test.ts
│   ├── sensors_asw.test.ts
│   ├── ecm_hospital.test.ts
│   ├── fleet_anti_betrayal.test.ts
│   ├── game_modes.test.ts
│   ├── ai_bots.test.ts
│   ├── meta_progression.test.ts
│   ├── platform_sdk.test.ts
│   └── binary_protocol.test.ts
├── integration/
│   ├── multi_client_netcode.test.ts
│   ├── full_combat_cycle.test.ts
│   └── bot_match_simulation.test.ts
└── e2e/
    └── browser_client.spec.ts
```

---

## Real-World Application Scenarios (Tier 4)

| # | Scenario | Features Exercised | Description |
|---|----------|--------------------|-------------|
| S1 | Sandbox Fleet Operations & Progression | F1, F3, F4, F14, F15, F17, F18, F19, F20 | Player spawns Tier 1 PT boat, harvests crates and oil rigs, defeats AI bots, earns XP/credits, unlocks Destroyer, modifies loadout, forms fleet, tests 15s NAP timer on kick, accepts 1v1 duel arena challenge, returns with bonus XP. |
| S2 | Deep ASW Wolfpack Standoff | F2, F3, F5, F8, F9, F11, F12, F13 | Submarine operating at deep silent running is tracked via deployed aircraft Sonar Buoy; submarine ascends to periscope depth to launch cruise missile; ASW Destroyer activates ECM jamming to deflect missile and drops depth charges. |
| S3 | Arctic Ice Archipelago & Dredging | F2, F3, F4, F10 | Non-icebreaker cruiser suffers continuous grinding damage entering Arctic ice; Icebreaker vessel breaks navigable channel; Dredger excavates shallow strait to allow capital battleship passage. |
| S4 | 15-Minute Convoy Escort & KOTH Match | F1, F3, F4, F6, F7, F13, F15, F16, F17 | Blue and Red factions contest a central maritime sector while escorting an AI Oil Tanker; CIWS intercepts incoming rocket barrages; Mercy hospital ship restores damaged flagships. |
| S5 | Acoustic Warfare & Decoy Countermeasures | F5, F7, F11, F12 | Active sonar ping reveals submerged submarine but exposes pinging vessel at 2x distance; submarine launches acoustic homing torpedo; target launches acoustic noisemaker decoy successfully spoofing torpedo seeker. |

---

## Coverage Thresholds
- Tier 1: $\ge 105$ tests ($\ge 5$ per feature across 21 core features).
- Tier 2: $\ge 105$ boundary/corner tests.
- Tier 3: Pairwise combinatorial cross-feature tests.
- Tier 4: 5 realistic application-level scenarios.
- Acceptance Target: 100% passing tests, verified clean-room zero mk48 assets, bundle size < 15 MB.
