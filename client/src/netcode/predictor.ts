/**
 * Client-Side Movement Prediction & Reconciliation
 * Clean-Room implementation for NavalCommand.io
 * Eliminates input latency by predicting local ship motion and reconciling with authoritative server snapshots.
 */

import { ClientInputData, EntitySnapshot } from './binary_client.js';
import { normalizeAngle } from '../../../common/math/vector2.js';


export interface LocalPredictedState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  speedKnots: number;
  depthState: number;
}

interface StoredInput {
  sequence: number;
  steer: number;
  throttle: number;
  dt: number;
}

export class ClientPredictor {
  public localEntityId: number = 0;

  // Current predicted state
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public heading: number = 0;
  public speedKnots: number = 0;
  public depthState: number = 0;

  // Smoothing error vector
  private errorX: number = 0;
  private errorY: number = 0;

  // Ship performance parameters (can be configured based on ship type)
  public maxSpeedMs: number = 16.0;   // ~31 knots
  public accelRate: number = 2.5;     // m/s^2
  public decelRate: number = 3.0;     // m/s^2
  public turnRateMax: number = 0.45;  // rad/s

  private pendingInputs: StoredInput[] = [];
  private nextSequence: number = 1;

  constructor(initialX: number = 0, initialY: number = 0, initialHeading: number = 0) {
    this.x = initialX;
    this.y = initialY;
    this.heading = initialHeading;
  }

  public reset(x: number, y: number, heading: number): void {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.vx = 0;
    this.vy = 0;
    this.speedKnots = 0;
    this.errorX = 0;
    this.errorY = 0;
    this.pendingInputs = [];
  }

  /**
   * Apply local client input immediately and return payload for server transmission.
   */
  public applyInput(
    steer: number,
    throttle: number,
    dt: number,
    aimAngleRad: number,
    targetDistance: number,
    flags: {
      firePrimary?: boolean;
      fireSecondary?: boolean;
      fireTorpedo?: boolean;
      fireMissile?: boolean;
      diveToggle?: boolean;
      stealthToggle?: boolean;
      ecmToggle?: boolean;
      activeSonar?: boolean;
    } = {}
  ): ClientInputData {
    const sequence = this.nextSequence++;

    // Record in unacknowledged input buffer
    this.pendingInputs.push({
      sequence,
      steer,
      throttle,
      dt,
    });

    // 1. Immediate local physics integration
    this.integrateStep(steer, throttle, dt);

    return {
      sequence,
      steer,
      throttle,
      aimAngleRad,
      targetDistance,
      firePrimary: !!flags.firePrimary,
      fireSecondary: !!flags.fireSecondary,
      fireTorpedo: !!flags.fireTorpedo,
      fireMissile: !!flags.fireMissile,
      diveToggle: !!flags.diveToggle,
      stealthToggle: !!flags.stealthToggle,
      ecmToggle: !!flags.ecmToggle,
      activeSonar: !!flags.activeSonar,
    };
  }

  /**
   * Single timestep hydrodynamic integration.
   */
  private integrateStep(steer: number, throttle: number, dt: number): void {
    // Heading rotation based on rudder and forward motion
    const forwardRatio = Math.min(1.0, this.speedKnots / 10.0);
    this.heading = normalizeAngle(this.heading + steer * this.turnRateMax * forwardRatio * dt);

    // Throttle acceleration / drag deceleration
    const targetSpeed = throttle * this.maxSpeedMs;
    const currentSpeed = Math.hypot(this.vx, this.vy);

    let newSpeed = currentSpeed;
    if (targetSpeed > currentSpeed) {
      newSpeed = Math.min(targetSpeed, currentSpeed + this.accelRate * dt);
    } else {
      newSpeed = Math.max(targetSpeed, currentSpeed - this.decelRate * dt);
    }

    this.vx = Math.cos(this.heading) * newSpeed;
    this.vy = Math.sin(this.heading) * newSpeed;
    this.speedKnots = Math.abs(newSpeed) * 1.94384;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /**
   * Reconcile local state when server snapshot acknowledges inputs.
   */
  public reconcile(serverState: EntitySnapshot, ackSequence: number): void {
    // 1. Discard inputs acknowledged by server
    this.pendingInputs = this.pendingInputs.filter((inp) => inp.sequence > ackSequence);

    // 2. Measure discrepancy between predicted position and authoritative server position
    const deltaX = this.x - serverState.x;
    const deltaY = this.y - serverState.y;
    const errorDistance = Math.hypot(deltaX, deltaY);

    if (errorDistance > 0.5) {
      // Large deviation: snap to authoritative state and re-simulate remaining unacknowledged inputs
      this.x = serverState.x;
      this.y = serverState.y;
      this.vx = serverState.vx;
      this.vy = serverState.vy;
      this.heading = serverState.heading;
      this.depthState = serverState.depthState;

      for (const input of this.pendingInputs) {
        this.integrateStep(input.steer, input.throttle, input.dt);
      }
      this.errorX = 0;
      this.errorY = 0;
    } else {
      // Small deviation: smoothly decay error offset
      this.errorX = deltaX;
      this.errorY = deltaY;
    }
  }

  /**
   * Get render position including smooth error decay.
   */
  public getRenderPosition(decayDt: number): { x: number; y: number; heading: number } {
    // Decay error vector toward 0
    this.errorX *= Math.max(0, 1.0 - decayDt * 8.0);
    this.errorY *= Math.max(0, 1.0 - decayDt * 8.0);

    return {
      x: this.x - this.errorX,
      y: this.y - this.errorY,
      heading: this.heading,
    };
  }

  public get pendingCount(): number {
    return this.pendingInputs.length;
  }
}
