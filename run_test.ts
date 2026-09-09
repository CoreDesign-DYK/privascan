const drawWidth = 100;
const drawHeight = 200;

function toLandscape(vx: number, vy: number, quarterTurn: number) {
  const cx = drawHeight / 2; // canvas.width / 2
  const cy = drawWidth / 2;  // canvas.height / 2
  const dx = vx - drawWidth / 2;
  const dy = vy - drawHeight / 2;
  const angle = quarterTurn * Math.PI / 2;
  const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
  const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
  return { x: rx + cx, y: ry + cy };
}

console.log("Turn 1, vx=0, vy=0:", toLandscape(0, 0, 1));
console.log("Turn -1, vx=0, vy=0:", toLandscape(0, 0, -1));
