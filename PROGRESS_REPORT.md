# Original User Request

## Approved Task Prompt — 2026-11-07T11:06:00Z

Develop NavalCommand.io into a production-grade naval web game with responsive hybrid steering (mk48-style mouse-directed steering by default and responsive WASD), high-contrast optimized visuals featuring pseudo-3D vessel depth and vibrant ocean wave effects, and balanced combat with spawn protection and respawn flow.

Working directory: c:\Users\Administrator\Downloads\NavalCommand_SourceCode_20261025
Integrity mode: development

## Requirements

### R1. Hybrid Steering and Responsive Movement
Implement mouse-driven steering toward the cursor as the default control scheme (similar to mk48.io, where the vessel steers toward cursor direction with intuitive speed control), while retaining an optional, immediately responsive WASD keyboard steering mode. Eliminate throttle and rudder sluggishness so vessels respond crisply to player input.

### R2. High-Contrast Visuals with Pseudo-3D Depth and Water Effects
Upgrade the visual presentation from flat/drab graphics to optimized, high-contrast, visually appealing visuals with pseudo-3D depth cues. Add procedural shading/lighting, layered deck structures, and hull depth to vessels, along with dynamic ocean wave textures, visible wakes, and foam, while keeping rendering performant and bundle size well within limits.

### R3. Combat Balance, Spawn Protection, and Respawn Flow
Implement a 3–5 second invulnerability shield upon spawning with clear visual feedback, adjust bot initial spawn distances to prevent immediate swarming of newly spawned players, and replace instant teleportation on death with a dedicated respawn screen featuring a countdown timer.

### R4. HUD and Map Decluttering
Streamline the HUD and tactical overlay to ensure high readability during combat, decluttering overlapping radar rings, oversized shoal zones, and excessive arc wedges, and correct island minimap rendering.

### R5. Clean-Room Implementation Constraint
All code, procedural shaders/textures, and audio must be original clean-room implementations; do not copy any code, sprites, or audio from mk48.io or AGPL-licensed repositories.

## Acceptance Criteria

### Movement and Controls
- [ ] Mouse cursor position steers the vessel heading toward the cursor when mouse-steering mode is active.
- [ ] WASD mode provides responsive rudder and throttle adjustment without laggy ramp-up.
- [ ] Players can toggle or switch between mouse steering and WASD steering.

### Visual Quality and Presentation
- [ ] Vessel hulls exhibit distinct visual contrast against the ocean background and display pseudo-3D depth details (shaded layers, deck structures, or lighting highlights).
- [ ] Ocean surface renders visible procedural wave patterns, wakes behind moving vessels, and foam effects.
- [ ] Minimap accurately displays island polygon contours instead of single-point circles.
- [ ] Total web production build bundle remains under 15 MB.

### Combat, Spawning, and HUD
- [ ] Newly spawned player vessels receive a 3–5 second invulnerability shield preventing immediate damage.
- [ ] Bots do not spawn within lethal engagement range of the player's initial spawn location.
- [ ] Sinking triggers a dedicated respawn screen with a countdown timer before respawning.
- [ ] Tactical overlays (shoals, firing arcs, radar sweep) do not obscure ship hull visibility or combat indicators.

### Verification and Test Suite
- [ ] `npx vitest run` passes all unit and integration test suites with 0 test failures.
- [ ] `npx tsc --noEmit` completes with 0 type errors.
- [ ] `npx vite build` builds cleanly without bundling errors.
- [ ] Headless/browser verification captures screenshots confirming readable vessels, wave effects, HUD layout, and respawn screen.


## Follow-up — 2026-11-07T12:02:50Z

URGENT USER FEEDBACK & REFERENCE SCREENSHOTS FOR MILESTONE M8 (MUST INCORPORATE IMMEDIATELY):

