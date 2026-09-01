const motionByKind = {
  hero: ["focus", "reveal", "accent"],
  summary: ["gather", "highlight"],
  definition: ["focus", "connect"],
  mechanism: ["assemble", "transform", "pulse"],
  "cause-effect": ["trace", "flow", "highlight"],
  timeline: ["trace", "progress", "focus"],
  structure: ["explode", "assemble", "connect"],
  analogy: ["compare", "bridge", "highlight"],
  misconception: ["contrast", "replace", "confirm"],
  cycle: ["cycle", "flow", "return"],
  "list-overview": ["stagger", "rank", "highlight"],
  "list-item": ["focus", "reveal", "score"],
  ranking: ["rank", "grow", "highlight"],
  recommendation: ["focus", "compare", "confirm"],
  process: ["trace", "progress", "checkpoint"],
  decision: ["branch", "trace", "confirm"],
  checkpoint: ["progress", "check", "confirm"],
  demo: ["focus", "simulate", "confirm"],
  acceptance: ["check", "gather", "confirm"],
  "comparison-table": ["compare", "scan", "verdict"],
  "before-after": ["contrast", "wipe", "confirm"],
  tradeoff: ["balance", "compare", "verdict"],
  radar: ["trace", "compare", "highlight"],
  "decision-tree": ["branch", "trace", "verdict"],
  pain: ["focus", "pressure", "reveal"],
  solution: ["replace", "focus", "confirm"],
  "feature-demo": ["simulate", "spotlight", "confirm"],
  proof: ["reveal", "verify", "highlight"],
  cta: ["focus", "pulse", "confirm"],
  "bar-chart": ["grow", "rank", "annotate"],
  "line-chart": ["trace", "progress", "annotate"],
  "area-chart": ["trace", "fill", "annotate"],
  "ranking-chart": ["grow", "rank", "highlight"],
  "trend-illustration": ["trace", "flow", "label"],
};

const metaphorRules = [
  { pattern: /(字幕|旁白|音频|配音|caption|subtitle|narration|audio|voice)/iu, symbol: "◴", metaphor: "timeline-sync" },
  { pattern: /(水|雨|海洋|蒸发|凝结|water|rain|ocean|evapor)/iu, symbol: "💧", metaphor: "water-cycle" },
  { pattern: /(化学|分子|原子|键|reaction|molecule|atom|bond)/iu, symbol: "⚛", metaphor: "molecular-assembly" },
  { pattern: /(时间|历史|阶段|timeline|history|phase)/iu, symbol: "◷", metaphor: "time-path" },
  { pattern: /(增长|数据|趋势|百分比|growth|data|trend|metric)/iu, symbol: "↗", metaphor: "measured-rise" },
  { pattern: /(流程|步骤|工作流|process|workflow|step)/iu, symbol: "→", metaphor: "production-line" },
  { pattern: /(比较|对比|区别|compare|versus|\bvs\b)/iu, symbol: "⇄", metaphor: "balanced-scale" },
  { pattern: /(产品|功能|发布|product|feature|launch)/iu, symbol: "◆", metaphor: "product-spotlight" },
  { pattern: /(网络|连接|系统|network|connect|system)/iu, symbol: "⌘", metaphor: "connected-network" },
];

function cleanText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function subjectLabels(visual, fallback) {
  if (Array.isArray(visual.nodes) && visual.nodes.length) return visual.nodes.map((item) => cleanText(item.label || item.name || item)).filter(Boolean).slice(0, 6);
  if (Array.isArray(visual.steps) && visual.steps.length) return visual.steps.map((item) => cleanText(item.operation || item.label)).filter(Boolean).slice(0, 6);
  if (Array.isArray(visual.items) && visual.items.length) return visual.items.map((item) => cleanText(item.name || item.title || item)).filter(Boolean).slice(0, 6);
  if (visual.item) return [cleanText(visual.item.name || fallback)].filter(Boolean);
  if (Array.isArray(visual.labels) && visual.labels.length) return visual.labels.map(cleanText).filter(Boolean).slice(0, 6);
  if (Array.isArray(visual.subjects) && visual.subjects.length) return visual.subjects.map(cleanText).filter(Boolean).slice(0, 6);
  if (Array.isArray(visual.points) && visual.points.length) return visual.points.map(cleanText).filter(Boolean).slice(0, 6);
  return [cleanText(fallback)].filter(Boolean);
}

function relationsFor(visual, subjects) {
  if (Array.isArray(visual.edges) && visual.edges.length) {
    return visual.edges.slice(0, 10).map((edge) => ({
      from: cleanText(edge.from),
      to: cleanText(edge.to),
      label: cleanText(edge.label || edge.relation),
    })).filter((edge) => edge.from && edge.to);
  }
  const relation = cleanText(visual.relation || (visual.kind === "cycle" ? "returns" : "leads-to"));
  return subjects.slice(0, -1).map((subject, index) => ({ from: subject, to: subjects[index + 1], label: relation }));
}

