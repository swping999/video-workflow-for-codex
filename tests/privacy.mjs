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
const mediaExtensions = new Set([".wav", ".aiff", ".mp3", ".m4a", ".mp4", ".mov", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const publicMediaAllowlist = new Set([
  "docs/demo.gif",
  "docs/visuals/comparison.png",
  "docs/visuals/data-story.png",
  "docs/visuals/explainer.png",
  "docs/visuals/listicle.png",
  "docs/visuals/promo.png",
  "docs/visuals/workflow.png",
  "examples/public-demo/output/cover.png",
  "examples/public-demo/output/final.mp4",
]);
const failures = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else {
      const relative = path.relative(root, target);
      if (mediaExtensions.has(path.extname(entry.name).toLowerCase()) && !publicMediaAllowlist.has(relative)) failures.push(`unreviewed bundled media asset: ${relative}`);
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
console.log("Privacy/free-core scan passed: only reviewed public demo media is bundled; no personal paths, identity media, or cloud speech credential hooks found.");
