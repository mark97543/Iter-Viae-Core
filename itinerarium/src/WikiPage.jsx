import { useState, useEffect, useRef, useCallback } from 'react';
import './WikiPage.css';

/* ── Data ─────────────────────────────────────────────────── */

const TOOLS = [
  {
    id: 'faber',
    version: 'Version I',
    name: 'Faber',
    subtitle: 'The Smith',
    icon: '⚒️',
    status: 'completed',
    sections: [
      {
        id: 'faber-overview',
        title: 'Overview',
        content: (
          <>
            <p>
              Faber is the <strong>data preprocessing engine</strong> of Iter Viae. It
              ingests raw OpenStreetMap planet or region extracts in
              <code>.pbf</code> (Protocolbuffer Binary Format) and compiles them
              into three production-ready offline artifacts consumed by all
              downstream components.
            </p>
            <p>
              The pipeline is fully automated via a single Bash script. Once a
              valid <code>.pbf</code> file is placed in the raw input directory,
              Faber validates the workspace, clears previous output, and drives
              the full compilation sequence with clear CLI progress feedback at
              every stage.
            </p>
          </>
        ),
      },
      {
        id: 'faber-requirements',
        title: 'Requirements',
        content: (
          <>
            <p>Faber depends on the following tools being available on your <code>PATH</code>:</p>
            <table className="wiki__artifact-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Purpose</th>
                  <th>Install</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>tilemaker</td>
                  <td>Generates .mbtiles vector tile sets from OSM data</td>
                  <td><code>apt install tilemaker</code> or build from source</td>
                </tr>
                <tr>
                  <td>valhalla</td>
                  <td>Routing engine — builds routing graph and tiles</td>
                  <td>See <a href="https://github.com/valhalla/valhalla" target="_blank" rel="noreferrer">valhalla/valhalla</a></td>
                </tr>
                <tr>
                  <td>pelias / photon</td>
                  <td>Geocoder — builds geocoder.db for offline search</td>
                  <td>See Pelias or Photon documentation</td>
                </tr>
                <tr>
                  <td>bash ≥ 5</td>
                  <td>Script runtime</td>
                  <td>Pre-installed on most Linux distributions</td>
                </tr>
              </tbody>
            </table>
          </>
        ),
      },
      {
        id: 'faber-structure',
        title: 'Directory Structure',
        content: (
          <>
            <p>
              Faber expects a precise workspace layout. The script will create
              any missing directories on first run, but you can pre-create them
              manually:
            </p>
            <CodeBlock lang="bash" code={`Iter Viae Core/
├── tools/
│   └── faber/
│       └── faber.sh       # Main automation script
└── data/
    └── maps/
        ├── raw/           # Place exactly ONE .pbf file here
        └── compiled/      # Output artifacts land here`} />
          </>
        ),
      },
      {
        id: 'faber-running',
        title: 'Running Faber',
        content: (
          <>
            <p>
              Place exactly one <code>.pbf</code> extract file in{' '}
              <code>data/maps/raw/</code>, then execute the script from the
              repository root:
            </p>
            <CodeBlock lang="bash" code={`cd "Iter Viae Core"
bash tools/faber/faber.sh`} />
            <div className="wiki__callout wiki__callout--warning">
              <span className="wiki__callout-icon">⚠️</span>
              <span>
                Faber will <strong>purge all existing files</strong> in{' '}
                <code>data/maps/compiled/</code> before each run to ensure only
                the latest artifacts are kept. Back up any previously compiled
                maps you wish to retain.
              </span>
            </div>
            <p>
              The script validates that exactly one <code>.pbf</code> is present
              before proceeding. If zero or multiple files are detected, it will
              abort with an explanatory message.
            </p>
          </>
        ),
      },
      {
        id: 'faber-artifacts',
        title: 'Output Artifacts',
        content: (
          <>
            <p>A successful run produces three files in <code>data/maps/compiled/</code>:</p>
            <table className="wiki__artifact-table">
              <thead>
                <tr><th>File</th><th>Format</th><th>Used By</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>map.mbtiles</td>
                  <td>MBTiles (SQLite)</td>
                  <td>Mensa — rendered by MapLibre GL JS</td>
                </tr>
                <tr>
                  <td>routing.tar</td>
                  <td>Valhalla tile archive</td>
                  <td>Navis — offline turn-by-turn routing</td>
                </tr>
                <tr>
                  <td>geocoder.db</td>
                  <td>SQLite</td>
                  <td>Navis — offline address/POI search</td>
                </tr>
              </tbody>
            </table>
          </>
        ),
      },
    ],
  },

  {
    id: 'mensa',
    version: 'Version II',
    name: 'Mensa',
    subtitle: 'The Table',
    icon: '🗺️',
    status: 'in-progress',
    sections: [
      {
        id: 'mensa-overview',
        title: 'Overview',
        content: (
          <p>
            Mensa is the <strong>desktop application interface</strong> for Iter
            Viae. It wraps a MapLibre GL JS map canvas inside a native Tauri
            shell, rendering the <code>.mbtiles</code> vector tiles produced by
            Faber at a smooth 60fps with zero network dependency. The interface
            enforces a high-contrast tactical dark mode consistent with the
            broader Iter Viae design language.
          </p>
        ),
      },
      {
        id: 'mensa-launch',
        title: 'Launching Mensa',
        content: (
          <>
            <p>
              Mensa is distributed as a compiled Tauri binary. After downloading
              the appropriate release from the Downloads page:
            </p>
            <div className="wiki__steps">
              {[
                { label: 'Install', body: <>Run the installer or extract the archive for your platform.</> },
                { label: 'Point to tiles', body: <>On first launch, use the <strong>File → Open Map</strong> menu to point Mensa at your compiled <code>map.mbtiles</code> file.</> },
                { label: 'Explore', body: <>Pan, zoom, and inspect the offline map. All rendering happens on-device; no internet connection is required.</> },
              ].map((s, i) => (
                <div className="wiki__step" key={i}>
                  <span className="wiki__step-num">{i + 1}</span>
                  <div className="wiki__step-body"><strong>{s.label}:</strong> {s.body}</div>
                </div>
              ))}
            </div>
          </>
        ),
      },
      {
        id: 'mensa-tile-config',
        title: 'Tile Configuration',
        content: (
          <>
            <p>
              Mensa reads a local MapLibre style sheet that references a{' '}
              <code>mbtiles://</code> protocol source. The style is bundled
              inside the application and automatically rewrites the tile source
              path to match the file you select at runtime.
            </p>
            <div className="wiki__callout wiki__callout--info">
              <span className="wiki__callout-icon">ℹ️</span>
              <span>
                Mensa currently supports a single active map at a time. Switching
                maps requires reopening a different <code>.mbtiles</code> file
                via the File menu. Multi-map support is planned for a future
                release.
              </span>
            </div>
          </>
        ),
      },
      {
        id: 'mensa-keybinds',
        title: 'Keyboard Shortcuts',
        content: (
          <>
            <table className="wiki__artifact-table">
              <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
              <tbody>
                {[
                  ['Ctrl + Q / ⌘Q', 'Quit Mensa'],
                  ['Scroll Wheel', 'Zoom in / out'],
                  ['Click + Drag', 'Pan the map'],
                  ['Ctrl + Scroll', 'Tilt / rotate view'],
                ].map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        ),
      },
    ],
  },

  {
    id: 'itinerarium',
    version: 'Version III',
    name: 'Itinerarium',
    subtitle: 'The Roadbook',
    icon: '📡',
    status: 'completed',
    sections: [
      {
        id: 'itinerarium-overview',
        title: 'Overview',
        content: (
          <p>
            Itinerarium is the <strong>web portal</strong> you are currently
            viewing. It serves as the public-facing hub for the Iter Viae
            project — providing documentation, release announcements, and
            downloads of compiled map artifacts. It is built with React + Vite
            and designed to be statically hosted with no server-side runtime
            required.
          </p>
        ),
      },
      {
        id: 'itinerarium-running',
        title: 'Running Locally',
        content: (
          <>
            <p>Prerequisites: Node.js ≥ 18 and npm.</p>
            <CodeBlock lang="bash" code={`cd "Iter Viae Core/itinerarium"
npm install
npm run dev`} />
            <p>
              The dev server starts at <code>http://localhost:5173</code> with
              hot-module replacement enabled. To produce a production build:
            </p>
            <CodeBlock lang="bash" code={`npm run build
# Output lands in itinerarium/dist/`} />
          </>
        ),
      },
      {
        id: 'itinerarium-structure',
        title: 'Project Structure',
        content: (
          <>
            <CodeBlock lang="bash" code={`itinerarium/
├── public/              # Static assets (SVGs, favicon)
│   ├── banner.svg
│   └── fav.svg
└── src/
    ├── main.jsx         # React entry point
    ├── App.jsx          # Router setup
    ├── index.css        # Global design tokens & resets
    ├── NavBar.jsx / .css
    ├── WelcomeScreen.jsx / .css
    ├── WikiPage.jsx / .css
    ├── BlogPage.jsx / .css      # (planned)
    └── DownloadsPage.jsx / .css # (planned)`} />
          </>
        ),
      },
    ],
  },

  {
    id: 'navis',
    version: 'Version IV',
    name: 'Navis',
    subtitle: 'The Ship',
    icon: '🧭',
    status: 'planned',
    sections: [
      {
        id: 'navis-overview',
        title: 'Overview',
        content: (
          <>
            <p>
              Navis is the <strong>field and mobile navigation client</strong>{' '}
              — the final component in the Iter Viae pipeline. It consumes the
              artifacts produced by Faber (<code>routing.tar</code> and{' '}
              <code>geocoder.db</code>) to deliver fully offline turn-by-turn
              routing and address search on handheld devices.
            </p>
            <div className="wiki__callout wiki__callout--warning">
              <span className="wiki__callout-icon">🚧</span>
              <span>
                Navis is in the <strong>planning stage</strong>. No builds are
                available yet. This documentation reflects the intended design
                and will be updated as development progresses.
              </span>
            </div>
          </>
        ),
      },
      {
        id: 'navis-planned',
        title: 'Planned Features',
        content: (
          <>
            <div className="wiki__steps">
              {[
                'Offline vector map rendering using the compiled .mbtiles artifact',
                'Turn-by-turn navigation powered by the Valhalla routing.tar graph',
                'Offline geocoding and POI search via geocoder.db',
                'GPS track recording and export',
                'Tactical dark mode consistent with Mensa and Itinerarium',
                'Cross-platform support: Linux, Android, and iOS',
              ].map((feat, i) => (
                <div className="wiki__step" key={i}>
                  <span className="wiki__step-num">{i + 1}</span>
                  <div className="wiki__step-body">{feat}</div>
                </div>
              ))}
            </div>
          </>
        ),
      },
    ],
  },
];

/* ── CodeBlock sub-component ─────────────────────────────── */

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="wiki__code-block">
      <div className="wiki__code-header">
        <span className="wiki__code-lang">{lang}</span>
        <button
          className={`wiki__code-copy${copied ? ' copied' : ''}`}
          onClick={handleCopy}
          aria-label="Copy code to clipboard"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="wiki__pre"><code>{code}</code></pre>
    </div>
  );
}

