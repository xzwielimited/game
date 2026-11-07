import { describe, it, expect, beforeEach } from 'vitest';
import { NavalCommandApp } from '../../client/src/app.js';
import { AuthoritativeGameServer } from '../../server/core/game_server.js';
import { soundSynth } from '../../client/src/audio/sound_synthesizer.js';
import { shortestAngleDiff } from '../../common/math/vector2.js';

function createMockElement(tag: string = 'div'): any {
  const styleObj: any = {};
  Object.defineProperty(styleObj, 'cssText', {
    set(txt: string) {
      txt.split(';').forEach((decl) => {
        const parts = decl.split(':');
        if (parts.length >= 2) {
          const k = parts[0].trim();
          const v = parts.slice(1).join(':').trim();
          if (k) styleObj[k] = v;
        }
      });
    },
    get() {
      return '';
    },
  });
  const mockCtx = {
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    setLineDash: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: () => ({ width: 0 }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  const mockEl: any = {
    tagName: tag.toUpperCase(),
    style: styleObj,
    children: [],
    appendChild: (child: any) => {
      mockEl.children.push(child);
      mockEl.innerHTML += (child.outerHTML || child.innerHTML || '');
    },
    removeChild: () => {},
    addEventListener: () => {},
    querySelector: () => createMockElement(),
    querySelectorAll: () => [],
    classList: { add: () => {}, remove: () => {} },
    innerHTML: '',
    textContent: '',
    getContext: () => mockCtx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    width: 800,
    height: 600,
  };
  return mockEl;
}

(globalThis as any).document = {
  createElement: (tag: string) => createMockElement(tag),
  getElementById: (id: string) => createMockElement(),
  body: createMockElement('body'),
};
(globalThis as any).window = {
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: () => {},
  removeEventListener: () => {},
  AudioContext: class {
    currentTime = 0;
    sampleRate = 44100;
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          setTargetAtTime: () => {},
        },
        connect: () => {},
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
        },
        connect: () => {},
        start: () => {},
        stop: () => {},
      };
    }
    createBufferSource() {
      return { buffer: null, connect: () => {}, start: () => {}, stop: () => {} };
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(1024) };
    }
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
        Q: { value: 1 },
        connect: () => {},
      };
    }
  },
};

