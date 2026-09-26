> **Superseded:** this describes the previous template system. The current contract lives in `src/shared/styles.js` (styles/tokens), `src/services/aiDirectorService.js` (director schema) and `PIPELINE_ARCHITECTURE.md`.

# 🎥 SHOT_LIBRARY.MD — 12 PROFESSIONAL REMOTION SHOT PRIMITIVES

Each shot primitive in our Remotion engine serves a specific narrative purpose.

---

### 1. `archival_documentary`
- **Purpose:** Full-bleed authentic historical or corporate photography with cinematic pan-and-scan camera glide.
- **Key Params:**
  - `mediaUrl` (base64 image or clean public URL)
  - `panDirection`: `'left_to_right'` | `'right_to_left'` | `'push_in'` | `'pull_out'`
  - `vignetteIntensity`: `0.4` to `0.8`
  - `dateStamp` or `locationTag`: Optional subtle glass pill (e.g. `[ 📍 WALL STREET, 2008 ]`)
- **Text Rule:** No center headline box! Let the archival media fill the 1080x1920 canvas.

---

### 2. `animated_data_chart`
- **Purpose:** Live dynamic stock chart, valuation plunge, or inflation curve drawn in real-time.
- **Key Params:**
  - `chartType`: `'line'` | `'bar'` | `'candlestick'`
  - `direction`: `'crash'` (crimson red) | `'surge'` (emerald green)
  - `headline`: Context title (e.g. *"MARKET CAPITALIZATION"*)
  - `startValue`: e.g. `"$45.00"`
  - `endValue`: e.g. `"$0.12"`
  - `sfx`: `'sub_drop'`

---

### 3. `evidence_paper`
- **Purpose:** Leaked document, vintage newspaper clipping, internal email, or tweet headline slamming onto screen.
- **Key Params:**
  - `headlineText`: Bold newspaper title (e.g. *"LEHMAN BROTHERS FILES FOR BANKRUPTCY"*)
  - `source`: e.g. *"NEW YORK TIMES — SEPT 15, 2008"*
  - `highlightSnippet`: Red highlighter marker over the key confession sentence.
  - `sfx`: `'paper_slam'`

---

### 4. `dynamic_map_pulse`
- **Purpose:** Historical invasion route, fiber-optic cable connection, or global supply chain path.
- **Key Params:**
  - `mapRegion`: `'europe'` | `'usa'` | `'global'` | `'custom'`
  - `originCity`: e.g. *"Chicago"*
  - `destCity`: e.g. *"New Jersey"*
  - `latencyOrDistance`: e.g. *"13.3 Milliseconds"*
  - `pulseColor`: e.g. `"#38bdf8"`

---

### 5. `editorial_versus`
- **Purpose:** Full-screen Before vs After / Myth vs Reality comparison with dynamic division line.
- **Key Params:**
  - `topSubject`: Title & detail of side A
  - `bottomSubject`: Title & detail of side B
  - `accentColorTop`: e.g. `"#f43f5e"` (Crimson)
  - `accentColorBottom`: e.g. `"#10b981"` (Emerald)
  - `dividerStyle`: Luminous horizontal laser with "VS" emblem

---

### 6. `kinetic_impact_word`
- **Purpose:** 1 to 3 massive, screen-dominating words taking up 70% of screen for 0.8–1.5 seconds.
- **Key Params:**
  - `word`: e.g. *"VULNERABLE"*, *"COLLAPSE"*, *"BRIBED"*
  - `textColor`: `"#ffffff"` with neon backlight
  - `sfx`: `'impact_boom'`

---

### 7. `metric_hero`
- **Purpose:** Giant 128px glowing statistic hero with camera shake and pulse.
- **Key Params:**
  - `statValue`: e.g. `"$100 BILLION"`, `"+500%"`, `"0.001s"`
  - `statLabel`: e.g. *"ENTERPRISE VALUATION"*
  - `headline`: Supporting context line below the number
  - `accentColor`: `"#f59e0b"` or `"#38bdf8"`

---

### 8. `interface_inspection`
- **Purpose:** Clean, modern phone or web UI mockup (e.g. bank balance plummeting to $0.00, live terminal code, or incoming push notification).
- **Key Params:**
  - `uiType`: `'terminal'` | `'browser'` | `'phone_notification'` | `'trading_screen'`
  - `data`: Relevant payload (code snippet, notification text, stock ticker)

---

### 9. `process_blueprint`
- **Purpose:** Sleek architectural mechanism diagram showing interconnected nodes.
- **Key Params:**
  - `title`: Mechanism Name
  - `nodes`: Array of 3 sequential concepts with icon, label, and pulse signal.

---

### 10. `quote_reveal`
- **Purpose:** Famous quote or whistleblower confession with cursor typing effect and ambient dark depth.
- **Key Params:**
  - `quoteText`: Spoken statement
  - `author`: Attributed name & title

---

### 11. `photo_parallax`
- **Purpose:** 2.5D depth separation where subject stands out from a blurred, moving environment.
- **Key Params:**
  - `mediaUrl`: High-res foreground asset
  - `depthScale`: `1.1` to `1.25`

---

### 12. `cinematic_hold`
- **Purpose:** Minimalist atmospheric scene that allows a shocking story revelation to sink in without visual clutter.
- **Key Params:**
  - `backgroundTexture`: Atmospheric dark obsidian with slow vignette breathing.
