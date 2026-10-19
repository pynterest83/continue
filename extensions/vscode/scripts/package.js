const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const version = JSON.parse(
  fs.readFileSync("./package.json", { encoding: "utf-8" }),
).version;

const args = process.argv.slice(2);
let target;

if (args[0] === "--target") {
  target = args[1];
}

if (!fs.existsSync("build")) {
  fs.mkdirSync("build", { recursive: true });
}

// Clean any existing VSIX files to avoid conflicts
const buildDir = path.join(__dirname, "..", "build");
if (fs.existsSync(buildDir)) {
  const files = fs.readdirSync(buildDir);
  files.forEach((file) => {
    if (file.endsWith(".vsix")) {
      const filePath = path.join(buildDir, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`[info] Removed existing VSIX: ${file}`);
      } catch (err) {
        console.warn(`[warn] Could not remove ${file}:`, err.message);
      }
    }
  });
}

const isPreRelease = args.includes("--pre-release");

// Add a small delay to ensure file system is stable after prepackage
// This helps avoid "unexpected number of bytes" errors from yazl
const waitForFileSystemStability = () => {
  return new Promise((resolve) => {
    // Wait 1 second to ensure all file operations from prepackage are complete
    setTimeout(resolve, 1000);
  });
};

let command = isPreRelease
  ? "npx @vscode/vsce package --out ./build --pre-release --no-dependencies"
  : "npx @vscode/vsce package --out ./build --no-dependencies";

if (target) {
  command += ` --target ${target}`;
}

(async () => {
  await waitForFileSystemStability();

  exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
    if (stdout) {
      console.log(stdout);
    }
    if (stderr) {
      console.error(stderr);
    }
    if (error) {
      console.error(
        "Packaging failed. This can happen if files are being modified during packaging.",
      );
      console.error("Try:");
      console.error(
        "  1. Ensure no file watchers or build processes are running",
      );
      console.error(
        "  2. Close any editors that might be modifying files in this directory",
      );
      console.error(
        "  3. Run 'npm run prepackage' first, then wait a moment before running 'npm run package'",
      );
      throw error;
    }
    console.log(
      `✓ VSIX package created successfully at extensions/vscode/build/continue-${version}.vsix`,
    );
  });
})();
