// ===== TEPRIS.JS - FULLY RESPONSIVE & ENHANCED WITH MOBILE AUDIO + LEVEL SPEED + INITIALS ENTRY + SCOREBOARD =====

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('tetris');
  const context = canvas.getContext('2d');
  const previewBox = document.getElementById('preview-box');
  const previewCtx = previewBox?.getContext('2d');
  const scoreDisplay = document.getElementById('score');
  const highScoreDisplay = document.getElementById('highScore');
  const startSound = document.getElementById('coin-sound');
  const rotateSound = document.getElementById('rotate-sound');
  const bgMusic = document.getElementById('bg-music');
  const pointsSound = document.getElementById('points-sound');
  const tetrisSound = document.getElementById('tetris-sound');
  const levelDisplay = document.getElementById('level');
  const linesDisplay = document.getElementById('lines');

  const rows = 20;
  const cols = 10;
  let blockSize = 20;

  let score = 0;
  let highScore = parseInt(localStorage.getItem('teprisHighScore')) || 0;
  let highScoreInitials = localStorage.getItem('teprisHighScoreInitials') || '---';
  let level = 0;
  let linesCleared = 0;

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
  let flashDuration = 400; // Slowed down for visibility


function playSafe(sound) {
  if (!sound || typeof sound.play !== 'function') {
    console.warn(`🔇 Invalid sound object`, sound);
    return;
  }
  try {
    sound.pause();
    sound.currentTime = 0;
    const playPromise = sound.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => console.log(`🔊 Played sound: ${sound.id || 'unknown'}`))
        .catch(err => console.warn(`🔇 Playback failed for [${sound.id || 'sound'}]:`, err));
    }
  } catch (e) {
    console.warn(`🔇 Error during playSafe [${sound.id || 'sound'}]:`, e);
  }
}

let lastTap = 0;

