import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mediaBinaries } from "./media-tools.mjs";
import { espeakVoiceFor } from "./language.mjs";
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

const macVoiceCache = new Map();

function automaticMacVoice(say, language) {
  if (macVoiceCache.has(language)) return macVoiceCache.get(language);
  const locale = String(language || "en-US").replace("-", "_");
  const result = run(say, ["-v", "?"], "list macOS voices");
  const exact = result.stdout.split(/\r?\n/u).find((line) => line.includes(`# ${locale}`));
  const prefix = locale.split("_")[0];
  const fallback = result.stdout.split(/\r?\n/u).find((line) => line.includes(`# ${prefix}_`));
  const selected = (exact || fallback)?.trim().split(/\s+/u)[0] || null;
  macVoiceCache.set(language, selected);
  return selected;
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
    const selectedVoice = voice && voice !== "auto" ? voice : automaticMacVoice(say, language);
    if (selectedVoice) args.push("-v", selectedVoice);
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
    const languagePrefix = String(language || "en-US").split("-")[0];
    const selectVoice = voice && voice !== "auto"
      ? `$s.SelectVoice(${psQuote(voice)});`
      : `$v=$s.GetInstalledVoices() | Where-Object {$_.VoiceInfo.Culture.Name -like ${psQuote(`${languagePrefix}-*`)}} | Select-Object -First 1; if($v){$s.SelectVoice($v.VoiceInfo.Name)};`;
    const script = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; ${selectVoice} $s.Rate=${Math.max(-10, Math.min(10, Math.round((speed - 1) * 5)))}; $s.SetOutputToWaveFile(${psQuote(output)}); $s.Speak([IO.File]::ReadAllText(${psQuote(textFile)})); $s.Dispose();`;
    run(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], "system TTS");
    fs.unlinkSync(textFile);
    return;
  }
  const espeak = executable("espeak-ng") || executable("espeak");
  if (!espeak) throw new Error("No system TTS found; install espeak-ng or use provider=files");
  const selectedVoice = voice && voice !== "auto" ? voice : espeakVoiceFor(language);
  run(espeak, ["-v", selectedVoice, "-s", String(Math.max(80, Math.round(175 * speed))), "-w", output, text], "system TTS");
}

function synthesizeAdapter({ adapterPath, text, output, voice, language, prosody }) {
  if (!adapterPath) throw new Error("Narration provider adapter requires --adapter /absolute/executable or VIDEO_WORKFLOW_TTS_ADAPTER");
  const resolved = path.resolve(adapterPath);
  try { fs.accessSync(resolved, fs.constants.X_OK); } catch { throw new Error(`TTS adapter is not executable: ${resolved}`); }
  const textFile = `${output}.txt`;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(textFile, text);
  try {
    run(resolved, [
      "--text-file", textFile,
      "--output", output,
      "--language", String(language || "auto"),
      "--voice", String(voice || "auto"),
      "--rate", String(Number(prosody?.rate || 1)),
      "--pitch", String(Number(prosody?.pitch || 0)),
      "--emphasis", String(prosody?.emphasis || "moderate"),
    ], "local TTS adapter");
  } finally {
    fs.rmSync(textFile, { force: true });
  }
  if (!fs.existsSync(output)) throw new Error(`TTS adapter did not create output: ${output}`);
}

export async function synthesizeProject(projectArg, { provider: providerArg = null, overwrite = false, adapter: adapterArg = null } = {}) {
  const project = validateLockedSource(projectArg);
  const { projectRoot, source } = project;
  const requestPath = path.join(projectRoot, ".media", "audio-request.json");
  if (!fs.existsSync(requestPath)) throw new Error("Missing .media/audio-request.json; run export first");
  const request = readJson(requestPath);
  const provider = providerArg || source.audio.provider || "system";
  if (!["system", "files", "adapter"].includes(provider)) throw new Error("Narration provider must be system, files, or adapter; the free core never calls a cloud speech API");
  if (provider === "files") return { provider, generated: 0, skipped: request.items.length };
  if (provider === "system" && !systemProviderAvailable()) throw new Error("No free operating-system TTS is available; install espeak-ng on Linux or use provider=files");

  const useContinuous = Boolean(request.continuousNarration && request.scenes?.length);
  const rawDir = path.join(projectRoot, useContinuous ? ".media/raw-scenes" : ".media/raw-cues");
  fs.mkdirSync(rawDir, { recursive: true });
  let generated = 0;
  let skipped = 0;
  const jobs = useContinuous ? request.scenes : request.items;
  const adapterPath = adapterArg || process.env.VIDEO_WORKFLOW_TTS_ADAPTER || null;
  for (const item of jobs) {
    const existing = ["wav", "flac", "mp3", "m4a", "aac"].map((extension) => path.join(rawDir, `${item.id}.${extension}`)).find((candidate) => fs.existsSync(candidate));
    if (existing && !overwrite) {
      skipped += 1;
      continue;
    }
    if (existing && overwrite) fs.unlinkSync(existing);
    const outputBase = path.join(rawDir, item.id);
    const parameters = {
      text: item.ttsText,
      output: `${outputBase}.wav`,
      voice: item.voice || request.voice,
      language: item.language || request.language,
      speed: Number(item.prosody?.rate || request.prosody?.rate || request.speed),
      prosody: item.prosody || request.prosody,
    };
    if (provider === "adapter") synthesizeAdapter({ ...parameters, adapterPath });
    else synthesizeSystem(parameters);
    generated += 1;
  }
  return { provider, generated, skipped, rawDir, continuousNarration: useContinuous, platform: `${os.platform()}-${os.arch()}` };
}