The user just tested the live build (while M7 was finishing and before M8 was applied) and uploaded 3 reference screenshots of actual `mk48.io`:
1. `C:/Users/Administrator/.gemini/antigravity/brain/b60ac635-5abb-475d-89fe-9a29f1ad2287/.user_uploaded/media_1794052785336_5730b669.jpg` (mk48.io Vietnamese Start Screen & Ocean/Islands)
2. `C:/Users/Administrator/.gemini/antigravity/brain/b60ac635-5abb-475d-89fe-9a29f1ad2287/.user_uploaded/media_1794052802468_2c496f9c.jpg` (mk48.io In-Game View with 3D-shaded Islands, Ship Name/Health Bar, Minimalist HUD)
3. `C:/Users/Administrator/.gemini/antigravity/brain/b60ac635-5abb-475d-89fe-9a29f1ad2287/.user_uploaded/media_1794052817676_104e6097.jpg` (mk48.io Zoomed Ship View, Wake Bubbles, Green Triangle Torpedo Indicators, Bottom Status Bar)

User's exact words:
"THẬT SỰ KHÓ CHƠI LẮM ẤY, tối ưu giao diện, làm tiếng việt, mô phỏng như mk48.io thật, thật sự cái vòng rada đậm và khó nhìn quá, với cả con tàu nó quá mở, chẳng thấy được gì, thật sự thất vọng, bạn tối ưu tiếp đi"

CRITICAL M8 REQUIREMENTS TO ADDRESS THIS FEEDBACK COMPLETELY:
1. **REMOVE / HIDE THE RADAR RINGS & FIRING ARC WEDGES BY DEFAULT**:
   - The user explicitly hated the green radar circle and firing arc circles around the ship ("cái vòng rada đậm và khó nhìn quá"). In `mk48.io` (see screenshots 2 & 3), there are NO radar circles or arc wedges around the ship in normal view! Hide radar sweep rings and firing arc wedges completely by default (only show if toggled via a radar hotkey like `[R]`, or keep completely off by default so the water around the ship is 100% clean).
2. **MAKE THE SHIP LARGE, CRISP, AND HIGHLY VISIBLE ("con tàu nó quá mờ, chẳng thấy được gì")**:
   - Increase default camera zoom significantly (e.g. `1.8` to `2.2` default zoom, with smooth mouse-wheel zoom in/out) and/or scale up ship rendering so the player's vessel is prominent, sharp, and unmistakable in the center of the screen like `mk48.io` Screenshot 3.
   - Render ships with high-contrast bright metallic/steel-gray & warm-deck tones (`#9aa5b1`, `#cbd5e1`, `#d4a373` wood/steel decks), dark crisp hull outlines, 3D turret barrels that rotate toward the cursor, and zero transparency/blurriness on surface ships.
   - Render a large, crisp bright-green player name label above the player's ship, and white name labels + clean white/red health bars right above bot/enemy ships (matching Screenshot 2 & 3).
   - Render bright green downward triangle markers (`▼`) above active torpedoes/missiles in the water with white bubble trails behind them (matching Screenshot 3).
   - Render a prominent curved trail of white wake foam bubbles behind moving ships.
3. **BRIGHT MARINE-BLUE OCEAN & 3D-SHADED ISLANDS (MATCHING SCREENSHOTS 1–3)**:
   - Replace the dark/black ocean (`#091422`) with a vibrant marine/royal blue ocean (`#1c487a` / `#21538b`) featuring diagonal directional wave shading and crisp white specular wave ripples.
   - Render islands with 3D hill-shading: dark underwater drop-shadow around the island, golden sandy beach perimeter, and olive-green elevated interior hills with directional sun shading (matching Screenshot 2). Remove the ugly flat teal circles for shoals!
