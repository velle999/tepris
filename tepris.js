// ===== TEPRIS.JS - FULLY RESPONSIVE & ENHANCED WITH MOBILE AUDIO + LEVEL SPEED + INITIALS ENTRY + SCOREBOARD =====

// This is the clean and fully edited version of your Tepris game logic.
// It removes duplicate functions, repairs control logic, stabilizes gameplay loop, and includes full mobile touch/vibration support.

// Entry point on DOM load

function addTouchControls() {
  console.log("✅ Touch controls initialized");

  let startX = 0, startY = 0, moved = false, longPressTimer = null;
  const threshold = 30, doubleTapGap = 300;
  let lastTap = 0;

  window.addEventListener('touchstart', e => {
    if (!e.touches || e.touches.length > 2) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    moved = false;
    longPressTimer = setTimeout(() => {
      navigator.vibrate?.(100);
      hardDrop();
    }, 400);
  });

  window.addEventListener('touchmove', e => {
    if (!e.touches || e.touches.length > 2) return;
    clearTimeout(longPressTimer);
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > threshold) {
        moved = true;
        navigator.vibrate?.(25);
        if (dx > 0) {
          pos.x++;
          if (collide(arena, { matrix: current, pos })) pos.x--;
        } else {
          pos.x--;
          if (collide(arena, { matrix: current, pos })) pos.x++;
        }
        startX = t.clientX;
      }
    } else if (Math.abs(dy) > threshold && dy > 0) {
      moved = true;
      navigator.vibrate?.(15);
      drop();
      startY = t.clientY;
    }
  });

  window.addEventListener('touchend', e => {
    clearTimeout(longPressTimer);
    if (e.changedTouches.length === 2) {
      navigator.vibrate?.([30, 30, 30]);
      hardDrop();
      return;
    }
    if (moved) return;
    const now = Date.now();
    if (now - lastTap < doubleTapGap) {
      paused = !paused;
      if (paused) {
        bgMusic.pause();
        console.log('⏸️ Paused by double-tap');
      } else {
        bgMusic.play().catch(err => console.warn("🔇 Music resume failed:", err));
        requestAnimationFrame(update);
        console.log('▶️ Resumed by double-tap');
      }
      lastTap = 0;
    } else {
      navigator.vibrate?.(10);
      rotatePiece(1);
      lastTap = now;
    }
  });

  const leftBtn = document.getElementById('left-btn');
  const rightBtn = document.getElementById('right-btn');
  const rotateBtn = document.getElementById('rotate-btn');
  const downBtn = document.getElementById('down-btn');
  const hardDropBtn = document.getElementById('harddrop-btn');
  const holdBtn = document.getElementById('hold-btn');

  if (leftBtn) leftBtn.addEventListener('click', () => {
    if (paused || !running) return;
    pos.x--;
    if (collide(arena, { matrix: current, pos })) pos.x++;
  });

  if (rightBtn) rightBtn.addEventListener('click', () => {
    if (paused || !running) return;
    pos.x++;
    if (collide(arena, { matrix: current, pos })) pos.x--;
  });

  if (rotateBtn) rotateBtn.addEventListener('click', () => {
    if (paused || !running) return;
    rotatePiece(1);
  });

  if (downBtn) downBtn.addEventListener('click', () => {
    if (paused || !running) return;
    drop();
  });

  if (hardDropBtn) hardDropBtn.addEventListener('click', () => {
    if (paused || !running) return;
    navigator.vibrate?.([20, 40]);
    hardDrop();
  });

  if (holdBtn) holdBtn.addEventListener('click', () => {
    paused = !paused;
    if (paused) {
      bgMusic.pause();
      console.log('⏸️ Game paused via hold button');
    } else {
      bgMusic.play().catch(err => console.warn("🔇 Music resume failed:", err));
      requestAnimationFrame(update);
      console.log('▶️ Game resumed via hold button');
    }
  });
}

let canvas, context, previewBox, previewCtx;
let scoreDisplay, highScoreDisplay, levelDisplay, linesDisplay;
let startSound, rotateSound, bgMusic, pointsSound, tetrisSound;

let rows = 20, cols = 10, blockSize = 20;
let arena, current, next, pos, running = false, paused = false;
let dropCounter = 0, dropInterval = 1000, lastTime = 0;
let score = 0, highScore = 0, highScoreInitials = '---';
let level = 0, linesCleared = 0;
let flashingCells = [], flashStartTime = 0, flashDuration = 400;

