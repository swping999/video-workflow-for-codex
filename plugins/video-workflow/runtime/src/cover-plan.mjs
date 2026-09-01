const layouts = ["editorial-split", "symbol-center", "diagonal-story"];

function compact(value, limit) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  return [...text].length > limit ? `${[...text].slice(0, limit).join("")}…` : text;
}

function subtitleFrom(source, firstDirection) {
  const tension = firstDirection?.hook?.tension;
  if (tension && tension !== source.project.title) return compact(tension, 34);
  const next = source.scenes[1]?.title || source.scenes[0]?.cues?.[0] || "";
  return compact(next, 34);
}

export function buildCoverPlan(source, directionPlan) {
  const firstDirection = directionPlan.scenes[0];
  const symbol = firstDirection?.symbol || "✦";
  const headline = compact(source.project.title, 28);
  const subtitle = subtitleFrom(source, firstDirection);
  return {
    schemaVersion: 1,
    strategy: "independent-cover-composition",
    formatSafeArea: source.render.platform.coverSafeArea,
    candidates: layouts.map((layout, index) => ({
      id: `cover-${index + 1}`,
      layout,
      headline,
      subtitle,
      symbol,
      visualMetaphor: firstDirection?.metaphor || "editorial-focus",
      eyebrow: index === 0 ? source.project.type.toUpperCase() : index === 1 ? "VISUAL EXPLAINER" : "WATCH IN 30 SECONDS",
      accent: index % 2 ? "secondary" : "primary",
      occupancyTarget: [0.68, 0.62, 0.72][index],
    })),
  };
}

export function validateCoverPlan(plan) {
  const failures = [];
  if (plan?.schemaVersion !== 1) failures.push("unsupported cover-plan schema");
  if (!Array.isArray(plan?.candidates) || plan.candidates.length < 2) failures.push("cover plan needs at least two candidates");
  for (const [index, candidate] of (plan?.candidates || []).entries()) {
    if (!layouts.includes(candidate.layout)) failures.push(`cover ${index + 1} has an unsupported layout`);
    if (!candidate.headline) failures.push(`cover ${index + 1} has no headline`);
    if (!candidate.symbol) failures.push(`cover ${index + 1} has no visual symbol`);
  }
  if (failures.length) throw new Error(`Cover-plan validation failed:\n- ${failures.join("\n- ")}`);
  return plan;
}
