import './WelcomeScreen.css';

const STATUS = {
  COMPLETED:   { label: 'Completed',   cls: 'completed'   },
  IN_PROGRESS: { label: 'In Progress', cls: 'in-progress' },
  PLANNED:     { label: 'Planned',     cls: 'planned'     },
};

const COMPONENTS = [
  {
    version:  'Version I',
    name:     'Faber',
    subtitle: 'The Smith',
    icon:     '⚒️',
    status:   STATUS.COMPLETED,
    desc:
      'The data preprocessing engine. Faber ingests raw OpenStreetMap ' +
      'extracts (.pbf) and compiles them into production-ready offline map ' +
      'artifacts — vector tiles (.mbtiles), a routing graph (routing.tar), ' +
      'and a geocoder database (geocoder.db).',
  },
  {
    version:  'Version II',
    name:     'Mensa',
    subtitle: 'The Table',
    icon:     '🗺️',
    status:   STATUS.IN_PROGRESS,
    desc:
      'The desktop application interface. Mensa hosts the compiled offline ' +
      'tactical map inside a native Tauri shell, rendering buttery-smooth ' +
      '60fps vector tiles via MapLibre GL JS with no network dependency.',
  },
  {
    version:  'Version III',
    name:     'Itinerarium',
    subtitle: 'The Roadbook',
    icon:     '📡',
    status:   STATUS.COMPLETED,
    desc:
      'The web portal you are viewing right now. Itinerarium provides ' +
      'project documentation, release announcements, and offline map ' +
      'artifact downloads — the public face of Iter Viae.',
  },
  {
    version:  'Version IV',
    name:     'Navis',
    subtitle: 'The Ship',
    icon:     '🧭',
    status:   STATUS.PLANNED,
    desc:
      'The field and mobile navigation client. Navis will bring on-the-go ' +
      'offline routing and tactical mapping to handheld devices, completing ' +
      'the Iter Viae ecosystem as an end-to-end solution.',
  },
];

function CompCard({ component, animDelay }) {
  const { version, name, subtitle, icon, status, desc } = component;
  const cls = `comp-card__badge--${status.cls}`;
  const dotCls = `comp-card__status-dot--${status.cls}`;

  return (
    <article
      className={`comp-card anim-fade-up delay-${animDelay}`}
      aria-label={`${name} — ${subtitle}`}
    >
      <span className={`comp-card__status-dot ${dotCls}`} aria-hidden="true" />

      <header className="comp-card__header">
        <div className="comp-card__icon" aria-hidden="true">{icon}</div>
        <div className="comp-card__titles">
          <span className="comp-card__version">{version}</span>
          <h2 className="comp-card__name">{name}</h2>
          <span className="comp-card__subtitle">{subtitle}</span>
        </div>
      </header>

      <hr className="comp-card__rule" />

      <p className="comp-card__desc">{desc}</p>

      <div className={`comp-card__badge ${cls}`}>
        <span className="comp-card__badge-dot" aria-hidden="true" />
        {status.label}
      </div>
    </article>
  );
}

const DELAY_STEPS = [300, 400, 500, 600];

export default function WelcomeScreen() {
  return (
    <main className="welcome" id="welcome">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="hero" aria-label="Project introduction">
        <img
          src="/banner.svg"
          alt="Iter Viae — Way of the Road"
          className="hero__banner anim-fade-in"
          width="580"
          height="218"
        />

        <p className="hero__tagline anim-fade-up delay-200">
          <em>Offline-first navigation infrastructure</em> built on
          OpenStreetMap. No cloud. No telemetry. Total operational independence —
          from raw map data to a field-ready device.
        </p>

        <hr className="hero__divider anim-fade-in delay-300" />
      </section>

      {/* ── Components ───────────────────────────────────── */}
      <section aria-label="Core project components">
        <div className="section-label anim-fade-up delay-200">
          <p className="section-label__eyebrow">Architecture</p>
          <h1 className="section-label__title">Core Components</h1>
        </div>

        <div className="components" role="list">
          {COMPONENTS.map((comp, i) => (
            <CompCard
              key={comp.name}
              component={comp}
              animDelay={DELAY_STEPS[i]}
            />
          ))}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="site-footer">
        <em>Iter Viae</em> &nbsp;·&nbsp; Way of the Road &nbsp;·&nbsp; Offline Navigation Infrastructure
      </footer>
    </main>
  );
}
