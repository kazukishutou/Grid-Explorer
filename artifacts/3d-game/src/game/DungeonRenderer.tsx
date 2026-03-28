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
const LINE_PX = 1.5;
const LINE_COLOR = "#00dd44";
const FOG_NEAR = 10;
const FOG_FAR = 28;
const BLACK = 0x000000;

const DIR_ANGLES = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

let lastPlayerKey = "";
let stepStart = 0;
let stepFromX = 0, stepFromZ = 0;
let stepToX = 0, stepToZ = 0;
let stepFromAngle = 0, stepToAngle = 0;
let isAnimating = false;

function isWall(dungeon: DungeonMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) return true;
  return dungeon.grid[y][x] === 1;
}

type Seg = [number, number, number, number, number, number]; // x1 y1 z1 x2 y2 z2

function computeCellSegments(dungeon: DungeonMap): Map<string, Seg[]> {
  const result = new Map<string, Seg[]>();
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      if (isWall(dungeon, x, y)) continue;
      const segs: Seg[] = [];
      const wx = x * CELL_SIZE;
      const wz = y * CELL_SIZE;

      if (isWall(dungeon, x, y - 1)) {
        const fz = wz - HALF;
        segs.push([wx - HALF, WALL_HEIGHT, fz, wx + HALF, WALL_HEIGHT, fz]);
        segs.push([wx - HALF, 0, fz, wx + HALF, 0, fz]);
        if (isWall(dungeon, x - 1, y)) segs.push([wx - HALF, 0, fz, wx - HALF, WALL_HEIGHT, fz]);
        if (isWall(dungeon, x + 1, y)) segs.push([wx + HALF, 0, fz, wx + HALF, WALL_HEIGHT, fz]);
      }
      if (isWall(dungeon, x, y + 1)) {
        const fz = wz + HALF;
        segs.push([wx - HALF, WALL_HEIGHT, fz, wx + HALF, WALL_HEIGHT, fz]);
        segs.push([wx - HALF, 0, fz, wx + HALF, 0, fz]);
        if (isWall(dungeon, x - 1, y)) segs.push([wx - HALF, 0, fz, wx - HALF, WALL_HEIGHT, fz]);
        if (isWall(dungeon, x + 1, y)) segs.push([wx + HALF, 0, fz, wx + HALF, WALL_HEIGHT, fz]);
      }
      if (isWall(dungeon, x + 1, y)) {
        const fx = wx + HALF;
        segs.push([fx, WALL_HEIGHT, wz - HALF, fx, WALL_HEIGHT, wz + HALF]);
        segs.push([fx, 0, wz - HALF, fx, 0, wz + HALF]);
        if (isWall(dungeon, x, y - 1)) segs.push([fx, 0, wz - HALF, fx, WALL_HEIGHT, wz - HALF]);
        if (isWall(dungeon, x, y + 1)) segs.push([fx, 0, wz + HALF, fx, WALL_HEIGHT, wz + HALF]);
      }
      if (isWall(dungeon, x - 1, y)) {
        const fx = wx - HALF;
        segs.push([fx, WALL_HEIGHT, wz - HALF, fx, WALL_HEIGHT, wz + HALF]);
        segs.push([fx, 0, wz - HALF, fx, 0, wz + HALF]);
        if (isWall(dungeon, x, y - 1)) segs.push([fx, 0, wz - HALF, fx, WALL_HEIGHT, wz - HALF]);
        if (isWall(dungeon, x, y + 1)) segs.push([fx, 0, wz + HALF, fx, WALL_HEIGHT, wz + HALF]);
      }
      if (segs.length) result.set(`${x},${y}`, segs);
    }
  }
  return result;
}