4. **FULL VIETNAMESE LOCALIZATION & MK48.IO-STYLE HUD + START OVERLAY**:
   - Localize the entire UI into natural Vietnamese (`Làm tiếng Việt`).
   - Add an `mk48.io`-style Start/Lobby Overlay when opening the game (or toggled via ESC): Logo, Game Mode cards (`Hạm đội hỗn chiến`, `2 Hạm đội`), input `Tên` (player name), green `Chơi` button, and `Chơi với bạn bè` button.
   - Streamline the in-game HUD to match `mk48.io` (Screenshots 2 & 3):
     - **Top-center**: Sleek XP/Level progress bar (`0% lên Cấp 2 — Bấm [T] chọn tàu mới`).
     - **Top-left**: Compact Fleet panel (`Tên hạm đội` — `USSR`, `Ae VN`, `Yamato`... `Xin tham gia`).
     - **Top-right**: Clean Leaderboard (`Bảng xếp hạng` 1..10 + số người trực tuyến).
     - **Bottom-center**: Text status line (`[Lớp tàu] 53.0kn 193° [N] (Tọa độ)`) directly above compact horizontal weapon reload bars (`2/2`, `30/30`).
     - **Bottom-left**: Translucent chat box (`Thông điệp...`).

Ensure Worker M8 reads the 3 uploaded screenshots and implements all of these visual, camera zoom, radar-ring removal, and Vietnamese UI upgrades right now!


## Follow-up — 2026-11-07T12:18:59Z

CRITICAL VISUAL BUGS DISCOVERED IN USER'S LIVE SCREENSHOT (`media_1794053369918_7599bf0f.jpg`) — MUST FIX IMMEDIATELY IN M8/M9:

The user uploaded 6 new screenshots:
- `C:/Users/Administrator/.gemini/antigravity/brain/b60ac635-5abb-475d-89fe-9a29f1ad2287/.user_uploaded/media_1794053369918_7599bf0f.jpg` (Our live game showing a broken ship with a huge black rectangle sticking out sideways and vertical rotated text!)
- `C:/Users/Administrator/.gemini/antigravity/brain/b60ac635-5abb-475d-89fe-9a29f1ad2287/.user_uploaded/media_1794053406076_c74aa1d9.jpg` (Our live game showing bots looking like `+` crosses)
- `C:/Users/Administrator/.gemini/antigravity/brain/b60ac635-5abb-475d-89fe-9a29f1ad2287/.user_uploaded/media_1794053570564_e0eb4c70.jpg` (mk48.io Xếp Hạng modal & bottom tab bar)
- `C:/Users/Administrator/.gemini/antigravity/brain/b60ac635-5abb-475d-89fe-9a29f1ad2287/.user_uploaded/media_1794053656195_2dc8dac1.jpg` (mk48.io `TÀU` visual ship roster by Tier with top-down Blender-style ship illustrations)
- `C:/Users/Administrator/.gemini/antigravity/brain/b60ac635-5abb-475d-89fe-9a29f1ad2287/.user_uploaded/media_1794053697947_d02bd12a.jpg` (mk48.io detailed Oil Rig platform with Helipad `H`, upright green player text `gsh03619`, and realistic ship wake)
- `C:/Users/Administrator/.gemini/antigravity/brain/b60ac635-5abb-475d-89fe-9a29f1ad2287/.user_uploaded/media_1794053821611_2ce1ff1a.jpg` (mk48.io Wiki showing ships are Blender-style top-down renders)

### ROOT CAUSES OF THE DEFORMED SHIP IN `media_1794053369918_7599bf0f.jpg` (FIX ALL 4 IMMEDIATELY):

1. **BUG #1: 533mm Torpedo Mounts Rendered as 85-Meter-Long Triple Battleship Cannons (`client/src/rendering/vector_hulls.ts`)**:
   - In `fletcher_dd` (`beam: 12m`) and `pt_boat_109` (`beam: 6.2m, length: 24m`), `torpedo_533mm_unguided` has `caliberMm: 533`!
   - `ProceduralTurret` treated `caliberMm = 533` as a 533mm cannon: `scale = 2.0`, `barrelLength = (16 + 533 * 0.05) * 2 = 85.3m`, `barrels = 3`, `barrelThickness = 8.5m`!
   - That created a massive **85-meter-long black rectangle sticking out sideways** from the middle of the 12m-wide Destroyer and made PT boats look like flying crosses (`+`)!
   - **REQUIRED FIX**:
     - Add `category?: string` to `TurretConfig` and pass `category: m.category` in `app.ts` (`createVesselView`).
     - In `ProceduralTurret`:
       * If `category === 'TORPEDO' || category === 'ROCKET_TORPEDO'`: Render a compact, realistic **Torpedo Tube Launcher** (`8m` long × `3.5m` wide grey rectangular 3-tube rack that stays well inside the hull beam!).
       * If `category === 'CRUISE_MISSILE'`: Render a compact flush **VLS Missile Hatch** (`5m × 5m` dark grid with small white cell lids, no protruding barrel).
       * If `category === 'DEPTH_CHARGE' || category === 'NAVAL_MINE'`: Render a tiny stern rack (`3m × 2m`).
       * For `BALLISTIC_GUN` / `SAM_CIWS`: Clamp turret house width to at most `beamMeters * 0.36` (around `4m–8m` radius) and barrel length to `8m–18m` so turrets NEVER bulge outside the ship's hull width (`beam`)!

