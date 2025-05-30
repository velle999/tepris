// ============================================================================
//    TEPRIS ENGINE: RGB SLIDE + BG + FLASH LINES + GAMEPAD + BUG-FREE TOUCH
//    2025 Velle & ChatGPT: Because normal Tetris is for cowards
// ============================================================================

const COLS = 10, ROWS = 20;
let blockSize = 24;
let arena, current, next, hold, canHold, pos;
let score = 0, highScore = 0, highScoreInitials = "---", level = 0, linesCleared = 0;
let running = false, paused = false, overlayMenuActive = false;
let flashingCells = [], flashStartTime = 0, flashDuration = 400;
let dropInterval = 1000, dropCounter = 0, lastTime = 0;
let canvas, ctx, previewBox, previewCtx, scoreDisplay, highScoreDisplay, levelDisplay, linesDisplay;
let bgMusic, coinSound, rotateSound, pointsSound, tetrisSound, startSound;

const bgTracks = [
  'assets/background.mp3',
  'assets/bg-2.mp3',
  'assets/bg-3.mp3'
];
let currentTrackIndex = Math.floor(Math.random() * bgTracks.length);

let overlayMenuItems = [], overlayMenuIndex = 0;
const PAUSE_MENU_ITEMS = ['resume-btn', 'mute-btn', 'input-toggle-btn'];

const CRT_EFFECT = true, VHS_EFFECT = true;

const pieces = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]]
};

let dpadHold = { left: false, right: false, down: false };
let stickHold = { left: false, right: false, down: false };
let dpadTimers = { left: null, right: null, down: null };
let stickTimers = { left: null, right: null, down: null };
const INITIAL_DELAY = 220, REPEAT_RATE = 40;

let lastButtonStates = Array(17).fill(false);
let gamepadPollActive = false;

let rgbMode = false;
let isFlashing = false;

// ========== Utility & Rendering ==========

function getRGBColor(t) {
  const r = Math.floor(128 + 128 * Math.sin(t/600));
  const g = Math.floor(128 + 128 * Math.sin(t/600 + 2));
  const b = Math.floor(128 + 128 * Math.sin(t/600 + 4));
  return `rgb(${r},${g},${b})`;
}
function setRGBBackground(enable) {
  const el = document.getElementById('tepris-background') || document.body;
  if (enable) {
    el.style.animation = "bgScreensaver 2s linear infinite";
    el.style.background = "linear-gradient(270deg, #f00, #0f0, #00f, #ff0, #0ff, #f0f, #fff)";
    el.style.backgroundSize = "1200% 1200%";
  } else {
    el.style.animation = "";
    el.style.background = "";
    el.style.backgroundSize = "";
  }
}
function saveHighScore() {
  localStorage.setItem('teprisHighScore', highScore);
  localStorage.setItem('teprisHighScoreInitials', highScoreInitials);
}
function loadHighScore() {
  highScore = parseInt(localStorage.getItem('teprisHighScore')) || 0;
  highScoreInitials = localStorage.getItem('teprisHighScoreInitials') || "---";
}
function createMatrix(w, h) { return Array.from({ length: h }, () => Array(w).fill(0)); }
function createPiece(type) { return pieces[type].map(r => [...r]); }
function randomPiece() {
  const keys = Object.keys(pieces);
  return createPiece(keys[Math.floor(Math.random() * keys.length)]);
}
function playSafe(audio) {
  if (!audio || typeof audio.play !== 'function') return;
  try { audio.pause(); audio.currentTime = 0; audio.play().catch(()=>{}); } catch {}
}

// ========== Rendering ==========

