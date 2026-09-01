import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mediaBinaries } from "./media-tools.mjs";
import { readJson, run } from "./utils.mjs";
import { validateLockedSource } from "./source.mjs";

function executable(name) {
  try {
    const result = run(process.platform === "win32" ? "where" : "which", [name], `locate ${name}`);
    return result.stdout.trim().split(/\r?\n/u)[0] || null;
  } catch {
    return null;
  }
}

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function systemProviderAvailable() {
  if (process.platform === "darwin") return Boolean(executable("say"));
  if (process.platform === "win32") return Boolean(executable("powershell") || executable("pwsh"));
  return Boolean(executable("espeak-ng") || executable("espeak"));
}

function synthesizeSystem({ text, output, voice, language, speed }) {
  const { ffmpeg } = mediaBinaries();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (process.platform === "darwin") {
    const say = executable("say");
    if (!say) throw new Error("macOS system speech command `say` is unavailable");
    const intermediate = `${output}.aiff`;
    const args = [];
    if (voice && voice !== "auto") args.push("-v", voice);
    args.push("-r", String(Math.max(80, Math.round(190 * speed))), "-o", intermediate, text);
    run(say, args, "system TTS");
    run(ffmpeg, ["-y", "-v", "error", "-i", intermediate, "-ar", "48000", "-ac", "1", output], "convert system TTS");
    fs.unlinkSync(intermediate);
    return;
  }
  if (process.platform === "win32") {
    const powershell = executable("powershell") || executable("pwsh");
    if (!powershell) throw new Error("Windows SpeechSynthesizer is unavailable");
    const textFile = `${output}.txt`;
    fs.writeFileSync(textFile, text);
    const selectVoice = voice && voice !== "auto" ? `$s.SelectVoice(${psQuote(voice)});` : "";
    const script = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; ${selectVoice} $s.Rate=${Math.max(-10, Math.min(10, Math.round((speed - 1) * 5)))}; $s.SetOutputToWaveFile(${psQuote(output)}); $s.Speak([IO.File]::ReadAllText(${psQuote(textFile)})); $s.Dispose();`;
    run(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], "system TTS");
    fs.unlinkSync(textFile);
    return;
  }
  const espeak = executable("espeak-ng") || executable("espeak");
  if (!espeak) throw new Error("No system TTS found; install espeak-ng or use provider=files");
  const selectedVoice = voice && voice !== "auto" ? voice : language.split("-")[0];
  run(espeak, ["-v", selectedVoice, "-s", String(Math.max(80, Math.round(175 * speed))), "-w", output, text], "system TTS");
}

export async function synthesizeProject(projectArg, { provider: providerArg = null, overwrite = false } = {}) {
  const project = validateLockedSource(projectArg);
  const { projectRoot, source } = project;
  const requestPath = path.join(projectRoot, ".media", "audio-request.json");
  if (!fs.existsSync(requestPath)) throw new Error("Missing .media/audio-request.json; run export first");
  const request = readJson(requestPath);
  const provider = providerArg || source.audio.provider || "system";
  if (!["system", "files"].includes(provider)) throw new Error("Narration provider must be system or files; the free core never calls a cloud speech API");
  if (provider === "files") return { provider, generated: 0, skipped: request.items.length };
  if (!systemProviderAvailable()) throw new Error("No free operating-system TTS is available; install espeak-ng on Linux or use provider=files");

  const rawDir = path.join(projectRoot, ".media", "raw-cues");
  fs.mkdirSync(rawDir, { recursive: true });
  let generated = 0;
  let skipped = 0;
  for (const item of request.items) {
    const existing = ["wav", "flac", "mp3", "m4a", "aac"].map((extension) => path.join(rawDir, `${item.id}.${extension}`)).find((candidate) => fs.existsSync(candidate));
    if (existing && !overwrite) {
      skipped += 1;
      continue;
    }
    if (existing && overwrite) fs.unlinkSync(existing);
    const outputBase = path.join(rawDir, item.id);
    synthesizeSystem({ text: item.ttsText, output: `${outputBase}.wav`, voice: request.voice, language: request.language, speed: Number(request.speed) });
    generated += 1;
  }
  return { provider, generated, skipped, rawDir, platform: `${os.platform()}-${os.arch()}` };
}