/* ── Sidebar ─────────────────────────────────────────────── */

function WikiSidebar({ activeTool, activeSection, onToolClick, onSectionClick }) {
  return (
    <aside className="wiki__sidebar" aria-label="Wiki navigation">
      <p className="wiki__sidebar-label">Contents</p>
      <ul className="wiki__sidebar-nav" role="list">
        {TOOLS.map((tool) => (
          <li key={tool.id} className="wiki__sidebar-item">
            <button
              className={`wiki__sidebar-link${activeTool === tool.id ? ' active' : ''}`}
              onClick={() => onToolClick(tool.id, tool.sections[0].id)}
              aria-current={activeTool === tool.id ? 'true' : undefined}
            >
              <span className="wiki__sidebar-icon" aria-hidden="true">{tool.icon}</span>
              {tool.name}
            </button>
            {activeTool === tool.id && (
              <ul className="wiki__sidebar-sub" role="list">
                {tool.sections.map((sec) => (
                  <li key={sec.id}>
                    <button
                      className={`wiki__sidebar-sublink${activeSection === sec.id ? ' active' : ''}`}
                      onClick={() => onSectionClick(sec.id)}
                    >
                      {sec.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/* ── Tool Section ────────────────────────────────────────── */

function ToolSection({ tool, sectionRef }) {
  const badgeCls = `wiki__tool-badge wiki__tool-badge--${tool.status}`;
  const badgeLabel = tool.status === 'in-progress' ? 'In Progress'
    : tool.status === 'planned' ? 'Planned' : 'Completed';

  return (
    <section
      id={tool.id}
      className="wiki__tool-section anim-fade-up"
      aria-labelledby={`${tool.id}-title`}
      ref={sectionRef}
    >
      <header className="wiki__tool-header">
        <div className="wiki__tool-icon" aria-hidden="true">{tool.icon}</div>
        <div className="wiki__tool-title-group">
          <p className="wiki__tool-version">{tool.version}</p>
          <h2 className="wiki__tool-name" id={`${tool.id}-title`}>{tool.name}</h2>
          <p className="wiki__tool-subtitle">{tool.subtitle}</p>
        </div>
        <span className={badgeCls}>{badgeLabel}</span>
      </header>

      {tool.sections.map((sec) => (
        <div key={sec.id} id={sec.id} className="wiki__subsection">
          <h3 className="wiki__subsection-title">{sec.title}</h3>
          {sec.content}
        </div>
      ))}
    </section>
  );
}

/* ── WikiPage ────────────────────────────────────────────── */

export default function WikiPage() {
  const [activeTool, setActiveTool]       = useState('faber');
  const [activeSection, setActiveSection] = useState('faber-overview');

  const sectionRefs = useRef({});

  // Scroll to a section
  const scrollToSection = useCallback((sectionId) => {
    setActiveSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Scroll to first section of a tool
  const scrollToTool = useCallback((toolId, firstSectionId) => {
    setActiveTool(toolId);
    setActiveSection(firstSectionId);
    const el = document.getElementById(toolId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Update active section on scroll
  useEffect(() => {
    const allSections = TOOLS.flatMap((t) => t.sections.map((s) => s.id));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            setActiveSection(id);
            const tool = TOOLS.find((t) => t.sections.some((s) => s.id === id));
            if (tool) setActiveTool(tool.id);
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    allSections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <main className="wiki" id="wiki">
      <div className="wiki__body">
        {/* Sidebar */}
        <WikiSidebar
          activeTool={activeTool}
          activeSection={activeSection}
          onToolClick={scrollToTool}
          onSectionClick={scrollToSection}
        />

        {/* Content */}
        <div className="wiki__content">
          <header className="wiki__page-header anim-fade-up">
            <p className="wiki__page-eyebrow">Documentation</p>
            <h1 className="wiki__page-title">Wiki</h1>
            <p className="wiki__page-lead">
              User guides and technical references for all Iter Viae tools —
              from data preparation with Faber to field navigation with Navis.
            </p>
          </header>

          {TOOLS.map((tool) => (
            <ToolSection
              key={tool.id}
              tool={tool}
              sectionRef={(el) => { sectionRefs.current[tool.id] = el; }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