function drawMatrix(matrix, offset, _ctx = ctx, size = blockSize, color = "#0ff", opacity = 1) {
  if (!matrix || !offset || !_ctx) return;
  _ctx.save();
  _ctx.globalAlpha = opacity;
  const t = performance.now();
  matrix.forEach((row, y) => row.forEach((val, x) => {
    if (val) {
      const gx = x + offset.x, gy = y + offset.y, now = t + gx*77 + gy*99;
      let fillC = rgbMode ? getRGBColor(now) : color;
      if (flashingCells.some(c=>c.x===gx&&c.y===gy)) fillC = "#fff";
      _ctx.fillStyle = fillC;
      _ctx.fillRect(gx*size, gy*size, size, size);
      _ctx.strokeStyle = "#000";
      _ctx.strokeRect(gx*size, gy*size, size, size);
    }
  }));
  _ctx.restore();
}
function drawGhostPiece() {
  if (!current) return;
  let ghostY = pos.y;
  while (!collide(arena, { matrix: current, pos: { x: pos.x, y: ghostY + 1 } })) ghostY++;
  drawMatrix(current, { x: pos.x, y: ghostY }, ctx, blockSize, rgbMode ? getRGBColor(performance.now()+888) : "#888", 0.3);
}
function drawCRTOverlay(_ctx) {
  if (!CRT_EFFECT) return;
  const { width, height } = _ctx.canvas;
  _ctx.save(); _ctx.globalAlpha = 0.05; _ctx.fillStyle = "#0f0";
  for (let y=0; y<height; y+=2) _ctx.fillRect(0, y, width, 1);
  _ctx.restore();
}
function drawVHSTracking(_ctx) {
  if (!VHS_EFFECT) return;
  const w=_ctx.canvas.width, h=_ctx.canvas.height, offset=Math.random()*4-2;
  _ctx.save(); _ctx.globalAlpha=0.03; _ctx.translate(offset,0); _ctx.fillStyle="#0ff";
  for (let y=0; y<h; y+=8) _ctx.fillRect(0, y+Math.sin(y*0.1+Date.now()/100)*2, w, 1);
  _ctx.restore();
}
function draw() {
  ctx.fillStyle = rgbMode ? getRGBColor(performance.now()) : "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (arena) drawMatrix(arena, { x: 0, y: 0 });
  drawGhostPiece();
  if (current && pos) drawMatrix(current, pos);
  if (previewBox && next) {
    previewCtx.clearRect(0,0,previewBox.width,previewBox.height);
    const scale = Math.floor(previewBox.width/4);
    if (next) drawMatrix(next, { x: 1, y: 1 }, previewCtx, scale, rgbMode ? getRGBColor(performance.now()+333) : "#0f0", 0.8);
  }
  drawVHSTracking(ctx);
  drawCRTOverlay(ctx);
}

// ========== Game Logic ==========

