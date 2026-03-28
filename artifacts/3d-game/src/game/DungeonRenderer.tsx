import { useEffect, useRef } from "react";
import * as THREE from "three";
import { DungeonMap, PlayerState } from "./dungeon";

interface Props {
  dungeon: DungeonMap;
  player: PlayerState;
}

const CELL_SIZE = 2;
const HALF = CELL_SIZE / 2;
const WALL_HEIGHT = 2.5;
const STEP_DURATION = 180;
const T = 0.09; // line thickness in world units
const GREEN = 0x00dd44;
const BLACK = 0x000000;

let lastPlayerKey = "";
let stepStart = 0;
let stepFromX = 0, stepFromZ = 0;
let stepToX = 0, stepToZ = 0;
let stepFromAngle = 0, stepToAngle = 0;
let isAnimating = false;

const DIR_ANGLES = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

// How far behind the cell centre the camera sits (towards where the player came from).
// This increases the distance to the front wall so ceiling/floor become visible.
const CAM_BACK = 0.48;
// Backward (opposite of facing) unit vector per direction: N=0, E=1, S=2, W=3
// N faces -Z → backward is +Z; E faces +X → backward is -X; etc.
const DIR_BACK_X = [0, -1, 0, 1];
const DIR_BACK_Z = [1,  0, -1, 0];

function isWall(dungeon: DungeonMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) return true;
  return dungeon.grid[y][x] === 1;
}

// Draw a vertical edge unless the wall continues seamlessly in the lateral direction.
// Lateral = cell beside the open cell along the face; diag = lateral cell shifted in the "ahead" direction.
// Skip only when: lateral is open corridor AND diagonal is still wall (= the wall surface continues unbroken).
function needsVert(dungeon: DungeonMap, lx: number, ly: number, dx: number, dy: number): boolean {
  return !(!isWall(dungeon, lx, ly) && isWall(dungeon, dx, dy));
}

// Build a single merged Mesh out of all axis-aligned line-box segments.
// Each segment: [x1,y1,z1, x2,y2,z2]. The two non-length dimensions get T thickness.
function buildLineMesh(
  segments: Array<[number, number, number, number, number, number]>,
  mat: THREE.MeshBasicMaterial
): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  let base = 0;

  for (const [x1, y1, z1, x2, y2, z2] of segments) {
    let xMin = Math.min(x1, x2), xMax = Math.max(x1, x2);
    let yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
    let zMin = Math.min(z1, z2), zMax = Math.max(z1, z2);
    if (xMin === xMax) { xMin -= T / 2; xMax += T / 2; }
    if (yMin === yMax) { yMin -= T / 2; yMax += T / 2; }
    if (zMin === zMax) { zMin -= T / 2; zMax += T / 2; }

    // 8 corners of the box
    positions.push(
      xMin, yMin, zMin, // 0
      xMax, yMin, zMin, // 1
      xMax, yMax, zMin, // 2
      xMin, yMax, zMin, // 3
      xMin, yMin, zMax, // 4
      xMax, yMin, zMax, // 5
      xMax, yMax, zMax, // 6
      xMin, yMax, zMax, // 7
    );
    const o = base;
    indices.push(
      o+0, o+2, o+1,  o+0, o+3, o+2, // -z face
      o+4, o+5, o+6,  o+4, o+6, o+7, // +z face
      o+0, o+1, o+5,  o+0, o+5, o+4, // -y face
      o+2, o+6, o+5,  o+2, o+5, o+1, // +x face
      o+3, o+7, o+6,  o+3, o+6, o+2, // +y face
      o+0, o+4, o+7,  o+0, o+7, o+3, // -x face
    );
    base += 8;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return new THREE.Mesh(geo, mat);
}

