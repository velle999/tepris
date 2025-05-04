const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
const previewBox = document.getElementById('preview-box');
const previewCtx = previewBox?.getContext('2d');
const scoreDisplay = document.getElementById('score');
const highScoreDisplay = document.getElementById('highScore');
const startSound = document.getElementById('start-sound');

const blockSize = 20;
const rows = 20;
const cols = 10;
canvas.width = cols * blockSize;
canvas.height = rows * blockSize;

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
  const matrix = [];
  while (h--) matrix.push(new Array(w).fill(0));
  return matrix;
}

function createPiece(type) {
  return pieces[type].map(row => [...row]); // Always clone
}

function drawMatrix(matrix, offset, ctx = context, size = blockSize, color = '#0ff', opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  matrix.forEach((row, y) => {
    row.forEach((val, x) => {
      if (val) {
        ctx.fillStyle = color;
        ctx.fillRect((x + offset.x) * size, (y + offset.y) * size, size, size);
        ctx.strokeStyle = '#000';
        ctx.strokeRect((x + offset.x) * size, (y + offset.y) * size, size, size);
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

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (dir > 0) {
        rotated[x][rows - 1 - y] = matrix[y][x]; // CW
      } else {
        rotated[cols - 1 - x][y] = matrix[y][x]; // CCW
      }
    }
  }

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
  while (!collide(arena, { matrix: current, pos })) {
    pos.y++;
  }
  pos.y--;
  merge(arena, { matrix: current, pos });
  resetPiece();
  sweep();
  updateScore();
}

function sweep() {
  outer: for (let y = rows - 1; y >= 0; y--) {
    for (let x = 0; x < cols; x++) {
      if (arena[y][x] === 0) continue outer;
    }
    arena.splice(y, 1);
    arena.unshift(new Array(cols).fill(0));
    score += 10;
  }
}

function draw() {
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
  while (!collide(arena, { matrix: current, pos: ghostPos })) {
    ghostPos.y++;
  }
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
  try {
    startSound?.play();
  } catch (e) {
    console.warn('🔇 Audio blocked:', e.message);
  }
  arena = createMatrix(cols, rows);
  current = randomPiece();
  next = randomPiece();
  updateScore();
  running = true;
  update();
}

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

  // Ignore tiny finger wiggles
  if (Math.max(absX, absY) < 20) return;

  if (absX > absY) {
    // Horizontal swipe
    if (dx > 0) {
      pos.x++;
      if (collide(arena, { matrix: current, pos })) pos.x--;
    } else {
      pos.x--;
      if (collide(arena, { matrix: current, pos })) pos.x++;
    }
  } else {
    // Vertical swipe
    if (dy > 0) {
      hardDrop(); // ⬇️ Hard drop!
    } else {
      rotatePiece(1); // ⬆️ Rotate on upward swipe
    }
  }
}, { passive: true });