function movePiece(dir) {
  if (!running || paused || overlayMenuActive || isFlashing) return;
  if (dir === "left")  { pos.x--; if (collide(arena, { matrix: current, pos })) pos.x++; }
  if (dir === "right") { pos.x++; if (collide(arena, { matrix: current, pos })) pos.x--; }
  if (dir === "down")  drop();
}
function startRepeat(dir, isDpad) {
  if (overlayMenuActive) return;
  if (isDpad) {
    dpadHold[dir] = true;
    if (dpadTimers[dir]) clearTimeout(dpadTimers[dir]);
    movePiece(dir);
    dpadTimers[dir] = setTimeout(function repeat() {
      if (dpadHold[dir]) {
        movePiece(dir);
        dpadTimers[dir] = setTimeout(repeat, REPEAT_RATE);
      }
    }, INITIAL_DELAY);
  } else {
    stickHold[dir] = true;
    if (stickTimers[dir]) clearTimeout(stickTimers[dir]);
    movePiece(dir);
    stickTimers[dir] = setTimeout(function repeat() {
      if (stickHold[dir]) {
        movePiece(dir);
        stickTimers[dir] = setTimeout(repeat, REPEAT_RATE);
      }
    }, INITIAL_DELAY);
  }
}
function stopRepeat(dir, isDpad) {
  if (isDpad) { dpadHold[dir] = false; if (dpadTimers[dir]) clearTimeout(dpadTimers[dir]); }
  else { stickHold[dir] = false; if (stickTimers[dir]) clearTimeout(stickTimers[dir]); }
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
  player.matrix.forEach((row, y) => row.forEach((val, x) => {
    if (val) arena[y + player.pos.y][x + player.pos.x] = 1;
  }));
}
function rotateMatrix(matrix, dir) {
  const rows = matrix.length, cols = matrix[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      rotated[dir > 0 ? x : cols - 1 - x][dir > 0 ? rows - 1 - y : y] = matrix[y][x];
  return rotated;
}
function rotatePiece(dir) {
  if (overlayMenuActive || isFlashing) return;
  const rotated = rotateMatrix(current, dir);
  const oldX = pos.x;
  let offset = 1;
  while (collide(arena, { matrix: rotated, pos })) {
    pos.x += offset;
    offset = -(offset + (offset > 0 ? 1 : -1));
    if (offset > rotated[0].length) { pos.x = oldX; return; }
  }
  current = rotated;
  playSafe(rotateSound);
}
function resetPiece() {
  canHold = true;
  current = next || randomPiece();
  next = randomPiece();
  pos = { x: ((COLS / 2) | 0) - ((current[0].length / 2) | 0), y: 0 };
  if (collide(arena, { matrix: current, pos })) {
    // GAME OVER!
    if (score > highScore) {
      paused = true;
      promptInitialsModal((val) => {
        highScore = score;
        highScoreInitials = val;
        saveHighScore();
        updateScore();
        paused = false;
        rgbMode = false; setRGBBackground(false);
        running = false;
        showGameOverMenu();
      });
    } else {
      rgbMode = false; setRGBBackground(false);
      running = false; paused = false;
      showGameOverMenu();
    }
    return;
  }
}
function drop() {
  if (!running || paused || overlayMenuActive || isFlashing) return;
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
  if (!running || paused || overlayMenuActive || isFlashing) return;
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
  for (let y = ROWS - 1; y >= 0; y--)
    if (arena[y].every(v => v !== 0)) rowsToClear.push(y);

  if (rowsToClear.length) {
    rowsToClear.forEach(y => {
      for (let x = 0; x < COLS; x++) flashingCells.push({ x, y });
    });
    flashStartTime = performance.now();
    isFlashing = true;

    if (rowsToClear.length === 4) { playSafe(tetrisSound); screenShake(); triggerTetrisEffect(); }
    else playSafe(pointsSound);
    pulseScore();

    function finishFlash() {
      rowsToClear.sort((a,b)=>a-b).forEach(y => {
        arena.splice(y,1);
        arena.unshift(Array(COLS).fill(0));
      });
      linesCleared += rowsToClear.length;
      score += rowsToClear.length === 4 ? 1200 : rowsToClear.length * 100;
      level = Math.floor(linesCleared / 10);
      dropInterval = Math.max(100, 1000 - level * 100);
      updateScore();
      flashingCells = [];
      isFlashing = false;
      if (running) requestAnimationFrame(update);
    }

    setTimeout(finishFlash, flashDuration);
    requestAnimationFrame(update);
  }
}

// ========== UI / FX ==========

function updateScore() {
  if (scoreDisplay) scoreDisplay.textContent = score;
  if (highScoreDisplay) highScoreDisplay.textContent = `${highScoreInitials} ${highScore}`;
  if (levelDisplay) levelDisplay.textContent = level;
  if (linesDisplay) linesDisplay.textContent = linesCleared;
  if (!rgbMode && score > highScore) {
    rgbMode = true;
    setRGBBackground(true);
  }
}
function pulseScore() {
  if (!scoreDisplay) return;
  scoreDisplay.classList.add('pulse');
  setTimeout(() => scoreDisplay.classList.remove('pulse'), 300);
}
function showInsertCoinPrompt(duration = 3000) {
  const insertCoin = document.getElementById('insert-coin');
  if (insertCoin) {
    insertCoin.style.display = 'block';
    setTimeout(() => { insertCoin.style.display = 'none'; }, duration);
  }
}
function screenShake(intensity = 4, duration = 200) {
  const canvas = document.getElementById('tetris');
  const originalTransform = canvas.style.transform;
  let start = performance.now();
  function shake() {
    const elapsed = performance.now() - start;
    if (elapsed < duration) {
      const dx = (Math.random() - 0.5) * intensity;
      const dy = (Math.random() - 0.5) * intensity;
      canvas.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(shake);
    } else {
      canvas.style.transform = originalTransform;
    }
  }
  shake();
}
function triggerTetrisEffect() {
  const container = document.getElementById('tetris-container') || document.body;
  container.classList.add('tetris-flash');
  setTimeout(() => container.classList.remove('tetris-flash'), 500);
}
function promptInitialsModal(callback) {
  const modal = document.getElementById('initials-modal');
  const input = document.getElementById('initials-input');
  const ok = document.getElementById('submit-initials');
  if (!modal || !input || !ok) {
    alert('Initials modal missing!');
    callback('---');
    return;
  }
  modal.style.display = 'flex';
  input.value = '';
  setTimeout(() => input.focus(), 100);
  function cleanup() {
    modal.style.display = 'none';
    ok.removeEventListener('click', onSubmit);
    input.removeEventListener('keydown', onKeyDown);
  }
  function onSubmit() {
    let val = input.value.trim().toUpperCase().substring(0, 3);
    if (!val) val = "---";
    cleanup();
    callback(val);
  }
  function onKeyDown(e) {
    if (e.key === 'Enter') onSubmit();
    if (e.key === 'Escape') {
      cleanup();
      callback("---");
    }
  }
  ok.addEventListener('click', onSubmit);
  input.addEventListener('keydown', onKeyDown);
}

// ========== Keyboard Input ==========

document.addEventListener('keydown', (e) => {
  if (overlayMenuActive) {
    if (e.key === "ArrowDown") { overlayMenuIndex = (overlayMenuIndex + 1) % overlayMenuItems.length; highlightOverlayMenuItem(); e.preventDefault(); }
    if (e.key === "ArrowUp") { overlayMenuIndex = (overlayMenuIndex - 1 + overlayMenuItems.length) % overlayMenuItems.length; highlightOverlayMenuItem(); e.preventDefault(); }
    if (e.key === "Enter" || e.key === " ") { overlayMenuItems[overlayMenuIndex].click(); e.preventDefault(); }
    return;
  }
  if (!running && (e.key === 'Enter' || e.code === 'Enter')) { window.startTetris?.(); return; }
  if (!running) return;
  if (e.key.toLowerCase() === 'p' || e.key === 'Enter') { paused = !paused; setPauseState(paused); return; }
  if (paused || isFlashing) return;
  switch (e.key) {
    case 'ArrowLeft': movePiece('left'); break;
    case 'ArrowRight': movePiece('right'); break;
    case 'ArrowDown': movePiece('down'); break;
    case 'ArrowUp': rotatePiece(1); break;
    case ' ': hardDrop(); break;
    case 'Shift':
      if (!canHold) break;
      if (!hold) { hold = current; current = next; next = randomPiece(); }
      else { [current, hold] = [hold, current]; }
      pos = { x: ((COLS / 2) | 0) - ((current[0].length / 2) | 0), y: 0 };
      canHold = false;
      break;
  }
});

// ========== Gamepad Polling ==========

function pollOverlayMenuGamepad() {
  if (!overlayMenuActive) return;
  const gp = navigator.getGamepads?.()[0];
  if (!gp) return requestAnimationFrame(pollOverlayMenuGamepad);
  let navDown = gp.buttons[13]?.pressed || (gp.axes[1] > 0.5);
  let navUp   = gp.buttons[12]?.pressed || (gp.axes[1] < -0.5);
  if (!window._lastOverlayNav) window._lastOverlayNav = { up: false, down: false, btn: false };
  if (navDown && !window._lastOverlayNav.down) {
    overlayMenuIndex = (overlayMenuIndex + 1) % overlayMenuItems.length;
    highlightOverlayMenuItem();
  }
  if (navUp && !window._lastOverlayNav.up) {
    overlayMenuIndex = (overlayMenuIndex - 1 + overlayMenuItems.length) % overlayMenuItems.length;
    highlightOverlayMenuItem();
  }
  const btnA = gp.buttons[0]?.pressed, btnStart = gp.buttons[9]?.pressed;
  if ((btnA || btnStart) && !window._lastOverlayNav.btn) {
    overlayMenuItems[overlayMenuIndex].click();
  }
  window._lastOverlayNav = { up: navUp, down: navDown, btn: (btnA || btnStart) };
  requestAnimationFrame(pollOverlayMenuGamepad);
}

function startGamepadPolling() {
  if (gamepadPollActive) return;
  gamepadPollActive = true;
  requestAnimationFrame(pollGamepad);
}
function resetGamepadPolling() {
  gamepadPollActive = false;
  setTimeout(startGamepadPolling, 0);
}
function pollGamepad() {
  if (!gamepadPollActive) return;
  const gp = navigator.getGamepads?.()[0];
  if (!gp) return requestAnimationFrame(pollGamepad);
  if (!running) {
    const anyPressed = gp.buttons.some((b, idx) => b.pressed && !lastButtonStates[idx]) ||
      (Math.abs(gp.axes[0]) > 0.5 && !lastButtonStates._stickX) ||
      (Math.abs(gp.axes[1]) > 0.5 && !lastButtonStates._stickY);
    if (anyPressed) window.startTetris?.();
    lastButtonStates = gp.buttons.map(b => b.pressed);
    lastButtonStates._stickX = Math.abs(gp.axes[0]) > 0.5;
    lastButtonStates._stickY = Math.abs(gp.axes[1]) > 0.5;
    return requestAnimationFrame(pollGamepad);
  }
  if (!paused && running) {
    if (gp.buttons[14]?.pressed) { if (!lastButtonStates[14]) startRepeat('left', true); } else stopRepeat('left', true);
    if (gp.buttons[15]?.pressed) { if (!lastButtonStates[15]) startRepeat('right', true); } else stopRepeat('right', true);
    if (gp.buttons[13]?.pressed) { if (!lastButtonStates[13]) startRepeat('down', true); } else stopRepeat('down', true);
    if (gp.axes[0] < -0.5) { if (!lastButtonStates._stickLeft) startRepeat('left', false); } else stopRepeat('left', false);
    if (gp.axes[0] > 0.5)  { if (!lastButtonStates._stickRight) startRepeat('right', false); } else stopRepeat('right', false);
    if (gp.axes[1] > 0.5)  { if (!lastButtonStates._stickDown) startRepeat('down', false); } else stopRepeat('down', false);
    gp.buttons.forEach((btn, idx) => {
      const wasPressed = lastButtonStates[idx], justPressed = btn.pressed && !wasPressed;
      if (justPressed) switch (idx) {
        case 0: rotatePiece(1); break;
        case 1: hardDrop(); break;
        case 2:
          if (canHold) {
            if (!hold) { hold = current; current = next; next = randomPiece(); }
            else { [current, hold] = [hold, current]; }
            pos = { x: ((COLS / 2) | 0) - ((current[0].length / 2) | 0), y: 0 };
            canHold = false;
          }
          break;
        case 3: movePiece('down'); break;
        case 9: setPauseState(!paused); break;
      }
    });
  }
  lastButtonStates = gp.buttons.map(b => b.pressed);
  lastButtonStates._stickLeft = gp.axes[0] < -0.5;
  lastButtonStates._stickRight = gp.axes[0] > 0.5;
  lastButtonStates._stickDown = gp.axes[1] > 0.5;
  requestAnimationFrame(pollGamepad);
}

// ========== Touch Controls (NEW & BUG-FREE) ==========

// -- IDs of on-screen touch buttons --
const TOUCH_BTN_IDS = [
  'left-btn', 'right-btn', 'down-btn',
  'rotate-btn', 'harddrop-btn', 'hold-btn'
];
function isTouchButtonEvent(e) {
  function checkTarget(t) {
    if (!t || !t.target) return false;
    return TOUCH_BTN_IDS.some(id => {
      const el = document.getElementById(id);
      return el && (t.target === el || el.contains(t.target));
    });
  }
  if (e.touches && e.touches.length)
    for (let i = 0; i < e.touches.length; ++i)
      if (checkTarget(e.touches[i])) return true;
  if (e.changedTouches && e.changedTouches.length)
    for (let i = 0; i < e.changedTouches.length; ++i)
      if (checkTarget(e.changedTouches[i])) return true;
  return checkTarget(e);
}

function addTouchControls() {
  let startX = 0, startY = 0, moved = false, longPressTimer = null, lastTap = 0;
  const threshold = 38, doubleTapGap = 320;

  window.addEventListener('touchstart', e => {
    if (!e.touches || e.touches.length > 2 || overlayMenuActive || isTouchButtonEvent(e)) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; moved = false;
    longPressTimer = setTimeout(() => { navigator.vibrate?.(100); hardDrop(); }, 420);
  }, { passive: false });

  window.addEventListener('touchmove', e => {
    if (!e.touches || e.touches.length > 2 || overlayMenuActive || isTouchButtonEvent(e)) return;
    clearTimeout(longPressTimer);
    const t = e.touches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > threshold) {
        moved = true;
        navigator.vibrate?.(18);
        if (dx > 0) movePiece('right');
        else movePiece('left');
        startX = t.clientX;
      }
    } else if (Math.abs(dy) > threshold && dy > 0) {
      moved = true;
      navigator.vibrate?.(10);
      movePiece('down');
      startY = t.clientY;
    }
  }, { passive: false });

  window.addEventListener('touchend', e => {
    if (isTouchButtonEvent(e)) return;
    clearTimeout(longPressTimer);
    if (e.changedTouches && e.changedTouches.length === 2) {
      navigator.vibrate?.([30,30,30]);
      hardDrop();
      return;
    }
    if (moved) return;
    const now = Date.now();
    if (now - lastTap < doubleTapGap) {
      setPauseState(!paused);
      lastTap = 0;
    } else {
      navigator.vibrate?.(8);
      rotatePiece(1);
      lastTap = now;
    }
  }, { passive: false });

  addTouchButtonListeners();
}

