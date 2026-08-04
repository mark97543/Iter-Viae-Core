import { NavLink } from 'react-router-dom';
import './NavBar.css';

const NAV_ITEMS = [
  { to: '/',         label: 'Home'      },
  { to: '/wiki',     label: 'Wiki'      },
  { to: '/blog',     label: 'Blog'      },
  { to: '/downloads',label: 'Downloads' },
];

export default function NavBar() {
  return (
    <nav className="navbar" aria-label="Site navigation">
      <div className="navbar__inner">
        {/* Logo */}
        <NavLink to="/" className="navbar__logo" aria-label="Iter Viae home">
          <img
            src="/fav.svg"
            alt=""
            className="navbar__logo-icon"
            aria-hidden="true"
            width="28"
            height="28"
          />
          <span className="navbar__logo-text">
            Iter <span>Viae</span>
          </span>
        </NavLink>

        {/* Links */}
        <ul className="navbar__links" role="list">
          {NAV_ITEMS.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `navbar__link${isActive ? ' active' : ''}`
                }
              >
                <span className="navbar__link-dot" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