2. **BUG #2: Visual Hull Beam vs Length Proportion (`client/src/rendering/vector_hulls.ts`)**:
   - Real-world `fletcher_dd` has `length: 114, beam: 12` (10:1 ratio), which looks like a thin toothpick when turrets are mounted on it.
   - In `ProceduralVessel`, compute a visual beam `const visualBeam = Math.max(this.beamMeters, this.lengthMeters * 0.20)` for drawing the hull, deck, and superstructure so every ship has sleek, realistic `mk48.io` Blender-render proportions (like Screenshot 4 `media_1794053656195_2dc8dac1.jpg`) where turrets sit comfortably inside the deck width!

3. **BUG #3: Sideways / Rotated Player Name & Health Bar (`client/src/rendering/vector_hulls.ts`)**:
   - Because `overheadUI` is a child of `this.container` (which has `this.container.rotation = v.physics.heading`), `Commander_You` and the green HP bar rotate 90° sideways and upside-down when the ship turns!
   - **REQUIRED FIX**:
     - In `ProceduralVessel.update(dt, aimAngleWorld)`, counter-rotate `this.overheadUI.rotation = -this.container.rotation;` and place `nameLabel` & `hpBarGraphics` at `(0, -Math.max(this.lengthMeters * 0.45, 28))` inside `overheadUI` (or position `overheadUI` in screen-up coordinates) so the player name `Commander_You` and HP bar are **ALWAYS 100% horizontal (upright)** above the ship, exactly like `gsh03619` in `media_1794053697947_d02bd12a.jpg`!
     - Also hide the player's own HP bar when at 100% HP (or make it subtle below the name) so only the crisp green name is above the player's ship like `mk48.io`!

4. **BUG #4: Offshore Oil Rig Platform (`media_1794053697947_d02bd12a.jpg`) & Visual Tech Tree (`TÀU`)**:
   - In `app.ts` (`drawWorldTerrain`), upgrade Oil Rigs from a plain orange square (`g.rect(..., 36, 36)`) to a detailed 3D offshore platform matching `media_1794053697947_d02bd12a.jpg`: drop shadow on water, beige/steel concrete platform deck (`90m × 90m`), corner legs, industrial structures/cranes, and an octagonal `[H]` helipad in the corner!
   - In `menus.ts`, localize the Tech Tree (`TÀU — CẤP ĐỘ 1 ĐẾN 10`) into Vietnamese and include a top-down SVG/Canvas ship silhouette preview on each ship card!


## Follow-up — 2026-11-07T12:37:41Z

URGENT USER DIRECTIVE FOR MILESTONE M9 (GAMEPLAY, WEAPON ICONS, TORPEDO MODES, RAPID-FIRE SALVO, MOVEMENT FIX, SILENT ENGINE AUDIO & 100% VIETNAMESE UI):

