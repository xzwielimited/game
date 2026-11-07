/**
 * Anti-Betrayal Fleet & Karma Reputation System
 * Clean-Room implementation for NavalCommand.io (Milestone M3)
 *
 * Implements:
 * - Up to 5 active visible fleets with create, invite, join, leave, and kick controls.
 * - Mandatory 15-second Non-Aggression Pact (NAP) timer upon leaving or being kicked,
 *   completely blocking mutual damage between the ex-member and former fleetmates.
 * - Karma System (0-100 score, LOYAL / SUSPECT / TRAITOR status, name color shift)
 *   penalizing players who attack former fleetmates shortly after the 15s NAP expires.
 */

export const MAX_VISIBLE_FLEETS = 5;
export const NAP_DURATION_SECONDS = 15.0;
export const POST_NAP_KARMA_WINDOW_SECONDS = 30.0;

export type KarmaStatus = 'LOYAL' | 'SUSPECT' | 'TRAITOR';

export interface KarmaProfile {
  playerId: string;
  karmaScore: number; // 0 to 100 (100 = honorable, < 70 = SUSPECT, < 40 = TRAITOR)
  status: KarmaStatus;
  nameColorHex: string;
  betrayalCount: number;
}

export interface FleetState {
  fleetId: string;
  name: string;
  leaderId: string;
  memberIds: Set<string>;
  invitedIds: Set<string>;
  createdAt: number;
}

interface PairTimer {
  napRemainingSeconds: number;
  postNapElapsedSeconds: number | null;
}

export class FleetKarmaManager {
  private fleets: Map<string, FleetState> = new Map();
  private playerFleetMap: Map<string, string> = new Map();
  private karmaProfiles: Map<string, KarmaProfile> = new Map();
  private pairTimers: Map<string, PairTimer> = new Map();
  private nextFleetSeq = 1;

  private makePairKey(idA: string, idB: string): string {
    return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
  }

  public getOrCreateKarmaProfile(playerId: string): KarmaProfile {
    let profile = this.karmaProfiles.get(playerId);
    if (!profile) {
      profile = {
        playerId,
        karmaScore: 100,
        status: 'LOYAL',
        nameColorHex: '#00e676', // Honorable emerald/white
        betrayalCount: 0,
      };
      this.karmaProfiles.set(playerId, profile);
    }
    return profile;
  }

  private updateKarmaStatus(profile: KarmaProfile): void {
    if (profile.karmaScore < 40) {
      profile.status = 'TRAITOR';
      profile.nameColorHex = '#ff1744'; // Hostile crimson red
    } else if (profile.karmaScore < 75) {
      profile.status = 'SUSPECT';
      profile.nameColorHex = '#ffab00'; // Warning amber orange
    } else {
      profile.status = 'LOYAL';
      profile.nameColorHex = '#00e676'; // Honorable green
    }
  }

  /**
   * Lists up to MAX_VISIBLE_FLEETS (5) active fleets.
   */
  public getVisibleFleets(): FleetState[] {
    return Array.from(this.fleets.values()).slice(0, MAX_VISIBLE_FLEETS);
  }

  public getFleet(fleetId: string): FleetState | undefined {
    return this.fleets.get(fleetId);
  }

  public getPlayerFleet(playerId: string): FleetState | undefined {
    const fleetId = this.playerFleetMap.get(playerId);
    return fleetId ? this.fleets.get(fleetId) : undefined;
  }

  /**
   * Creates a new fleet (up to 5 visible active fleets).
   */
  public createFleet(leaderId: string, name?: string): { success: boolean; fleet?: FleetState; error?: string } {
    if (this.fleets.size >= MAX_VISIBLE_FLEETS) {
      return { success: false, error: 'Maximum of 5 active fleets reached' };
    }
    if (this.playerFleetMap.has(leaderId)) {
      this.leaveFleet(leaderId);
    }

    const fleetId = `fleet_${this.nextFleetSeq++}`;
    const fleet: FleetState = {
      fleetId,
      name: name ?? `Task Force ${this.nextFleetSeq - 1}`,
      leaderId,
      memberIds: new Set([leaderId]),
      invitedIds: new Set(),
      createdAt: Date.now(),
    };

    this.fleets.set(fleetId, fleet);
    this.playerFleetMap.set(leaderId, fleetId);
    this.getOrCreateKarmaProfile(leaderId);
    return { success: true, fleet };
  }

  /**
   * Invites a player to join the leader's fleet.
   */
  public inviteToFleet(fleetId: string, inviterId: string, targetPlayerId: string): boolean {
    const fleet = this.fleets.get(fleetId);
    if (!fleet || !fleet.memberIds.has(inviterId)) return false;
    fleet.invitedIds.add(targetPlayerId);
    return true;
  }

  /**
   * Joins an existing fleet.
   */
  public joinFleet(fleetId: string, playerId: string): boolean {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) return false;

    if (this.playerFleetMap.has(playerId)) {
      this.leaveFleet(playerId);
    }

    fleet.memberIds.add(playerId);
    fleet.invitedIds.delete(playerId);
    this.playerFleetMap.set(playerId, fleetId);
    this.getOrCreateKarmaProfile(playerId);

    // Clear any old NAP timers with current fleetmates
    for (const mateId of fleet.memberIds) {
      if (mateId !== playerId) {
        this.pairTimers.delete(this.makePairKey(playerId, mateId));
      }
    }