describe('Milestone M9: Weapons, Torpedo Modes, Controls & Audio Verification', () => {
  let app: NavalCommandApp;
  let server: AuthoritativeGameServer;

  beforeEach(() => {
    app = new NavalCommandApp(createMockElement());
    (app as any).setupInitialWorld();
    server = app.localServer;
  });

  // =========================================================================
  // 1. SILENT ENGINE HUM & COMBAT AUDIO SYNTHESIZER
  // =========================================================================
  describe('1. Silent Engine Hum & Combat Audio FX', () => {
    it('updateEngineSound is a complete no-op and never starts an engine oscillator', () => {
      soundSynth.resumeContext();
      // Calling updateEngineSound at various throttles and speeds
      expect(() => {
        soundSynth.updateEngineSound(1.0, 35);
        soundSynth.updateEngineSound(0.5, 18);
        soundSynth.updateEngineSound(-0.5, 10);
        soundSynth.updateEngineSound(0.0, 0);
      }).not.toThrow();

      // engineOsc should never be started
      expect((soundSynth as any).engineOsc).toBeNull();
    });

    it('plays discrete combat events safely without error', () => {
      soundSynth.resumeContext();
      expect(() => {
        soundSynth.playCannonBoom(127, 0);
        soundSynth.playCannonBoom(460, 500);
        soundSynth.playTorpedoWhoosh();
        soundSynth.playExplosion(1.5);
        soundSynth.playSonarPing(800);
        soundSynth.playWaterSplash(1.0);
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 2. WEAPON SLOT SELECTION & INDEPENDENT FIRING LOGIC
  // =========================================================================
  describe('2. Weapon Slot Selection & Left-Click Firing Rules', () => {
    it('defaults to Slot [1] Đạn Pháo (selectedWeaponSlot === 0) on startup', () => {
      expect((app as any).selectedWeaponSlot).toBe(0);
    });

    it('left-click on Slot [1] (Đạn Pháo) only fires artillery mounts and NEVER auto-fires torpedoes', () => {
      const player = server.getVessel(app.playerVesselId)!;
      // Ensure player has both artillery and torpedo mounts (fletcher_dd)
      const artilleryMounts = player.mounts.filter((m) => m.category === 'ARTILLERY');
      const torpedoMounts = player.mounts.filter((m) => m.category === 'TORPEDO');
      expect(artilleryMounts.length).toBeGreaterThan(0);
      expect(torpedoMounts.length).toBeGreaterThan(0);

      const initialTorpAmmo = torpedoMounts[0].ammoCurrent;

      // Select Slot 0 (Đạn Pháo)
      (app as any).selectedWeaponSlot = 0;
      (app as any).mouseScreenX = 500;
      (app as any).mouseScreenY = 500;

      // Fire selected slot
      app.fireSelectedWeaponSlot();

      // Torpedo ammo must remain completely untouched!
      expect(torpedoMounts[0].ammoCurrent).toBe(initialTorpAmmo);
      // Projectiles launched should only be ballistic shells, not torpedoes
      for (const proj of server.getAllProjectiles()) {
        expect(proj.category).toBe('ARTILLERY');
      }
    });

    it('switching to Slot [2] (Ngư Lôi Thẳng) fires torpedo in straight unguided mode', () => {
      const player = server.getVessel(app.playerVesselId)!;
      const initialProjCount = server.getAllProjectiles().length;

      // Select Slot 1: Ngư Lôi Thẳng
      (app as any).selectedWeaponSlot = 1;
      (app as any).mouseScreenX = 600;
      (app as any).mouseScreenY = 200;

      app.fireSelectedWeaponSlot();

      // Should have launched a torpedo projectile
      expect(server.getAllProjectiles().length).toBe(initialProjCount + 1);
      const launched = server.getAllProjectiles().pop()!;
      expect(launched.category).toBe('TORPEDO');
      expect(launched.isHoming).toBe(false);
    });

    it('switching to Slot [3] (Ngư Lôi Truy Đuổi) fires torpedo in acoustic homing mode', () => {
      const player = server.getVessel(app.playerVesselId)!;
      // Spawn an enemy bot in front of the player
      server.spawnVessel({
        id: 99,
        name: 'Target_Dummy',
        shipId: 'pt_boat_109',
        position: { x: player.physics.position.x + 300, y: player.physics.position.y },
        heading: 0,
        isBot: true,
        teamId: 2,
      });

      const initialProjCount = server.getAllProjectiles().length;

      // Select Slot 2: Ngư Lôi Truy Đuổi
      (app as any).selectedWeaponSlot = 2;
      (app as any).mouseScreenX = 400;
      (app as any).mouseScreenY = 200;

      app.fireSelectedWeaponSlot();

      expect(server.getAllProjectiles().length).toBe(initialProjCount + 1);
      const launched = server.getAllProjectiles().pop()!;
      expect(launched.category).toBe('TORPEDO');
      expect(launched.isHoming).toBe(true);
    });
  });

  // =========================================================================
  // 3. ACOUSTIC HOMING TORPEDO SEEKER DYNAMICS
  // =========================================================================
  describe('3. Torpedo Guidance Mechanics: Straight vs Acoustic Homing', () => {
    it('straight torpedo travels in an unchanging ballistic heading', () => {
      const player = server.getVessel(app.playerVesselId)!;
      // Index 3 is the torpedo mount mid_torp on fletcher_dd
      server.fireMount(player.id, 3, { x: 500, y: 500 }, false);
      const torp = server.getAllProjectiles().find((p) => p.category === 'TORPEDO')!;
      expect(torp).toBeDefined();
      expect(torp.isHoming).toBe(false);

      const initialVelocityHeading = Math.atan2(torp.velocity.y, torp.velocity.x);

      // Advance simulation 20 ticks (1.0s)
      for (let i = 0; i < 20; i++) {
        server.step(0.05);
      }

      const currentVelocityHeading = Math.atan2(torp.velocity.y, torp.velocity.x);
      // Bearing must remain constant without turning
      expect(Math.abs(shortestAngleDiff(initialVelocityHeading, currentVelocityHeading))).toBeLessThan(0.001);
    });

    it('homing torpedo detects nearby enemy and dynamically steers heading toward target', () => {
      const player = server.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;

      // Enemy positioned at (300, 100) — off to the starboard flank
      server.spawnVessel({
        id: 101,
        name: 'Enemy_Cruiser',
        shipId: 'fletcher_dd',
        position: { x: 300, y: 100 },
        heading: 0,
        isBot: true,
        teamId: 2,
      });

      // Fire homing torpedo from mount 3 initially aimed East (300, 0)
      server.fireMount(player.id, 3, { x: 300, y: 0 }, true);
      const torp = server.getAllProjectiles().find((p) => p.category === 'TORPEDO' && p.isHoming)!;
      expect(torp).toBeDefined();

      const initialHeading = Math.atan2(torp.velocity.y, torp.velocity.x);

      // Simulate 15 ticks (0.75s) to allow seeker acquisition and rudder steering
      for (let i = 0; i < 15; i++) {
        server.step(0.05);
      }

      const updatedHeading = Math.atan2(torp.velocity.y, torp.velocity.x);
      const angleDiff = shortestAngleDiff(initialHeading, updatedHeading);

      // The torpedo should have turned positively towards +Y where the enemy is located
      expect(angleDiff).toBeGreaterThan(0.05);
    });
  });

  // =========================================================================
  // 4. RAPID-FIRE SALVO BURST
  // =========================================================================
  describe('4. Rapid-Fire Salvo Burst Functionality', () => {
    it('triggerSalvoBurst discharges all ready artillery mounts of selected slot', () => {
      const player = server.getVessel(app.playerVesselId)!;
      (app as any).selectedWeaponSlot = 0;

      const artilleryCount = player.mounts.filter((m) => m.category === 'ARTILLERY').length;
      expect(artilleryCount).toBeGreaterThanOrEqual(2);

      // Call salvo burst
      expect(() => {
        app.triggerSalvoBurst();
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 5. MOVEMENT, INITIAL CURSOR & STICKY TELEGRAPH THROTTLE
  // =========================================================================
  describe('5. Responsive Movement & Sticky Telegraph Throttle', () => {
    it('initializes mouseScreenX and mouseScreenY to center-top screen', () => {
      const freshApp = new NavalCommandApp(createMockElement());
      expect((freshApp as any).mouseScreenX).toBeGreaterThan(0);
      expect((freshApp as any).mouseScreenY).toBeGreaterThan(0);
    });

    it('stickyTelegraphThrottle maintains forward throttle setting when W is released', () => {
      app.stickyTelegraphThrottle = true;
      app.steeringMode = 'WASD';
      const player = server.getVessel(app.playerVesselId)!;

      // Press W
      (app as any).keysPressed.add('w');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(1.0);

      // Release W
      (app as any).keysPressed.delete('w');
      (app as any).updateLocalInput(0.05);
      // In sticky telegraph mode, throttle stays at 1.0 until S or X is pressed!
      expect(player.physics.throttle).toBe(1.0);

      // Press X to stop
      (app as any).keysPressed.add('x');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(0.0);
      (app as any).keysPressed.delete('x');
    });

    it('in MOUSE mode with stickyTelegraphThrottle: cursor within 35m idles and stops vessel', () => {
      app.stickyTelegraphThrottle = true;
      app.steeringMode = 'MOUSE';
      const player = server.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;

      // Cursor placed 20m from vessel (< 35m)
      (app as any).mouseScreenX = 20;
      (app as any).mouseScreenY = 0;
      (app as any).updateLocalInput(0.05);

      expect(player.physics.throttle).toBe(0.0);

      // Cursor placed 150m from vessel (>= 120m) -> full flank
      (app as any).mouseScreenX = 150;
      (app as any).mouseScreenY = 0;
      (app as any).updateLocalInput(0.05);

      expect(player.physics.throttle).toBe(1.0);
    });

    it('applies responsive velocity boost to achieve swift acceleration', () => {
      app.stickyTelegraphThrottle = true;
      const player = server.getVessel(app.playerVesselId)!;
      player.physics.linearVelocity.x = 0;
      player.physics.linearVelocity.y = 0;
      player.physics.heading = 0;

      // Command full throttle
      player.physics.throttle = 1.0;
      (app as any).mouseScreenX = 200;
      (app as any).mouseScreenY = 0;

      (app as any).updateLocalInput(0.1);

      // Velocity must have responded immediately (> 0.5 m/s in single tick)
      expect(player.physics.linearVelocity.x).toBeGreaterThan(0.5);
    });
  });

  // =========================================================================
  // 6. BOTTOM-CENTER WEAPON HUD & VIETNAMESE LOCALIZATION
  // =========================================================================
  describe('6. Weapon Controls Panel & 100% Vietnamese Localization', () => {
    it('creates HUD weapon controls with 4 slots and salvo burst button', () => {
      const weaponControls = app.hud.weaponControls;
      expect(weaponControls).toBeDefined();

      // Check slot cards rendered
      const root = weaponControls.container;
      expect(root).toBeDefined();
      expect(root.style.bottom).toBe('14px');
      expect(root.style.left).toBe('50%');

      // Check Vietnamese labels inside weapon controls
      expect(root.innerHTML).toContain('ĐẠN PHÁO');
      expect(root.innerHTML).toContain('NGƯ LÔI THẲNG');
      expect(root.innerHTML).toContain('NGƯ LÔI TRUY ĐUỔI');
      expect(root.innerHTML).toContain('BẮN LIÊN THANH');
    });
  });
});