The user just tested the build and gave the following critical requirements that MUST be implemented before completing M9:
"sửa lại giao diện như mk48.io á, các loại đạn pháo để hình ra, với di chuyển nó bị lỗi rồi, khó di chuyển, với logic bắn thuỷ lôi của nó bì gì ấy, 1 là loại bắn thẳng không truy đuổi, 2 là loại truy đuổi kết hợp tự định hướng, này mới vào cứ tự bắn thuỷ lôi, đạn pháo thì không biết đang bắn cái nào, cả 2 loại di chuyển tôi đều không dùng được. làm 1 nút bắn liên thanh (xả toàn bộ 1 loạt đạn đang chọn vào 1 kẻ địch hoặc hướng chỉ định, hãy xem các video logic, cách chơi mk48 để hiểu nó hoạt động như nào. âm thanh nó bị ồn á, chỉ để các hiệu ứng âm thanh vào lúc hợp lí, như bắn pháo, vụ nổ,... dịch toàn bộ game ra tiếng việt."

### EXACT ROOT CAUSES & MANDATORY FIXES TO IMPLEMENT NOW:

1. **SILENCE THE NOISY ENGINE HUM (`client/src/audio/sound_synthesizer.ts` & `client/src/app.ts`)**:
   - **Root Cause**: `soundSynth.updateEngineSound()` starts a continuous 24/7 `triangle` wave oscillator (`engineOsc` at 40–130Hz) that drones loudly into the speakers non-stop!
   - **Mandatory Fix**: In `sound_synthesizer.ts`, make `updateEngineSound()` a complete no-op (and ensure `engineOsc` is never started). Only play discrete sound effects on actual combat events: cannon firing (`playCannonBoom`), torpedo launch (`playTorpedoWhoosh`), explosions (`playExplosion`), sonar ping (`playSonarPing`), and water splash (`playWaterSplash`).

2. **FIX BROKEN/SLUGGISH MOVEMENT IN BOTH MOUSE & WASD MODES (`client/src/app.ts`)**:
   - **Root Causes**:
     a) When `startLobbyElement` or a menu modal is visible on screen, mouse events still bled through, AND `mouseScreenX/Y` initialized to `(0, 0)` (top-left corner), forcing the ship to turn toward the top-left corner!
     b) Clicking "Chơi" or any HUD button bubbled down to `container`'s `mousedown` listener and triggered `firePlayerWeapons()`!
     c) In `app.ts`, ship acceleration (`1.8 m/s²`) and turn rate (`20 deg/s`) felt frozen on screen, and releasing `W` in WASD mode immediately set `throttle = 0.0` (stopping the ship).
   - **Mandatory Fix**:
     - Initialize `mouseScreenX = window.innerWidth * 0.5` and `mouseScreenY = window.innerHeight * 0.35` on startup.
     - In `container` `mousedown`, ignore clicks if `(e.target as HTMLElement).tagName !== 'CANVAS'` or if the Start Lobby / any Menu Modal is open!
     - Make **BOTH** Mouse and WASD work seamlessly together at all times:
       * If the player presses `W`/`Up`, `S`/`Down`, `A`/`Left`, `D`/`Right`, apply crisp responsive steering & throttle (`sticky telegraph throttle` in WASD mode so pressing W sets full ahead `1.0`, S sets reverse `-0.5`, and Space/X or close cursor stops, plus apply a responsive velocity/turn boost in `app.ts` so the ship responds immediately within 0.5s instead of taking 10s to accelerate!).
       * In `MOUSE` mode (`mk48.io` style): moving the cursor anywhere on the water smoothly steers the ship toward the cursor, and cursor distance from the ship controls throttle (`< 35m` idle, `>= 35m` fast cruise/flank speed).

