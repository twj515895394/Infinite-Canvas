import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { ToastHost } from '@/components/ui/toast'
import { notifyMutationError, notifyQueryError } from '@/core/feedback/queryFeedback'
import './index.css'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => notifyQueryError(error, query),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => notifyMutationError(error, mutation),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary label="应用">
          <App />
          <ToastHost />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
