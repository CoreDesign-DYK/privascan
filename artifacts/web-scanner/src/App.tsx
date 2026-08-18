import { type ReactNode, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { ScannerProvider } from '@/contexts/scanner-context';
import { LanguageProvider } from '@/contexts/language-context';
import { TopBar } from '@/components/top-bar';
import ScannerScreen from '@/pages/scanner';
import PreviewScreen from '@/pages/preview';
import GalleryScreen from '@/pages/gallery';
import EditScreen from '@/pages/edit';
import MarkupScreen from '@/pages/markup';
import HomeScreen from '@/pages/home';
import PrivacyPolicyScreen from '@/pages/privacy-policy';
import TermsOfServiceScreen from '@/pages/terms-of-service';
import LoginScreen from '@/pages/login';
import { PinLockScreen } from '@/components/pin-lock-screen';
import { isLockRequired, recordHiddenAt } from '@/lib/pin-storage';
import { registerServiceWorker } from '@/lib/sw-registration';
import { UpdateBanner } from '@/components/update-banner';

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  const hideTopBar = ['/', '/edit', '/markup', '/preview', '/home', '/privacy-policy', '/terms-of-service', '/login'].includes(location);

  return (
    <RoutedErrorBoundary>
      <ScannerProvider>
        <Switch>
          <Route path="/" component={ScannerScreen} />
          <Route path="/preview" component={PreviewScreen} />
          <Route path="/gallery" component={GalleryScreen} />
          <Route path="/edit" component={EditScreen} />
          <Route path="/markup" component={MarkupScreen} />
          <Route path="/home">{() => { window.location.replace('/'); return null; }}</Route>
          <Route path="/privacy-policy" component={PrivacyPolicyScreen} />
          <Route path="/terms-of-service" component={TermsOfServiceScreen} />
          <Route path="/login" component={LoginScreen} />
          <Route component={NotFound} />
        </Switch>
        {!hideTopBar && <TopBar />}
      </ScannerProvider>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

/* ── PIN lock gate ────────────────────────────────────────────────────────── */
function AppWithPinLock() {
  const [locked, setLocked] = useState(() => isLockRequired());

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        recordHiddenAt();
      } else {
        if (isLockRequired()) setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (locked) {
    return <PinLockScreen onUnlock={() => setLocked(false)} />;
  }
  return <Router />;
}

function App() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AppWithPinLock />
          </WouterRouter>
          <Toaster />
          <SonnerToaster position="top-center" />
          {updateReady && (
            <UpdateBanner onDismiss={() => setUpdateReady(false)} />
          )}
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
