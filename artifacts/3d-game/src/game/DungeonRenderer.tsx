import { useEffect, useRef } from "react";
import * as THREE from "three";
import { DungeonMap, PlayerState } from "./dungeon";

interface Props {
  dungeon: DungeonMap;
  player: PlayerState;
}

const CELL_SIZE = 2;
const WALL_HEIGHT = 2.5;
const STEP_DURATION = 180;
const GREEN = 0x00dd44;
const BLACK = 0x000000;

let lastPlayerKey = "";
let stepStart = 0;
let stepFromX = 0;
let stepFromZ = 0;
let stepToX = 0;
let stepToZ = 0;
let stepFromAngle = 0;
let stepToAngle = 0;
let isAnimating = false;

const DIR_ANGLES = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

function buildScene(dungeon: DungeonMap): THREE.Group {
  const group = new THREE.Group();

  const faceMat = new THREE.MeshBasicMaterial({ color: BLACK });
  const lineMat = new THREE.LineBasicMaterial({ color: GREEN });

  const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
  const wallEdges = new THREE.EdgesGeometry(wallGeo);

  const cx = ((dungeon.width - 1) / 2) * CELL_SIZE;
  const cz = ((dungeon.height - 1) / 2) * CELL_SIZE;
  const pw = dungeon.width * CELL_SIZE;
  const ph = dungeon.height * CELL_SIZE;

  const floorGeo = new THREE.PlaneGeometry(pw, ph);
  const floorEdges = new THREE.EdgesGeometry(floorGeo);

  const floor = new THREE.Mesh(floorGeo, faceMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  group.add(floor);
  const floorLines = new THREE.LineSegments(floorEdges, lineMat);
  floorLines.rotation.x = -Math.PI / 2;
  floorLines.position.set(cx, 0, cz);
  group.add(floorLines);

  const ceilGeo = new THREE.PlaneGeometry(pw, ph);
  const ceilEdges = new THREE.EdgesGeometry(ceilGeo);

  const ceil = new THREE.Mesh(ceilGeo, faceMat.clone());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, WALL_HEIGHT, cz);
  group.add(ceil);
  const ceilLines = new THREE.LineSegments(ceilEdges, lineMat);
  ceilLines.rotation.x = Math.PI / 2;
  ceilLines.position.set(cx, WALL_HEIGHT, cz);
  group.add(ceilLines);

  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      if (dungeon.grid[y][x] !== 1) continue;

      const wx = x * CELL_SIZE;
      const wz = y * CELL_SIZE;
      const wy = WALL_HEIGHT / 2;

      const mesh = new THREE.Mesh(wallGeo, faceMat);
      mesh.position.set(wx, wy, wz);
      group.add(mesh);

      const lines = new THREE.LineSegments(wallEdges, lineMat);
      lines.position.set(wx, wy, wz);
      group.add(lines);
    }
  }

  return group;
}

export default function DungeonRenderer({ dungeon, player }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const playerRef = useRef(player);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BLACK);
    scene.fog = new THREE.Fog(BLACK, 12, 32);

    const camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 100);
    scene.add(camera);

    const dungeonGroup = buildScene(dungeon);
    scene.add(dungeonGroup);

    const px = dungeon.startX * CELL_SIZE;
    const pz = dungeon.startY * CELL_SIZE;
    camera.position.set(px, WALL_HEIGHT * 0.45, pz);
    camera.rotation.y = DIR_ANGLES[dungeon.startDir];
    lastPlayerKey = `${dungeon.startX},${dungeon.startY},${dungeon.startDir}`;
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
        const tx = p.x * CELL_SIZE;
        const tz = p.y * CELL_SIZE;
        stepFromX = camera.position.x;
        stepFromZ = camera.position.z;
        stepToX = tx;
        stepToZ = tz;

        let fromA = camera.rotation.y % (2 * Math.PI);
        let toA = DIR_ANGLES[p.dir];
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
