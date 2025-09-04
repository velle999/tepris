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

// ===== Universal Start Trigger =====
function tryStartGame() {
    if (!running) {
        window.startTetris?.();
        hidePauseMenu();
        hideGameOverMenu();
    }
}


// ===== Keyboard Input =====
document.addEventListener('keydown', e => {
    if (overlayMenuActive) {
        if (e.key === "ArrowDown") { overlayMenuIndex = (overlayMenuIndex + 1) % overlayMenuItems.length; highlightOverlayMenuItem(); e.preventDefault(); }
        if (e.key === "ArrowUp") { overlayMenuIndex = (overlayMenuIndex - 1 + overlayMenuItems.length) % overlayMenuItems.length; highlightOverlayMenuItem(); e.preventDefault(); }
        if (e.key === "Enter" || e.key === " ") { overlayMenuItems[overlayMenuIndex].click(); e.preventDefault(); }
        return;
    }

    tryStartGame();
    if (!running) return;

    if (e.key.toLowerCase() === 'p' || e.key === 'Enter') { paused = !paused; setPauseState(paused); return; }
    if ((e.key === 'Escape') && !overlayMenuActive) setPauseState(!paused);
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
            else [current, hold] = [hold, current];
            pos = { x: ((COLS / 2) | 0) - ((current[0].length / 2) | 0), y: 0 };
            canHold = false;
            break;
    }
});

// ===== Gamepad Polling with Haptics =====
// ===== Start Gamepad Polling =====
function startGamepadPolling() {
    if (!gamepadPollActive) {
        gamepadPollActive = true;
        lastButtonStates = [];
        pollGamepad();
    }
}

function pollGamepad() {
    if (!gamepadPollActive) return;

    // --- Get first connected gamepad ---
    const gamepads = navigator.getGamepads?.();
    const gp = Array.from(gamepads).find(g => g); // skip nulls
    if (!gp) return requestAnimationFrame(pollGamepad);

    // --- Start game if not running ---
    const anyPressed = gp.buttons.some((b,i) => b.pressed && !lastButtonStates[i]) ||
                       Math.abs(gp.axes[0]) > 0.5 || Math.abs(gp.axes[1]) > 0.5;
    if (!running && anyPressed) tryStartGame();

    if (!running) {
        lastButtonStates = gp.buttons.map(b => b.pressed);
        lastButtonStates._stickLeft = gp.axes[0] < -0.5;
        lastButtonStates._stickRight = gp.axes[0] > 0.5;
        lastButtonStates._stickDown = gp.axes[1] > 0.5;
        return requestAnimationFrame(pollGamepad);
    }

    if (!paused && running) {
        // --- D-Pad / left stick movement ---
        if (gp.buttons[15]?.pressed) { if (!lastButtonStates[15]) startRepeat('right', true); } else stopRepeat('right', true);
        if (gp.buttons[14]?.pressed) { if (!lastButtonStates[14]) startRepeat('left', true); } else stopRepeat('left', true);
        if (gp.buttons[13]?.pressed) { if (!lastButtonStates[13]) startRepeat('down', true); } else stopRepeat('down', true);
        if (gp.axes[0] < -0.5) { if (!lastButtonStates._stickLeft) startRepeat('left', false); } else stopRepeat('left', false);
        if (gp.axes[0] > 0.5)  { if (!lastButtonStates._stickRight) startRepeat('right', false); } else stopRepeat('right', false);
        if (gp.axes[1] > 0.5)  { if (!lastButtonStates._stickDown) startRepeat('down', false); } else stopRepeat('down', false);

        // --- Button mapping ---
        const BUTTON_MAP = {
            rotate: [0, 2],
            hardDrop: [1],
            hold: [2, 3],
            softDrop: [3]
        };

        gp.buttons.forEach((btn, idx) => {
            const justPressed = btn.pressed && !lastButtonStates[idx];
            if (!justPressed) return;

            // Light vibration feedback
            if (gp.vibrationActuator?.type === 'dual-rumble') {
                gp.vibrationActuator.playEffect('dual-rumble', {
                    duration: 50, strongMagnitude: 0.2, weakMagnitude: 0.2
                }).catch(()=>{});
            }

            if (BUTTON_MAP.rotate.includes(idx)) rotatePiece(1);
            else if (BUTTON_MAP.hardDrop.includes(idx)) hardDrop();
            else if (BUTTON_MAP.hold.includes(idx) && canHold) {
                if (!hold) { hold = current; current = next; next = randomPiece(); }
                else [current, hold] = [hold, current];
                pos = { x: ((COLS/2)|0) - ((current[0].length/2)|0), y: 0 };
                canHold = false;
            }
            else if (BUTTON_MAP.softDrop.includes(idx)) movePiece('down');
            else if (idx === 9) setPauseState(!paused); // Start button
        });

        // --- Update lastButtonStates ---
        lastButtonStates = gp.buttons.map(b => b.pressed);
        lastButtonStates._stickLeft = gp.axes[0] < -0.5;
        lastButtonStates._stickRight = gp.axes[0] > 0.5;
        lastButtonStates._stickDown = gp.axes[1] > 0.5;
    }

    requestAnimationFrame(pollGamepad);
}

