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
const LINE_PX = 1.5;      // constant screen-space line width
const LINE_COLOR = "#00dd44";
const FOG_NEAR = 10;
const FOG_FAR = 30;
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

// --- Segment computation (same visibility rules as before) ---
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
        segs.push([wx - HALF, 0,           fz, wx + HALF, 0,           fz]);
        if (isWall(dungeon, x - 1, y)) segs.push([wx - HALF, 0, fz, wx - HALF, WALL_HEIGHT, fz]);
        if (isWall(dungeon, x + 1, y)) segs.push([wx + HALF, 0, fz, wx + HALF, WALL_HEIGHT, fz]);
      }
      if (isWall(dungeon, x, y + 1)) {
        const fz = wz + HALF;
        segs.push([wx - HALF, WALL_HEIGHT, fz, wx + HALF, WALL_HEIGHT, fz]);
        segs.push([wx - HALF, 0,           fz, wx + HALF, 0,           fz]);
        if (isWall(dungeon, x - 1, y)) segs.push([wx - HALF, 0, fz, wx - HALF, WALL_HEIGHT, fz]);
        if (isWall(dungeon, x + 1, y)) segs.push([wx + HALF, 0, fz, wx + HALF, WALL_HEIGHT, fz]);
      }
      if (isWall(dungeon, x + 1, y)) {
        const fx = wx + HALF;
        segs.push([fx, WALL_HEIGHT, wz - HALF, fx, WALL_HEIGHT, wz + HALF]);
        segs.push([fx, 0,           wz - HALF, fx, 0,           wz + HALF]);
        if (isWall(dungeon, x, y - 1)) segs.push([fx, 0, wz - HALF, fx, WALL_HEIGHT, wz - HALF]);
        if (isWall(dungeon, x, y + 1)) segs.push([fx, 0, wz + HALF, fx, WALL_HEIGHT, wz + HALF]);
      }
      if (isWall(dungeon, x - 1, y)) {
        const fx = wx - HALF;
        segs.push([fx, WALL_HEIGHT, wz - HALF, fx, WALL_HEIGHT, wz + HALF]);
        segs.push([fx, 0,           wz - HALF, fx, 0,           wz + HALF]);
        if (isWall(dungeon, x, y - 1)) segs.push([fx, 0, wz - HALF, fx, WALL_HEIGHT, wz - HALF]);
        if (isWall(dungeon, x, y + 1)) segs.push([fx, 0, wz + HALF, fx, WALL_HEIGHT, wz + HALF]);
      }
      if (segs.length) result.set(`${x},${y}`, segs);
    }
  }
  return result;
}

// Grid-based line-of-sight: samples along the straight line in grid space
function hasLOS(
  dungeon: DungeonMap,
  px: number, py: number,
  cx: number, cy: number
): boolean {
  if (px === cx && py === cy) return true;
  const dx = cx - px;
  const dy = cy - py;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 4 + 2;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const gx = Math.round(px + dx * t);
    const gy = Math.round(py + dy * t);
    if (gx === cx && gy === cy) return true;
    if (isWall(dungeon, gx, gy)) return false;
  }
  return true;
}

// Build Three.js scene with ONLY black occluder meshes (no lines)
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

  const cx = ((dungeon.width - 1) / 2) * CELL_SIZE;
  const cz = ((dungeon.height - 1) / 2) * CELL_SIZE;
  const pw = dungeon.width * CELL_SIZE;
  const ph = dungeon.height * CELL_SIZE;
  const planeGeo = new THREE.PlaneGeometry(pw, ph);

  const floor = new THREE.Mesh(planeGeo, mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  group.add(floor);

  const ceil = new THREE.Mesh(planeGeo.clone(), mat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, WALL_HEIGHT, cz);
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

    // ── Three.js WebGL canvas (occluder layer) ──
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    // Insert BEFORE overlay so overlay canvas sits on top in the stacking order
    mount.insertBefore(renderer.domElement, overlay);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.left = "0";

    // ── 2D overlay canvas ──
    overlay.width  = w;
    overlay.height = h;

    // ── Three.js scene ──
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

    const tmp = new THREE.Vector3();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      // ── Update camera (step animation) ──
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

      // ── 3D render: black wall occluders ──
      renderer.render(scene, camera);
      camera.updateWorldMatrix(true, false); // ensure matrixWorldInverse is fresh

      // ── 2D overlay: project lines and draw at constant width ──
      const ctx = overlay.getContext("2d")!;
      const ow = overlay.width;
      const oh = overlay.height;
      ctx.clearRect(0, 0, ow, oh);

      const camGX = Math.round(camera.position.x / CELL_SIZE);
      const camGZ = Math.round(camera.position.z / CELL_SIZE);

      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth   = LINE_PX;
      ctx.lineCap     = "round";

      for (const [cellKey, segs] of cellSegs) {
        const comma = cellKey.indexOf(",");
        const cellX = +cellKey.slice(0, comma);
        const cellY = +cellKey.slice(comma + 1);

        // Distance cull
        const ddx = cellX - camGX;
        const ddz = cellY - camGZ;
        const cellDist = Math.sqrt(ddx * ddx + ddz * ddz) * CELL_SIZE;
        if (cellDist > FOG_FAR) continue;

        // LOS cull
        if (!hasLOS(dungeon, camGX, camGZ, cellX, cellY)) continue;

        // Fog opacity
        const alpha = cellDist <= FOG_NEAR
          ? 1.0
          : 1.0 - (cellDist - FOG_NEAR) / (FOG_FAR - FOG_NEAR);
        ctx.globalAlpha = Math.max(0, alpha);

        for (const [x1, y1, z1, x2, y2, z2] of segs) {
          // Project endpoint 1
          tmp.set(x1, y1, z1).project(camera);
          if (tmp.z >= 1) continue; // behind near plane
          const sx1 = (tmp.x + 1) * 0.5 * ow;
          const sy1 = (1 - tmp.y) * 0.5 * oh;

          // Project endpoint 2
          tmp.set(x2, y2, z2).project(camera);
          if (tmp.z >= 1) continue;
          const sx2 = (tmp.x + 1) * 0.5 * ow;
          const sy2 = (1 - tmp.y) * 0.5 * oh;

          // Rough off-screen cull
          const margin = ow;
          if (sx1 < -margin && sx2 < -margin) continue;
          if (sx1 > ow + margin && sx2 > ow + margin) continue;
          if (sy1 < -oh && sy2 < -oh) continue;
          if (sy1 > oh * 2 && sy2 > oh * 2) continue;

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
      {/* overlay is inserted AFTER the WebGL canvas in the DOM via insertBefore in useEffect */}
      <canvas
        ref={overlayRef}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
