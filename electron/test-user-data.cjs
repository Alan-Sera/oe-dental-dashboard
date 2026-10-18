/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");

const TEST_PROFILE_MARKER = ".oe-electron-test-profile";

function configureElectronTestUserData(app, environment = process.env) {
  const requested = environment.OE_ELECTRON_TEST_USER_DATA_DIR;
  if (!requested) return null;

  if (app.isPackaged) {
    throw new Error("El perfil de pruebas no está disponible en la app instalada.");
  }
  if (!path.isAbsolute(requested)) {
    throw new Error("La ruta del perfil de pruebas debe ser absoluta.");
  }

  const testDir = fs.realpathSync(requested);
  if (!fs.statSync(testDir).isDirectory() ||
      !fs.statSync(path.join(testDir, TEST_PROFILE_MARKER)).isFile()) {
    throw new Error("El perfil de pruebas requiere su archivo marcador.");
  }

  const defaultDir = path.resolve(app.getPath("userData"));
  if (testDir.toLowerCase() === defaultDir.toLowerCase()) {
    throw new Error("El perfil de pruebas coincide con los datos instalados.");
  }

  app.setPath("userData", testDir);
  if (path.resolve(app.getPath("userData")).toLowerCase() !== testDir.toLowerCase()) {
    throw new Error("Electron no confirmó el perfil de pruebas.");
  }

  return testDir;
}

module.exports = { configureElectronTestUserData, TEST_PROFILE_MARKER };
