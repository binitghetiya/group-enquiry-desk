import { Link } from 'react-router-dom';

const SITES = [
  { key: 'ipstudios', name: 'IP Studios' },
  { key: 'drvet', name: 'DrVet Animal Hospital' },
  { key: 'space42arena', name: 'Space42 Arena' },
  { key: 'jazzbar', name: 'Jazzbar' },
  { key: 'menalead', name: 'MENA Lead' },
];

export function Home() {
  return (
    <section>
      <h1>Group Enquiry Desk</h1>
      <p className="muted">
        A local prototype of a shared enquiry form for five brands. Each link below represents a page configured for one
        brand. The server decides the brand; the visitor cannot change it.
      </p>
      <h2>Public enquiry forms</h2>
      <ul className="link-grid">
        {SITES.map((s) => (
          <li key={s.key}>
            <Link to={`/enquire/${s.key}`} className="card-link">
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
      <h2>Demo pages (published SEO)</h2>
      <ul>
        <li>
          <Link to="/pages/space42arena-rooftop-acoustic-night">Space42 Arena: Rooftop Acoustic Night (fictional)</Link>
        </li>
        <li>
          <Link to="/pages/drvet-pet-dental-care">DrVet: Pet Dental Care (fictional)</Link>
        </li>
      </ul>
      <h2>Staff</h2>
      <p>
        <Link to="/admin">Open the enquiry admin</Link> (sign-in required)
      </p>
    </section>
  );
}