3. **STOP AUTO-FIRING TORPEDOES ON CLICK + IMPLEMENT 2 TORPEDO MODES + RAPID-FIRE SALVO BUTTON (`client/src/app.ts`, `client/src/hud/weapon_controls.ts`)**:
   - **Root Cause**: `firePlayerWeapons()` in `app.ts` looped through ALL `player.mounts` (`for (let i = 0; i < player.mounts.length; i++)`) and fired cannons, torpedoes, and depth charges ALL AT ONCE on every left-click, completely ignoring `this.selectedWeaponSlot`!
   - **Mandatory Fix**:
     - Organize player weapons into clear selectable slots (`[1]`, `[2]`, `[3]`, `[4]`) where Left-Click ONLY fires the **currently selected weapon slot/type** (defaulting to `[1] Đạn Pháo Chính`, so entering the game and clicking NEVER auto-fires torpedoes!):
       * **Slot `[1]` — ĐẠN PHÁO (Hải Pháo Chính)**: Fires `BALLISTIC_GUN` mounts toward the cursor.
       * **Slot `[2]` — NGƯ LÔI THẲNG (Bắn thẳng không truy đuổi)**: Fires torpedo mounts as straight-line unguided torpedoes (`straight` mode — travels straight along the aimed bearing without homing).
       * **Slot `[3]` — NGƯ LÔI TRUY ĐUỔI (Tự định hướng & bám mục tiêu)**: Fires torpedo mounts as acoustic homing / cursor-guided torpedoes (`homing` mode — automatically locks onto and steers toward the nearest enemy ship in the aimed sector / cursor direction!). Ensure every torpedo-armed ship (including `fletcher_dd`, `pt_boat_109`, submarines) exposes both `[2] Ngư Lôi Thẳng` and `[3] Ngư Lôi Truy Đuổi` modes!
       * **Slot `[4]` — TÊN LỬA / THỦY LÔI / ĐẶC BIỆT**: Fires `CRUISE_MISSILE`, `DEPTH_CHARGE`, `SAM_CIWS`, or `NAVAL_MINE` mounts.
     - **Add a Dedicated Rapid-Fire Salvo Button (`🔥 BẮN LIÊN THANH [SPACE / CHUỘT PHẢI]`)**:
       * Add a prominent button **`🔥 BẮN LIÊN THANH [SPACE]`** on the bottom-center weapon HUD, bound to **`Spacebar`** and **Right-Click** (`contextmenu` prevented).
       * Clicking this button or pressing `Space` / Right-Click triggers a **Rapid-Fire Salvo Burst** (`salvoBurst`): rapidly fires all loaded barrels/tubes of the selected weapon (e.g. a 4-round rapid volley every 120ms) directly at the targeted enemy or cursor direction!

4. **VISUAL WEAPON ICONS AT BOTTOM-CENTER & 100% VIETNAMESE UI (`client/src/hud/weapon_controls.ts`, `client/src/hud/hud_controller.ts`, `client/src/hud/menus.ts`, `client/src/app.ts`)**:
   - Position the Weapon Controls Panel at the **Bottom-Center** of the screen (`left: 50%; transform: translateX(-50%); bottom: 14px;`), styled like `mk48.io`.
   - Render **clear visual SVG icons** inside each weapon slot card:
     * `[1]` Gold Artillery Shell / Twin Turret SVG icon (`Đạn Pháo`)
     * `[2]` Cyan/Green Straight Torpedo SVG icon with straight trajectory arrow (`Ngư Lôi Thẳng`)
     * `[3]` Orange/Red Homing Torpedo SVG icon with target-lock reticle (`Ngư Lôi Truy Đuổi`)
     * `[4]` Missile / Depth Charge SVG icon (`Tên Lửa / Bom Chìm`)
   - Show visual ammo pips/bars and a glowing border + `"ĐANG CHỌN"` badge on the active weapon slot so the player always knows visually which ammo type is selected.
   - Translate **100% of all remaining English text** in `hud_controller.ts`, `weapon_controls.ts`, `menus.ts`, and `kill_feed.ts` into Vietnamese (`ĐỘ BỀN THÂN TÀU`, `[X] LÁI: CHUỘT`, `[T] ĐỔI TÀU`, `[L] TRANG BỊ`, `[C] SƠN TÀU`, `[Q] LẶN/NỔI`, `[E] TÀNG HÌNH`, `[F] NHIỄU RADAR`, `SẴN SÀNG`, `MẶT NƯỚC`, `KÍNH TIỀM VỌNG`, `LẶN SÂU`, etc.).

---

## Milestone M10: Authentic `mk48.io` Live HUD Synchronization, Fleets, Chat & Progression (Completed)

