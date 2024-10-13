export type Point = number[];

export type Func = (pos: Point) => number;

export class ValuedPoint {
  constructor(public readonly pos: Point, public val: number = 0) {}

  calc(fn: Func): ValuedPoint {
    this.val = fn(this.pos);
    return this;
  }

  toString(): string {
    return `(${this.pos.join(",")}; ${this.val})`;
  }

  static midpoint(p1: ValuedPoint, p2: ValuedPoint, fn: Func): ValuedPoint {
    const mid = p1.pos.map((v, i) => (v + p2.pos[i]) / 2) as Point;
    return new ValuedPoint(mid, fn(mid));
  }

  static intersectZero(p1: ValuedPoint, p2: ValuedPoint, fn: Func): ValuedPoint {
    const denom = p1.val - p2.val;
    const k1 = -p2.val / denom;
    const k2 = p1.val / denom;
    const pt = p1.pos.map((v, i) => k1 * v + k2 * p2.pos[i]) as Point;
    return new ValuedPoint(pt, fn(pt));
  }
}

export const binary_search_zero = (
  p1: ValuedPoint,
  p2: ValuedPoint,
  fn: Func,
  tol: number[]
): [ValuedPoint, boolean] => {
  if (p2.pos.every((v, i) => Math.abs(v - p1.pos[i]) < tol[i])) {
    const pt = ValuedPoint.intersectZero(p1, p2, fn);
    const is_zero = pt.val === 0 || (Math.sign(pt.val - p1.val) === Math.sign(p2.val - pt.val) && Math.abs(pt.val) < 1e200);
    return [pt, is_zero];
  } else {
    const mid = ValuedPoint.midpoint(p1, p2, fn);
    if (mid.val === 0) {
      return [mid, true];
    } else if (Math.sign(mid.val) === Math.sign(p1.val)) {
      return binary_search_zero(mid, p2, fn, tol);
    } else {
      return binary_search_zero(p1, mid, fn, tol);
    }
  }
};