# AGENT HQ — Simulated Prototype

A playable 3D isometric office simulation where five miniature robotic AI agents work the floor of a premium black, white, and gold headquarters. Everything is procedural Three.js geometry and canvas texture work — no external 3D assets, paid APIs, or API keys.

## Run it

```bash
npm install
npm run dev -- --port 5173
```

Open `http://localhost:5173`. For a production check:

```bash
npm run build
npm run preview -- --port 5173
```

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Orbit camera | Drag | One-finger drag |
| Pan camera | Right-drag | Two-finger drag |
| Zoom | Scroll or camera dock | Pinch or camera dock |
| Select agent | Click robot, roster row, or `1`–`5` | Tap robot or roster card |
| Clear selection | `Escape` or panel close | Panel close |
| Isometric / top-down | Toolbar or `I` / `T` | Toolbar |
| Focus boardroom | Click the glass boardroom | Tap the glass boardroom |
| Executive console | Click the executive desk | Tap the executive desk |
| Pour a coffee | Click the coffee bar | Tap the coffee bar |
| Pause / resume | `Space` or Pause | Pause |
| Change tempo | `S` or `1× / 2×` | Tempo |
| Convene stand-up | Button or `M` | Stand-up |

## What is simulated

- **Five agents** — Nova (Chief of Staff), Atlas (Strategy Lead), Iris (Research Analyst), Echo (Communications Director), and Onyx (Operations Engineer), each with a distinct role, task stream, status, and workstation.
- **Live tasks** — agents progress through role-specific work, publish results to the activity feed, and rotate to new tasks. Directives (Analyze / Review / Sync) interrupt the current task immediately.
- **Executive stand-up** — agents walk through the boardroom door, gather around the table, hold the meeting, then retrace their route back to their desks.
- **Interactive furniture** — the boardroom, executive desk/hologram, and coffee bar are all clickable and drive real camera or simulation events.
- **Executive HUD** — selected-agent detail panel, five-agent roster, newest-first operations feed, pause/tempo, stand-up control, and a boot sequence with live metrics.

## Performance notes

- Built for a 6 GB Android tablet / Snapdragon-class GPU: device pixel ratio is capped, antialiasing is disabled on coarse-pointer or low-memory devices, static geometry is merged by material, and the shadow map renders once.
- Typical desktop scene: ~263 draw calls and ~141k triangles. Touch/low-power profile stays around ~220 draw calls and ~129k triangles at a capped pixel ratio.
- Responsive presets cover desktop, tablet, and portrait phone. Touch targets stay large and the roster becomes a horizontal dock on phones.

## Structure

```text
index.html          HUD shell, help dialog, boot screen
src/main.js         Renderer, camera presets, raycasting, simulation loop, test API
src/world.js        Procedural office, robots, furniture, lighting, static merge
src/simulation.js   Agent definitions, tasks, directives, stand-up lifecycle, feed
src/ui.js           HUD rendering, roster/feed, panels, toasts, controls
src/styles.css      Responsive layout and visual system
src/textures.js     Procedural floor, rugs, screens, signage, floor crest
public/fonts/       Locally bundled OFL fonts (Manrope, Instrument Serif)
```

The browser test surface is exposed at `window.AGENT_HQ` (`getState`, `getMetrics`, `selectAgent`, `setView`, `conveneStandup`, `showExecutiveConsole`, and related helpers).

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
