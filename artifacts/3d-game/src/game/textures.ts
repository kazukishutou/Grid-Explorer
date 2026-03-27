import * as THREE from "three";

function makeCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

export function makeWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, S, S);

  ctx.strokeStyle = "#0d3b5e";
  ctx.lineWidth = 1;
  const grid = 32;
  for (let i = 0; i <= S; i += grid) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }

  const circuits: [number, number, number, number, string][] = [
    [0, 40, 80, 40, "#00f0ff"],
    [80, 40, 80, 100, "#00f0ff"],
    [80, 100, 200, 100, "#00f0ff"],
    [200, 100, 200, 160, "#00f0ff"],
    [200, 160, 256, 160, "#00f0ff"],
    [32, 160, 32, 220, "#ff2d7a"],
    [32, 220, 160, 220, "#ff2d7a"],
    [160, 220, 160, 256, "#ff2d7a"],
    [128, 0, 128, 70, "#a020f0"],
    [128, 70, 230, 70, "#a020f0"],
    [230, 70, 230, 140, "#a020f0"],
    [230, 140, 180, 140, "#a020f0"],
  ];

  for (const [x1, y1, x2, y2, color] of circuits) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 6;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  const nodes: [number, number, string][] = [
    [80, 40, "#00f0ff"],
    [80, 100, "#00f0ff"],
    [200, 100, "#00f0ff"],
    [200, 160, "#00f0ff"],
    [32, 160, "#ff2d7a"],
    [32, 220, "#ff2d7a"],
    [160, 220, "#ff2d7a"],
    [128, 70, "#a020f0"],
    [230, 70, "#a020f0"],
    [230, 140, "#a020f0"],
  ];
  for (const [nx, ny, color] of nodes) {
    ctx.fillStyle = color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(nx, ny, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.strokeStyle = "#00f0ff44";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(Math.random() * 7) * 32 + 8;
    const y = Math.floor(Math.random() * 7) * 32 + 12;
    ctx.strokeRect(x, y, 16, 8);
  }

  ctx.fillStyle = "#ffffff08";
  for (let y = 0; y < S; y += 4) {
    ctx.fillRect(0, y, S, 1);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1.25);
  return tex;
}

export function makeFloorTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = "#0c0c1a";
  ctx.fillRect(0, 0, S, S);

  const grid = 32;
  ctx.strokeStyle = "#00f0ff22";
  ctx.lineWidth = 1;
  for (let i = 0; i <= S; i += grid) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }

  ctx.strokeStyle = "#00f0ff55";
  ctx.lineWidth = 2;
  for (let i = 0; i <= S; i += grid * 2) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }

  for (let x = 0; x < S; x += grid) {
    for (let y = 0; y < S; y += grid) {
      if ((x / grid + y / grid) % 2 === 0) {
        ctx.fillStyle = "#ffffff04";
        ctx.fillRect(x + 1, y + 1, grid - 2, grid - 2);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

export function makeCeilingTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = "#080812";
  ctx.fillRect(0, 0, S, S);

  ctx.strokeStyle = "#a020f033";
  ctx.lineWidth = 1;
  const grid = 32;
  for (let i = 0; i <= S; i += grid) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }

  ctx.fillStyle = "#a020f0";
  ctx.shadowBlur = 10;
  ctx.shadowColor = "#a020f0";
  for (let x = 0; x < S; x += grid * 2) {
    for (let y = 0; y < S; y += grid * 2) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}
