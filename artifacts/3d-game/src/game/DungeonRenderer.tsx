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
const BLACK = 0x000000;
const CAM_BACK = 0.48;
const DIR_ANGLES = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const DIR_BACK_X = [0, -1, 0, 1];
const DIR_BACK_Z = [1,  0, -1, 0];

// Depth render target resolution (smaller = faster readback)
const DEPTH_SIZE = 256;
// NDC z tolerance: positive = allow surface to be this much "behind" stored depth.
// Must be large enough to pass when the segment IS the visible surface,
// and small enough to block segments truly behind another wall.
const DEPTH_EPS = 0.025;

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

function needsVert(dungeon: DungeonMap, lx: number, ly: number, dx: number, dy: number): boolean {
  return !(!isWall(dungeon, lx, ly) && isWall(dungeon, dx, dy));
}

// Depth-encoding shader: packs NDC z [-1,1] into RG channels (16-bit precision)
const DEPTH_VERT = `
  varying float vNDCz;
  void main() {
    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = pos;
    vNDCz = pos.z / pos.w;
  }
`;
const DEPTH_FRAG = `
  varying float vNDCz;
  void main() {
    float d = clamp(vNDCz * 0.5 + 0.5, 0.0, 1.0);
    float hi = floor(d * 255.0) / 255.0;
    float lo = fract(d * 255.0);
    gl_FragColor = vec4(hi, lo, 0.0, 1.0);
  }
`;

// Pre-compute all 3D line segment endpoints as a flat Float32Array [x1,y1,z1, x2,y2,z2, ...]
function buildSegments(dungeon: DungeonMap): Float32Array {
  const list: number[] = [];
  const seg = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) =>
    list.push(x1, y1, z1, x2, y2, z2);

  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      if (isWall(dungeon, x, y)) continue;
      const wx = x * CELL_SIZE, wz = y * CELL_SIZE;

      if (isWall(dungeon, x, y - 1)) {
        const fz = wz - HALF;
        seg(wx - HALF, WALL_HEIGHT, fz, wx + HALF, WALL_HEIGHT, fz);
        seg(wx - HALF, 0, fz, wx + HALF, 0, fz);
        if (needsVert(dungeon, x - 1, y, x - 1, y - 1)) seg(wx - HALF, 0, fz, wx - HALF, WALL_HEIGHT, fz);
        if (needsVert(dungeon, x + 1, y, x + 1, y - 1)) seg(wx + HALF, 0, fz, wx + HALF, WALL_HEIGHT, fz);
      }
      if (isWall(dungeon, x, y + 1)) {
        const fz = wz + HALF;
        seg(wx - HALF, WALL_HEIGHT, fz, wx + HALF, WALL_HEIGHT, fz);
        seg(wx - HALF, 0, fz, wx + HALF, 0, fz);
        if (needsVert(dungeon, x - 1, y, x - 1, y + 1)) seg(wx - HALF, 0, fz, wx - HALF, WALL_HEIGHT, fz);
        if (needsVert(dungeon, x + 1, y, x + 1, y + 1)) seg(wx + HALF, 0, fz, wx + HALF, WALL_HEIGHT, fz);
      }
      if (isWall(dungeon, x + 1, y)) {
        const fx = wx + HALF;
        seg(fx, WALL_HEIGHT, wz - HALF, fx, WALL_HEIGHT, wz + HALF);
        seg(fx, 0, wz - HALF, fx, 0, wz + HALF);
        if (needsVert(dungeon, x, y - 1, x + 1, y - 1)) seg(fx, 0, wz - HALF, fx, WALL_HEIGHT, wz - HALF);
        if (needsVert(dungeon, x, y + 1, x + 1, y + 1)) seg(fx, 0, wz + HALF, fx, WALL_HEIGHT, wz + HALF);
      }
      if (isWall(dungeon, x - 1, y)) {
        const fx = wx - HALF;
        seg(fx, WALL_HEIGHT, wz - HALF, fx, WALL_HEIGHT, wz + HALF);
        seg(fx, 0, wz - HALF, fx, 0, wz + HALF);
        if (needsVert(dungeon, x, y - 1, x - 1, y - 1)) seg(fx, 0, wz - HALF, fx, WALL_HEIGHT, wz - HALF);
        if (needsVert(dungeon, x, y + 1, x - 1, y + 1)) seg(fx, 0, wz + HALF, fx, WALL_HEIGHT, wz + HALF);
      }
    }
  }
  return new Float32Array(list);
}

// Black occluder geometry only — no green line meshes
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
  const pg = new THREE.PlaneGeometry(dungeon.width * CELL_SIZE, dungeon.height * CELL_SIZE);
  const floor = new THREE.Mesh(pg, mat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, cz); group.add(floor);
  const ceil = new THREE.Mesh(pg.clone(), mat);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, WALL_HEIGHT, cz); group.add(ceil);
  return group;
}

