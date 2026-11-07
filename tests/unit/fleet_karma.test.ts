/**
 * Milestone M3 Unit Tests: Anti-Betrayal Fleet Mechanics (15s NAP) & Karma System
 * Clean-Room Test Suite for NavalCommand.io
 */

import { describe, it, expect } from 'vitest';
import {
  FleetKarmaManager,
  MAX_VISIBLE_FLEETS,
  NAP_DURATION_SECONDS,
} from '../../common/models/fleet.js';
import { AuthoritativeGameServer } from '../../server/core/game_server.js';

describe('M3: Anti-Betrayal Fleet Mechanics & Karma Reputation System', () => {
  it('supports up to 5 visible active fleets with create, invite, join, leave, and kick controls', () => {
    const manager = new FleetKarmaManager();

    for (let i = 1; i <= MAX_VISIBLE_FLEETS; i++) {
      const res = manager.createFleet(`leader_${i}`, `Fleet Alpha ${i}`);
      expect(res.success).toBe(true);
    }

    // 6th fleet is blocked because MAX_VISIBLE_FLEETS = 5
    const sixth = manager.createFleet('leader_6', 'Overflow Fleet');
    expect(sixth.success).toBe(false);
    expect(manager.getVisibleFleets().length).toBe(5);

    const fleet1 = manager.getVisibleFleets()[0];
    expect(manager.inviteToFleet(fleet1.fleetId, 'leader_1', 'ally_2')).toBe(true);
    expect(manager.joinFleet(fleet1.fleetId, 'ally_2')).toBe(true);

    // Friendly fire within same fleet is completely disabled
    expect(manager.canDamage('leader_1', 'ally_2')).toBe(false);
    expect(manager.canDamage('ally_2', 'leader_1')).toBe(false);
  });

  it('enforces a mandatory 15-second Non-Aggression Pact (NAP) timer on leave or kick blocking all mutual damage', () => {
    const manager = new FleetKarmaManager();
    const { fleet } = manager.createFleet('leader_1', 'Wolfpack');
    expect(fleet).toBeDefined();

    manager.joinFleet(fleet!.fleetId, 'member_2');
    manager.joinFleet(fleet!.fleetId, 'member_3');

    // Kick member_2 -> triggers 15.0s NAP with leader_1 and member_3
    expect(manager.kickMember(fleet!.fleetId, 'leader_1', 'member_2')).toBe(true);
    expect(manager.getRemainingNAP('leader_1', 'member_2')).toBe(NAP_DURATION_SECONDS);
    expect(manager.getRemainingNAP('member_3', 'member_2')).toBe(NAP_DURATION_SECONDS);

    // Mutual damage is strictly blocked during the 15s NAP window
    expect(manager.canDamage('leader_1', 'member_2')).toBe(false);
    expect(manager.canDamage('member_2', 'leader_1')).toBe(false);
    const blockedAttack = manager.recordAttack('leader_1', 'member_2', 500);
    expect(blockedAttack.allowed).toBe(false);
    expect(blockedAttack.effectiveDamage).toBe(0);

    // Advance 10 seconds -> 5s remaining, still blocked
    manager.step(10.0);
    expect(manager.getRemainingNAP('leader_1', 'member_2')).toBeCloseTo(5.0, 2);
    expect(manager.canDamage('leader_1', 'member_2')).toBe(false);

    // Advance remaining 5 seconds -> NAP expires!
    manager.step(5.0);
    expect(manager.getRemainingNAP('leader_1', 'member_2')).toBe(0);
    expect(manager.canDamage('leader_1', 'member_2')).toBe(true);
  });

  it('penalizes Karma score and shifts name color toward warning/hostile hues when attacking former fleetmates shortly after NAP expiry', () => {
    const manager = new FleetKarmaManager();
    const { fleet } = manager.createFleet('betrayer_1', 'Corsairs');
    manager.joinFleet(fleet!.fleetId, 'victim_2');

    // Betrayer leaves fleet -> 15s NAP starts
    manager.leaveFleet('betrayer_1');
    manager.step(15.0); // NAP expires, post-NAP betrayal window opens

    // Attack immediately after NAP expiry -> Karma penalized!
    const atk1 = manager.recordAttack('betrayer_1', 'victim_2', 400);
    expect(atk1.allowed).toBe(true);
    expect(atk1.karmaPenalized).toBe(true);
    expect(atk1.newKarmaProfile.karmaScore).toBe(65);
    expect(atk1.newKarmaProfile.status).toBe('SUSPECT');
    expect(atk1.newKarmaProfile.nameColorHex).toBe('#ffab00'); // Warning amber

    // Second betrayal attack -> drops into TRAITOR status (< 40)
    const atk2 = manager.recordAttack('betrayer_1', 'victim_2', 400);
    expect(atk2.newKarmaProfile.karmaScore).toBe(30);
    expect(atk2.newKarmaProfile.status).toBe('TRAITOR');
    expect(atk2.newKarmaProfile.nameColorHex).toBe('#ff1744'); // Hostile red
  });

  it('verifies AuthoritativeGameServer enforces 15s NAP and Karma penalty in live vessel damage', () => {
    const server = new AuthoritativeGameServer(20);
    const v1 = server.spawnVessel({ id: 1, name: 'Alpha', shipId: 'fletcher_dd', fleetId: 10 });
    const v2 = server.spawnVessel({ id: 2, name: 'Bravo', shipId: 'fletcher_dd', fleetId: 10 });

    // Same fleet -> 0 damage
    expect(server.applyDamage(v1.id, v2.id, 500)).toBe(0);

    // Leave fleet and start 15s NAP
    v2.fleetId = 0;
    server.setFleetNAP(v1.id, v2.id, 15.0);
    expect(server.applyDamage(v1.id, v2.id, 500)).toBe(0);

    // Advance 15.5 seconds -> NAP expires, attacking now deals damage and penalizes Karma
    server.step(15.5);
    const dmg = server.applyDamage(v1.id, v2.id, 500);
    expect(dmg).toBeGreaterThan(0);
    expect(v1.karma).toBeLessThan(100);
  });
});
