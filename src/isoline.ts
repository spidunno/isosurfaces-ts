import { Cell, build_tree } from "./cell";
import type { Func, Point } from "./point";
import { ValuedPoint, binary_search_zero } from "./point";

export const plot_isoline = (
  fn: Func,
  pmin: Point,
  pmax: Point,
  min_depth: number = 5,
  max_quads: number = 10000,
  tol: number[] | null = null
): Point[][] => {
  const pminArray = [...pmin];
  const pmaxArray = [...pmax];
  const tolArray = tol
    ? [...tol]
    : pmaxArray.map((v, i) => (v - pminArray[i]) / 1000);
  const quadtree = build_tree(2, fn, pminArray, pmaxArray, min_depth, max_quads, tolArray);
  const triangles = new Triangulator(quadtree, fn, tolArray).triangulate();
  return new CurveTracer(triangles, fn, tolArray).trace();
};

class Triangle {
  constructor(
    public readonly vertices: ValuedPoint[],
    public next: Triangle | null = null,
    public next_bisect_point: ValuedPoint | null = null,
    public prev: Triangle | null = null,
    public visited: boolean = false
  ) {}
}

const four_triangles = (
  a: ValuedPoint,
  b: ValuedPoint,
  c: ValuedPoint,
  d: ValuedPoint,
  center: ValuedPoint
): [Triangle, Triangle, Triangle, Triangle] => {
  return [
    new Triangle([a, b, center]),
    new Triangle([b, c, center]),
    new Triangle([c, d, center]),
    new Triangle([d, a, center]),
  ];
};

class Triangulator {
  private triangles: Triangle[] = [];
  private hanging_next: { [key: string]: Triangle } = {};
  constructor(private readonly root: Cell, private readonly fn: Func, private readonly tol: number[]) {}

  triangulate(): Triangle[] {
    this.triangulate_inside(this.root);
    return this.triangles;
  }

  private triangulate_inside(quad: Cell): void {
    if (quad.children.length) {
      quad.children.forEach((child) => {
        this.triangulate_inside(child);
      });
      this.triangulate_crossing_row(quad.children[0], quad.children[1]);
      this.triangulate_crossing_row(quad.children[2], quad.children[3]);
      this.triangulate_crossing_col(quad.children[0], quad.children[2]);
      this.triangulate_crossing_col(quad.children[1], quad.children[3]);
    }
  }

  private triangulate_crossing_row(a: Cell, b: Cell): void {
    if (a.children.length && b.children.length) {
      this.triangulate_crossing_row(a.children[1], b.children[0]);
      this.triangulate_crossing_row(a.children[3], b.children[2]);
    } else if (a.children.length) {
      this.triangulate_crossing_row(a.children[1], b);
      this.triangulate_crossing_row(a.children[3], b);
    } else if (b.children.length) {
      this.triangulate_crossing_row(a, b.children[0]);
      this.triangulate_crossing_row(a, b.children[2]);
    } else {
      const face_dual_a = this.get_face_dual(a);
      const face_dual_b = this.get_face_dual(b);
      let triangles: [Triangle, Triangle, Triangle, Triangle];
      if (a.depth < b.depth) {
        const edge_dual = this.get_edge_dual(b.vertices[2], b.vertices[0]);
        triangles = four_triangles(
          b.vertices[2],
          face_dual_b,
          b.vertices[0],
          face_dual_a,
          edge_dual
        );
      } else {
        const edge_dual = this.get_edge_dual(a.vertices[3], a.vertices[1]);
        triangles = four_triangles(
          a.vertices[3],
          face_dual_b,
          a.vertices[1],
          face_dual_a,
          edge_dual
        );
      }
      this.add_four_triangles(triangles);
    }
  }

  private triangulate_crossing_col(a: Cell, b: Cell): void {
    if (a.children.length && b.children.length) {
      this.triangulate_crossing_col(a.children[2], b.children[0]);
      this.triangulate_crossing_col(a.children[3], b.children[1]);
    } else if (a.children.length) {
      this.triangulate_crossing_col(a.children[2], b);
      this.triangulate_crossing_col(a.children[3], b);
    } else if (b.children.length) {
      this.triangulate_crossing_col(a, b.children[0]);
      this.triangulate_crossing_col(a, b.children[1]);
    } else {
      const face_dual_a = this.get_face_dual(a);
      const face_dual_b = this.get_face_dual(b);
      let triangles: [Triangle, Triangle, Triangle, Triangle];
      if (a.depth < b.depth) {
        const edge_dual = this.get_edge_dual(b.vertices[0], b.vertices[1]);
        triangles = four_triangles(
          b.vertices[0],
          face_dual_b,
          b.vertices[1],
          face_dual_a,
          edge_dual
        );
      } else {
        const edge_dual = this.get_edge_dual(a.vertices[2], a.vertices[3]);
        triangles = four_triangles(
          a.vertices[2],
          face_dual_b,
          a.vertices[3],
          face_dual_a,
          edge_dual
        );
      }
      this.add_four_triangles(triangles);
    }
  }

