import { AuthProvider } from '../contexts/AuthContext';
import NetworkStatus from '../components/NetworkStatus';
import BrowserCompatibilityWarning from '../components/BrowserCompatibilityWarning';
import './globals.css';

export const metadata = {
  title: 'ReviseLikeTeacher',
  description: 'NEET PG preparation platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <NetworkStatus />
          <BrowserCompatibilityWarning />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