function addTouchControls() {
  let startX = 0;
  let startY = 0;
  let moved = false;
  let longPressTimer = null;
  const threshold = 30;

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
    if (now - lastTap < 300) {
      paused = !paused;
      if (paused) {
        bgMusic.pause();
        console.log('⏸️ Paused by touch');
      } else {
        bgMusic.play().catch(err => console.warn("🔇 Music resume failed:", err));
        requestAnimationFrame(update);
        console.log('▶️ Resumed by touch');
      }
      lastTap = 0;
    } else {
      navigator.vibrate?.(10);
      rotatePiece(1);
      lastTap = now;
    }
  });
}

  function promptInitials() {
    const initials = prompt("🎉 NEW HIGH SCORE! Enter your initials:", highScoreInitials || '---');
    if (initials) {
      const clean = initials.toUpperCase().substring(0, 3);
      localStorage.setItem('teprisHighScoreInitials', clean);
      return clean;
    }
    return highScoreInitials;
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

  function drawGhostPiece() {
    if (!current) return;
    let ghostY = pos.y;
    while (!collide(arena, { matrix: current, pos: { x: pos.x, y: ghostY + 1 } })) {
      ghostY++;
    }
    drawMatrix(current, { x: pos.x, y: ghostY }, context, blockSize, '#888', 0.3);
  }

  function draw() {
    context.fillStyle = '#111';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(arena, { x: 0, y: 0 });
    drawGhostPiece();
    if (current) drawMatrix(current, pos);

    if (previewBox && next) {
      previewCtx.clearRect(0, 0, previewBox.width, previewBox.height);
      const scale = Math.floor(previewBox.width / 4);
      drawMatrix(next, { x: 1, y: 1 }, previewCtx, scale, '#0f0', 0.8);
    }
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
    playSafe(rotateSound);
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
      if (arena[y].every(val => val !== 0)) {
        rowsToClear.push(y);
      }
    }

    if (rowsToClear.length > 0) {
      rowsToClear.forEach(y => {
        for (let x = 0; x < cols; x++) {
          flashingCells.push({ x, y });
        }
      });

      flashStartTime = performance.now();

      // Immediately play sound if it's a Tetris (before any delay)
      if (rowsToClear.length === 4) {
        console.log("🎉 TETRIS! Triggering sound early.");
        playSafe(tetrisSound);
        triggerTetrisEffect();
      }

      setTimeout(() => {
        rowsToClear.sort((a, b) => a - b); // Ensure proper top-down removal
        rowsToClear.forEach(y => {
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

  function triggerTetrisEffect() {
    const canvasWrapper = document.getElementById('tetris-container') || document.body;
    canvasWrapper.classList.add('tetris-flash');
    setTimeout(() => {
      canvasWrapper.classList.remove('tetris-flash');
    }, 500);
  }

  function updateScore() {
    scoreDisplay.textContent = score;
    highScoreDisplay.textContent = `${highScoreInitials} ${highScore}`;
    if (levelDisplay) levelDisplay.textContent = level;
    if (linesDisplay) linesDisplay.textContent = linesCleared;
  }

  function resetPiece() {
    current = next || randomPiece();
    next = randomPiece();
    pos.y = 0;
    pos.x = ((cols / 2) | 0) - ((current[0].length / 2) | 0);
    if (collide(arena, { matrix: current, pos })) {
      console.warn('💀 GAME OVER');
      if (score > highScore) {
        highScore = score;
        highScoreInitials = promptInitials();
        localStorage.setItem('teprisHighScore', score);
      }
      arena = createMatrix(cols, rows);
      score = 0;
      level = 0;
      linesCleared = 0;
      dropInterval = 1000;
      updateScore();
    }
  }

  function randomPiece() {
    const keys = Object.keys(pieces);
    return createPiece(keys[Math.floor(Math.random() * keys.length)]);
  }

  function update(time = 0) {
    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
      drop();
    }
    draw();
    if (running) requestAnimationFrame(update);
  }

  document.addEventListener('keydown', event => {
    if (!running) return;

    if (event.key.toLowerCase() === 'p' || event.key === 'Enter') {
      paused = !paused;
      console.log(paused ? '⏸️ Game paused' : '▶️ Game resumed');
      if (paused) {
        bgMusic.pause();
      } else {
        bgMusic.play().catch(err => console.warn("🔇 Music resume failed:", err));
        requestAnimationFrame(update); // Resume loop on unpause
      }
      return;
    }

    if (paused) return;

    switch (event.key) {
      case 'ArrowLeft':
        pos.x--;
        if (collide(arena, { matrix: current, pos })) pos.x++;
        break;
      case 'ArrowRight':
        pos.x++;
        if (collide(arena, { matrix: current, pos })) pos.x--;
        break;
      case 'ArrowDown':
        drop();
        break;
      case 'ArrowUp':
        rotatePiece(1);
        break;
      case ' ':
        hardDrop();
        break;
    }
  });

  function update(time = 0) {
    if (paused) return;

    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;

    if (dropCounter > dropInterval) {
      drop();
    }

    draw();
    if (running) requestAnimationFrame(update);
  }

  function sweep() {
    flashingCells = [];
    let rowsToClear = [];

    for (let y = rows - 1; y >= 0; y--) {
      if (arena[y].every(val => val !== 0)) {
        rowsToClear.push(y);
      }
    }

    if (rowsToClear.length > 0) {
      rowsToClear.forEach(y => {
        for (let x = 0; x < cols; x++) {
          flashingCells.push({ x, y });
        }
      });

      flashStartTime = performance.now();

      setTimeout(() => {
        rowsToClear.sort((a, b) => a - b);
        rowsToClear.forEach(y => {
          arena.splice(y, 1);
          arena.unshift(Array(cols).fill(0));
        });

        linesCleared += rowsToClear.length;
        score += rowsToClear.length === 4 ? 1200 : rowsToClear.length * 100;
        level = Math.floor(linesCleared / 10);
        dropInterval = Math.max(100, 1000 - level * 100);

        if (rowsToClear.length === 4) {
          console.log("🎉 TETRIS! Triggering sound late.");
          playSafe(tetrisSound);
          triggerTetrisEffect();
        } else {
          playSafe(pointsSound);
        }

        updateScore();
      }, flashDuration);
    }
  }

addTouchControls();

  window.startTetris = function startTetris() {
    if (running) return;
    playSafe(startSound);
    bgMusic.volume = 0.5;
    playSafe(bgMusic);
    arena = createMatrix(cols, rows);
    current = randomPiece();
    next = randomPiece();
    updateScore();
    resizeCanvas();
    resizePreviewBox();
    running = true;
    update();
  };

  resizeCanvas();
  resizePreviewBox();
});