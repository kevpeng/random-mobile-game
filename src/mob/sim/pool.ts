/**
 * Struct-of-arrays pool for thousands of units. Removal swaps the last live
 * entry into the hole, so iteration stays dense (iterate backwards when
 * removing during a loop).
 */
export class Pool {
  n = 0;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly hp: Float32Array;
  /** Bitmask of gates this unit has already passed (player units only). */
  readonly gates: Uint32Array;
  /** Visual-only: seconds since spawned (pop-in animation). */
  readonly age: Float32Array;

  constructor(readonly cap: number) {
    this.x = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.hp = new Float32Array(cap);
    this.gates = new Uint32Array(cap);
    this.age = new Float32Array(cap);
  }

  get full(): boolean {
    return this.n >= this.cap;
  }

  /** Adds a unit; returns its index, or -1 if the pool is full. */
  add(x: number, z: number, hp: number, vx = 0, gates = 0): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x;
    this.z[i] = z;
    this.vx[i] = vx;
    this.hp[i] = hp;
    this.gates[i] = gates;
    this.age[i] = 0;
    return i;
  }

  remove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.z[i] = this.z[last];
    this.vx[i] = this.vx[last];
    this.hp[i] = this.hp[last];
    this.gates[i] = this.gates[last];
    this.age[i] = this.age[last];
  }

  clear(): void {
    this.n = 0;
  }

  /** Sum of hit points (a champion counts as its hp). */
  total(): number {
    let t = 0;
    for (let i = 0; i < this.n; i++) t += this.hp[i];
    return t;
  }
}