// Amanatides & Woo DDA — origin and target are world-space (x, z) floats.
// Returns true if there is an unobstructed grid path from origin to the cell
// containing (tx, tz).  The starting cell is never checked as a wall.
function worldLOS(
  dungeon: DungeonMap,
  ox: number, oz: number,   // camera world x, z
  tx: number, tz: number,   // target world x, z
): boolean {
  const dx = tx - ox;
  const dz = tz - oz;
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return true;

  // Start / target grid cells
  let gx = Math.floor(ox / CELL_SIZE);
  let gz = Math.floor(oz / CELL_SIZE);
  const tgx = Math.floor(tx / CELL_SIZE);
  const tgz = Math.floor(tz / CELL_SIZE);

  const stepX = dx >= 0 ? 1 : -1;
  const stepZ = dz >= 0 ? 1 : -1;

  // t-values for first grid boundary crossing (0..1 along the ray)
  const invDx = dx !== 0 ? 1 / dx : Infinity;
  const invDz = dz !== 0 ? 1 / dz : Infinity;

  let tMaxX = dx > 0
    ? ((gx + 1) * CELL_SIZE - ox) * invDx
    : dx < 0 ? (gx * CELL_SIZE - ox) * invDx : Infinity;
  let tMaxZ = dz > 0
    ? ((gz + 1) * CELL_SIZE - oz) * invDz
    : dz < 0 ? (gz * CELL_SIZE - oz) * invDz : Infinity;

  const tDeltaX = dx !== 0 ? Math.abs(CELL_SIZE * invDx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(CELL_SIZE * invDz) : Infinity;

  // Skip the starting cell (camera is inside it)
  if (tMaxX < tMaxZ) { tMaxX += tDeltaX; gx += stepX; }
  else               { tMaxZ += tDeltaZ; gz += stepZ; }

  for (let i = 0; i < 60; i++) {
    if (gx === tgx && gz === tgz) return true;
    if (gx < 0 || gz < 0 || gx >= dungeon.width || gz >= dungeon.height) return false;
    if (dungeon.grid[gz][gx] === 1) return false;

    if (tMaxX < tMaxZ) { tMaxX += tDeltaX; gx += stepX; }
    else               { tMaxZ += tDeltaZ; gz += stepZ; }
  }
  return true;
}

// Build Three.js scene with ONLY black occluder meshes (no lines).
function buildOccluderScene(dungeon: DungeonMap): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: BLACK });
  const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);

  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      if (!isWall(dungeon, x, y)) continue;
      const m = new THREE.Mesh(wallGeo, mat);
      m.position.set(x * CELL_SIZE, WALL_HEIGHT / 2, y * CELL_SIZE);
      group.add(m);
    }
  }
  const cxW = ((dungeon.width - 1) / 2) * CELL_SIZE;
  const czW = ((dungeon.height - 1) / 2) * CELL_SIZE;
  const pw = dungeon.width * CELL_SIZE;
  const ph = dungeon.height * CELL_SIZE;
  const pg = new THREE.PlaneGeometry(pw, ph);
  const floor = new THREE.Mesh(pg, mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cxW, 0, czW);
  group.add(floor);
  const ceil = new THREE.Mesh(pg.clone(), mat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cxW, WALL_HEIGHT, czW);
  group.add(ceil);
  return group;
}