// ===== Reset Gamepad Polling =====
function resetGamepadPolling() {
    lastButtonStates = [];
    if (!gamepadPollActive) {
        gamepadPollActive = true;
        pollGamepad();
    }
}

// ===== Overlay Menu Gamepad Polling =====
function pollOverlayMenuGamepad() {
    const gp = navigator.getGamepads?.()[0];
    if (!overlayMenuActive || !gp) return;

    if (gp.buttons[13]?.pressed && !lastButtonStates[13]) {
        overlayMenuIndex = (overlayMenuIndex + 1) % overlayMenuItems.length;
        highlightOverlayMenuItem();
    }
    if (gp.buttons[12]?.pressed && !lastButtonStates[12]) {
        overlayMenuIndex = (overlayMenuIndex - 1 + overlayMenuItems.length) % overlayMenuItems.length;
        highlightOverlayMenuItem();
    }
    if ((gp.buttons[0]?.pressed && !lastButtonStates[0]) ||
        (gp.buttons[9]?.pressed && !lastButtonStates[9])) {
        overlayMenuItems[overlayMenuIndex].click();
    }

    lastButtonStates = gp.buttons.map(b => b.pressed);
    requestAnimationFrame(pollOverlayMenuGamepad);
}

// ===== Connection Events =====
window.addEventListener("gamepadconnected", e => {
    console.log("Gamepad connected:", e.gamepad);
    gamepadPollActive = true;
    pollGamepad();
});

window.addEventListener("gamepaddisconnected", e => {
    console.log("Gamepad disconnected:", e.gamepad);
    gamepadPollActive = false;
});

// ===== Overlay Menu Gamepad Polling =====
function pollOverlayMenuGamepad() {
    const gp = navigator.getGamepads?.()[0];
    if (!overlayMenuActive || !gp) return;

    // Navigate with D-pad or stick
    if (gp.buttons[13]?.pressed) { // down
        if (!lastButtonStates[13]) {
            overlayMenuIndex = (overlayMenuIndex + 1) % overlayMenuItems.length;
            highlightOverlayMenuItem();
        }
    }
    if (gp.buttons[12]?.pressed) { // up
        if (!lastButtonStates[12]) {
            overlayMenuIndex = (overlayMenuIndex - 1 + overlayMenuItems.length) % overlayMenuItems.length;
            highlightOverlayMenuItem();
        }
    }

    // Select with A (0) or Start (9)
    if (gp.buttons[0]?.pressed && !lastButtonStates[0]) {
        overlayMenuItems[overlayMenuIndex].click();
    }
    if (gp.buttons[9]?.pressed && !lastButtonStates[9]) {
        overlayMenuItems[overlayMenuIndex].click();
    }

    // Update button states
    lastButtonStates = gp.buttons.map(b => b.pressed);

    requestAnimationFrame(pollOverlayMenuGamepad);
}