export default function DungeonRenderer({ dungeon, player }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const playerRef = useRef(player);

  useEffect(() => { playerRef.current = player; }, [player]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const dpr = window.devicePixelRatio;
    let w = mount.clientWidth;
    let h = mount.clientHeight;

    // --- WebGL renderer (occluder geometry + depth pass) ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(dpr);
    Object.assign(renderer.domElement.style, { position: "absolute", top: "0", left: "0" });
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BLACK);
    scene.fog = new THREE.Fog(BLACK, 12, 32);
    scene.add(buildOccluderScene(dungeon));

    const camera = new THREE.PerspectiveCamera(88, w / h, 0.1, 100);

    // Depth render target (256×256) + shader + pixel buffer
    const depthTarget = new THREE.WebGLRenderTarget(DEPTH_SIZE, DEPTH_SIZE);
    const depthMat = new THREE.ShaderMaterial({ vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG });
    const depthPx = new Uint8Array(DEPTH_SIZE * DEPTH_SIZE * 4);

    // --- 2D canvas overlay (fixed-width lines) ---
    const cv = document.createElement("canvas");
    Object.assign(cv.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = w + "px";
    cv.style.height = h + "px";
    mount.appendChild(cv);
    const ctx = cv.getContext("2d")!;

    const segs = buildSegments(dungeon);
    const nSegs = segs.length / 6;

    // Initial camera position
    const sd = dungeon.startDir;
    const ipx = dungeon.startX * CELL_SIZE + DIR_BACK_X[sd] * CAM_BACK;
    const ipz = dungeon.startY * CELL_SIZE + DIR_BACK_Z[sd] * CAM_BACK;
    camera.position.set(ipx, WALL_HEIGHT * 0.5, ipz);
    camera.rotation.y = DIR_ANGLES[sd];
    lastPlayerKey = `${dungeon.startX},${dungeon.startY},${sd}`;
    stepFromX = ipx; stepFromZ = ipz; stepToX = ipx; stepToZ = ipz;
    stepFromAngle = DIR_ANGLES[sd]; stepToAngle = DIR_ANGLES[sd];
    isAnimating = false;

    const _v = new THREE.Vector3();
    const _c = new THREE.Vector3();

    // Project world point → canvas pixel coords + NDC values.
    // Returns null if behind the camera near-plane.
    function proj(x: number, y: number, z: number) {
      _c.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      if (_c.z >= -camera.near) return null; // behind or at near plane
      _v.set(x, y, z).project(camera);
      return {
        sx: (_v.x * 0.5 + 0.5) * cv.width,
        sy: (0.5 - _v.y * 0.5) * cv.height,
        nx: _v.x,
        ny: _v.y,
        nz: _v.z,
      };
    }

    // Decode stored NDC z from the depth render target at NDC position (nx, ny).
    // WebGL readPixels is bottom-left origin, matching NDC y convention.
    function depthAt(nx: number, ny: number): number {
      const ix = Math.min(Math.max(Math.floor((nx + 1) * 0.5 * DEPTH_SIZE), 0), DEPTH_SIZE - 1);
      const iy = Math.min(Math.max(Math.floor((ny + 1) * 0.5 * DEPTH_SIZE), 0), DEPTH_SIZE - 1);
      const b = (iy * DEPTH_SIZE + ix) * 4;
      // Decode 16-bit depth from RG channels
      const d = depthPx[b] / 255 + depthPx[b + 1] / 255 / 255;
      return d * 2 - 1; // back to NDC z range [-1, 1]
    }

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      // Camera animation
      const p = playerRef.current;
      const key = `${p.x},${p.y},${p.dir}`;
      if (key !== lastPlayerKey) {
        stepFromX = camera.position.x;
        stepFromZ = camera.position.z;
        stepToX = p.x * CELL_SIZE + DIR_BACK_X[p.dir] * CAM_BACK;
        stepToZ = p.y * CELL_SIZE + DIR_BACK_Z[p.dir] * CAM_BACK;
        let fa = camera.rotation.y % (2 * Math.PI);
        const ta = DIR_ANGLES[p.dir];
        let diff = ta - fa;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        stepFromAngle = fa; stepToAngle = fa + diff;
        stepStart = performance.now();
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
      camera.updateMatrixWorld();

      // Pass 1: render depth into small render target
      scene.overrideMaterial = depthMat;
      renderer.setRenderTarget(depthTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      scene.overrideMaterial = null;
      renderer.readRenderTargetPixels(depthTarget, 0, 0, DEPTH_SIZE, DEPTH_SIZE, depthPx);

      // Pass 2: main render (black occluder geometry to screen)
      renderer.render(scene, camera);

      // Pass 3: 2D fixed-width line overlay
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = "#00dd44";
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();

      for (let i = 0; i < nSegs; i++) {
        const b = i * 6;
        const pA = proj(segs[b], segs[b + 1], segs[b + 2]);
        if (!pA) continue;
        const pB = proj(segs[b + 3], segs[b + 4], segs[b + 5]);
        if (!pB) continue;

        // Depth occlusion: skip if a closer surface is in front of either endpoint
        if (depthAt(pA.nx, pA.ny) < pA.nz - DEPTH_EPS) continue;
        if (depthAt(pB.nx, pB.ny) < pB.nz - DEPTH_EPS) continue;

        ctx.moveTo(pA.sx, pA.sy);
        ctx.lineTo(pB.sx, pB.sy);
      }
      ctx.stroke();
    };
    animate();

    const onResize = () => {
      w = mount.clientWidth; h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = w + "px"; cv.style.height = h + "px";
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      depthTarget.dispose();
      mount.removeChild(renderer.domElement);
      mount.removeChild(cv);
    };
  }, [dungeon]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%", position: "relative" }} />;
}
