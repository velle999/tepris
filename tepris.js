// ===== TEPRIS.JS - FULLY RESPONSIVE & ENHANCED =====

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('tetris');
  const context = canvas.getContext('2d');
  const previewBox = document.getElementById('preview-box');
  const previewCtx = previewBox?.getContext('2d');
  const scoreDisplay = document.getElementById('score');
  const highScoreDisplay = document.getElementById('highScore');
  const startSound = document.getElementById('start-sound');
  const rotateSound = document.getElementById('rotate-sound');
  const bgMusic = document.getElementById('bg-music');
  const pointsSound = document.getElementById('points-sound');

  const rows = 20;
  const cols = 10;
  let blockSize = 20;

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

  function resizeCanvas() {
    const container = document.getElementById('tetris-container');
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

  window.addEventListener('resize', () => {
    resizeCanvas();
    resizePreviewBox();
  });

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
    ctx.save();
    ctx.globalAlpha = opacity;
    matrix.forEach((row, y) => {
      row.forEach((val, x) => {
        if (val) {
          const globalX = x + offset.x;
          const globalY = y + offset.y;
          const now = performance.now();
          let fill = color;
          if (flashingCells.some(c => c.x === globalX && c.y === globalY) && now - flashStartTime < flashDuration) {
            fill = '#fff';
          }
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
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        rotated[dir > 0 ? x : cols - 1 - x][dir > 0 ? rows - 1 - y : y] = matrix[y][x];
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
    playSound(rotateSound);
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
      if (arena[y].every(val => val !== 0)) {
        for (let x = 0; x < cols; x++) {
          flashingCells.push({ x, y });
        }
      }
    }
    if (flashingCells.length) flashStartTime = performance.now();
  }

  function update(time = 0) {
    const delta = time - lastTime;
    lastTime = time;
    dropCounter += delta;

    if (!paused && dropCounter > dropInterval) drop();
    draw();

    if (flashingCells.length && performance.now() - flashStartTime > flashDuration) {
      const rowsToClear = [...new Set(flashingCells.map(c => c.y))];
      if (rowsToClear.length > 0) playSound(pointsSound);
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
    while (!collide(arena, { matrix: current, pos: ghostPos })) ghostPos.y++;
    ghostPos.y--;
    drawMatrix(current, ghostPos, context, blockSize, '#0ff', 0.2);
  }

  function drawPreview() {
    if (!previewCtx || !next) return;
    previewCtx.clearRect(0, 0, previewBox.width, previewBox.height);
    const offsetX = ((4 - next[0].length) / 2) | 0;
    const offsetY = ((4 - next.length) / 2) | 0;
    drawMatrix(next, { x: offsetX, y: offsetY }, previewCtx, previewBox.width / 4, '#0ff', 1);
  }

function resetPiece() {
  current = next || randomPiece();
  next = randomPiece();
  pos.y = 0;
  pos.x = ((cols / 2) | 0) - ((current[0].length / 2) | 0);

  if (collide(arena, { matrix: current, pos })) {
    console.warn('💀 GAME OVER');

    // Only prompt for initials if it's a new high score
    if (score > highScore) {
      const initials = prompt("🏆 New High Score! Enter your initials:", "")
        ?.toUpperCase()
        .slice(0, 3) || "---";
      localStorage.setItem('teprisHighScore', score);
      localStorage.setItem('teprisHighInitials', initials);
    }

    // Reset for new game
    arena = createMatrix(cols, rows);
    score = 0;
  }
}

  function randomPiece() {
    const keys = Object.keys(pieces);
    return createPiece(keys[Math.floor(Math.random() * keys.length)]);
  }

function updateScore() {
  scoreDisplay.textContent = score;
  highScore = parseInt(localStorage.getItem('teprisHighScore')) || 0;
  const initials = localStorage.getItem('teprisHighInitials') || "---";
  highScoreDisplay.textContent = `${highScore} (${initials})`;
}

  function playSound(sound) {
    if (sound && typeof sound.play === 'function') {
      sound.currentTime = 0;
      const playPromise = sound.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => console.warn(`🔇 Sound play error [${sound.id}]:`, err));
      }
    }
  }

  function startTetris() {
    if (running) return;
    try {
      startSound?.play();
      bgMusic.volume = 0.5;
      bgMusic.play().catch(e => console.warn('🔇 Background music blocked:', e.message));
    } catch (e) {
      console.warn('🔇 Audio blocked:', e.message);
    }
    arena = createMatrix(cols, rows);
    current = randomPiece();
    next = randomPiece();
    updateScore();
    resizeCanvas();
    resizePreviewBox();
    running = true;
    update();
  }

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

  document.getElementById('rotate-btn')?.addEventListener('click', () => rotatePiece(1));

  // === Press-and-hold touch/mouse slide controls ===
  const holdRepeatRate = 150;
  let holdInterval = null;

  function enableHoldControl(buttonId, actionFn) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    const clear = () => {
      clearInterval(holdInterval);
      holdInterval = null;
    };

    btn.addEventListener('pointerdown', () => {
      actionFn();
      holdInterval = setInterval(actionFn, holdRepeatRate);
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
      btn.addEventListener(evt, clear)
    );
  }

  enableHoldControl('left-btn', () => {
    pos.x--;
    if (collide(arena, { matrix: current, pos })) pos.x++;
  });

  enableHoldControl('right-btn', () => {
    pos.x++;
    if (collide(arena, { matrix: current, pos })) pos.x--;
  });

  enableHoldControl('down-btn', () => drop());

  window.startTetris = startTetris;

  resizeCanvas();
  resizePreviewBox();
});
