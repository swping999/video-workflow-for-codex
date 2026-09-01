import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = [
  "/" + "Users" + "/",
  "presenter-master" + "-no-glasses",
  "user-voice" + "-reference",
  "speaker" + "-reference.wav",
  "identity" + "-reference.png",
  "Sen" + "try",
  "So" + "ng 的",
  "OPENAI" + "_API_KEY",
  "ELEVENLABS" + "_API_KEY",
  "api." + "openai.com",
  "api." + "elevenlabs.io",
];
const mediaExtensions = new Set([".wav", ".aiff", ".mp3", ".m4a", ".mp4", ".mov", ".png", ".jpg", ".jpeg", ".webp"]);
const failures = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else {
      if (mediaExtensions.has(path.extname(entry.name).toLowerCase())) failures.push(`bundled private/media asset: ${path.relative(root, target)}`);
      const content = fs.readFileSync(target, "utf8");
      for (const term of forbidden) {
        if (content.includes(term)) failures.push(`forbidden private marker in ${path.relative(root, target)}`);
      }
    }
  }
}

visit(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Privacy/free-core scan passed: no personal media, private home path, bundled media, or cloud speech credential hooks found.");
