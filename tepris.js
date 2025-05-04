// ===== TEPRIS.JS - RESPONSIVE, FLASHING LINES, FULL CONTROLS =====

const canvas = document.getElementById('tetris');
const context = canvas?.getContext('2d');
const previewBox = document.getElementById('preview-box');
const previewCtx = previewBox?.getContext('2d');
const scoreDisplay = document.getElementById('score');
const highScoreDisplay = document.getElementById('highScore');
const startSound = document.getElementById('start-sound');

let blockSize = 20;
const rows = 20;
const cols = 10;

let score = 0;
let highScore = parseInt(localStorage.getItem('teprisHighScore')) || 0;
let arena = createMatrix(cols, rows);
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let current = null;
let next = null;
let pos = { x: 0, y: 0 };
let running = false;
let paused = false;

let flashingCells = [];
let flashStartTime = 0;
let flashDuration = 200;

const pieces = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]]
};

function createMatrix(w, h) {
  return Array.from({ length: h }, () => Array(w).fill(0));
}

function createPiece(type) {
  return pieces[type].map(row => [...row]);
}

function drawMatrix(matrix, offset, ctx = context, size = blockSize, color = '#0ff', opacity = 1) {
  if (!ctx) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  matrix.forEach((row, y) => {
    row.forEach((val, x) => {
      if (val) {
        const globalX = x + offset.x;
        const globalY = y + offset.y;
        const now = performance.now();
        let fill = color;
        if (flashingCells.some(c => c.x === globalX && c.y === globalY) && now - flashStartTime < flashDuration)
          fill = '#fff';
        ctx.fillStyle = fill;
        ctx.fillRect(globalX * size, globalY * size, size, size);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(globalX * size, globalY * size, size, size);
      }
    });
  });
  ctx.restore();
}

function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((val, x) => {
      if (val) arena[y + player.pos.y][x + player.pos.x] = 1;
    });
  });
}

function collide(arena, player) {
  const [m, o] = [player.matrix, player.pos];
  for (let y = 0; y < m.length; ++y)
    for (let x = 0; x < m[y].length; ++x)
      if (m[y][x] && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0)
        return true;
  return false;
}

function rotateMatrix(matrix, dir) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      rotated[dir > 0 ? x : cols - 1 - x][dir > 0 ? rows - 1 - y : y] = matrix[y][x];
  return rotated;
}

function rotatePiece(dir) {
  const rotated = rotateMatrix(current, dir);
  const oldX = pos.x;
  let offset = 1;
  while (collide(arena, { matrix: rotated, pos })) {
    pos.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (offset > rotated[0].length) {
      pos.x = oldX;
      return;
    }
  }
  current = rotated;
}

function drop() {
  pos.y++;
  if (collide(arena, { matrix: current, pos })) {
    pos.y--;
    merge(arena, { matrix: current, pos });
    resetPiece();
    sweep();
    updateScore();
  }
  dropCounter = 0;
}

function hardDrop() {
  while (!collide(arena, { matrix: current, pos })) pos.y++;
  pos.y--;
  merge(arena, { matrix: current, pos });
  resetPiece();
  sweep();
  updateScore();
}

function sweep() {
  flashingCells = [];
  for (let y = rows - 1; y >= 0; y--) {
    if (arena[y].every(val => val !== 0))
      for (let x = 0; x < cols; x++)
        flashingCells.push({ x, y });
  }
  if (flashingCells.length) flashStartTime = performance.now();
}

function draw() {
  if (!context) return;
  context.fillStyle = '#111';
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawMatrix(arena, { x: 0, y: 0 });
  drawGhostPiece();
  drawMatrix(current, pos);
  drawPreview();
}

function drawGhostPiece() {
  if (!current) return;
  const ghostPos = { x: pos.x, y: pos.y };
  while (!collide(arena, { matrix: current, pos: ghostPos })) ghostPos.y++;
  ghostPos.y--;
  drawMatrix(current, ghostPos, context, blockSize, '#0ff', 0.2);
}