  private add_four_triangles(triangles: [Triangle, Triangle, Triangle, Triangle]): void {
    for (let i = 0; i < 4; i++) {
      this.next_sandwich_triangles(triangles[i], triangles[(i + 1) % 4], triangles[(i + 2) % 4]);
    }
    this.triangles.push(...triangles);
  }

  private set_next(tri1: Triangle, tri2: Triangle, vpos: ValuedPoint, vneg: ValuedPoint): void {
    if (!(vpos.val > 0 && vneg.val <= 0)) {
      return;
    }
    const [intersection, is_zero] = binary_search_zero(vpos, vneg, this.fn, this.tol);
    if (!is_zero) {
      return;
    }
    tri1.next_bisect_point = intersection;
    tri1.next = tri2;
    tri2.prev = tri1;
  }

  private next_sandwich_triangles(a: Triangle, b: Triangle, c: Triangle): void {
    const center = b.vertices[2];
    const x = b.vertices[0];
    const y = b.vertices[1];

    const id = (x.pos.map((v, i) => v + y.pos[i]) as Point).join(",");

    if (center.val > 0 && y.val <= 0) {
      this.set_next(b, c, center, y);
    }
    if (x.val > 0 && center.val <= 0) {
      this.set_next(b, a, x, center);
    }
    if (y.val > 0 && x.val <= 0) {
      if (id in this.hanging_next) {
        this.set_next(b, this.hanging_next[id], y, x);
        delete this.hanging_next[id];
      } else {
        this.hanging_next[id] = b;
      }
    } else if (y.val <= 0 && x.val > 0) {
      if (id in this.hanging_next) {
        this.set_next(this.hanging_next[id], b, x, y);
        delete this.hanging_next[id];
      } else {
        this.hanging_next[id] = b;
      }
    }
  }

  private get_edge_dual(p1: ValuedPoint, p2: ValuedPoint): ValuedPoint {
    if (Math.sign(p1.val) !== Math.sign(p2.val)) {
      return ValuedPoint.midpoint(p1, p2, this.fn);
    }
    const dt = 0.01;
    const df1 = this.fn(
      (p1.pos.map((v, i) => (1 - dt) * v + dt * p2.pos[i]) as Point)
    );
    const df2 = this.fn(
      (p1.pos.map((v, i) => dt * v + (1 - dt) * p2.pos[i]) as Point)
    );
    if (Math.sign(df1) === Math.sign(df2)) {
      return ValuedPoint.midpoint(p1, p2, this.fn);
    } else {
      const v1 = new ValuedPoint(p1.pos, df1);
      const v2 = new ValuedPoint(p2.pos, df2);
      return ValuedPoint.intersectZero(v1, v2, this.fn);
    }
  }

  private get_face_dual(quad: Cell): ValuedPoint {
    return ValuedPoint.midpoint(quad.vertices[0], quad.vertices[quad.vertices.length - 1], this.fn);
  }
}

class CurveTracer {
  private active_curve: ValuedPoint[] = [];
  constructor(private readonly triangles: Triangle[], private readonly fn: Func, private readonly tol: number[]) {}

  trace(): Point[][] {
    const curves: ValuedPoint[][] = [];
    this.triangles.forEach((triangle) => {
      if (!triangle.visited && triangle.next !== null) {
        this.active_curve = [];
        this.march_triangle(triangle);
        curves.push(this.active_curve);
      }
    });
    return curves.map((curve) => curve.map((v) => v.pos));
  }

  private march_triangle(initial_triangle: Triangle): void {
    let triangle: Triangle | null = initial_triangle;
    let start_triangle = triangle;
    let closed_loop = false;
    while (triangle.prev !== null) {
      triangle = triangle.prev;
      if (triangle === start_triangle) {
        closed_loop = true;
        break;
      }
    }
    while (triangle !== null && !triangle.visited) {
      if (triangle.next_bisect_point !== null) {
        this.active_curve.push(triangle.next_bisect_point);
      }
      triangle.visited = true;
      triangle = triangle.next;
    }
    if (closed_loop) {
      this.active_curve.push(this.active_curve[0]);
    }
  }
}