function createMatrix(w, h) {
  return Array.from({ length: h }, () => Array(w).fill(0));
}

const pieces = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]]
};

function createPiece(type) {
  return pieces[type].map(row => [...row]);
}

function playSafe(sound) {
  if (!sound || typeof sound.play !== 'function') return;
  try {
    sound.pause();
    sound.currentTime = 0;
    sound.play().catch(err => console.warn(`🔇 Sound failed:`, err));
  } catch (e) {
    console.warn('🔇 Sound error:', e);
  }
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
  playSafe(rotateSound);
}

function collide(arena, player) {
  const [m, o] = [player.matrix, player.pos];
  for (let y = 0; y < m.length; ++y)
    for (let x = 0; x < m[y].length; ++x)
      if (m[y][x] && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0)
        return true;
  return false;
}

function merge(arena, player) {
  player.matrix.forEach((row, y) => {
    row.forEach((val, x) => {
      if (val) arena[y + player.pos.y][x + player.pos.x] = 1;
    });
  });
}

function resetPiece() {
  current = next || randomPiece();
  next = randomPiece();
  pos.y = 0;
  pos.x = ((cols / 2) | 0) - ((current[0].length / 2) | 0);
  if (collide(arena, { matrix: current, pos })) {
    if (score > highScore) {
      highScore = score;
      highScoreInitials = promptInitials();
      localStorage.setItem('teprisHighScore', score);
    }
    arena = createMatrix(cols, rows);
    score = level = linesCleared = 0;
    dropInterval = 1000;
    updateScore();
  }
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
  let rowsToClear = [];
  for (let y = rows - 1; y >= 0; y--) {
    if (arena[y].every(val => val !== 0)) rowsToClear.push(y);
  }
  if (rowsToClear.length > 0) {
    rowsToClear.forEach(y => {
      for (let x = 0; x < cols; x++) {
        flashingCells.push({ x, y });
      }
    });
    flashStartTime = performance.now();
    if (rowsToClear.length === 4) {
      playSafe(tetrisSound);
      triggerTetrisEffect();
    } else {
      playSafe(pointsSound);
    }
    setTimeout(() => {
      rowsToClear.sort((a, b) => a - b).forEach(y => {
        arena.splice(y, 1);
        arena.unshift(Array(cols).fill(0));
      });
      linesCleared += rowsToClear.length;
      score += rowsToClear.length === 4 ? 1200 : rowsToClear.length * 100;
      level = Math.floor(linesCleared / 10);
      dropInterval = Math.max(100, 1000 - level * 100);
      updateScore();
    }, flashDuration);
  }
}

function updateScore() {
  scoreDisplay.textContent = score;
  highScoreDisplay.textContent = `${highScoreInitials} ${highScore}`;
  if (levelDisplay) levelDisplay.textContent = level;
  if (linesDisplay) linesDisplay.textContent = linesCleared;
}

function update(time = 0) {
  if (paused) return;
  const deltaTime = time - lastTime;
  lastTime = time;
  dropCounter += deltaTime;
  if (dropCounter > dropInterval) drop();
  draw();
  if (running) requestAnimationFrame(update);
}

function drawMatrix(matrix, offset, ctx = context, size = blockSize, color = '#0ff', opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  matrix.forEach((row, y) => {
    row.forEach((val, x) => {
      if (val) {
        const gx = x + offset.x;
        const gy = y + offset.y;
        const now = performance.now();
        ctx.fillStyle = flashingCells.some(c => c.x === gx && c.y === gy && now - flashStartTime < flashDuration) ? '#fff' : color;
        ctx.fillRect(gx * size, gy * size, size, size);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(gx * size, gy * size, size, size);
      }
    });
  });
  ctx.restore();
}

function drawGhostPiece() {
  if (!current) return;
  let ghostY = pos.y;
  while (!collide(arena, { matrix: current, pos: { x: pos.x, y: ghostY + 1 } })) ghostY++;
  drawMatrix(current, { x: pos.x, y: ghostY }, context, blockSize, '#888', 0.3);
}

