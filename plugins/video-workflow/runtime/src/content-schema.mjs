import fs from "node:fs";
import path from "node:path";
import { canonicalParagraph, readJson } from "./utils.mjs";

export const contentTypes = ["auto", "explainer", "listicle", "workflow", "comparison", "promo", "data-story"];
export const contentSchemaVersion = 1;

const visualKinds = {
  explainer: ["definition", "mechanism", "cause-effect", "timeline", "structure", "analogy", "misconception", "cycle"],
  listicle: ["list-overview", "list-item", "ranking", "recommendation"],
  workflow: ["process", "decision", "checkpoint", "demo", "acceptance"],
  comparison: ["comparison-table", "before-after", "tradeoff", "radar", "decision-tree"],
  promo: ["pain", "solution", "feature-demo", "proof", "cta"],
  "data-story": ["bar-chart", "line-chart", "area-chart", "ranking-chart", "trend-illustration"],
};

function score(text, pattern, weight, scores, type) {
  const matches = String(text).match(pattern);
  if (matches) scores[type] += weight * matches.length;
}

export function inferContentTypeDetailed(text, paragraphCount = 1) {
  const scores = Object.fromEntries(contentTypes.filter((type) => type !== "auto").map((type) => [type, 0]));
  score(text, /(对比|区别|差异|优缺点|\bvs\.?\b|before\s*\/\s*after|compare|versus)/giu, 4, scores, "comparison");
  score(text, /(步骤|第[一二三四五六七八九十\d]+步|流程|工作流|教程|操作|检查点|输入|输出|先.+再.+最后|how[ -]?to|tutorial|step)/giu, 3, scores, "workflow");
  score(text, /(数据|增长|下降|趋势|排名|星标|百分比|同比|环比|拐点|异常|\d+(?:\.\d+)?\s*%|metric|trend|growth|data)/giu, 4, scores, "data-story");
  score(text, /(功能|产品|发布|广告|转化|购买|品牌|卖点|客户|价格|CTA|feature|launch|product|brand)/giu, 2.5, scores, "promo");
  score(text, /(第[一二三四五六七八九十\d]+个|\b\d+[.)、]|清单|盘点|推荐|排行|list|top\s*\d+)/giu, 3, scores, "listicle");
  score(text, /(是什么|为什么|原理|机制|概念|误区|因果|解释|科普|what is|why|explain|concept)/giu, 2.5, scores, "explainer");
  if (paragraphCount >= 4 && scores.listicle > 0) scores.listicle += 1;
  if (Object.values(scores).every((value) => value === 0)) scores.explainer = 1;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [primary, primaryScore] = ranked[0];
  const [secondary, secondaryScore] = ranked[1];
  const confidence = primaryScore <= 1 ? 0.55 : Math.min(0.99, 0.58 + (primaryScore - secondaryScore) / Math.max(4, primaryScore * 2));
  return { primary, secondary: secondaryScore > 0 && secondaryScore >= primaryScore * 0.55 ? secondary : null, confidence: Number(confidence.toFixed(2)), scores };
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim()); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim()); value = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function loadChartData(filePath) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Data file not found: ${resolved}`);
  if (path.extname(resolved).toLowerCase() === ".json") {
    const value = readJson(resolved);
    return value.chart || value;
  }
  const rows = csvRows(fs.readFileSync(resolved, "utf8"));
  if (rows.length < 2) throw new Error("CSV data needs a header and at least one row");
  const [header, ...body] = rows;
  const labelIndex = 0;
  const valueIndex = Math.max(1, header.findIndex((item) => /value|数值|数量|percent|百分比/iu.test(item)));
  return {
    type: "bar",
    labels: body.map((row) => row[labelIndex]),
    values: body.map((row) => Number(row[valueIndex])),
    unit: header[valueIndex]?.match(/\((.*?)\)/u)?.[1] || "",
    source: path.basename(resolved),
  };
}

function pieces(text, fallback = ["重点", "方法", "结果"]) {
  const values = String(text).replace(/[。！？?!；;]$/u, "").split(/[，、,；;：:]/u).map((item) => item.trim()).filter(Boolean);
  return (values.length > 1 ? values : fallback).slice(0, 6);
}

function normalizeChart(chart, sources) {
  if (!chart) return { kind: "trend-illustration", illustrative: true, label: "趋势示意（非真实数据）", points: [] };
  let labels = Array.isArray(chart.labels) ? chart.labels.map(String) : [];
  const rawValues = Array.isArray(chart.values) ? chart.values : [];
  if (!labels.length || labels.length !== rawValues.length) throw new Error("Chart labels and values must have equal non-zero length");
  const missing = chart.missing || "error";
  let values = rawValues.map((value) => value === null || value === "" ? Number.NaN : Number(value));
  if (values.some((value) => !Number.isFinite(value))) {
    if (missing === "zero") values = values.map((value) => Number.isFinite(value) ? value : 0);
    else if (missing === "skip") {
      const rows = labels.map((label, index) => ({ label, value: values[index] })).filter((row) => Number.isFinite(row.value));
      labels = rows.map((row) => row.label); values = rows.map((row) => row.value);
    } else if (missing === "interpolate") {
      values = values.map((value, index) => {
        if (Number.isFinite(value)) return value;
        const before = values.slice(0, index).findLast((item) => Number.isFinite(item));
        const after = values.slice(index + 1).find((item) => Number.isFinite(item));
        if (Number.isFinite(before) && Number.isFinite(after)) return (before + after) / 2;
        if (Number.isFinite(before)) return before;
        if (Number.isFinite(after)) return after;
        return Number.NaN;
      });
    } else throw new Error("Chart contains missing/non-numeric values; set missing to skip, zero, or interpolate explicitly");
  }
  if (!values.length || values.some((value) => !Number.isFinite(value))) throw new Error("Chart has no finite numeric values after missing-value handling");
  if (["asc", "desc"].includes(chart.sort)) {
    const direction = chart.sort === "asc" ? 1 : -1;
    const rows = labels.map((label, index) => ({ label, value: values[index] })).sort((a, b) => direction * (a.value - b.value));
    labels = rows.map((row) => row.label); values = rows.map((row) => row.value);
  }
  if (chart.scale === "log" && values.some((value) => value <= 0)) throw new Error("Log-scale charts require values greater than zero");
  const domain = Array.isArray(chart.domain) && chart.domain.length === 2 ? chart.domain.map(Number) : null;
  if (domain && (!domain.every(Number.isFinite) || domain[1] <= domain[0] || (chart.scale === "log" && domain[0] <= 0))) throw new Error("Chart domain must contain two increasing finite values compatible with the scale");
  const illustrative = Boolean(chart.illustrative);
  const sourceId = chart.sourceId || null;
  const inlineSource = chart.source || null;
  if (!illustrative && !sourceId && !inlineSource) throw new Error("A real chart requires sourceId or source; otherwise set illustrative=true");
  if (sourceId && !sources.some((source) => source.id === sourceId)) throw new Error(`Chart sourceId does not exist: ${sourceId}`);
  return {
    kind: ["bar", "line", "area", "ranking"].includes(chart.type) ? `${chart.type}-chart` : "bar-chart",
    labels,
    values,
    unit: String(chart.unit || ""),
    sourceId,
    source: inlineSource,
    illustrative,
    annotations: Array.isArray(chart.annotations) ? chart.annotations : [],
    range: chart.range || null,
    scale: chart.scale || "linear",
    domain,
    missing,
  };
}

function normalizeComparison(comparison) {
  if (!comparison) return { kind: "comparison-table", illustrative: true, subjects: ["对象 A", "对象 B"], dimensions: [], verdict: "请提供统一对比维度" };
  const subjects = Array.isArray(comparison.subjects) && comparison.subjects.length === 2 ? comparison.subjects.map(String) : null;
  const dimensions = Array.isArray(comparison.dimensions) ? comparison.dimensions.map((item) => ({ name: String(item.name || ""), a: item.a ?? "", b: item.b ?? "", ...(item.max !== undefined ? { max: Number(item.max) } : {}), winner: item.winner || null })) : [];
  if (!subjects || !dimensions.length || dimensions.some((item) => !item.name)) throw new Error("Comparison requires exactly two subjects and at least one named dimension");
  if (comparison.mode === "radar" && dimensions.some((item) => !Number.isFinite(Number(item.a)) || !Number.isFinite(Number(item.b)) || (item.max !== undefined && (!Number.isFinite(item.max) || item.max <= 0)))) throw new Error("Radar comparisons require numeric a/b values and positive optional max values");
  return { kind: comparison.mode || "comparison-table", illustrative: false, subjects, dimensions, verdict: String(comparison.verdict || ""), recommendation: comparison.recommendation || null };
}

function defaultModel(type, text, index, total, globalItemNumber, chartData) {
  const values = pieces(text);
  if (index === 0) return { kind: "hero", label: values[0] || "START", points: values };
  if (index === total - 1) return { kind: "summary", points: values };
  if (type === "explainer") {
    const kind = visualKinds.explainer[(index - 1) % visualKinds.explainer.length];
    return { kind, nodes: values.map((label, itemIndex) => ({ id: `n${itemIndex + 1}`, label })), relation: kind === "cause-effect" ? "causes" : "explains" };
  }
  if (type === "listicle") return { kind: "list-item", item: { rank: globalItemNumber, name: values[0] || String(text), reason: values[1] || "", audience: values[2] || "", pros: values.slice(1, 3), cons: [], score: null, icon: null, asset: null } };
  if (type === "workflow") return { kind: "process", current: Math.max(1, index), steps: values.map((label, stepIndex) => ({ id: `s${stepIndex + 1}`, label, input: stepIndex === 0 ? "输入" : "", operation: label, output: stepIndex === values.length - 1 ? "输出" : "", check: stepIndex === values.length - 1 ? "检查" : "", branch: null, estimate: null, caution: null, asset: null })) };
  if (type === "comparison") return normalizeComparison(null);
  if (type === "promo") {
    const kinds = ["pain", "solution", "feature-demo", "proof", "cta"];
    return { kind: kinds[Math.min(kinds.length - 1, index - 1)], points: values, proof: [], cta: index === total - 2 ? "了解更多" : null, asset: null };
  }
  if (type === "data-story") return normalizeChart(index === 1 ? chartData : null, []);
  return { kind: "definition", nodes: values.map((label) => ({ label })) };
}

function loadOptionalJson(filePath, label) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`${label} file not found: ${resolved}`);
  return { value: readJson(resolved), directory: path.dirname(resolved), path: resolved };
}

export function buildContentPlan({ scriptText, paragraphs, requestedType = "auto", planPath = null, dataPath = null, brandPath = null, language }) {
  const loadedPlan = loadOptionalJson(planPath, "Plan");
  const raw = loadedPlan?.value || {};
  if (raw.schemaVersion && raw.schemaVersion !== contentSchemaVersion) throw new Error(`Unsupported content plan schema: ${raw.schemaVersion}`);
  const classification = raw.classification || inferContentTypeDetailed(scriptText, paragraphs.length);
  const type = requestedType === "auto" ? (raw.type || classification.primary) : requestedType;
  if (!contentTypes.includes(type) || type === "auto") throw new Error(`Invalid resolved content type: ${type}`);
  const sources = Array.isArray(raw.sources) ? raw.sources.map((source, index) => ({ id: String(source.id || `source-${index + 1}`), title: String(source.title || source.url || `Source ${index + 1}`), url: source.url || null, note: source.note || null })) : [];
  const chartData = loadChartData(dataPath) || raw.chart || raw.data || null;
  const brandFile = loadOptionalJson(brandPath, "Brand");
  const brand = { name: null, logo: null, colors: [], fonts: [], cta: null, ...(raw.brand || {}), ...(brandFile?.value || {}) };
  if (!Array.isArray(brand.colors) || brand.colors.some((color) => !/^#[0-9a-f]{6}$/iu.test(String(color)))) throw new Error("Brand colors must be six-digit hex values");
  if (!Array.isArray(brand.fonts) || brand.fonts.some((font) => !String(font).trim())) throw new Error("Brand fonts must be non-empty names");
  const suppliedScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  if (suppliedScenes.length && suppliedScenes.length !== paragraphs.length) throw new Error(`Content plan scenes=${suppliedScenes.length} but script paragraphs=${paragraphs.length}`);
  let itemNumber = 0;
  const scenes = paragraphs.map((paragraph, index) => {
    const supplied = suppliedScenes[index] || {};
    if (supplied.narration && canonicalParagraph(supplied.narration) !== canonicalParagraph(paragraph)) throw new Error(`Content plan scene ${index + 1} narration differs from the locked script`);
    if (type === "listicle" && index > 0 && index < paragraphs.length - 1) itemNumber += 1;
    const paragraphClassification = inferContentTypeDetailed(paragraph, 1);
    const sceneType = supplied.type || (index > 0 && index < paragraphs.length - 1 && classification.secondary && classification.confidence < 0.75 && paragraphClassification.scores[paragraphClassification.primary] >= 3 ? paragraphClassification.primary : type);
    let model = supplied.visual || supplied.model || defaultModel(sceneType, paragraph, index, paragraphs.length, itemNumber, chartData);
    if (sceneType === "comparison" && (supplied.comparison || raw.comparison) && index > 0 && index < paragraphs.length - 1) model = normalizeComparison(supplied.comparison || raw.comparison);
    if (sceneType === "data-story" && (supplied.chart || (index === 1 ? chartData : null))) model = normalizeChart(supplied.chart || chartData, sources);
    if (sceneType === "promo" && model.kind === "cta" && brand.cta) model = { ...model, cta: brand.cta };
    if (model.kind && !["hero", "summary", ...Object.values(visualKinds).flat()].includes(model.kind)) throw new Error(`Unsupported visual kind in scene ${index + 1}: ${model.kind}`);
    return { contentType: sceneType, title: supplied.title || String(paragraph).replace(/[。！？?!；;：:]$/u, ""), chapter: supplied.chapter || null, visual: model, asset: supplied.asset || model.asset || null, icon: supplied.icon || null };
  });
  const claims = Array.isArray(raw.claims) ? raw.claims.map((claim, index) => ({ id: claim.id || `claim-${index + 1}`, text: String(claim.text || ""), sourceId: claim.sourceId || null, verified: Boolean(claim.verified), kind: claim.kind || "fact" })) : [];
  for (const claim of claims) {
    if ((claim.kind === "metric" || claim.kind === "testimonial" || claim.kind === "capability") && (!claim.verified || !claim.sourceId)) throw new Error(`${claim.kind} claim must be verified and cite sourceId: ${claim.text}`);
    if (claim.sourceId && !sources.some((source) => source.id === claim.sourceId)) throw new Error(`Claim sourceId does not exist: ${claim.sourceId}`);
  }
  for (const [sceneIndex, scene] of scenes.entries()) {
    const proof = Array.isArray(scene.visual?.proof) ? scene.visual.proof : [];
    if (!proof.length) continue;
    scene.visual.proof = proof.map((item) => {
      if (typeof item === "string") throw new Error(`Promo proof in scene ${sceneIndex + 1} must reference a verified claim or include verified source provenance`);
      if (item.claimId) {
        const claim = claims.find((entry) => entry.id === item.claimId);
        if (!claim || !claim.verified || !claim.sourceId) throw new Error(`Promo proof references an unverified claim: ${item.claimId}`);
        return { text: claim.text, sourceId: claim.sourceId, verified: true, claimId: claim.id };
      }
      if (!item.verified || !item.sourceId || !sources.some((source) => source.id === item.sourceId)) throw new Error(`Promo proof in scene ${sceneIndex + 1} requires verified=true and a valid sourceId`);
      return { text: String(item.text || ""), sourceId: item.sourceId, verified: true };
    });
  }
  return {
    schemaVersion: contentSchemaVersion,
    source: loadedPlan ? "provided" : "runtime-derived",
    sourceDirectory: loadedPlan?.directory || process.cwd(),
    brandDirectory: brandFile?.directory || loadedPlan?.directory || process.cwd(),
    language,
    type,
    classification: { ...classification, primary: type },
    title: raw.title || null,
    brand,
    sources,
    claims,
    pronunciation: Array.isArray(raw.pronunciation) ? raw.pronunciation : [],
    media: raw.media || { music: null, sfx: [] },
    scenes,
  };
}

export function validateContentPlan(plan) {
  const failures = [];
  if (plan.schemaVersion !== contentSchemaVersion) failures.push("unsupported content plan schema");
  if (!contentTypes.includes(plan.type) || plan.type === "auto") failures.push("content plan type is unresolved");
  if (!Array.isArray(plan.scenes) || !plan.scenes.length) failures.push("content plan has no scenes");
  for (const [index, scene] of (plan.scenes || []).entries()) {
    if (!scene.visual?.kind) failures.push(`scene ${index + 1} has no visual kind`);
    if (scene.visual?.kind?.endsWith("-chart") && !scene.visual.illustrative && !scene.visual.sourceId && !scene.visual.source) failures.push(`scene ${index + 1} chart has no source`);
    if (scene.visual?.kind === "comparison-table" && !scene.visual.illustrative && (!scene.visual.subjects || !scene.visual.dimensions?.length)) failures.push(`scene ${index + 1} comparison has no shared dimensions`);
  }
  if (failures.length) throw new Error(`Content-plan validation failed:\n- ${failures.join("\n- ")}`);
  return plan;
}
