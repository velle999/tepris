// ===== TEPRIS.JS - CLEANED, FIXED AND FUNCTIONAL =====

let score = 0;
let highScore = 0;
let highScoreInitials = '---';
let canvas, context;
let previewCanvas, previewContext;
let running = false;
let paused = false;
let blockSize = 20;
let rows = 20;
let cols = 10;
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let posX = 0;
let posY = 0;
let currentPiece = null;
let nextPiece = null;
let currentColor = 'cyan';
let nextColor = 'magenta';
const colors = ['cyan', 'magenta', 'yellow', 'lime', 'orange', 'red', 'blue'];

const tetrominoes = [
  [[1, 1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 1], [1, 1, 0]],
  [[1, 1, 0], [0, 1, 1]]
];

function createMatrix(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

let playfield = createMatrix(rows, cols);

function collide(field, piece, offsetX, offsetY) {
  return piece.some((row, y) =>
    row.some((val, x) =>
      val && (
        y + offsetY >= rows ||
        x + offsetX < 0 ||
        x + offsetX >= cols ||
        field[y + offsetY]?.[x + offsetX]
      )
    )
  );
}

function merge(field, piece, offsetX, offsetY, color) {
  piece.forEach((row, y) =>
    row.forEach((val, x) => {
      if (val) field[y + offsetY][x + offsetX] = color;
    })
  );
}

function drawMatrix(matrix, offsetX = 0, offsetY = 0, ghost = false) {
  matrix.forEach((row, y) => {
    row.forEach((val, x) => {
      if (val) {
        context.fillStyle = ghost ? 'rgba(255,255,255,0.2)' : (typeof val === 'string' ? val : currentColor);
        context.fillRect((x + offsetX) * blockSize, (y + offsetY) * blockSize, blockSize - 1, blockSize - 1);
      }
    });
  });
}

function drawPreview() {
  if (!previewCanvas) {
    previewCanvas = document.createElement('canvas');
    previewCanvas.width = 100;
    previewCanvas.height = 100;
    document.getElementById('preview-box').appendChild(previewCanvas);
    previewContext = previewCanvas.getContext('2d');
  }
  previewContext.clearRect(0, 0, 100, 100);
  previewContext.fillStyle = nextColor;
  nextPiece.forEach((row, y) =>
    row.forEach((val, x) => {
      if (val) previewContext.fillRect(x * 20, y * 20, 18, 18);
    })
  );
}

function drawGhostPiece() {
  let ghostY = posY;
  while (!collide(playfield, currentPiece, posX, ghostY + 1)) ghostY++;
  drawMatrix(currentPiece, posX, ghostY, true);
}

function drawTetris(time = 0) {
  if (!running) return;

  requestAnimationFrame(drawTetris); // keep looping, paused or not
  if (paused) return;

  const deltaTime = time - lastTime;
  lastTime = time;
  dropCounter += deltaTime;

  if (dropCounter > dropInterval) {
    posY++;
    if (collide(playfield, currentPiece, posX, posY)) {
      posY--;
      merge(playfield, currentPiece, posX, posY, currentColor);
      clearRows();
      spawnNewPiece();
    }
    dropCounter = 0;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawMatrix(playfield);
  drawGhostPiece();
  drawMatrix(currentPiece, posX, posY);
}

function togglePause() {
  if (!running) return;

  paused = !paused;
  console.log(paused ? "⏸️ Paused" : "▶️ Resumed");

  const overlay = document.getElementById('ready-overlay');
  if (paused) {
    overlay.textContent = '⏸️ PAUSED';
    overlay.style.opacity = 1;
  } else {
    overlay.style.opacity = 0;
    lastTime = performance.now(); // prevent jump on resume
  }
}

function spawnNewPiece() {
  currentPiece = nextPiece || randomPiece();
  currentColor = nextColor;
  nextPiece = randomPiece();
  nextColor = randomColor();
  drawPreview();
  posX = Math.floor(cols / 2) - Math.floor(currentPiece[0].length / 2);
  posY = 0;

  if (collide(playfield, currentPiece, posX, posY)) {
    running = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawMatrix(playfield);
    setTimeout(() => {
      if (score > highScore) {
        let initials = prompt('🏆 New High Score! Enter your initials (3 letters):', '').toUpperCase().slice(0, 3) || '---';
        highScoreInitials = initials;
        highScore = score;
        saveHighScoreLocal(initials, highScore);
      }
      loadHighScores().then(updateScoreboard);
      alert('💀 GAME OVER! Press the button to play again.');
      playfield = createMatrix(rows, cols);
    }, 300);
  }
}

function clearRows() {
  let cleared = 0;
  for (let y = rows - 1; y >= 0; y--) {
    if (playfield[y].every(v => v !== 0)) {
      playfield.splice(y, 1);
      playfield.unshift(new Array(cols).fill(0));
      cleared++;
      y++;
    }
  }
  if (cleared) updateScore(cleared * 100);
}

function updateScore(p) {
  score += p;
  document.getElementById('score').textContent = score;
}

function updateScoreboard() {
  document.getElementById('score').textContent = score;
  document.getElementById('highScore').textContent = `${highScore} (${highScoreInitials})`;
}

function tryRotateClockwise() {
  const rotated = rotateClockwise(currentPiece);
  if (!collide(playfield, rotated, posX, posY)) currentPiece = rotated;
  else if (!collide(playfield, rotated, posX - 1, posY)) { posX--; currentPiece = rotated; }
  else if (!collide(playfield, rotated, posX + 1, posY)) { posX++; currentPiece = rotated; }
}

function rotateClockwise(matrix) {
  return matrix[0].map((_, i) => matrix.map(row => row[i]).reverse());
}

function randomPiece() {
  return tetrominoes[Math.floor(Math.random() * tetrominoes.length)];
}

function randomColor() {
  return colors[Math.floor(Math.random() * colors.length)];
}

function saveHighScoreLocal(initials, score) {
  localStorage.setItem('teprisHighScore', JSON.stringify({ initials, score }));
}

function loadHighScores() {
  return new Promise(resolve => {
    const saved = JSON.parse(localStorage.getItem('teprisHighScore'));
    const table = document.getElementById('highscore-table');
    table.innerHTML = '';
    if (saved && saved.score) {
      highScore = saved.score;
      highScoreInitials = saved.initials || '---';
      const row = document.createElement('tr');
      row.innerHTML = `<td>#1</td><td>${highScoreInitials}</td><td>${highScore}</td>`;
      row.style.color = 'gold';
      table.appendChild(row);
    }
    resolve();
  });
}

function isValidMove(piece, offsetX, offsetY) {
  return piece.every((row, y) =>
    row.every((val, x) => {
      if (!val) return true;
      const newX = x + offsetX;
      const newY = y + offsetY;
      return newX >= 0 && newX < cols && newY < rows && playfield[newY][newX] === 0;
    })
  );
}

function setupScoreboard() {
  if (!document.getElementById('scoreboard')) {
    const scoreboard = document.createElement('div');
    scoreboard.id = 'scoreboard';
    scoreboard.innerHTML = `Score: <span id="score">0</span> | High Score: <span id="highScore">0 (---)</span>`;
    document.body.appendChild(scoreboard);
  }
}

function showReadyGoOverlay(callback) {
  const overlay = document.getElementById('ready-overlay');
  const sound = document.getElementById('start-sound');
  let count = 3;
  overlay.style.opacity = 1;
  overlay.textContent = count;
  sound?.play?.();
  const tick = () => {
    count--;
    if (count === 0) {
      overlay.textContent = 'GO!';
      setTimeout(() => {
        overlay.style.opacity = 0;
        callback();
      }, 600);
    } else {
      overlay.textContent = count;
      setTimeout(tick, 600);
    }
  };
  setTimeout(tick, 600);
}

['left-btn', 'right-btn', 'rotate-btn', 'down-btn'].forEach(id => {
  document.getElementById(id)?.addEventListener('pointerdown', () => {
    if (!running) return;
    switch (id) {
      case 'left-btn': if (isValidMove(currentPiece, posX - 1, posY)) posX--; break;
      case 'right-btn': if (isValidMove(currentPiece, posX + 1, posY)) posX++; break;
      case 'rotate-btn': tryRotateClockwise(); break;
      case 'down-btn':
        while (isValidMove(currentPiece, posX, posY + 1)) posY++;
        merge(playfield, currentPiece, posX, posY, currentColor);
        clearRows();
        spawnNewPiece();
        break;
    }
  });
});

function setupSwipeControls() {
  let startX = 0;
  let startY = 0;
  let startTime = 0;

document.addEventListener('touchstart', (e) => {
  if (e.target.closest('#tetris')) e.preventDefault();
}, { passive: false });

document.addEventListener('touchmove', (e) => {
  if (e.target.closest('#tetris')) e.preventDefault();
}, { passive: false });


  document.addEventListener('touchend', (e) => {
    if (!running || paused) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.screenX - startX;
    const deltaY = touch.screenY - startY;
    const elapsed = Date.now() - startTime;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > absY && absX > 30) {
      if (deltaX > 0) {
        if (isValidMove(currentPiece, posX + 1, posY)) posX++; // right
      } else {
        if (isValidMove(currentPiece, posX - 1, posY)) posX--; // left
      }
    } else if (absY > 30) {
      if (deltaY > 0) {
        // Swipe down: hard drop if fast, soft drop otherwise
        if (elapsed < 200) {
          while (isValidMove(currentPiece, posX, posY + 1)) posY++;
          merge(playfield, currentPiece, posX, posY, currentColor);
          updateScore(10);
          clearRows();
          spawnNewPiece();
        } else {
          if (isValidMove(currentPiece, posX, posY + 1)) posY++;
        }
      } else {
        // Swipe up: rotate
        tryRotateClockwise();
      }
    }
  });
}
function setupKeyboardControls() {
  document.addEventListener('keydown', (e) => {
    if (!running) return;

    const key = e.key.toLowerCase();

    if (key === 'enter' || key === 'p') {
      e.preventDefault();
      togglePause();
      return;
    }

    if (paused) return;

    switch (key) {
      case 'arrowleft':
      case 'a':
        if (isValidMove(currentPiece, posX - 1, posY)) {
          posX--;
        }
        break;

      case 'arrowright':
      case 'd':
        if (isValidMove(currentPiece, posX + 1, posY)) {
          posX++;
        }
        break;

      case 'arrowup':
      case 'w':
      case 'x':
        tryRotateClockwise();
        break;

      case 'arrowdown':
      case 's':
        if (isValidMove(currentPiece, posX, posY + 1)) {
          posY++;
        }
        break;

      case ' ':
        e.preventDefault(); // stop scroll AND fix repeat
        if (!paused) {
          // Single hard drop
          while (isValidMove(currentPiece, posX, posY + 1)) posY++;
          merge(playfield, currentPiece, posX, posY, currentColor);
          updateScore(10);
          clearRows();
          spawnNewPiece();
        }
        break;
    }
  }, { passive: false }); // Prevent passive behavior to block default
}

function togglePause() {
  if (!running) return;

  paused = !paused;
  console.log(paused ? "⏸️ Paused" : "▶️ Resumed");

  const overlay = document.getElementById('ready-overlay');
  if (paused) {
    overlay.textContent = '⏸️ PAUSED';
    overlay.style.opacity = 1;
  } else {
    overlay.style.opacity = 0;
    // Immediately resume drawing — reset timer so frame delta doesn't explode
    lastTime = performance.now();
    requestAnimationFrame(drawTetris);
  }
}

window.startTetris = function () {
  showReadyGoOverlay(() => {
    running = true;

    canvas = document.getElementById('tetris');
    context = canvas.getContext('2d');

    const screenWidth = window.innerWidth;
    blockSize = Math.floor(screenWidth / cols / 1.5);

    const scale = window.devicePixelRatio || 1;
    canvas.width = cols * blockSize * scale;
    canvas.height = rows * blockSize * scale;
    context.setTransform(scale, 0, 0, scale, 0, 0);

    playfield = createMatrix(rows, cols);
    nextPiece = randomPiece();
    nextColor = randomColor();
    spawnNewPiece();
    score = 0;
    lastTime = 0;
    dropCounter = 0;

    setupScoreboard();
    updateScoreboard();
    requestAnimationFrame(drawTetris);

    setupSwipeControls();     // mobile
    setupKeyboardControls();  // desktop
  });
};


document.addEventListener('DOMContentLoaded', () => {
  setupScoreboard();
  loadHighScores().then(updateScoreboard);
  document.getElementById('tetris-toggle').addEventListener('pointerdown', () => {
    if (!running && typeof window.startTetris === 'function') {
      window.startTetris();
    } else {
      console.error('startTetris is not defined.');
    }
  });
});
