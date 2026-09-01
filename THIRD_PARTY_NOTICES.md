# Third-party notices

Runtime packages are installed from npm and retain their own licenses:

- [GSAP](https://www.npmjs.com/package/gsap) 3.15.0 — GreenSock Standard "No Charge" License. Used for deterministic animation timelines; GSAP is not relicensed under this repository's MIT License.
- [Puppeteer Core](https://www.npmjs.com/package/puppeteer-core) 25.9.0 — Apache-2.0. Used to control a user-installed Chromium-based browser for frame capture.
- [@ffmpeg-installer/ffmpeg](https://www.npmjs.com/package/@ffmpeg-installer/ffmpeg) 1.1.0 — LGPL-2.1 wrapper package. Platform-specific binary packages declare LGPL-2.1, GPL-3.0, or an upstream FFmpeg license URL. Used for audio processing and final encoding.
- [@ffprobe-installer/ffprobe](https://www.npmjs.com/package/@ffprobe-installer/ffprobe) 2.1.2 — LGPL-2.1 wrapper package. Platform-specific binary packages declare LGPL-2.1 or GPL-3.0. Used for duration inspection.

FFmpeg licensing varies with the selected binary build and enabled components. Users who replace the installer binary are responsible for checking their chosen build.

Operating-system speech engines are invoked locally and are not redistributed. User-supplied audio remains subject to its own rights and terms. This repository does not redistribute voice models, personal voice samples, identity photographs, generated episodes, or cloud credentials.
