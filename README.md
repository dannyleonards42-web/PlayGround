# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/dannyleonards42-web/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/dannyleonards42-web/PlayGround)

- 🎮 [Open the project](https://omgithub.com/dannyleonards42-web/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=dannyleonards42-web%2FPlayGround).
- 💻 [Explore the source](https://github.com/dannyleonards42-web/PlayGround).
- 🛠️ [Check build runs](https://github.com/dannyleonards42-web/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/dannyleonards42-web/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/dannyleonards42-web).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->

## AGENT HQ

AGENT HQ is a playable, browser-based 3D isometric office game. Five miniature robotic agents work across a premium black-and-white floor with warm-gold accents, a central executive desk, a glass boardroom, partitions and a coffee bar. Everything is simulated locally in the browser — no API keys or external AI services are required.

### The shift

Each 2½-minute shift throws priority client briefs onto the operations strip. A brief names an agent and the protocol they need: **ANALYZE**, **REVIEW** or **SYNC**. Open a brief, issue the highlighted directive, and clear it before the countdown expires.

- Cleared briefs award points, build a streak and restore confidence.
- Wrong directives cost confidence and break the streak.
- Expired briefs cost more confidence.
- Reach a confidence of zero and the shift ends early. Clear the full clock to bank your grade.
- Pause and tempo both affect the shift clock, so use them deliberately.
- Stand-up pauses the shift clock and brief timers until every agent is back at a desk.

### Play

- **Issue a directive**: click a brief card, then the highlighted directive on its agent
- **Orbit**: drag
- **Pan**: right-drag (or two-finger drag on touch)
- **Zoom**: scroll or pinch
- **Views**: `I` isometric, `T` top-down, `R` reset
- **Select an agent**: click a robot, its desk, or a roster row (`1`–`5`)
- **Stand-up**: click the boardroom, the CONVENE STAND-UP button, or the executive console
- **Pause / tempo**: `Space` or the operations bar
- **Clear selection**: `Esc`

The roster, activity feed, task progress, focus and token metrics all update live. Directive and stand-up states are fully simulated and reset cleanly. The 3D floor, shift timer and score are all rendered client-side.

### Development

```bash
npm ci
npm run dev      # Vite development server
npm test         # simulation + shift gameplay tests
npm run build    # production output in dist/
```

The scene uses merged static geometry, a capped pixel ratio, reduced shadow resolution and fewer ambient particles on low-power/mobile devices.