    return true;
  }

  /**
   * Leaves a fleet voluntarily and activates the 15-second Non-Aggression Pact timer
   * with all remaining fleet members.
   */
  public leaveFleet(playerId: string): boolean {
    const fleetId = this.playerFleetMap.get(playerId);
    if (!fleetId) return false;

    const fleet = this.fleets.get(fleetId);
    if (!fleet) return false;

    fleet.memberIds.delete(playerId);
    this.playerFleetMap.delete(playerId);

    // Activate 15s Non-Aggression Pact with all remaining members
    for (const formerMateId of fleet.memberIds) {
      this.activateNAP(playerId, formerMateId, NAP_DURATION_SECONDS);
    }

    // Disband fleet if empty, or promote next member if leader left
    if (fleet.memberIds.size === 0) {
      this.fleets.delete(fleetId);
    } else if (fleet.leaderId === playerId) {
      fleet.leaderId = Array.from(fleet.memberIds)[0];
    }

    return true;
  }

  /**
   * Kicks a member from the fleet (leader only) and activates the 15-second NAP timer.
   */
  public kickMember(fleetId: string, leaderId: string, targetMemberId: string): boolean {
    const fleet = this.fleets.get(fleetId);
    if (!fleet || fleet.leaderId !== leaderId) return false;
    if (leaderId === targetMemberId || !fleet.memberIds.has(targetMemberId)) return false;

    fleet.memberIds.delete(targetMemberId);
    this.playerFleetMap.delete(targetMemberId);

    // Activate 15s Non-Aggression Pact between kicked player and all fleet members
    for (const mateId of fleet.memberIds) {
      this.activateNAP(targetMemberId, mateId, NAP_DURATION_SECONDS);
    }

    return true;
  }

  /**
   * Explicitly starts a 15s Non-Aggression Pact between two players.
   */
  public activateNAP(playerA: string, playerB: string, duration = NAP_DURATION_SECONDS): void {
    const key = this.makePairKey(playerA, playerB);
    this.pairTimers.set(key, {
      napRemainingSeconds: duration,
      postNapElapsedSeconds: null,
    });
  }

  public getRemainingNAP(playerA: string, playerB: string): number {
    const timer = this.pairTimers.get(this.makePairKey(playerA, playerB));
    return timer ? timer.napRemainingSeconds : 0;
  }

  /**
   * Checks if attacker can deal damage to victim.
   * Returns false if both are in the same fleet OR if the 15-second NAP timer is active.
   */
  public canDamage(attackerId: string, victimId: string): boolean {
    if (attackerId === victimId) return false;

    const fleetA = this.playerFleetMap.get(attackerId);
    const fleetB = this.playerFleetMap.get(victimId);
    if (fleetA && fleetB && fleetA === fleetB) {
      return false; // Friendly fire disabled within same fleet
    }

    const timer = this.pairTimers.get(this.makePairKey(attackerId, victimId));
    if (timer && timer.napRemainingSeconds > 0) {
      return false; // 15-second Non-Aggression Pact blocks 100% of mutual damage!
    }

    return true;
  }

  /**
   * Evaluates an attack between two players.
   * If allowed and occurs shortly after NAP expiration (within POST_NAP_KARMA_WINDOW_SECONDS),
   * penalizes the attacker's Karma score and shifts their name color toward warning/hostile hues.
   */
  public recordAttack(
    attackerId: string,
    victimId: string,
    rawDamage: number
  ): { allowed: boolean; effectiveDamage: number; karmaPenalized: boolean; newKarmaProfile: KarmaProfile } {
    const profile = this.getOrCreateKarmaProfile(attackerId);

    if (!this.canDamage(attackerId, victimId)) {
      return {
        allowed: false,
        effectiveDamage: 0,
        karmaPenalized: false,
        newKarmaProfile: profile,
      };
    }

    let karmaPenalized = false;
    const key = this.makePairKey(attackerId, victimId);
    const timer = this.pairTimers.get(key);

    if (
      timer &&
      timer.napRemainingSeconds <= 0 &&
      timer.postNapElapsedSeconds !== null &&
      timer.postNapElapsedSeconds <= POST_NAP_KARMA_WINDOW_SECONDS
    ) {
      // Betrayal attack right after NAP expired!
      profile.karmaScore = Math.max(0, profile.karmaScore - 35);
      profile.betrayalCount += 1;
      this.updateKarmaStatus(profile);
      karmaPenalized = true;
    }

    return {
      allowed: true,
      effectiveDamage: rawDamage,
      karmaPenalized,
      newKarmaProfile: profile,
    };
  }

  /**
   * Advances all NAP countdowns and post-NAP betrayal tracking windows.
   */
  public step(dt: number): void {
    for (const [key, timer] of this.pairTimers.entries()) {
      if (timer.napRemainingSeconds > 0) {
        timer.napRemainingSeconds = Math.max(0, timer.napRemainingSeconds - dt);
        if (timer.napRemainingSeconds === 0) {
          timer.postNapElapsedSeconds = 0;
        }
      } else if (timer.postNapElapsedSeconds !== null) {
        timer.postNapElapsedSeconds += dt;
        if (timer.postNapElapsedSeconds > POST_NAP_KARMA_WINDOW_SECONDS * 2) {
          this.pairTimers.delete(key);
        }
      }
    }
  }
}
