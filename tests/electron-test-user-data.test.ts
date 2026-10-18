import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { configureElectronTestUserData, TEST_PROFILE_MARKER } = require("../electron/test-user-data.cjs") as {
  configureElectronTestUserData: (
    app: { isPackaged: boolean; getPath: (name: string) => string; setPath: (name: string, value: string) => void },
    environment: { OE_ELECTRON_TEST_USER_DATA_DIR?: string }
  ) => string | null;
  TEST_PROFILE_MARKER: string;
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createTestProfile() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oe-electron-profile-"));
  temporaryDirectories.push(directory);
  await writeFile(path.join(directory, TEST_PROFILE_MARKER), "");
  return directory;
}

function createApp(defaultDirectory: string, isPackaged = false) {
  let userDataDirectory = defaultDirectory;
  return {
    isPackaged,
    getPath: vi.fn((name: string) => {
      if (name !== "userData") throw new Error(`Ruta inesperada: ${name}`);
      return userDataDirectory;
    }),
    setPath: vi.fn((_name: string, value: string) => { userDataDirectory = value; })
  };
}

it("keeps the normal Electron user data path when no test profile is requested", () => {
  const app = createApp("C:\\installed-data");
  expect(configureElectronTestUserData(app, {})).toBeNull();
  expect(app.setPath).not.toHaveBeenCalled();
});

it("uses only a marked, absolute test directory and verifies Electron accepted it", async () => {
  const testDirectory = await createTestProfile();
  const app = createApp(path.join(testDirectory, "installed-data"));
  expect(configureElectronTestUserData(app, { OE_ELECTRON_TEST_USER_DATA_DIR: testDirectory })).toBe(testDirectory);
  expect(app.setPath).toHaveBeenCalledWith("userData", testDirectory);
  expect(app.getPath("userData")).toBe(testDirectory);
});

it("rejects a test override in the packaged app", async () => {
  const testDirectory = await createTestProfile();
  const app = createApp(path.join(testDirectory, "installed-data"), true);
  expect(() => configureElectronTestUserData(app, { OE_ELECTRON_TEST_USER_DATA_DIR: testDirectory }))
    .toThrow(/app instalada/);
  expect(app.setPath).not.toHaveBeenCalled();
});

it("rejects an unmarked directory or the normal installed directory", async () => {
  const testDirectory = await createTestProfile();
  const unmarked = await mkdtemp(path.join(os.tmpdir(), "oe-electron-unmarked-"));
  temporaryDirectories.push(unmarked);
  const app = createApp(testDirectory);
  expect(() => configureElectronTestUserData(app, { OE_ELECTRON_TEST_USER_DATA_DIR: unmarked }))
    .toThrow();
  expect(() => configureElectronTestUserData(app, { OE_ELECTRON_TEST_USER_DATA_DIR: testDirectory }))
    .toThrow(/coincide con los datos instalados/);
  expect(app.setPath).not.toHaveBeenCalled();
});

it("rejects a relative path or an override Electron does not apply", async () => {
  const testDirectory = await createTestProfile();
  const app = createApp(path.join(testDirectory, "installed-data"));
  expect(() => configureElectronTestUserData(app, { OE_ELECTRON_TEST_USER_DATA_DIR: "relative" }))
    .toThrow(/absoluta/);
  app.setPath.mockImplementation(() => undefined);
  expect(() => configureElectronTestUserData(app, { OE_ELECTRON_TEST_USER_DATA_DIR: testDirectory }))
    .toThrow(/no confirmó/);
});