function addTouchButtonListeners() {
  function bindTouchMouse(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    let lastTouch = 0;

    el.addEventListener('touchstart', e => {
      e.preventDefault();
      lastTouch = Date.now();
      fn();
    }, { passive: false });

    el.addEventListener('mousedown', e => {
      if (Date.now() - lastTouch < 500) return;
      e.preventDefault();
      fn();
    });
  }

  bindTouchMouse('left-btn', () => movePiece('left'));
  bindTouchMouse('right-btn', () => movePiece('right'));
  bindTouchMouse('down-btn', () => movePiece('down'));
  bindTouchMouse('rotate-btn', () => rotatePiece(1));
  bindTouchMouse('harddrop-btn', () => hardDrop());
  bindTouchMouse('hold-btn', () => {
    if (canHold) {
      if (!hold) { hold = current; current = next; next = randomPiece(); }
      else { [current, hold] = [hold, current]; }
      pos = { x: ((COLS / 2) | 0) - ((current[0].length / 2) | 0), y: 0 };
      canHold = false;
    } else {
      setPauseState(!paused);
    }
  });
}

// ========== Overlay/Menu System ==========

function setPauseState(state) {
  paused = state;
  if (paused) showPauseMenu();
  else hidePauseMenu();
  if (bgMusic) state ? bgMusic.pause() : bgMusic.play().catch(()=>{});
  if (!state && running) requestAnimationFrame(update);
}
function showPauseMenu() {
  document.getElementById('pause-menu').style.display = 'block';
  overlayMenuActive = true;
  overlayMenuItems = PAUSE_MENU_ITEMS.map(id => document.getElementById(id));
  overlayMenuIndex = 0;
  highlightOverlayMenuItem();
  requestAnimationFrame(pollOverlayMenuGamepad);
}
function hidePauseMenu() {
  document.getElementById('pause-menu').style.display = 'none';
  overlayMenuActive = false;
}
function showGameOverMenu() {
  document.getElementById('gameover-score').textContent = `Score: ${score}`;
  const gameoverMenu = document.getElementById('gameover-menu');
  gameoverMenu.style.display = 'block';
  overlayMenuActive = true;
  overlayMenuItems = [document.getElementById('restart-btn')];
  overlayMenuIndex = 0;
  highlightOverlayMenuItem();
  requestAnimationFrame(pollOverlayMenuGamepad);
}
function hideGameOverMenu() {
  document.getElementById('gameover-menu').style.display = 'none';
  overlayMenuActive = false;
}
function showGame() {
  const wrapper = document.getElementById('tetris-wrapper');
  if (wrapper) wrapper.style.display = 'flex';
  setTimeout(() => { resizeCanvas(); resizePreviewBox(); }, 0);
}
function resizeCanvas() {
  const container = document.getElementById('tetris-container') || document.body;
  const vw = container.clientWidth, vh = window.innerHeight - 160;
  blockSize = Math.max(12, Math.min(40, Math.floor(Math.min(vw/COLS, vh/ROWS))));
  canvas.width = blockSize*COLS; canvas.height = blockSize*ROWS;
  canvas.style.width = `${canvas.width}px`; canvas.style.height = `${canvas.height}px`;
  draw();
}
function resizePreviewBox() {
  const size = Math.min(window.innerWidth * 0.2, 150);
  previewBox.width = size; previewBox.height = size;
  previewBox.style.width = `${size}px`; previewBox.style.height = `${size}px`;
}
function highlightOverlayMenuItem() {
  overlayMenuItems.forEach((btn, idx) => {
    if (btn) {
      btn.classList.toggle('selected', idx === overlayMenuIndex);
      if (idx === overlayMenuIndex) btn.focus();
    }
  });
}

