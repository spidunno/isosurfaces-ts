import type { Func, Point } from './point';
import { ValuedPoint } from "./point";

const vertices_from_extremes = (
  dim: number,
  pmin: Point,
  pmax: Point,
  fn: Func
): ValuedPoint[] => {
  const w = pmax.map((v, i) => v - pmin[i]);
  return Array.from({ length: 1 << dim }, (_, i) => {
    const pos = Array.from({ length: dim }, (_, d) =>
      pmin[d] + ((i >> d) & 1) * w[d]
    );
    return new ValuedPoint(pos).calc(fn);
  });
};

export class MinimalCell {
  constructor(public readonly dim: number, public readonly vertices: ValuedPoint[]) {}

  get_subcell(axis: number, dir: number): MinimalCell {
    const m = 1 << axis;
    return new MinimalCell(
      this.dim - 1,
      this.vertices.filter((_, i) => (i & (m > 0 ? 1 : 0)) === dir)
    );
  }

  get_dual(fn: Func): ValuedPoint {
    return ValuedPoint.midpoint(this.vertices[0], this.vertices[this.vertices.length - 1], fn);
  }
}

export class Cell extends MinimalCell {
  constructor(
    dim: number,
    vertices: ValuedPoint[],
    public readonly depth: number,
    public readonly children: Cell[] = [],
    public readonly parent: Cell | null = null,
    public readonly child_direction: number = 0
  ) {
    super(dim, vertices);
  }

  compute_children(fn: Func): void {
    if (this.children.length) {
      return;
    }
    this.vertices.forEach((vertex, i) => {
      const pmin = (this.vertices[0].pos.map((v, i) => v + vertex.pos[i]) as Point).map(
        (v) => v / 2
      );
      const pmax = (this.vertices[this.vertices.length - 1].pos.map((v, i) => v + vertex.pos[i]) as Point).map(
        (v) => v / 2
      );
      const vertices = vertices_from_extremes(this.dim, pmin, pmax, fn);
      const new_quad = new Cell(this.dim, vertices, this.depth + 1, [], this, i);
      this.children.push(new_quad);
    });
  }

  *get_leaves_in_direction(axis: number, dir: number): Generator<Cell> {
    if (this.children.length) {
      const m = 1 << axis;
      for (let i = 0; i < 1 << this.dim; i++) {
        if ((i & (m > 0 ? 1 : 0)) === dir) {
          yield* this.children[i].get_leaves_in_direction(axis, dir);
        }
      }
    } else {
      yield this;
    }
  }

  walk_in_direction(axis: number, dir: number): Cell | null {
    const m = 1 << axis;
    if ((this.child_direction & (m > 0 ? 1 : 0)) === dir) {
      if (this.parent === null) {
        return null;
      }
      const parent_walked = this.parent.walk_in_direction(axis, dir);
      if (parent_walked && parent_walked.children.length) {
        return parent_walked.children[this.child_direction ^ m];
      } else {
        return parent_walked;
      }
    } else {
      if (this.parent === null) {
        return null;
      }
      return this.parent.children[this.child_direction ^ m];
    }
  }

  *walk_leaves_in_direction(axis: number, dir: number): Generator<Cell | null> {
    const walked = this.walk_in_direction(axis, dir);
    if (walked !== null) {
      yield* walked.get_leaves_in_direction(axis, dir);
    } else {
      yield null;
    }
  }
}

const should_descend_deep_cell = (cell: Cell, tol: number[]): boolean => {
  if (cell.vertices[cell.vertices.length - 1].pos.every((v, i) => v - cell.vertices[0].pos[i] < 10 * tol[i])) {
    return false;
  } else if (cell.vertices.every((v) => Number.isNaN(v.val))) {
    return false;
  } else if (cell.vertices.some((v) => Number.isNaN(v.val))) {
    return true;
  } else {
    return cell.vertices.slice(1).some(
      (v) => Math.sign(v.val) !== Math.sign(cell.vertices[0].val)
    );
  }
};

export const build_tree = (
  dim: number,
  fn: Func,
  pmin: Point,
  pmax: Point,
  min_depth: number,
  max_cells: number,
  tol: number[]
): Cell => {
  const branching_factor = 1 << dim;
  max_cells = Math.max(branching_factor ** min_depth, max_cells);
  const vertices = vertices_from_extremes(dim, pmin, pmax, fn);
  let root = new Cell(dim, vertices, 0, [], null, 0);
  let current_quad = root;
  const quad_queue = [root];
  let leaf_count = 1;

  while (quad_queue.length > 0 && leaf_count < max_cells) {
    current_quad = quad_queue.shift() as Cell;
    if (current_quad.depth < min_depth || should_descend_deep_cell(current_quad, tol)) {
      current_quad.compute_children(fn);
      quad_queue.push(...current_quad.children);
      leaf_count += branching_factor - 1;
    }
  }
  return root;
};