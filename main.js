const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Geometry the window had before it went fullscreen, so leaving fullscreen
// returns it to a real floating window rather than a maximized one.
let floatingBounds = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    resizable: true,
    fullscreen: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000'
  });

  // Load the index.html file
  win.loadFile('index.html');
  
  // Open DevTools in development mode
  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }

  // Keep the renderer's button glyph in sync however fullscreen was entered
  // (our button, the compositor's titlebar, or F11).
  win.on('enter-full-screen', () => {
    win.webContents.send('window:fullscreen-changed', true);
  });
  win.on('leave-full-screen', () => {
    win.webContents.send('window:fullscreen-changed', false);
  });

  // Handle window closing
  win.on('closed', () => {
    // Dereference the window object
  });
}

function setFullscreen(win, value) {
  if (value) {
    if (!win.isFullScreen()) {
      floatingBounds = win.getBounds();
    }
    win.setFullScreen(true);
    return;
  }

  win.setFullScreen(false);
  // Under wlroots the compositor may hand back a maximized surface; force the
  // window back to the floating geometry it had before.
  if (win.isMaximized()) {
    win.unmaximize();
  }
  if (floatingBounds) {
    win.setBounds(floatingBounds);
  }
}

ipcMain.handle('window:toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  const next = !win.isFullScreen();
  setFullscreen(win, next);
  return next;
});

ipcMain.handle('window:is-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isFullScreen() : false;
});

ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  // On macOS it's common to re-create a window in the app when the dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});