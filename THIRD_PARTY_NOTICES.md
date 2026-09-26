# Third-party notices

## React Video Editor — Remotion Templates

Source: https://github.com/reactvideoeditor/remotion-templates · https://www.reactvideoeditor.com/remotion-templates

The repository states: "All templates in this repository are available under the MIT License. You can use them in personal and commercial projects, but attribution is appreciated where applicable." Individual files carry the header "This template is free to use in your projects! Credit appreciated but not required."

The following engine components adapt effects from these templates (re-implemented as timeline-driven, style-token-driven components; no template is used verbatim or loaded at runtime):

| Engine component | Adapted from |
|---|---|
| `src/remotion/engine/accents.jsx` — `Letterbox` | Letterbox Reveal (`letterbox-reveal.tsx`) |
| `src/remotion/engine/accents.jsx` — `FocusPull` | Image Zoom Reveal (`image-zoom-reveal.tsx`) |
| `src/remotion/engine/accents.jsx` — `FilmBurn` | Film Burn (`film-burn.tsx`) |
| `src/remotion/engine/accents.jsx` — `irisClip` (iris transition) | Spotlight Reveal (`spotlight-reveal.tsx`) |
| `src/remotion/families/photo.jsx` — `StackPhoto` | Photo Stack (`photo-stack.tsx`) |
| `src/remotion/families/editorial.jsx` — statement `highlight` variant | Text Highlight (`text-highlight.tsx`) |
| `src/remotion/families/editorial.jsx` — statement `chars` variant | Animated Text (`animated-text.tsx`) |
| `src/remotion/families/editorial.jsx` — `ChapterSplit` | Title Split (`title-split.tsx`) |
| `src/remotion/families/structured.jsx` — `ShareChart` | Donut Chart (`donut-chart.tsx`) |
| `src/remotion/families/structured.jsx` — `RankChart` | Progress Bars (`progress-bars.tsx`) |

Not used: `stat-counter`, `chart-animation`, `comparison-chart` (listed as Pro on the website despite appearing in the MIT repository), and templates based on CSS keyframe animation (`ken-burns`, `parallax-pan`, `zoom-pulse`, `floating-bubble-text`), which do not render deterministically in Remotion.

```
MIT License

Copyright (c) React Video Editor (reactvideoeditor.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
