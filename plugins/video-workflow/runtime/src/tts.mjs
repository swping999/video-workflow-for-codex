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

function systemProviderAvailable() {
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
  if (!espeak) throw new Error("No system TTS found; install espeak-ng or use another provider");
  const selectedVoice = voice && voice !== "auto" ? voice : language.split("-")[0];
  run(espeak, ["-v", selectedVoice, "-s", String(Math.max(80, Math.round(175 * speed))), "-w", output, text], "system TTS");
}

async function fetchAudio(url, options, outputBase) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`TTS request failed (${response.status}): ${body}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const extension = contentType.includes("mpeg") ? ".mp3" : contentType.includes("aac") ? ".aac" : ".wav";
  const output = `${outputBase}${extension}`;
  fs.writeFileSync(output, Buffer.from(await response.arrayBuffer()));
  return output;
}

async function synthesizeRemote(provider, item, request, outputBase) {
  const options = request.providerOptions || {};
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is required for provider=openai");
    return fetchAudio(
      `${options.baseUrl || "https://api.openai.com/v1"}/audio/speech`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: options.model || "gpt-4o-mini-tts", voice: request.voice === "auto" ? "alloy" : request.voice, input: item.ttsText, response_format: "wav", speed: request.speed }),
      },
      outputBase,
    );
  }
  if (provider === "elevenlabs") {
    const key = process.env.ELEVENLABS_API_KEY;
    const voiceId = options.voiceId || (request.voice !== "auto" ? request.voice : null);
    if (!key) throw new Error("ELEVENLABS_API_KEY is required for provider=elevenlabs");
    if (!voiceId) throw new Error("A voice ID is required for provider=elevenlabs");
    return fetchAudio(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.ttsText, model_id: options.model || "eleven_multilingual_v2" }),
      },
      outputBase,
    );
  }
  if (provider === "openai-compatible") {
    if (!options.endpoint) throw new Error("providerOptions.endpoint is required for provider=openai-compatible");
    const key = options.apiKeyEnv ? process.env[options.apiKeyEnv] : null;
    return fetchAudio(
      options.endpoint,
      {
        method: "POST",
        headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" },
        body: JSON.stringify({ model: options.model, voice: request.voice, input: item.ttsText, response_format: "wav", speed: request.speed }),
      },
      outputBase,
    );
  }
  throw new Error(`Unsupported narration provider: ${provider}`);
}

export async function synthesizeProject(projectArg, { provider: providerArg = null, overwrite = false } = {}) {
  const project = validateLockedSource(projectArg);
  const { projectRoot, source } = project;
  const requestPath = path.join(projectRoot, ".media", "audio-request.json");
  if (!fs.existsSync(requestPath)) throw new Error("Missing .media/audio-request.json; run export first");
  const request = readJson(requestPath);
  const provider = providerArg || source.audio.provider || "system";
  if (provider === "files") return { provider, generated: 0, skipped: request.items.length };
  if (provider === "system" && !systemProviderAvailable()) throw new Error("No operating-system TTS is available; use provider=files or configure another provider");

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
    if (provider === "system") {
      synthesizeSystem({ text: item.ttsText, output: `${outputBase}.wav`, voice: request.voice, language: request.language, speed: Number(request.speed) });
    } else {
      await synthesizeRemote(provider, item, request, outputBase);
    }
    generated += 1;
  }
  return { provider, generated, skipped, rawDir, platform: `${os.platform()}-${os.arch()}` };
}