1. **Zero-Overlap HUD Layout (`client/src/hud/hud_controller.ts`)**:
   - Repositioned `.tactical-top-bar` to `top: 28px` (`z-index: 85`) with compact styling so the top-center `mk48.io` XP progress bar (`top: 0`, `height: 22px`, `z-index: 100`) is 100% unobstructed.
2. **Live XP Progress Bar & Automatic Tier Unlocks (`client/src/app.ts`)**:
   - Implemented `computePlayerXpProgress()` using `SANDBOX_TIER_XP_THRESHOLDS` and `getSandboxTierForXp()`.
   - Automatically unlocks all vessels in `SHIP_ROSTER` up to the player's current tier (`this.hud.menus.unlockedHulls`) and updates the top-center XP progress bar fill and label in real time.
3. **Live Sorted Leaderboard & Interactive Fleet System (`client/src/app.ts`)**:
   - Implemented `getLiveLeaderboard()` sorting all active vessels (player + 12 AI ships) descending by live score with authentic fleet tags (`[USSR]`, `[Ae VN]`, `[やまをと]`, `[Đại Hán]`, `[Yamato]`).
   - Implemented `joinOrLeaveFleet(targetFleetId)` wiring the `Xin tham gia` / `Rời đội` buttons on the top-left Hạm Đội panel and enforcing the 15-second Non-Aggression Pact (`setFleetNAP(..., 15.0)`) upon leaving a fleet.
4. **Live Chat Box, Input Focus Guard & Special Slot `[4]` (`client/src/app.ts`)**:
   - Implemented `sendChatMessage(rawText)` with HTML bracket sanitization, 80-char clamping, and 6-message rolling history.
   - Added input focus guard in `window.addEventListener('keydown')` so typing in chat or player name input never triggers ship hotkeys (`WASD`, `Space`, `T`, `L`, `C`, `1-4`).
   - Extended Weapon Slot `[4]` (`selectedWeaponSlot === 3`) to fire `AIRCRAFT_SQUADRON` and `DREDGER_TOOL` mounts in addition to `SAM_MISSILE`, `SSM_MISSILE`, `DEPTH_CHARGE`, and `NAVAL_MINE`.
   - Wired lobby mode selection cards (`.mode-card-ffa`, `.mode-card-2f`, `.btn-friends-vn`) via `selectLobbyMode()`.
5. **Verification Suite (`tests/unit/m10_live_hud_interactions.test.ts`)**:
   - Added 9 comprehensive unit, boundary, and adversarial tests. All **24/24 test suites (300/300 tests)** pass 100%.

---

## Milestone M11: Authentic `mk48.io` Graphics Reconstruction (Completed)

1. **Authentic Multi-Layer Vector Warship Details (`client/src/rendering/vector_hulls.ts`)**:
   - Upgraded surface warship decks and superstructures: longitudinal teak plank lines (`BATTLESHIP`/`CRUISER`), twin deck lifeboats/RHIBs, windlass capstans, parked swept-wing fighter aircraft & angled landing guides (`AIRCRAFT_CARRIER`), ballast flood vents (`SUBMARINE`), ice-ram bow chevron & hydraulic crane (`DREDGER_ICEBREAKER`), lateral bridge wings, and reflective dark/cyan bridge glass.
2. **In-Theater 5-Layer Archipelago Islands (`common/models/terrain.ts`, `client/src/app.ts`)**:
   - Added 4 multi-vertex islands inside `[-1500, +1500]` while preserving legacy test presets `[0..2]`, rendered with 5-layer elevation (shallow turquoise coral reef -> drop shadow -> golden sandy beach + surf rim -> olive forest -> sunlit hill contour).
3. **Floating XP Crates & Enhanced Projectiles (`server/core/game_server.ts`, `client/src/rendering/pixi_renderer.ts`)**:
   - Server seeds 24 ambient `XpCrate`s (`WOODEN`, `STEEL`, `MILITARY_CHEST`) and replenishes below 15.
   - `PixiRenderer.renderCrates()` draws crates with X-straps and pulsing water ripple rings; `renderProjectiles()` adds elongated golden tracer artillery shells and ASW depth charges.
