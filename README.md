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

AGENT HQ is a playable, browser-based 3D isometric office simulation. Five miniature robotic agents work across a premium black-and-white floor with warm-gold accents, a central executive desk, a glass boardroom, partitions and a coffee bar. Everything is simulated locally in the browser — no API keys or external AI services are required.

### Play

- **Orbit**: drag
- **Pan**: right-drag (or two-finger drag on touch)
- **Zoom**: scroll or pinch
- **Views**: `I` isometric, `T` top-down, `R` reset
- **Select an agent**: click a robot, its desk, or a roster row (`1`–`5`)
- **Directives**: choose Analyze, Review or Sync from the selected-agent panel
- **Stand-up**: click the boardroom, the CONVENE STAND-UP button, or the executive console
- **Pause / tempo**: `Space` or the operations bar
- **Clear selection**: `Esc`

The roster, activity feed, task progress, focus and token metrics all update live. Directive and stand-up states are fully simulated and reset cleanly.

### Development

```bash
npm ci
npm run dev      # Vite development server
npm test         # simulation behaviour tests
npm run build    # production output in dist/
```

The scene uses merged static geometry, a capped pixel ratio, reduced shadow resolution and fewer ambient particles on low-power/mobile devices.
