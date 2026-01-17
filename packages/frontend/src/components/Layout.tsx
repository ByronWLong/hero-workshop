import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Layout() {
  const { user, logout, isLoggingOut } = useAuth();

  return (
    <div className="app-layout">
      <header className="app-header">
        <Link to="/" className="app-logo">
          <svg viewBox="0 0 100 100" width="40" height="40">
            <defs>
              <linearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#4F46E5' }} />
                <stop offset="100%" style={{ stopColor: '#7C3AED' }} />
              </linearGradient>
              <linearGradient id="shieldHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#818CF8', stopOpacity: 0.6 }} />
                <stop offset="100%" style={{ stopColor: '#4F46E5', stopOpacity: 0 }} />
              </linearGradient>
              <linearGradient id="hammerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#FCD34D' }} />
                <stop offset="100%" style={{ stopColor: '#F59E0B' }} />
              </linearGradient>
            </defs>
            {/* Shield shape */}
            <path d="M50 5 L90 20 L90 45 C90 70 70 88 50 95 C30 88 10 70 10 45 L10 20 Z" 
                  fill="url(#heroGrad)" stroke="#1E1B4B" strokeWidth="3"/>
            {/* Shield highlight */}
            <path d="M50 8 L85 21 L85 45 C85 67 67 83 50 90 C33 83 15 67 15 45 L15 21 Z" 
                  fill="url(#shieldHighlight)" opacity="0.4"/>
            {/* Hammer icon */}
            <g transform="translate(50,52)">
              <rect x="-18" y="-22" width="36" height="14" rx="3" fill="url(#hammerGrad)" stroke="#92400E" strokeWidth="1.5"/>
              <rect x="-4" y="-8" width="8" height="28" rx="2" fill="#78716C" stroke="#57534E" strokeWidth="1"/>
              <rect x="-16" y="-19" width="4" height="8" rx="1" fill="#FEF3C7" opacity="0.5"/>
            </g>
            {/* Star accent */}
            <polygon points="50,12 52,18 58,18 53,22 55,28 50,24 45,28 47,22 42,18 48,18" 
                     fill="#FCD34D" stroke="#F59E0B" strokeWidth="0.5"/>
          </svg>
          Hero Workshop
        </Link>

        <nav className="app-nav">
          <Link to="/characters" className="btn btn-secondary">
            My Characters
          </Link>

          <div className="user-menu">
            <div className="user-avatar">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
              ) : (
                user?.name?.charAt(0).toUpperCase() ?? '?'
              )}
            </div>
            <span className="user-name">{user?.name}</span>
            <button 
              className="btn btn-secondary" 
              onClick={() => logout()}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </nav>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
