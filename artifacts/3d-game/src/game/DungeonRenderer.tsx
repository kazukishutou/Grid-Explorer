import { useEffect, useRef } from "react";
import * as THREE from "three";
import { DungeonMap, PlayerState, isWall, DIR_VECTORS, Direction } from "./dungeon";

interface Props {
  dungeon: DungeonMap;
  player: PlayerState;
}

const CELL_SIZE = 2;
const WALL_HEIGHT = 2.5;
const STEP_DURATION = 180;

let lastPlayerKey = "";
let stepStart = 0;
let stepFromX = 0;
let stepFromZ = 0;
let stepToX = 0;
let stepToZ = 0;
let stepFromAngle = 0;
let stepToAngle = 0;
let isAnimating = false;

const DIR_ANGLES = [
  0,
  -Math.PI / 2,
  Math.PI,
  Math.PI / 2,
];

function buildScene(dungeon: DungeonMap): THREE.Group {
  const group = new THREE.Group();

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x4a3f35 });
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x2d2520 });
  const ceilMat = new THREE.MeshLambertMaterial({ color: 0x1a1512 });

  const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
  const floorGeo = new THREE.BoxGeometry(CELL_SIZE, 0.1, CELL_SIZE);

  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      const wx = x * CELL_SIZE;
      const wz = y * CELL_SIZE;

      if (dungeon.grid[y][x] === 1) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(wx, WALL_HEIGHT / 2, wz);
        group.add(wall);
      } else {
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(wx, -0.05, wz);
        group.add(floor);

        const ceil = new THREE.Mesh(floorGeo, ceilMat);
        ceil.position.set(wx, WALL_HEIGHT + 0.05, wz);
        group.add(ceil);
      }
    }
  }

  return group;
}

function addEdgeHighlights(group: THREE.Group, dungeon: DungeonMap) {
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0x6b5a4e });

  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      if (dungeon.grid[y][x] !== 0) continue;

      const neighbors: [number, number, number][] = [
        [x, y - 1, 0],
        [x + 1, y, 1],
        [x, y + 1, 2],
        [x - 1, y, 3],
      ];

      for (const [nx, ny, side] of neighbors) {
        if (!isWall(dungeon, nx, ny)) continue;

        const wx = x * CELL_SIZE;
        const wz = y * CELL_SIZE;

        let gx = wx, gz = wz;
        let rw = 0.1, rd = 0.1;

        if (side === 0) { gz = wz - CELL_SIZE / 2; rw = CELL_SIZE; rd = 0.1; }
        else if (side === 1) { gx = wx + CELL_SIZE / 2; rw = 0.1; rd = CELL_SIZE; }
        else if (side === 2) { gz = wz + CELL_SIZE / 2; rw = CELL_SIZE; rd = 0.1; }
        else { gx = wx - CELL_SIZE / 2; rw = 0.1; rd = CELL_SIZE; }

        const geo = new THREE.BoxGeometry(rw, WALL_HEIGHT, rd);
        const mesh = new THREE.Mesh(geo, edgeMat);
        mesh.position.set(gx, WALL_HEIGHT / 2, gz);
        group.add(mesh);
      }
    }
  }
}

export default function DungeonRenderer({ dungeon, player }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
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

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0705);
    scene.fog = new THREE.Fog(0x0a0705, 6, 24);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 100);
    cameraRef.current = camera;

    const ambient = new THREE.AmbientLight(0x332211, 0.4);
    scene.add(ambient);

    const torchLight = new THREE.PointLight(0xff8833, 2.5, 8);
    camera.add(torchLight);
    torchLight.position.set(0, -0.2, 0);
    scene.add(camera);

    const dungeonGroup = buildScene(dungeon);
    addEdgeHighlights(dungeonGroup, dungeon);
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

      const flicker = 1 + (Math.sin(performance.now() * 0.003) * 0.12);
      torchLight.intensity = 2.5 * flicker;

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