export default function DungeonRenderer({ dungeon, player }: Props) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const playerRef  = useRef(player);

  useEffect(() => { playerRef.current = player; }, [player]);

  useEffect(() => {
    const mount   = mountRef.current;
    const overlay = overlayRef.current;
    if (!mount || !overlay) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    // ── WebGL canvas for black occluder meshes ──
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.insertBefore(renderer.domElement, overlay); // overlay canvas stays on top
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.left = "0";

    // ── 2D overlay canvas ──
    overlay.width  = w;
    overlay.height = h;

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BLACK);
    scene.fog = new THREE.Fog(BLACK, FOG_NEAR, FOG_FAR);

    const camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 100);
    scene.add(camera);
    scene.add(buildOccluderScene(dungeon));

    const cellSegs = computeCellSegments(dungeon);

    const px0 = dungeon.startX * CELL_SIZE;
    const pz0 = dungeon.startY * CELL_SIZE;
    camera.position.set(px0, WALL_HEIGHT * 0.45, pz0);
    camera.rotation.y = DIR_ANGLES[dungeon.startDir];
    lastPlayerKey = `${dungeon.startX},${dungeon.startY},${dungeon.startDir}`;
    stepFromX = px0; stepFromZ = pz0;
    stepToX   = px0; stepToZ   = pz0;
    stepFromAngle = DIR_ANGLES[dungeon.startDir];
    stepToAngle   = DIR_ANGLES[dungeon.startDir];
    isAnimating   = false;

    const tmp1 = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      // ── Step animation ──
      const p = playerRef.current;
      const key = `${p.x},${p.y},${p.dir}`;
      if (key !== lastPlayerKey) {
        const tx = p.x * CELL_SIZE;
        const tz = p.y * CELL_SIZE;
        stepFromX = camera.position.x;
        stepFromZ = camera.position.z;
        stepToX = tx; stepToZ = tz;
        let fromA = camera.rotation.y % (2 * Math.PI);
        const toA = DIR_ANGLES[p.dir];
        let diff = toA - fromA;
        if (diff >  Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        stepFromAngle = fromA;
        stepToAngle   = fromA + diff;
        stepStart   = performance.now();
        isAnimating = true;
        lastPlayerKey = key;
      }
      if (isAnimating) {
        const t = Math.min((performance.now() - stepStart) / STEP_DURATION, 1);
        const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        camera.position.x = stepFromX + (stepToX - stepFromX) * e;
        camera.position.z = stepFromZ + (stepToZ - stepFromZ) * e;
        camera.rotation.y = stepFromAngle + (stepToAngle - stepFromAngle) * e;
        if (t >= 1) isAnimating = false;
      }

      // ── 3D render: black occluder meshes ──
      renderer.render(scene, camera);
      camera.updateWorldMatrix(true, false);

      // ── 2D overlay: project & draw constant-width lines ──
      const ctx = overlay.getContext("2d")!;
      const ow = overlay.width;
      const oh = overlay.height;
      ctx.clearRect(0, 0, ow, oh);

      const camWX = camera.position.x;
      const camWZ = camera.position.z;

      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth   = LINE_PX;
      ctx.lineCap     = "round";

      for (const [cellKey, segs] of cellSegs) {
        const comma = cellKey.indexOf(",");
        const cellX = +cellKey.slice(0, comma);
        const cellY = +cellKey.slice(comma + 1);

        // World position of cell center
        const cellWX = cellX * CELL_SIZE;
        const cellWZ = cellY * CELL_SIZE;

        // Distance cull (fog)
        const ddx = cellWX - camWX;
        const ddz = cellWZ - camWZ;
        const cellDist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (cellDist > FOG_FAR) continue;

        // LOS using world-space Amanatides & Woo DDA
        // Target: center of cell shifted slightly inward to avoid boundary issues
        if (!worldLOS(dungeon, camWX, camWZ, cellWX + 0.01, cellWZ + 0.01)) continue;

        // Fog alpha
        const alpha = cellDist <= FOG_NEAR
          ? 1.0
          : 1.0 - (cellDist - FOG_NEAR) / (FOG_FAR - FOG_NEAR);
        ctx.globalAlpha = Math.max(0, alpha);

        for (const [x1, y1, z1, x2, y2, z2] of segs) {
          // Project endpoint 1
          tmp1.set(x1, y1, z1).project(camera);
          const z1ndc = tmp1.z;
          const sx1 = (tmp1.x + 1) * 0.5 * ow;
          const sy1 = (1 - tmp1.y) * 0.5 * oh;

          // Project endpoint 2
          tmp2.set(x2, y2, z2).project(camera);
          const z2ndc = tmp2.z;
          const sx2 = (tmp2.x + 1) * 0.5 * ow;
          const sy2 = (1 - tmp2.y) * 0.5 * oh;

          // Skip only when BOTH endpoints are behind the near plane
          if (z1ndc >= 1 && z2ndc >= 1) continue;

          // Rough off-screen cull (allow generous margin for clipped segments)
          const margin = ow * 2;
          if (Math.max(sx1, sx2) < -margin) continue;
          if (Math.min(sx1, sx2) > ow + margin) continue;
          if (Math.max(sy1, sy2) < -margin) continue;
          if (Math.min(sy1, sy2) > oh + margin) continue;

          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
    };
    animate();

    const handleResize = () => {
      if (!mount || !overlay) return;
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      overlay.width  = nw;
      overlay.height = nh;
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
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <canvas
        ref={overlayRef}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
