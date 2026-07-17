import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { Route, Switch, Router as WouterRouter, Redirect, useLocation } from 'wouter';
import { Shell } from './components/layout/Shell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { routes } from './routes';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Privacy from './pages/Privacy';

const queryClient = new QueryClient();

/** Renders a full-page loading spinner while the session is being restored. */
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Wraps protected dashboard routes — redirects to /login if not authenticated. */
function ProtectedRouter() {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  return (
    <Shell>
      <Switch>
        <Route path="/" component={() => <Redirect to="/dashboard" />} />
        {routes.map(r => (
          <Route key={r.path} path={r.path} component={r.component} />
        ))}
        <Route component={() => (
          <div className="flex items-center justify-center h-full">
            <h2 className="text-xl text-gray-500">404 - Page Not Found</h2>
          </div>
        )} />
      </Switch>
    </Shell>
  );
}

/** Top-level router — public (login/signup) vs protected dashboard. */
function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Switch>
      {/* Public routes — no auth required */}
      <Route path="/login" component={() => (user ? <Redirect to="/dashboard" /> : <Login />)} />
      <Route path="/signup" component={() => (user ? <Redirect to="/dashboard" /> : <Signup />)} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/privacy/deletion-status" component={Privacy} />
      {/* Everything else is protected */}
      <Route component={ProtectedRouter} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </WouterRouter>
        <Toaster position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
