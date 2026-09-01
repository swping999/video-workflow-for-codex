import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { buildCoverPlan, validateCoverPlan } from "./cover-plan.mjs";
import { buildDirectionPlan, validateDirectionPlan } from "./direction.mjs";
import { validateContentPlan } from "./content-schema.mjs";
import { loadProject, validateLockedSource } from "./source.mjs";
import { readJson, sha256Text, writeJson } from "./utils.mjs";
import { buildSoundPlan } from "./sound-design.mjs";

const visualKinds = ["hero", "summary", "definition", "mechanism", "cause-effect", "timeline", "structure", "analogy", "misconception", "cycle", "list-overview", "list-item", "ranking", "recommendation", "process", "decision", "checkpoint", "demo", "acceptance", "comparison-table", "before-after", "tradeoff", "radar", "decision-tree", "pain", "solution", "feature-demo", "proof", "cta", "bar-chart", "line-chart", "area-chart", "ranking-chart", "trend-illustration"];

function escapeHtml(value) {
  return String(value || "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

export function storyboardEditorHtml(source, story) {
  const payload = story.scenes.map((scene) => ({
    sceneId: scene.id,
    title: scene.title,
    layout: scene.layout,
    captionPosition: scene.visual?.captionPosition || "bottom",
    visual: scene.visual?.model || {},
    narration: scene.voice?.cues?.map((cue) => cue.text).join("") || "",
    duration: scene.duration,
  }));
  const options = visualKinds.map((kind) => `<option value="${kind}">${kind}</option>`).join("");
  return `<!doctype html><html lang="${escapeHtml(source.copy.language)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(source.project.title)} Storyboard Editor</title><style>*{box-sizing:border-box}body{margin:0;background:#eee8dd;color:#181818;font:15px/1.45 system-ui}.app{display:grid;grid-template-columns:280px minmax(420px,1fr) minmax(340px,.8fr);height:100vh}.list,.controls{overflow:auto;padding:20px;border-right:1px solid #cabfae;background:#faf7f1}.controls{border-right:0;border-left:1px solid #cabfae}.preview{display:grid;place-items:center;padding:30px;background:radial-gradient(circle,#fff 0,#e8e0d3 70%)}button,input,select,textarea{font:inherit}.scene-button{display:block;width:100%;margin:0 0 10px;padding:14px;border:1px solid #27221d;border-radius:12px;background:#fff;text-align:left}.scene-button.active{background:#202020;color:#fff}.canvas{width:min(90%,860px);aspect-ratio:16/9;padding:6%;border:3px solid #181818;border-radius:24px;background:#fffdf8;box-shadow:12px 14px 0 #c8bda9}.canvas h2{margin:0 0 24px;font-size:clamp(28px,4vw,58px)}.symbol{display:grid;place-items:center;height:48%;border-radius:20px;background:linear-gradient(135deg,#f68b36,#3159c9);color:#fff;font-size:90px}.narration{margin-top:20px;padding:12px 16px;border-radius:12px;background:#181818;color:#fff}.field{display:block;margin:0 0 16px}.field span{display:block;margin-bottom:6px;font-weight:800}.field input,.field select,.field textarea{width:100%;padding:10px;border:1px solid #aaa;border-radius:9px;background:#fff}.field textarea{min-height:260px;font-family:ui-monospace,monospace}.save{width:100%;padding:13px;border:0;border-radius:999px;background:#ef812c;color:#fff;font-weight:900}.hint{color:#6d655a;font-size:13px}@media(max-width:980px){.app{grid-template-columns:220px 1fr}.controls{position:fixed;right:0;top:0;bottom:0;width:360px;box-shadow:-10px 0 35px #0002}.preview{padding-right:380px}}</style><div class="app"><aside class="list"><h1>Storyboard</h1><p>${escapeHtml(source.project.type)} · ${escapeHtml(source.project.theme)}</p><div id="list"></div></aside><main class="preview"><div class="canvas"><h2 id="preview-title"></h2><div class="symbol" id="preview-symbol">✦</div><div class="narration" id="preview-narration"></div></div></main><aside class="controls"><h2>Visual parameters</h2><label class="field"><span>Title</span><input id="title"></label><label class="field"><span>Scene type</span><select id="layout">${options}</select></label><label class="field"><span>Caption position</span><select id="caption"><option>bottom</option><option>top</option><option>left</option><option>right</option></select></label><label class="field"><span>Visual model JSON</span><textarea id="visual"></textarea></label><button class="save" id="save">Download storyboard.patch.json</button><p class="hint">Apply with: video-workflow apply-storyboard --project … --patch storyboard.patch.json. Only edited scenes are invalidated and re-rendered.</p></aside></div><script>const scenes=${JSON.stringify(payload).replace(/</gu,"\\u003c")};let selected=0;const edits=new Map;const byId=id=>document.getElementById(id);function current(){return edits.get(scenes[selected].sceneId)||structuredClone(scenes[selected])}function store(){const base=current();base.title=byId('title').value;base.layout=byId('layout').value;base.captionPosition=byId('caption').value;try{base.visual=JSON.parse(byId('visual').value);byId('visual').style.borderColor='#aaa'}catch{byId('visual').style.borderColor='#d00';return false}edits.set(base.sceneId,base);return true}function render(){const item=current();byId('title').value=item.title;byId('layout').value=item.layout;byId('caption').value=item.captionPosition;byId('visual').value=JSON.stringify(item.visual,null,2);byId('preview-title').textContent=item.title;byId('preview-symbol').textContent=item.visual.symbol||item.visual.icon||({cycle:'↻',timeline:'◷','bar-chart':'↗',process:'→'}[item.layout]||'✦');byId('preview-narration').textContent=item.narration;document.querySelectorAll('.scene-button').forEach((el,i)=>el.classList.toggle('active',i===selected))}byId('list').innerHTML=scenes.map((scene,i)=>'<button class="scene-button" data-i="'+i+'"><b>'+String(i+1).padStart(2,'0')+' · '+scene.title.replace(/[<>&]/g,'')+'</b><br><small>'+scene.layout+' · '+scene.duration.toFixed(2)+'s</small></button>').join('');document.querySelectorAll('.scene-button').forEach(el=>el.onclick=()=>{store();selected=Number(el.dataset.i);render()});['title','layout','caption','visual'].forEach(id=>byId(id).addEventListener('input',()=>{if(store())render()}));byId('save').onclick=()=>{if(!store())return;const patch={schemaVersion:1,project:'${escapeHtml(source.project.slug)}',scenes:[...edits.values()].map(({sceneId,title,layout,captionPosition,visual})=>({sceneId,title,layout,captionPosition,visual}))};const blob=new Blob([JSON.stringify(patch,null,2)+'\\n'],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='storyboard.patch.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};render();</script></html>`;
}

function loadStory(projectRoot) {
  const sandbox = { window: {} };
  const storyPath = path.join(projectRoot, "story.js");
  vm.runInNewContext(fs.readFileSync(storyPath, "utf8"), sandbox, { filename: storyPath });
  return sandbox.window.VIDEO_WORKFLOW_STORY;
}

function validateAssetPaths(projectRoot, value, key = "") {
  if (Array.isArray(value)) return value.forEach((item) => validateAssetPaths(projectRoot, item, key));
  if (value && typeof value === "object") return Object.entries(value).forEach(([childKey, child]) => validateAssetPaths(projectRoot, child, childKey));
  if (!["asset", "image", "video", "screenshot", "logo"].includes(key) || !value) return;
  const resolved = path.resolve(projectRoot, String(value));
  if (!resolved.startsWith(`${projectRoot}${path.sep}`) || !fs.existsSync(resolved)) throw new Error(`Storyboard patch asset must already exist inside the project: ${value}`);
}

function archiveVisualState(projectRoot) {
  const directory = path.join(projectRoot, "revisions", `visual-${new Date().toISOString().replace(/[:.]/gu, "-")}`);
  fs.mkdirSync(directory, { recursive: true });
  for (const relative of ["story-source.json", "story.js", "content-plan.locked.json", "direction-plan.locked.json", "sound-plan.locked.json", "cover-plan.locked.json"]) {
    const source = path.join(projectRoot, relative);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(directory, relative));
  }
  return directory;
}

export function applyStoryboardPatch(projectArg, patchPath) {
  const project = validateLockedSource(projectArg);
  const { projectRoot } = project;
  const patch = readJson(path.resolve(patchPath));
  if (patch.schemaVersion !== 1 || !Array.isArray(patch.scenes) || !patch.scenes.length) throw new Error("Storyboard patch must use schemaVersion 1 and contain scenes");
  if (patch.project && patch.project !== project.source.project.slug) throw new Error("Storyboard patch targets a different project");
  const source = structuredClone(project.source);
  const planPath = path.join(projectRoot, source.content.lockedFile);
  const plan = readJson(planPath);
  const story = loadStory(projectRoot);
  const changed = [];
  for (const entry of patch.scenes) {
    const index = source.scenes.findIndex((scene) => scene.id === entry.sceneId);
    if (index < 0) throw new Error(`Storyboard patch references unknown scene: ${entry.sceneId}`);
    if (entry.layout && !visualKinds.includes(entry.layout)) throw new Error(`Unsupported storyboard layout: ${entry.layout}`);
    if (entry.visual) validateAssetPaths(projectRoot, entry.visual);
    const title = entry.title ? String(entry.title).trim() : source.scenes[index].title;
    const layout = entry.layout || entry.visual?.kind || source.scenes[index].layout;
    const model = entry.visual || source.scenes[index].visual.model;
    const captionPosition = ["bottom", "top", "left", "right"].includes(entry.captionPosition) ? entry.captionPosition : (source.scenes[index].visual.captionPosition || "bottom");
    source.scenes[index] = { ...source.scenes[index], title, layout, visual: { ...source.scenes[index].visual, model, captionPosition } };
    plan.scenes[index] = { ...plan.scenes[index], title, visual: model };
    if (story.scenes[index]) {
      story.scenes[index] = { ...story.scenes[index], title, layout, visual: { ...story.scenes[index].visual, model, captionPosition } };
    }
    changed.push(entry.sceneId);
  }
  validateContentPlan(plan);
  const directionPlan = validateDirectionPlan(buildDirectionPlan({ title: source.project.title, type: source.project.type, scenes: plan.scenes, narration: source.scenes.map((scene) => scene.cues.join("")) }), source.scenes.length);
  const coverPlan = validateCoverPlan(buildCoverPlan(source, directionPlan));
  const soundPlan = buildSoundPlan({ directionPlan, theme: source.project.theme, mode: source.audio.soundDesign || "subtle" });
  for (const [index, direction] of directionPlan.scenes.entries()) {
    source.scenes[index].visual.direction = direction;
    if (story.scenes[index]?.visual) story.scenes[index].visual.direction = direction;
  }
  const planText = `${JSON.stringify(plan, null, 2)}\n`;
  const directionText = `${JSON.stringify(directionPlan, null, 2)}\n`;
  const coverText = `${JSON.stringify(coverPlan, null, 2)}\n`;
  const soundText = `${JSON.stringify(soundPlan, null, 2)}\n`;
  source.content.lockedSha256 = sha256Text(planText);
  source.direction = { status: "locked", lockedFile: "direction-plan.locked.json", lockedSha256: sha256Text(directionText) };
  source.cover = { status: "locked", lockedFile: "cover-plan.locked.json", lockedSha256: sha256Text(coverText) };
  source.sound = { status: "locked", lockedFile: "sound-plan.locked.json", lockedSha256: sha256Text(soundText) };
  source.audio.soundPlan = soundPlan;
  story.audio.soundPlan = soundPlan;
  const archive = archiveVisualState(projectRoot);
  fs.writeFileSync(planPath, planText);
  fs.writeFileSync(path.join(projectRoot, "direction-plan.locked.json"), directionText);
  fs.writeFileSync(path.join(projectRoot, "cover-plan.locked.json"), coverText);
  fs.writeFileSync(path.join(projectRoot, "sound-plan.locked.json"), soundText);
  writeJson(path.join(projectRoot, "story-source.json"), source);
  fs.writeFileSync(path.join(projectRoot, "story.js"), `window.VIDEO_WORKFLOW_STORY = ${JSON.stringify(story, null, 2)};\n`);
  for (const format of fs.existsSync(path.join(projectRoot, ".media", "cache", "frames")) ? fs.readdirSync(path.join(projectRoot, ".media", "cache", "frames")) : []) {
    const formatRoot = path.join(projectRoot, ".media", "cache", "frames", format);
    for (const entry of fs.readdirSync(formatRoot, { withFileTypes: true })) if (entry.isDirectory() && changed.some((sceneId) => entry.name.startsWith(`${sceneId}-`))) fs.rmSync(path.join(formatRoot, entry.name), { recursive: true, force: true });
  }
  validateLockedSource(projectRoot);
  return { projectRoot, changed: [...new Set(changed)], archive };
}