function buildScene(dungeon: DungeonMap): THREE.Group {
  const group = new THREE.Group();

  const faceMat = new THREE.MeshBasicMaterial({ color: BLACK });
  const lineMat = new THREE.MeshBasicMaterial({ color: GREEN });

  // --- Black occluder boxes for every wall cell ---
  const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      if (!isWall(dungeon, x, y)) continue;
      const mesh = new THREE.Mesh(wallGeo, faceMat);
      mesh.position.set(x * CELL_SIZE, WALL_HEIGHT / 2, y * CELL_SIZE);
      group.add(mesh);
    }
  }

  // --- Black floor & ceiling planes (occlude geometry below/above) ---
  const cx = ((dungeon.width - 1) / 2) * CELL_SIZE;
  const cz = ((dungeon.height - 1) / 2) * CELL_SIZE;
  const pw = dungeon.width * CELL_SIZE;
  const ph = dungeon.height * CELL_SIZE;
  const planeMat = faceMat;
  const planeGeo = new THREE.PlaneGeometry(pw, ph);
  const floor = new THREE.Mesh(planeGeo, planeMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  group.add(floor);
  const ceil = new THREE.Mesh(planeGeo.clone(), planeMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, WALL_HEIGHT, cz);
  group.add(ceil);

  // --- Green edge lines ---
  // Walk every open cell; for each of its 4 sides that borders a wall cell,
  // draw: top horizontal, bottom horizontal, and vertical edges ONLY where
  // the corridor does not continue laterally (= corner / dead end).
  const segs: Array<[number, number, number, number, number, number]> = [];

  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      if (isWall(dungeon, x, y)) continue;
      const wx = x * CELL_SIZE;
      const wz = y * CELL_SIZE;

      // North face  (wall at y-1)
      if (isWall(dungeon, x, y - 1)) {
        const fz = wz - HALF;
        segs.push([wx - HALF, WALL_HEIGHT, fz, wx + HALF, WALL_HEIGHT, fz]); // top
        segs.push([wx - HALF, 0,           fz, wx + HALF, 0,           fz]); // bottom
        // vertical at west edge: skip only when corridor continues west AND wall also continues west
        if (needsVert(dungeon, x - 1, y, x - 1, y - 1)) segs.push([wx - HALF, 0, fz, wx - HALF, WALL_HEIGHT, fz]);
        if (needsVert(dungeon, x + 1, y, x + 1, y - 1)) segs.push([wx + HALF, 0, fz, wx + HALF, WALL_HEIGHT, fz]);
      }

      // South face  (wall at y+1)
      if (isWall(dungeon, x, y + 1)) {
        const fz = wz + HALF;
        segs.push([wx - HALF, WALL_HEIGHT, fz, wx + HALF, WALL_HEIGHT, fz]);
        segs.push([wx - HALF, 0,           fz, wx + HALF, 0,           fz]);
        if (needsVert(dungeon, x - 1, y, x - 1, y + 1)) segs.push([wx - HALF, 0, fz, wx - HALF, WALL_HEIGHT, fz]);
        if (needsVert(dungeon, x + 1, y, x + 1, y + 1)) segs.push([wx + HALF, 0, fz, wx + HALF, WALL_HEIGHT, fz]);
      }

      // East face   (wall at x+1)
      if (isWall(dungeon, x + 1, y)) {
        const fx = wx + HALF;
        segs.push([fx, WALL_HEIGHT, wz - HALF, fx, WALL_HEIGHT, wz + HALF]);
        segs.push([fx, 0,           wz - HALF, fx, 0,           wz + HALF]);
        if (needsVert(dungeon, x, y - 1, x + 1, y - 1)) segs.push([fx, 0, wz - HALF, fx, WALL_HEIGHT, wz - HALF]);
        if (needsVert(dungeon, x, y + 1, x + 1, y + 1)) segs.push([fx, 0, wz + HALF, fx, WALL_HEIGHT, wz + HALF]);
      }

      // West face   (wall at x-1)
      if (isWall(dungeon, x - 1, y)) {
        const fx = wx - HALF;
        segs.push([fx, WALL_HEIGHT, wz - HALF, fx, WALL_HEIGHT, wz + HALF]);
        segs.push([fx, 0,           wz - HALF, fx, 0,           wz + HALF]);
        if (needsVert(dungeon, x, y - 1, x - 1, y - 1)) segs.push([fx, 0, wz - HALF, fx, WALL_HEIGHT, wz - HALF]);
        if (needsVert(dungeon, x, y + 1, x - 1, y + 1)) segs.push([fx, 0, wz + HALF, fx, WALL_HEIGHT, wz + HALF]);
      }
    }
  }

  group.add(buildLineMesh(segs, lineMat));
  return group;
}

export default function DungeonRenderer({ dungeon, player }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const playerRef = useRef(player);

  useEffect(() => { playerRef.current = player; }, [player]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BLACK);
    scene.fog = new THREE.Fog(BLACK, 12, 32);

    const camera = new THREE.PerspectiveCamera(88, w / h, 0.1, 100);
    scene.add(camera);

    scene.add(buildScene(dungeon));

    const sd = dungeon.startDir;
    const px = dungeon.startX * CELL_SIZE + DIR_BACK_X[sd] * CAM_BACK;
    const pz = dungeon.startY * CELL_SIZE + DIR_BACK_Z[sd] * CAM_BACK;
    camera.position.set(px, WALL_HEIGHT * 0.5, pz);
    camera.rotation.y = DIR_ANGLES[sd];
    lastPlayerKey = `${dungeon.startX},${dungeon.startY},${sd}`;
    stepFromX = px; stepFromZ = pz;
    stepToX = px; stepToZ = pz;
    stepFromAngle = DIR_ANGLES[dungeon.startDir];
    stepToAngle = DIR_ANGLES[dungeon.startDir];
    isAnimating = false;

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const p = playerRef.current;
      const key = `${p.x},${p.y},${p.dir}`;
      if (key !== lastPlayerKey) {
        const tx = p.x * CELL_SIZE + DIR_BACK_X[p.dir] * CAM_BACK;
        const tz = p.y * CELL_SIZE + DIR_BACK_Z[p.dir] * CAM_BACK;
        stepFromX = camera.position.x;
        stepFromZ = camera.position.z;
        stepToX = tx;
        stepToZ = tz;

        let fromA = camera.rotation.y % (2 * Math.PI);
        const toA = DIR_ANGLES[p.dir];
        let diff = toA - fromA;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        stepFromAngle = fromA;
        stepToAngle = fromA + diff;

        stepStart = performance.now();
        isAnimating = true;
        lastPlayerKey = key;
      }

      if (isAnimating) {
        const t = Math.min((performance.now() - stepStart) / STEP_DURATION, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        camera.position.x = stepFromX + (stepToX - stepFromX) * ease;
        camera.position.z = stepFromZ + (stepToZ - stepFromZ) * ease;
        camera.rotation.y = stepFromAngle + (stepToAngle - stepFromAngle) * ease;
        if (t >= 1) isAnimating = false;
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mount) return;
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [dungeon]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