// ========== Main Game Loop ==========

function update(time=0) {
  if (paused || overlayMenuActive) return;
  const deltaTime = time - lastTime; lastTime = time;
  if (!isFlashing) dropCounter += deltaTime;
  if (!isFlashing && dropCounter > dropInterval) drop();
  draw();
  if (running || isFlashing) requestAnimationFrame(update);
}

// ========== Fake BIOS Boot ==========

function fakeBootSequence(cb) {
  const boot=document.createElement('div');
  boot.id='bios-boot'; boot.style="position:absolute;top:0;left:0;width:100%;height:100%;background:#000;color:#0f0;font-family:Courier New,monospace;padding:20px;z-index:9999;";
  const bootText=document.createElement('pre'); bootText.id='boot-text'; bootText.textContent='Booting TEPRIS Engine...'; boot.appendChild(bootText); document.body.appendChild(boot);
  const lines=['Loading assets...','Detecting input hardware...','Mounting ROM...','Verifying shaders...','Calibrating CRT barrel distortion...','>> READY <<'];
  let i=0, interval=setInterval(()=>{if(i<lines.length)bootText.textContent+='\n'+lines[i++];else{clearInterval(interval);setTimeout(()=>{boot.remove();showInsertCoinPrompt();cb?.();},1000);}},400);
}

