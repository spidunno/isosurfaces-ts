import { Cell, MinimalCell, build_tree } from "./cell";
import type { Func, Point } from './point';
import { ValuedPoint, binary_search_zero } from "./point";

export const plot_isosurface = (
  fn: Func,
  pmin: Point,
  pmax: Point,
  min_depth: number = 5,
  max_cells: number = 10000,
  tol: number[] | null = null
): [ValuedPoint[][], Point[][]] => {
  const pminArray = [...pmin];
  const pmaxArray = [...pmax];
  const tolArray = tol
    ? [...tol]
    : pmaxArray.map((v, i) => (v - pminArray[i]) / 1000);
  const octtree = build_tree(3, fn, pminArray, pmaxArray, min_depth, max_cells, tolArray);
  const simplices = Array.from(new SimplexGenerator(octtree, fn).get_simplices());
  const faces: Point[][] = [];
  simplices.forEach((simplex) => {
    const face_list = march_simplex(simplex, fn, tolArray);
    if (face_list !== null) {
      faces.push(...face_list);
    }
  });
  return [simplices, faces];
};

const TETRAHEDRON_TABLE: { [key: number]: [number, number][] } = {
  0b0000: [],
  0b0001: [[0, 3], [1, 3], [2, 3]],
  0b0010: [[0, 2], [1, 2], [3, 2]],
  0b0100: [[0, 1], [2, 1], [3, 1]],
  0b1000: [[1, 0], [2, 0], [3, 0]],
  0b0011: [[0, 2], [2, 1], [1, 3], [3, 0]],
  0b0110: [[0, 1], [1, 3], [3, 2], [2, 0]],
  0b0101: [[0, 1], [1, 2], [2, 3], [3, 0]],
};

const march_indices = (simplex: ValuedPoint[]): [number, number][] => {
  let id = 0;
  simplex.forEach((p) => {
    id = 2 * id + (p.val > 0 ? 1 : 0);
  });
  if (id in TETRAHEDRON_TABLE) {
    return TETRAHEDRON_TABLE[id];
  } else {
    return TETRAHEDRON_TABLE[0b1111 ^ id];
  }
};

const march_simplex = (
  simplex: ValuedPoint[],
  fn: Func,
  tol: number[]
): Point[][] | null => {
  const indices = march_indices(simplex);
  if (indices.length) {
    const points: Point[] = [];
    indices.forEach(([i, j]) => {
      const [intersection, is_zero] = binary_search_zero(simplex[i], simplex[j], fn, tol);
      if (!is_zero) {
        throw new Error("Intersection not at zero");
      }
      points.push(intersection.pos);
    });
    if (points.length === 3) {
      return [points];
    } else {
      return [
        [points[0], points[1], points[3]],
        [points[1], points[2], points[3]],
      ];
    }
  } else {
    return null;
  }
};

class SimplexGenerator {
  constructor(private readonly root: Cell, private readonly fn: Func) {}

  *get_simplices(): Generator<ValuedPoint[]> {
    yield* this.get_simplices_within(this.root);
  }

  *get_simplices_within(oct: Cell): Generator<ValuedPoint[]> {
    if (oct.children.length) {
      for (const child of oct.children) {
        yield* this.get_simplices_within(child);
      }
    } else {
      for (let axis = 0; axis < 3; axis++) {
        for (let dir = 0; dir < 2; dir++) {
          for (const leaf of oct.walk_leaves_in_direction(axis, dir)) {
            if (leaf === null) {
              yield* this.get_simplices_between_face(oct, oct.get_subcell(axis, dir));
            } else {
              yield* this.get_simplices_between(oct, leaf, axis, dir);
            }
          }
        }
      }
    }
  }

  *get_simplices_between(a: Cell, b: Cell, axis: number, dir: number): Generator<ValuedPoint[]> {
    if (a.depth > b.depth) {
      [a, b] = [b, a];
      dir = 1 - dir;
    }
    const face = b.get_subcell(axis, 1 - dir);
    for (const volume of [a, b]) {
      yield* this.get_simplices_between_face(volume, face);
    }
  }

  *get_simplices_between_face(volume: Cell, face: MinimalCell): Generator<ValuedPoint[]> {
    for (let i = 0; i < 4; i++) {
      const edge = face.get_subcell(i % 2, Math.floor(i / 2));
      for (const v of edge.vertices) {
        yield [
          volume.get_dual(this.fn),
          face.get_dual(this.fn),
          edge.get_dual(this.fn),
          v,
        ];
      }
    }
  }
}