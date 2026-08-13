import { type ReactNode } from 'react';
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

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  const hideTopBar = location === '/edit' || location === '/markup';

  return (
    <RoutedErrorBoundary>
      <ScannerProvider>
        <Switch>
          <Route path="/" component={ScannerScreen} />
          <Route path="/preview" component={PreviewScreen} />
          <Route path="/gallery" component={GalleryScreen} />
          <Route path="/edit" component={EditScreen} />
          <Route path="/markup" component={MarkupScreen} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
          <SonnerToaster position="top-center" />
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
