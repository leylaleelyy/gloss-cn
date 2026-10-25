import { access, mkdir, readlink, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, "desktop/out/Gloss");
const executable = join(app, "Gloss");
await access(executable);
const bin = join(homedir(), ".local/bin");
const applications = join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "applications");
await mkdir(bin, { recursive: true });
await mkdir(applications, { recursive: true });
const link = join(bin, "gloss-desktop");
try { await symlink(executable, link); }
catch (error) {
  if (error.code !== "EEXIST" || await readlink(link).catch(() => "") !== executable) throw error;
}
// Escape Desktop Entry Exec's reserved characters, including literal percent codes.
const quoted = '"' + executable.replace(/([\\"`$])/g, "\\$1").replaceAll("%", "%%") + '"';
await writeFile(join(applications, "io.usegloss.desktop.desktop"), `[Desktop Entry]
Type=Application
Name=Gloss Desktop
Comment=Read, highlight, and ask questions about your articles, EPUBs and PDFs
Exec=${quoted}
Icon=${join(app, "io.usegloss.desktop.png")}
Terminal=false
Categories=Office;Education;
StartupWMClass=io.usegloss.desktop
`);
console.log(`Installed Gloss Desktop in your application launcher.\nCommand: ${link}\nKeep ${app} in place; the launcher points there.`);
