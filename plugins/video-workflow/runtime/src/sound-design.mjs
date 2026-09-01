import fs from "node:fs";
import path from "node:path";
import { run, writeJson } from "./utils.mjs";

const cueForMotion = {
  assemble: "pop",
  transform: "chime",
  pulse: "pulse",
  trace: "tick",
  flow: "whoosh",
  progress: "tick",
  focus: "chime",
  reveal: "whoosh",
  highlight: "pop",
  annotate: "tick",
  confirm: "chime",
  verdict: "chime",
  cta: "pulse",
  cycle: "whoosh",
  grow: "rise",
};

const synthesis = {
  pop: "sine=frequency=560:duration=0.13,volume=0.12,afade=t=out:st=0.03:d=0.10",
  tick: "sine=frequency=1100:duration=0.08,volume=0.09,afade=t=out:st=0.02:d=0.06",
  chime: "sine=frequency=880:duration=0.34,volume=0.08,afade=t=in:d=0.02,afade=t=out:st=0.10:d=0.24",
  pulse: "sine=frequency=420:duration=0.24,volume=0.10,tremolo=f=8:d=0.55,afade=t=out:st=0.10:d=0.14",
  whoosh: "anoisesrc=color=pink:amplitude=0.05:duration=0.34,highpass=f=420,lowpass=f=4200,afade=t=in:d=0.03,afade=t=out:st=0.10:d=0.24",
  rise: "sine=frequency=360:duration=0.40,volume=0.08,afade=t=in:d=0.03,afade=t=out:st=0.20:d=0.20",
};

const moodByTheme = {
  whiteboard: "light-acoustic",
  editorial: "minimal-percussion",
  tech: "electronic-pulse",
  product: "modern-corporate",
};

const bedByMood = {
  "light-acoustic": [147, 220],
  "minimal-percussion": [110, 165],
  "electronic-pulse": [98, 196],
  "modern-corporate": [131, 196],
};

export function buildSoundPlan({ directionPlan, theme, mode = "subtle" }) {
  const normalizedMode = ["off", "subtle", "full"].includes(mode) ? mode : "subtle";
  const cues = [];
  if (normalizedMode !== "off") {
    for (const [sceneIndex, scene] of directionPlan.scenes.entries()) {
      const motions = normalizedMode === "full" ? scene.motion.slice(0, 3) : scene.motion.slice(0, 1);
      for (const [motionIndex, motion] of motions.entries()) {
        const sound = cueForMotion[motion];
        if (!sound) continue;
        cues.push({
          id: `${scene.sceneId}-${motionIndex + 1}-${sound}`,
          sceneId: scene.sceneId,
          motion,
          sound,
          offsetRatio: Number((0.08 + motionIndex * 0.24).toFixed(2)),
          volume: normalizedMode === "full" ? 0.34 : 0.22,
          procedural: true,
        });
      }
    }
  }
  return {
    schemaVersion: 1,
    mode: normalizedMode,
    musicMood: moodByTheme[theme] || "minimal-percussion",
    narrationPriority: true,
    ducking: { enabled: true, targetReductionDb: -12, attackMs: 15, releaseMs: 260 },
    cues,
  };
}

export function materializeProceduralSounds({ ffmpeg, projectRoot, story, soundPlan }) {
  if (!soundPlan || soundPlan.mode === "off") return [];
  const outputDir = path.join(projectRoot, ".media", "generated-sfx");
  fs.mkdirSync(outputDir, { recursive: true });
  const generated = new Map();
  for (const cue of soundPlan.cues || []) {
    if (!synthesis[cue.sound]) continue;
    if (!generated.has(cue.sound)) {
      const output = path.join(outputDir, `${cue.sound}.wav`);
      if (!fs.existsSync(output)) {
        run(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", synthesis[cue.sound], "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", output], `generate ${cue.sound} sound effect`);
      }
      generated.set(cue.sound, path.relative(projectRoot, output));
    }
  }
  const items = (soundPlan.cues || []).map((cue) => {
    const scene = story.scenes.find((item) => item.id === cue.sceneId);
    if (!scene || !generated.has(cue.sound)) return null;
    const usable = Math.max(0.08, scene.voice.duration - 0.12);
    return {
      file: generated.get(cue.sound),
      sceneId: cue.sceneId,
      offset: Number((scene.voice.start - scene.start + usable * cue.offsetRatio).toFixed(3)),
      volume: cue.volume,
      generated: true,
      motion: cue.motion,
    };
  }).filter(Boolean);
  writeJson(path.join(outputDir, "manifest.json"), { schemaVersion: 1, mode: soundPlan.mode, items });
  return items;
}

export function materializeProceduralMusic({ ffmpeg, projectRoot, story, soundPlan }) {
  if (!soundPlan || soundPlan.mode !== "full") return null;
  const outputDir = path.join(projectRoot, ".media", "generated-music");
  fs.mkdirSync(outputDir, { recursive: true });
  const output = path.join(outputDir, `${soundPlan.musicMood || "minimal-percussion"}.wav`);
  if (!fs.existsSync(output)) {
    const [rootFrequency, upperFrequency] = bedByMood[soundPlan.musicMood] || bedByMood["minimal-percussion"];
    const duration = Math.max(0.5, Number(story.duration));
    const fadeOutStart = Math.max(0, duration - 0.65);
    const source = `aevalsrc=0.032*sin(2*PI*${rootFrequency}*t)+0.018*sin(2*PI*${upperFrequency}*t):s=48000:d=${duration.toFixed(3)}`;
    run(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", source, "-af", `lowpass=f=1100,afade=t=in:d=0.45,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.65`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", output], "generate procedural background music");
  }
  return {
    file: path.relative(projectRoot, output),
    volume: 0.12,
    ducking: 0.24,
    generated: true,
    mood: soundPlan.musicMood,
  };
}