function drawPreview() {
  if (!previewCtx || !next) return;
  previewCtx.clearRect(0, 0, previewBox.width, previewBox.height);
  const offsetX = ((4 - next[0].length) / 2) | 0;
  const offsetY = ((4 - next.length) / 2) | 0;
  drawMatrix(next, { x: offsetX, y: offsetY }, previewCtx, 20, '#0ff', 1);
}

function update(time = 0) {
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  if (!paused && dropCounter > dropInterval) drop();
  draw();

  if (flashingCells.length && performance.now() - flashStartTime > flashDuration) {
    const rowsToClear = [...new Set(flashingCells.map(c => c.y))];
    for (let y of rowsToClear.sort((a, b) => b - a)) {
      arena.splice(y, 1);
      arena.unshift(new Array(cols).fill(0));
      score += 10;
    }
    flashingCells = [];
    updateScore();
  }

  if (running) requestAnimationFrame(update);
}

function resetPiece() {
  current = next || randomPiece();
  next = randomPiece();
  pos.y = 0;
  pos.x = ((cols / 2) | 0) - ((current[0].length / 2) | 0);
  if (collide(arena, { matrix: current, pos })) {
    console.warn('💀 GAME OVER');
    arena = createMatrix(cols, rows);
    score = 0;
  }
}

function randomPiece() {
  const keys = Object.keys(pieces);
  const type = keys[Math.floor(Math.random() * keys.length)];
  return createPiece(type);
}

function updateScore() {
  scoreDisplay.textContent = score;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('teprisHighScore', score);
  }
  highScoreDisplay.textContent = highScore;
}

function startTetris() {
  if (running) return;
  try { startSound?.play(); } catch (e) { console.warn('🔇 Audio blocked:', e.message); }
  arena = createMatrix(cols, rows);
  current = randomPiece();
  next = randomPiece();
  pos = { x: 4, y: 0 };
  updateScore();
  running = true;
  resizeCanvas();
  update();
}

function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Block size that keeps square blocks and fits both directions
  const maxBlockWidth = Math.floor(vw / cols);
  const maxBlockHeight = Math.floor(vh / rows);
  blockSize = Math.min(maxBlockWidth, maxBlockHeight);

  const pixelWidth = cols * blockSize;
  const pixelHeight = rows * blockSize;

  // Set both the internal resolution AND the display size
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  canvas.style.width = pixelWidth + 'px';
  canvas.style.height = pixelHeight + 'px';

  if (previewBox) {
    previewBox.width = 80;
    previewBox.height = 80;
    previewBox.style.width = '80px';
    previewBox.style.height = '80px';
  }

  draw();
}

window.addEventListener('resize', resizeCanvas);

// === CONTROLS ===
document.addEventListener('keydown', e => {
  if (!running) return;
  switch (e.key) {
    case 'ArrowLeft': pos.x--; if (collide(arena, { matrix: current, pos })) pos.x++; break;
    case 'ArrowRight': pos.x++; if (collide(arena, { matrix: current, pos })) pos.x--; break;
    case 'ArrowDown': drop(); break;
    case 'ArrowUp': rotatePiece(1); break;
    case ' ': hardDrop(); break;
    case 'Enter': paused = !paused; break;
  }
});

// === TOUCH CONTROLS ===
document.getElementById('left-btn')?.addEventListener('click', () => { pos.x--; if (collide(arena, { matrix: current, pos })) pos.x++; });
document.getElementById('right-btn')?.addEventListener('click', () => { pos.x++; if (collide(arena, { matrix: current, pos })) pos.x--; });
document.getElementById('down-btn')?.addEventListener('click', () => drop());
document.getElementById('rotate-btn')?.addEventListener('click', () => rotatePiece(1));

// === START HOOK ===
window.startTetris = startTetris;

// === SWIPE GESTURES ===
let touchStartX = 0, touchStartY = 0;
canvas.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.max(absX, absY) < 20) return;

  if (absX > absY) {
    dx > 0 ? pos.x++ : pos.x--;
    if (collide(arena, { matrix: current, pos })) dx > 0 ? pos.x-- : pos.x++;
  } else {
    dy > 0 ? hardDrop() : rotatePiece(1);
  }
}, { passive: true });
