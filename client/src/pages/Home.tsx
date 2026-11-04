import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { brandClass, Icon, monogram, type IconName } from '../components/ui';

const SITES = [
  { key: 'ipstudios', name: 'IP Studios', blurb: 'Content and live production' },
  { key: 'drvet', name: 'DrVet Animal Hospital', blurb: 'General service questions' },
  { key: 'space42arena', name: 'Space42 Arena', blurb: 'Venue hire and event information' },
  { key: 'jazzbar', name: 'Jazzbar', blurb: 'Private event enquiries' },
  { key: 'menalead', name: 'MENA Lead', blurb: 'Projects and partnerships' },
];

const PAGES = [
  { ref: 'space42arena-rooftop-acoustic-night', brand: 'Space42 Arena', title: 'Rooftop Acoustic Night' },
  { ref: 'drvet-pet-dental-care', brand: 'DrVet', title: 'Pet Dental Care' },
];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'shield', title: 'Brand set by the server', text: 'Each form is signed for one brand. Visitors cannot change where it goes.' },
  { icon: 'lock', title: 'Built-in abuse controls', text: 'Single-use form tokens, a minimum fill time, rate limits and a honeypot.' },
  { icon: 'sparkles', title: 'Human-approved AI', text: 'AI SEO suggestions stay drafts until an administrator reviews and publishes them.' },
];

export function Home() {
  useEffect(() => {
    document.title = 'Group Enquiry Desk';
  }, []);

  return (
    <div className="home">
      <section className="hero" aria-labelledby="home-title">
        <p className="eyebrow">Shared enquiry platform</p>
        <h1 id="home-title" className="hero-title">
          One secure enquiry desk for five brands
        </h1>
        <p className="hero-lead">
          A local prototype of a shared enquiry form. Each link below represents a page configured for one brand. The
          server decides the brand; the visitor cannot change it.
        </p>
        <div className="hero-actions">
          <a href="#forms" className="btn btn-primary btn-lg">
            <span>Browse enquiry forms</span>
            <Icon name="arrow-right" />
          </a>
          <Link to="/admin" className="btn btn-secondary btn-lg">
            <Icon name="lock" />
            <span>Open the enquiry admin</span>
          </Link>
        </div>
        <p className="hero-note">The admin area requires a staff sign-in.</p>
      </section>

      <section className="section" aria-labelledby="forms">
        <div className="section-head">
          <h2 id="forms" tabIndex={-1}>
            Public enquiry forms
          </h2>
          <p className="section-desc">Pick a brand to open its public form.</p>
        </div>
        <ul className="card-grid">
          {SITES.map((s) => (
            <li key={s.key}>
              <Link to={`/enquire/${s.key}`} className={`brand-card ${brandClass(s.key)}`}>
                <span className="brand-badge" aria-hidden="true">
                  {monogram(s.name)}
                </span>
                <span className="brand-card-body">
                  <span className="brand-card-name">{s.name}</span>
                  <span className="brand-card-blurb">{s.blurb}</span>
                </span>
                <Icon name="arrow-right" className="brand-card-arrow" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="demo-pages">
        <div className="section-head">
          <h2 id="demo-pages">Demo pages (published SEO)</h2>
          <p className="section-desc">Fictional pages that show only human-approved, published metadata.</p>
        </div>
        <ul className="card-grid card-grid-2">
          {PAGES.map((p) => (
            <li key={p.ref}>
              <Link to={`/pages/${p.ref}`} className="link-card">
                <Icon name="file" className="link-card-icon" />
                <span className="link-card-body">
                  <span className="link-card-title">
                    {p.brand}: {p.title}
                  </span>
                  <span className="link-card-meta">Fictional demo page</span>
                </span>
                <Icon name="chevron-right" className="link-card-arrow" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="how">
        <h2 id="how" className="sr-only">
          How it works
        </h2>
        <ul className="feature-grid">
          {FEATURES.map((f) => (
            <li key={f.title} className="feature">
              <span className="feature-icon">
                <Icon name={f.icon} />
              </span>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-text">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
