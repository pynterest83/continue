import * as cp from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { URL } from "url";
import * as vscode from "vscode";
import { getExtensionVersion } from "../util/util";

export class IntranetUpdateService {
  private static readonly LAST_CHECK_KEY = "intranetUpdate.lastCheckTimestamp";
  private static readonly DISMISSED_VERSION_KEY =
    "intranetUpdate.dismissedVersion";
  private static readonly CHECK_INTERVAL = 10 * 1000; // 10 seconds

  constructor(private context: vscode.ExtensionContext) {
    this.checkAndAutoUpdate();
  }

  private get intranetUpdateServerUrl(): string | undefined {
    return (
      vscode.workspace
        .getConfiguration("continue")
        .get<string>("intranetUpdateServerUrl") || undefined
    );
  }

  async checkAndAutoUpdate(force: boolean = false) {
    if (!this.intranetUpdateServerUrl) {
      if (force) {
        vscode.window.showInformationMessage(
          "Intranet update server URL is not configured.",
        );
      }
      return;
    }

    const lastCheck =
      this.context.globalState.get<number>(
        IntranetUpdateService.LAST_CHECK_KEY,
      ) || 0;
    const now = Date.now();

    if (!force && now - lastCheck < IntranetUpdateService.CHECK_INTERVAL) {
      return;
    }

    await this.context.globalState.update(
      IntranetUpdateService.LAST_CHECK_KEY,
      now,
    );

    try {
      if (force) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Checking for updates...",
            cancellable: false,
          },
          async () => {
            await this.performCheck(true);
          },
        );
      } else {
        await this.performCheck(false);
      }
    } catch (error) {
      if (force) {
        vscode.window.showErrorMessage(`Error checking for updates: ${error}`);
      } else {
        console.error("Error checking for updates:", error);
      }
    }
  }

  private async performCheck(force: boolean) {
    const updateInfo = await this.fetchUpdateInfo();
    const currentVersion = getExtensionVersion();

    if (this.compareVersions(updateInfo.version, currentVersion) === "newer") {
      const dismissedVersion = this.context.globalState.get<string>(
        IntranetUpdateService.DISMISSED_VERSION_KEY,
      );
      if (!force && dismissedVersion === updateInfo.version) {
        return;
      }

      const platformTarget = this.getPlatformTarget();
      const selection = await vscode.window.showInformationMessage(
        `Continue update available: v${updateInfo.version} (Current: v${currentVersion}, Platform: ${platformTarget})`,
        "Download & Install",
        "Download Only",
        "Dismiss",
      );

      const downloadUrl = this.selectDownloadUrl(updateInfo.downloadUrl);

      if (selection === "Download & Install") {
        await this.autoInstall(downloadUrl, updateInfo.version);
      } else if (selection === "Download Only") {
        vscode.env.openExternal(vscode.Uri.parse(downloadUrl));
      } else if (selection === "Dismiss") {
        await this.context.globalState.update(
          IntranetUpdateService.DISMISSED_VERSION_KEY,
          updateInfo.version,
        );
      }
    } else if (force) {
      vscode.window.showInformationMessage(
        "Continue is up to date.",
      );
    }
  }

  private getPlatformTarget(): string {
    const platform = os.platform();
    let arch = os.arch();

    // Check for Rosetta on macOS
    if (platform === "darwin" && arch === "x64") {
      try {
        const result = cp.execSync("sysctl -n sysctl.proc_translated", {
          encoding: "utf8",
        });
        if (result.trim() === "1") {
          arch = "arm64";
        }
      } catch (e) {
        // Ignore errors
      }
    }

    const target = `${platform}-${arch}`;
    console.log(`[IntranetUpdateService] Detected platform target: ${target}`);
    return target;
  }

  private selectDownloadUrl(
    downloadUrl: { [key: string]: string } | string,
  ): string {
    if (typeof downloadUrl === "string") {
      return downloadUrl;
    }

    const target = this.getPlatformTarget();
    if (downloadUrl[target]) {
      console.log(
        `[IntranetUpdateService] Found specific URL for ${target}: ${downloadUrl[target]}`,
      );
      return downloadUrl[target];
    }

    if (downloadUrl["default"]) {
      console.log(
        `[IntranetUpdateService] No URL for ${target}, using default: ${downloadUrl["default"]}`,
      );
      return downloadUrl["default"];
    }

    throw new Error(
      `No download URL found for platform ${target} and no default provided`,
    );
  }

  private async fetchUpdateInfo(): Promise<{
    version: string;
    downloadUrl: { [key: string]: string } | string;
  }> {
    const urlStr = this.intranetUpdateServerUrl!;
    const url = new URL(urlStr);
    const client = url.protocol === "https:" ? https : http;

    return new Promise((resolve, reject) => {
      const req = client.get(urlStr, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Server returned status code ${res.statusCode}`));
          res.resume();
          return;
        }

        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (!json.version || !json.downloadUrl) {
              reject(new Error("Invalid response format from update server"));
            } else {
              resolve(json);
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on("error", (e) => reject(e));
      req.end();
    });
  }

  private compareVersions(v1: string, v2: string): "newer" | "same" | "older" {
    const parse = (v: string) => v.split(".").map((p) => parseInt(p, 10));
    const p1 = parse(v1);
    const p2 = parse(v2);

    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 > n2) return "newer";
      if (n1 < n2) return "older";
    }
    return "same";
  }

  private async autoInstall(downloadUrl: string, version: string) {
    const tmpDir = os.tmpdir();
    const vsixPath = path.join(tmpDir, `continue-${version}.vsix`);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Updating Continue",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: "Downloading..." });
          await this.downloadFile(downloadUrl, vsixPath);

          progress.report({ message: "Installing..." });
          await vscode.commands.executeCommand(
            "workbench.extensions.installExtension",
            vscode.Uri.file(vsixPath),
          );
        },
      );

      const reload = await vscode.window.showInformationMessage(
        "Extension updated successfully. Reload window to use new version?",
        "Reload Window",
        "Later",
      );

      if (reload === "Reload Window") {
        vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update extension: ${error}`);
    } finally {
      if (fs.existsSync(vsixPath)) {
        fs.unlinkSync(vsixPath);
      }
    }
  }

  private downloadFile(urlStr: string, dest: string): Promise<void> {
    const url = new URL(urlStr);
    const client = url.protocol === "https:" ? https : http;

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const req = client.get(urlStr, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Server returned status code ${res.statusCode}`));
          res.resume();
          return;
        }

        res.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });
      });

      req.on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });

      file.on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });

      req.end();
    });
  }
}