4. **Responsive Zero-Overlap HUD (`client/src/hud/hud_controller.ts`, `client/src/hud/kill_feed.ts`)**:
   - Repositioned KillFeed to `top: 235px; right: 16px` below the Leaderboard and added responsive media queries for narrow viewports (`<= 1080px`).
5. **Verification Suite (`tests/unit/m11_mk48_authentic_graphics.test.ts`)**:
   - Added 7 unit & boundary tests. Full suite: **25/25 test suites, 307/307 tests PASS**.

---

## Milestone M12: Authentic `mk48.io` Graphics, Bathymetry, 2.5D Ship Paneling, Quick Upgrade Bar & Threat Indicators (Completed — 2026-11-13)

1. **Deep Marine Ocean, Bathymetric Islands & Coastal Trees (`client/src/rendering/pixi_renderer.ts`, `client/src/app.ts`)**:
   - Updated canvas ocean background to deep marine blue (`0x113a75`), reduced coordinate grid opacity (`0.09`), and added dark wave troughs (`0x0c2c5c`), lit primary swells, dappled wavelets, and white seafoam glints.
   - Upgraded islands to **7 bathymetric & terrain layers** (3 bathymetric water shelves -> shoreline surf foam ring -> SE underwater drop shadow -> golden-olive sandy beach -> 3-tier olive terrain contours) plus **8 deterministic coastal tree/shrub clusters** per island and **5 procedural Arctic ice floes** in the northern sector.
2. **Oil Barrels, Crates, Two-Tone Torpedoes, Mines & Wake Foam Trails (`client/src/rendering/pixi_renderer.ts`, `client/src/rendering/wake_fx.ts`)**:
   - Upgraded `renderCrates()` to draw ribbed cylindrical **Steel Oil Barrels / Drums**, slatted wooden crates, and gold-clasped military chests with dual concentric water ripple rings.
   - Upgraded `renderProjectiles()` to draw metallic silver/red-warhead torpedoes with 5-node foamy zigzag contrails and warning triangles (`▼`), plus 6-horn contact mines with pulsing red detonator lights.
   - Upgraded `WakeFX` with centerline turbulent white foam core ribbons and expanding foam bubble clusters.
3. **2.5D Multi-Shaded Warship Paneling & Torpedo Troughs (`client/src/rendering/vector_hulls.ts`)**:
   - Added 2-layer soft drop shadows, gunwale rubbing strakes, forward V-breakwaters, transverse hull plating seams, engine room louver vents, twin recessed torpedo troughs with visible red-tipped torpedoes on patrol/destroyer hulls, red/white lifebuoys, mooring bollards, 3D sunlit/shadowed superstructure bevels, and visible red warheads inside torpedo tube muzzles (preserving turret bounding-box invariants).
4. **Quick Ship Upgrade Bar, Custom Fleet Input, Reload Fill & Threat Warning Triangles (`client/src/app.ts`, `client/src/hud/hud_controller.ts`)**:
   - Added clickable `.mk48-upgrade-bar` under the top XP bar with top-down SVG ship cards (`getAvailableUpgradeShips`, `selectQuickUpgradeHull`, `getShipTopDownSvg`).
   - Added editable `.mk48-fleet-name-input` (`createOrJoinCustomFleet`) with XSS/HTML sanitization and 15s Non-Aggression Pact enforcement.
   - Added real-time weapon reload fill bar (`.mk48-reload-fill`), auto-fading tutorial banner (`.mk48-tutorial-banner`), bottom-right `☰` compact minimal HUD toggle (`toggleCompactMinimalHud`), and 75m ring incoming threat warning triangles (`computeIncomingThreats`, `renderThreatIndicators`).
5. **Verification Suite (`tests/unit/m12_mk48_shader_hud_overhaul.test.ts`)**:
   - Added 7 unit & boundary tests. Full verification: `npm run build` (`tsc && vite build`, 0 errors) and `npx vitest run` (**26/26 test files passed, 314/314 tests passed**).
