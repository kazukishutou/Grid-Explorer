import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
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

// Build flat position array [x1,y1,z1, x2,y2,z2, ...] for LineSegmentsGeometry
function buildPositions(dungeon: DungeonMap): number[] {
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
  return list;
}

// Black occluder geometry (walls, floor, ceiling) — provides proper Z-buffer occlusion
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

    let w = mount.clientWidth;
    let h = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    Object.assign(renderer.domElement.style, { position: "absolute", top: "0", left: "0" });
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BLACK);
    scene.fog = new THREE.Fog(BLACK, 12, 32);

    // Black occluder geometry writes to the Z-buffer and blocks lines behind walls
    scene.add(buildOccluderScene(dungeon));

    // LineMaterial: linewidth is in CSS pixels, constant regardless of perspective.
    // depthTest: true (default) — lines behind occluder geometry are hidden by Z-buffer.
    // fog: true — lines fade with distance like the black walls.
    const lineMat = new LineMaterial({
      color: 0x00dd44,
      linewidth: 1.5,
      fog: true,
      resolution: new THREE.Vector2(w, h),
    });
    const lineGeo = new LineSegmentsGeometry();
    lineGeo.setPositions(buildPositions(dungeon));
    const lines = new LineSegments2(lineGeo, lineMat);
    scene.add(lines);

    const camera = new THREE.PerspectiveCamera(88, w / h, 0.1, 100);

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

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

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

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      w = mount.clientWidth; h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      lineMat.resolution.set(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [dungeon]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%", position: "relative" }} />;
}
