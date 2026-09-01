import { canonicalParagraph } from "./utils.mjs";

export const supportedLanguages = {
  "zh-CN": { html: "zh-CN", espeak: "zh", family: '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif', cueLimit: 22 },
  "en-US": { html: "en", espeak: "en-us", family: 'Inter,"Helvetica Neue",Arial,sans-serif', cueLimit: 64 },
  "ja-JP": { html: "ja", espeak: "ja", family: '"Hiragino Sans","Yu Gothic","Noto Sans CJK JP",sans-serif', cueLimit: 26 },
  "ko-KR": { html: "ko", espeak: "ko", family: '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans CJK KR",sans-serif', cueLimit: 30 },
  "es-ES": { html: "es", espeak: "es", family: 'Inter,"Helvetica Neue",Arial,sans-serif', cueLimit: 64 },
  "fr-FR": { html: "fr", espeak: "fr", family: 'Inter,"Helvetica Neue",Arial,sans-serif', cueLimit: 64 },
  "de-DE": { html: "de", espeak: "de", family: 'Inter,"Helvetica Neue",Arial,sans-serif', cueLimit: 64 },
  "pt-BR": { html: "pt-BR", espeak: "pt-br", family: 'Inter,"Helvetica Neue",Arial,sans-serif', cueLimit: 64 },
};

const aliases = {
  auto: "auto", zh: "zh-CN", "zh-cn": "zh-CN", chinese: "zh-CN",
  en: "en-US", "en-us": "en-US", english: "en-US",
  ja: "ja-JP", "ja-jp": "ja-JP", japanese: "ja-JP",
  ko: "ko-KR", "ko-kr": "ko-KR", korean: "ko-KR",
  es: "es-ES", "es-es": "es-ES", spanish: "es-ES",
  fr: "fr-FR", "fr-fr": "fr-FR", french: "fr-FR",
  de: "de-DE", "de-de": "de-DE", german: "de-DE",
  pt: "pt-BR", "pt-br": "pt-BR", portuguese: "pt-BR",
};

export function detectLanguage(text) {
  const value = String(text || "");
  const counts = {
    "zh-CN": (value.match(/[\u3400-\u9fff]/gu) || []).length,
    "ja-JP": (value.match(/[\u3040-\u30ff]/gu) || []).length,
    "ko-KR": (value.match(/[\uac00-\ud7af]/gu) || []).length,
    latin: (value.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/gu) || []).length,
  };
  if (counts["ja-JP"] > 2) return "ja-JP";
  if (counts["ko-KR"] > 2) return "ko-KR";
  if (counts["zh-CN"] >= Math.max(2, counts.latin * 0.35)) return "zh-CN";
  if (/\b(el|la|los|las|una|para|con|por|que)\b/iu.test(value)) return "es-ES";
  if (/\b(le|la|les|une|pour|avec|des|que)\b/iu.test(value)) return "fr-FR";
  if (/\b(der|die|das|und|mit|für|nicht)\b/iu.test(value)) return "de-DE";
  if (/\b(o|a|os|as|uma|para|com|não)\b/iu.test(value)) return "pt-BR";
  return "en-US";
}

export function resolveLanguage(requested, text) {
  const normalized = aliases[String(requested || "auto").toLowerCase()];
  if (!normalized) throw new Error(`Unsupported language: ${requested}. Use auto or one of ${Object.keys(supportedLanguages).join(", ")}`);
  return normalized === "auto" ? detectLanguage(text) : normalized;
}

function baseSentenceChunks(value) {
  const text = canonicalParagraph(value);
  const chunks = [];
  let cursor = "";
  for (const char of text) {
    cursor += char;
    if (/[。！？?!；;：:\n]/u.test(char)) {
      chunks.push(cursor);
      cursor = "";
    }
  }
  if (cursor) chunks.push(cursor);
  return chunks.filter(Boolean);
}

function splitLongExact(value, limit, cjk) {
  if ([...value].length <= limit) return [value];
  const chars = [...value];
  const chunks = [];
  let start = 0;
  while (start < chars.length) {
    let end = Math.min(chars.length, start + limit);
    if (end < chars.length) {
      const lower = Math.max(start + Math.floor(limit * 0.55), start + 1);
      for (let cursor = end; cursor >= lower; cursor -= 1) {
        const char = chars[cursor - 1];
        if ((cjk && /[，、；：,.]/u.test(char)) || (!cjk && /\s/u.test(char))) {
          end = cursor;
          break;
        }
      }
      const minimumTail = cjk ? 4 : 12;
      if (chars.length - end > 0 && chars.length - end < minimumTail) {
        const target = Math.max(start + 1, chars.length - minimumTail);
        let adjusted = target;
        const orphanLower = Math.max(start + Math.floor(limit * 0.45), start + 1);
        for (let cursor = target; cursor >= orphanLower; cursor -= 1) {
          const char = chars[cursor - 1];
          if ((cjk && /[，、；：,.]/u.test(char)) || (!cjk && /\s/u.test(char))) {
            adjusted = cursor;
            break;
          }
        }
        end = adjusted;
      }
    }
    chunks.push(chars.slice(start, end).join(""));
    start = end;
  }
  return chunks.filter(Boolean);
}

export function splitSubtitleCues(value, language) {
  const locale = supportedLanguages[language] || supportedLanguages["en-US"];
  const cjk = ["zh-CN", "ja-JP", "ko-KR"].includes(language);
  const cues = baseSentenceChunks(value).flatMap((chunk) => splitLongExact(chunk, locale.cueLimit, cjk));
  if (cues.join("") !== canonicalParagraph(value)) throw new Error("Subtitle cue splitting changed the locked text");
  return cues;
}

export function timingTokens(text, language) {
  if (["zh-CN", "ja-JP", "ko-KR"].includes(language)) {
    return [...String(text)].filter((token) => !/\s/u.test(token));
  }
  return String(text).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|[^\s]/gu) || [];
}

export function defaultPronunciations(language) {
  if (language !== "zh-CN") return [];
  return [
    { match: "AI", spoken: "A I" },
    { match: "API", spoken: "A P I" },
    { match: "MCP", spoken: "M C P" },
    { match: "LLM", spoken: "L L M" },
    { match: "URL", spoken: "U R L" },
    { match: "JSON", spoken: "J S O N" },
    { match: "CSV", spoken: "C S V" },
    { match: "GitHub", spoken: "Git Hub" },
  ];
}

export function fontFamilyFor(language) {
  return (supportedLanguages[language] || supportedLanguages["en-US"]).family;
}

export function espeakVoiceFor(language) {
  return (supportedLanguages[language] || supportedLanguages["en-US"]).espeak;
}