function draw() {
  context.fillStyle = '#111';
  context.fillRect(0, 0, canvas.width, canvas.height);
  console.log('🧱 Drawing state:', { current, pos, arena });
  drawMatrix(arena, { x: 0, y: 0 });
  drawGhostPiece();
  if (current && pos) {
    drawMatrix(current, pos);
  } else {
    console.warn('⚠️ No current piece to draw');
  }
  if (previewBox && next) {
    previewCtx.clearRect(0, 0, previewBox.width, previewBox.height);
    const scale = Math.floor(previewBox.width / 4);
    drawMatrix(next, { x: 1, y: 1 }, previewCtx, scale, '#0f0', 0.8);
  }
}

function randomPiece() {
  const keys = Object.keys(pieces);
  return createPiece(keys[Math.floor(Math.random() * keys.length)]);
}

function promptInitials() {
  const initials = prompt('🎉 NEW HIGH SCORE! Enter your initials:', highScoreInitials || '---');
  if (initials) {
    const clean = initials.toUpperCase().substring(0, 3);
    localStorage.setItem('teprisHighScoreInitials', clean);
    return clean;
  }
  return highScoreInitials;
}

function triggerTetrisEffect() {
  const container = document.getElementById('tetris-container') || document.body;
  container.classList.add('tetris-flash');
  setTimeout(() => container.classList.remove('tetris-flash'), 500);
}

function resizeCanvas() {
  const container = document.getElementById('tetris-container') || document.body;
  const vw = container.clientWidth;
  const vh = window.innerHeight - 160;
  blockSize = Math.max(12, Math.min(40, Math.floor(Math.min(vw / cols, vh / rows))));
  canvas.width = blockSize * cols;
  canvas.height = blockSize * rows;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  draw();
}

function resizePreviewBox() {
  const size = Math.min(window.innerWidth * 0.2, 150);
  previewBox.width = size;
  previewBox.height = size;
  previewBox.style.width = `${size}px`;
  previewBox.style.height = `${size}px`;
}

document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('tetris');
  context = canvas.getContext('2d');
  previewBox = document.getElementById('preview-box');
  previewCtx = previewBox?.getContext('2d');

  scoreDisplay = document.getElementById('score');
  highScoreDisplay = document.getElementById('highScore');
  levelDisplay = document.getElementById('level');
  linesDisplay = document.getElementById('lines');

  startSound = document.getElementById('coin-sound');
  rotateSound = document.getElementById('rotate-sound');
  bgMusic = document.getElementById('bg-music');
  pointsSound = document.getElementById('points-sound');
  tetrisSound = document.getElementById('tetris-sound');

  highScore = parseInt(localStorage.getItem('teprisHighScore')) || 0;
  highScoreInitials = localStorage.getItem('teprisHighScoreInitials') || '---';

  arena = createMatrix(cols, rows);
  pos = { x: 0, y: 0 };

  resizeCanvas();
  resizePreviewBox();

  document.addEventListener('keydown', (event) => {
    if (!running) return;
    if (event.key.toLowerCase() === 'p' || event.key === 'Enter') {
      paused = !paused;
      if (paused) {
        bgMusic.pause();
      } else {
        bgMusic.play().catch(err => console.warn("🔇 Music resume failed:", err));
        requestAnimationFrame(update);
      }
      return;
    }
    if (paused) return;
    switch (event.key) {
      case 'ArrowLeft': pos.x--; if (collide(arena, { matrix: current, pos })) pos.x++; break;
      case 'ArrowRight': pos.x++; if (collide(arena, { matrix: current, pos })) pos.x--; break;
      case 'ArrowDown': drop(); break;
      case 'ArrowUp': rotatePiece(1); break;
      case ' ': hardDrop(); break;
    }
  });
});

window.startTetris = function () {
  if (running) return;
  playSafe(startSound);
  bgMusic.volume = 0.5;
  playSafe(bgMusic);

  arena = createMatrix(cols, rows);
  current = randomPiece();
  next = randomPiece();
  pos = { x: ((cols / 2) | 0) - ((current[0].length / 2) | 0), y: 0 };

  updateScore();
  addTouchControls();

  // Ensure canvas touch handling is enforced
  canvas.style.touchAction = 'none';
  canvas.style.webkitUserSelect = 'none';
  canvas.style.userSelect = 'none';
  canvas.setAttribute('tabindex', '0');
  resizeCanvas();
  resizePreviewBox();
  draw(); // ✅ Force first visual frame

  running = true;
  requestAnimationFrame(update);
};
