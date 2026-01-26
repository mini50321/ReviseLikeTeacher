import { AuthProvider } from '../contexts/AuthContext';
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
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