function metaphorFor(text, visual) {
  const combined = `${text} ${JSON.stringify(visual)}`;
  return metaphorRules.find((item) => item.pattern.test(combined)) || { symbol: "✦", metaphor: "editorial-focus" };
}

function normalizeMotion(value, fallback) {
  const allowed = new Set(Object.values(motionByKind).flat());
  const supplied = Array.isArray(value) ? value.map(cleanText).filter((item) => allowed.has(item)) : [];
  return supplied.length ? [...new Set(supplied)].slice(0, 5) : fallback;
}

export function directScene({ scene, narration, index, total }) {
  const visual = scene.visual || {};
  const kind = visual.kind || "definition";
  const subjects = subjectLabels(visual, scene.title || narration);
  const metaphor = metaphorFor(`${scene.title || ""} ${narration || ""}`, visual);
  const supplied = scene.direction || {};
  const motion = normalizeMotion(supplied.motion, motionByKind[kind] || ["focus", "reveal"]);
  const focus = cleanText(supplied.focus || subjects[0] || scene.title || narration);
  const beats = Array.isArray(supplied.beats) && supplied.beats.length
    ? supplied.beats.map((item, beatIndex) => ({
      id: cleanText(item.id || `beat-${beatIndex + 1}`),
      action: cleanText(item.action || motion[Math.min(beatIndex, motion.length - 1)]),
      subject: cleanText(item.subject || subjects[Math.min(beatIndex, subjects.length - 1)] || focus),
      emphasis: cleanText(item.emphasis || (beatIndex === 0 ? "primary" : "supporting")),
    }))
    : motion.map((action, beatIndex) => ({ id: `beat-${beatIndex + 1}`, action, subject: subjects[Math.min(beatIndex, subjects.length - 1)] || focus, emphasis: beatIndex === 0 ? "primary" : "supporting" }));
  return {
    focus,
    subjects,
    relations: relationsFor(visual, subjects),
    metaphor: cleanText(supplied.metaphor || metaphor.metaphor),
    symbol: cleanText(supplied.symbol || metaphor.symbol),
    motion,
    beats,
    camera: {
      shot: cleanText(supplied.camera?.shot || (index === 0 ? "hero-wide" : index === total - 1 ? "summary-wide" : "diagram-medium")),
      movement: cleanText(supplied.camera?.movement || (motion.includes("trace") || motion.includes("flow") ? "follow-path" : "gentle-push")),
      focus,
    },
    composition: {
      anchor: cleanText(supplied.composition?.anchor || (index % 2 ? "left" : "center")),
      occupancyTarget: Number.isFinite(Number(supplied.composition?.occupancyTarget)) ? Math.max(0.4, Math.min(0.88, Number(supplied.composition.occupancyTarget))) : 0.64,
      depth: cleanText(supplied.composition?.depth || "foreground-subject/supporting-context"),
    },
    hook: index === 0 ? {
      promise: cleanText(supplied.hook?.promise || scene.title || narration),
      tension: cleanText(supplied.hook?.tension || (subjects[1] ? `${subjects[0]} → ${subjects[1]}` : focus)),
      targetSeconds: 3,
    } : null,
  };
}

export function buildDirectionPlan({ title, type, scenes, narration }) {
  const directedScenes = scenes.map((scene, index) => ({
    sceneId: `scene-${String(index + 1).padStart(2, "0")}`,
    kind: scene.visual?.kind || "definition",
    ...directScene({ scene, narration: narration[index], index, total: scenes.length }),
  }));
  return {
    schemaVersion: 1,
    title: cleanText(title),
    type,
    strategy: "semantic-subject-relation-motion-focus",
    scenes: directedScenes,
  };
}

export function validateDirectionPlan(plan, sceneCount) {
  const failures = [];
  if (plan?.schemaVersion !== 1) failures.push("unsupported direction-plan schema");
  if (!Array.isArray(plan?.scenes) || plan.scenes.length !== sceneCount) failures.push("direction-plan scene count differs from the locked script");
  for (const [index, scene] of (plan?.scenes || []).entries()) {
    if (!scene.focus) failures.push(`scene ${index + 1} has no visual focus`);
    if (!Array.isArray(scene.motion) || !scene.motion.length) failures.push(`scene ${index + 1} has no semantic motion`);
    if (!Array.isArray(scene.beats) || !scene.beats.length) failures.push(`scene ${index + 1} has no direction beats`);
    if (!Number.isFinite(Number(scene.composition?.occupancyTarget))) failures.push(`scene ${index + 1} has no occupancy target`);
  }
  if (failures.length) throw new Error(`Direction-plan validation failed:\n- ${failures.join("\n- ")}`);
  return plan;
}