// ===== Reset Gamepad Polling =====
function resetGamepadPolling() {
    lastButtonStates = [];
    if (!gamepadPollActive) {
        gamepadPollActive = true;
        pollGamepad();
    }
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
  let startX = 0, startY = 0, moved = false;
  const threshold = 38;
  let lastTapTime = 0;
  let tapCount = 0;
  const tapWindow = 300; // ms to detect triple-tap
  let isTwoFingerGesture = false;

  // Reset state
  function reset() {
    moved = false;
    isTwoFingerGesture = false;
  }

  window.addEventListener('touchstart', e => {
    if (overlayMenuActive) return;
    reset();

    // Ignore single touches on buttons
    if (e.touches.length === 1 && isTouchButtonEvent(e)) return;

    // Capture start position for swiping
    if (e.touches[0]) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }

    // Detect two-finger gesture at start
    if (e.touches.length >= 2) {
      isTwoFingerGesture = true;
    }

    e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchmove', e => {
    if (overlayMenuActive) return;
    if (isTwoFingerGesture) {
      e.preventDefault(); // block scroll during two-finger
      return;
    }
    if (isTouchButtonEvent(e)) {
      e.preventDefault();
      return;
    }

    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
      moved = true;
      navigator.vibrate?.(18);
      movePiece(dx > 0 ? 'right' : 'left');
      startX = t.clientX; // allow repeat
      e.preventDefault();
    } else if (dy > threshold) {
      moved = true;
      navigator.vibrate?.(10);
      movePiece('down');
      startY = t.clientY;
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('touchend', e => {
    // === HARD DROP: Two-finger tap detected ===
    if (isTwoFingerGesture && e.touches.length === 0) {
      e.preventDefault();
      navigator.vibrate?.([30, 30, 30]);
      hardDrop();
      reset();
      return;
    }

    // Ignore if started on a button
    if (isTouchButtonEvent(e)) {
      reset();
      return;
    }

    // === ROTATE or PAUSE: Only if no swipe happened ===
    if (moved) {
      reset();
      return;
    }

    const now = Date.now();
    const isDoubleOrTriple = now - lastTapTime < tapWindow;

    if (isDoubleOrTriple) {
      tapCount++;
    } else {
      tapCount = 1;
    }

    // --- Triple-tap: Pause ---
    if (tapCount === 3) {
      setPauseState(!paused);
      navigator.vibrate?.(100);
      lastTapTime = 0;
      tapCount = 0;
      reset();
      return;
    }

    // --- Single tap: Rotate (if not part of triple) ---
    if (tapCount === 1) {
      // Use a tiny delay to wait for more taps
      setTimeout(() => {
        if (tapCount === 1) {
          navigator.vibrate?.(8);
          rotatePiece(1);
        }
      }, 50);
    }

    lastTapTime = now;
    reset();
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
  // When showing the pause menu, adjust the layout
  scheduleResizeNow(0);
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

/* ---------------- Responsive Layout Helpers (Added) ---------------- */
/**
 * Return the current viewport dimensions. When available, visualViewport is used to account
 * for mobile browser chrome and zoom, otherwise window.innerWidth/innerHeight.
 */
function getViewport() {
  const vv = window.visualViewport;
  return {
    vw: vv ? vv.width : window.innerWidth,
    vh: vv ? vv.height : window.innerHeight,
  };
}

/**
 * Debounced scheduling of the resize. Multiple rapid events will only trigger one resize.
 */
let _resizeTimer = null;
function scheduleResizeNow(delay = 0) {
  if (_resizeTimer) clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    resizeCanvas();
    _resizeTimer = null;
  }, delay);
}

/**
 * Toggle fullscreen on the entire document. Safely ignores errors if fullscreen is not supported.
 */
function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  } catch (err) {
    console.warn('Fullscreen toggle failed', err);
  }
}

/*
 * Override resizeCanvas with responsive sizing logic. This implementation measures both
 * side-by-side and stacked layouts and chooses whichever yields the larger block size. It
 * carefully subtracts borders and gaps so the board never spills off-screen.
 */