// ========== INIT ==========

document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('tetris');
  ctx = canvas.getContext('2d');
  previewBox = document.getElementById('preview-box');
  previewCtx = previewBox?.getContext('2d');
  scoreDisplay = document.getElementById('score');
  highScoreDisplay = document.getElementById('highScore');
  levelDisplay = document.getElementById('level');
  linesDisplay = document.getElementById('lines');
  bgMusic = document.getElementById('bg-music');
  coinSound = document.getElementById('coin-sound');
  rotateSound = document.getElementById('rotate-sound');
  pointsSound = document.getElementById('points-sound');
  tetrisSound = document.getElementById('tetris-sound');
  startSound = coinSound;
  loadHighScore();

  // --- BG MUSIC AUTOSHUFLE LOGIC ---
  function setupBgMusicLoop() {
    if (!bgMusic) return;
    bgMusic.removeEventListener('ended', onTrackEnd);
    bgMusic.addEventListener('ended', onTrackEnd);

    function onTrackEnd() {
      let nextIdx = currentTrackIndex;
      if (bgTracks.length > 1) {
        while (nextIdx === currentTrackIndex) {
          nextIdx = Math.floor(Math.random() * bgTracks.length);
        }
      }
      currentTrackIndex = nextIdx;
      bgMusic.src = bgTracks[currentTrackIndex];
      bgMusic.currentTime = 0;
      bgMusic.play().catch((err) => {
        console.warn("Failed to play shuffled track:", err);
      });
    }
  }
  setupBgMusicLoop();

  // Pause menu controls
  const resumeBtn = document.getElementById('resume-btn');
  const muteBtn = document.getElementById('mute-btn');
  const inputToggleBtn = document.getElementById('input-toggle-btn');
  resumeBtn?.addEventListener('click',()=>setPauseState(false));
  muteBtn?.addEventListener('click',()=>{
    bgMusic.muted = !bgMusic.muted;
    muteBtn.textContent = bgMusic.muted ? '🔈 Unmute BGM' : '🔇 Mute BGM';
  });
  inputToggleBtn?.addEventListener('click',()=>{ 
    // "input toggle" actually shuffles tracks in this build. It's a secret.
    let nextIdx = currentTrackIndex;
    while (bgTracks.length > 1 && nextIdx === currentTrackIndex) {
      nextIdx = Math.floor(Math.random() * bgTracks.length);
    }
    currentTrackIndex = nextIdx;
    bgMusic.src = bgTracks[currentTrackIndex];
    bgMusic.currentTime = 0;
    bgMusic.play().catch(()=>{});
  });

  // Game Over Menu
  document.getElementById('restart-btn')?.addEventListener('click', () => {
    hideGameOverMenu();
    running = true; paused = false; rgbMode = false; setRGBBackground(false);
    window.__teprisStarted = true;
    arena = createMatrix(COLS, ROWS);
    current = randomPiece();
    next = randomPiece();
    pos = { x: ((COLS / 2) | 0) - ((current[0].length / 2) | 0), y: 0 };
    score = level = linesCleared = 0;
    dropInterval = 1000;
    updateScore();
    addTouchControls();
    showGame();
    draw();
    drop();
    requestAnimationFrame(update);
    resetGamepadPolling();
  });

  // Pause hotkey
  document.addEventListener('keydown',(e)=>{
    if ((e.key==='Escape'||e.key.toLowerCase()==='p') && !overlayMenuActive)
      setPauseState(!paused);
  });

  // Boot sequence and start game
  fakeBootSequence(()=>{
    document.getElementById('tetris-toggle')?.addEventListener('click', () => {
      window.startTetris();
      if (bgMusic) {
        currentTrackIndex = Math.floor(Math.random() * bgTracks.length);
        bgMusic.src = bgTracks[currentTrackIndex];
        bgMusic.volume = 0.5;
        playSafe(bgMusic);
      }
    });
    window.startTetris = function() {
      if (window.__teprisStarted) return;
      window.__teprisStarted = true;
      playSafe(startSound);
      if (bgMusic) { bgMusic.volume = 0.5; playSafe(bgMusic); }
      arena = createMatrix(COLS, ROWS);
      current = randomPiece();
      next = randomPiece();
      pos = { x: ((COLS / 2) | 0) - ((current[0].length / 2) | 0), y: 0 };
      updateScore();
      addTouchControls();
      showGame();
      draw();
      drop();
      running = true;
      paused = false;
      rgbMode = false;
      setRGBBackground(false);
      requestAnimationFrame(update);

      document.getElementById('insert-coin')?.style.setProperty('display', 'none');
      document.getElementById('tetris-toggle')?.style.setProperty('display', 'none');
      resetGamepadPolling();
    };
  });

  window.addEventListener('resize',()=>{ resizeCanvas(); resizePreviewBox(); });
  window.addEventListener('load', () => { resizeCanvas(); resizePreviewBox(); });

  // --- START THE GAMEPAD LOOP! ---
  startGamepadPolling();
});

// END OF FILE. Go touch grass. Or, if you’re reading this, maybe touch the hold button instead.