resizeCanvas = function() {
  if (!canvas) return;
  const gameArea = document.getElementById('game-area');
  const tContainer = document.getElementById('tetris-container');
  const infoPanel = document.getElementById('info-panel');
  if (!gameArea || !tContainer || !infoPanel) return;

  // Viewport measurement
  const { vw, vh } = getViewport();

  // Constants: border widths and gap
  const containerBorder = 4;
  const canvasBorder = 4;
  const gap = 12;
  const totalMargin = (containerBorder + canvasBorder) * 2;

  // Panel constraints
  const minPanel = 150;
  const maxPanel = 240;
  let candidatePanel = Math.floor(vw * 0.25);
  candidatePanel = Math.max(minPanel, Math.min(maxPanel, candidatePanel));

  // Fudge factor to avoid a 3-4px cutoff on some mobile devices (e.g., S24 FE)
  const fudge = 4;

  // Side layout cell size
  let availWSide = vw - candidatePanel - gap - totalMargin;
  let availHSide = vh - totalMargin - fudge;
  if (availWSide < 0) availWSide = 0;
  if (availHSide < 0) availHSide = 0;
  const cellSide = Math.floor(Math.min(availWSide / COLS, availHSide / ROWS));

  // Stacked layout: board occupies 70% height
  const heightRatio = 0.7;
  let availWStack = vw - totalMargin;
  let availHStack = vh * heightRatio - totalMargin - fudge;
  if (availWStack < 0) availWStack = 0;
  if (availHStack < 0) availHStack = 0;
  const cellStack = Math.floor(Math.min(availWStack / COLS, availHStack / ROWS));

  // Decide on the layout that maximises block size; tie goes to side layout
  const useSide = cellSide >= cellStack;
  let cell = useSide ? cellSide : cellStack;
  if (!Number.isFinite(cell) || cell <= 0) cell = 8;

  // Compute board dimensions
  const boardWidth = cell * COLS;
  const boardHeight = cell * ROWS;

  if (useSide) {
    // Place info panel to the right
    gameArea.style.flexDirection = 'row';
    tContainer.style.width = `${boardWidth}px`;
    tContainer.style.height = `${boardHeight}px`;
    // Remaining width after placing board and borders/gaps
    let remainingW = vw - boardWidth - totalMargin - gap;
    // Clamp panel width
    let panelW = Math.max(minPanel, Math.min(maxPanel, remainingW));
    infoPanel.style.width = `${panelW}px`;
    infoPanel.style.height = `${boardHeight}px`;
  } else {
    // Stack info panel under the board
    gameArea.style.flexDirection = 'column';
    tContainer.style.width = `${boardWidth}px`;
    tContainer.style.height = `${boardHeight}px`;
    infoPanel.style.width = `${boardWidth}px`;
    let remainingH = vh - boardHeight - totalMargin - gap - fudge;
    if (remainingH < 0) remainingH = 0;
    infoPanel.style.height = `${remainingH}px`;
  }

  // Set actual canvas resolution and displayed size
  blockSize = cell;
  canvas.width = blockSize * COLS;
  canvas.height = blockSize * ROWS;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;

  // Preview sizing
  if (previewBox) {
    let previewMax;
    if (useSide) {
      const panelWNow = parseInt(infoPanel.style.width || candidatePanel);
      previewMax = Math.min(Math.floor(panelWNow * 0.8), 200);
    } else {
      previewMax = Math.min(Math.floor(boardWidth * 0.4), 200);
    }
    const previewSize = Math.max(50, previewMax);
    previewBox.width = previewSize;
    previewBox.height = previewSize;
    previewBox.style.width = `${previewSize}px`;
    previewBox.style.height = `${previewSize}px`;
  }

  // Make scoreboard and touch controls fill panel width
  const scoreboard = document.getElementById('scoreboard');
  const touchControls = document.getElementById('touch-controls');
  if (scoreboard) {
    scoreboard.style.width = '100%';
    scoreboard.style.boxSizing = 'border-box';
  }
  if (touchControls) {
    touchControls.style.width = '100%';
    touchControls.style.boxSizing = 'border-box';
  }

  draw();
};

// Override preview resizing: handled in resizeCanvas
resizePreviewBox = function() {};

// Override showGame to call scheduleResizeNow
showGame = function() {
  const wrapper = document.getElementById('tetris-wrapper');
  if (wrapper) wrapper.style.display = 'flex';
  setTimeout(() => { scheduleResizeNow(0); }, 0);
};

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
  
  // --- Mobile audio unlock ---
  function initAudio() {
    if (bgMusic) {
      bgMusic.play().then(() => {
        bgMusic.pause();
        bgMusic.currentTime = 0;
      }).catch(()=>{});
    }
  }

  document.addEventListener("touchstart", initAudio, { once: true });
  document.addEventListener("mousedown", initAudio, { once: true });

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

      // Ensure correct initial sizing even if not fullscreen
      scheduleResizeNow(0);
      // Additional resize after UI settles (important on mobile)
      scheduleResizeNow(300);
    };
  });

  // Bind fullscreen button
  document.getElementById('fullscreen-btn')?.addEventListener('click', toggleFullscreen);

  // Global resize/orientation/fullscreen events
  window.addEventListener('resize', () => { scheduleResizeNow(50); });
  window.addEventListener('orientationchange', () => { scheduleResizeNow(350); });
  document.addEventListener('fullscreenchange', () => { scheduleResizeNow(50); });
  window.addEventListener('load', () => { scheduleResizeNow(50); });

  // --- START THE GAMEPAD LOOP! ---
  startGamepadPolling();
});

// END OF FILE. Go touch grass. Or, if you’re reading this, maybe touch the hold button instead.
