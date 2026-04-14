import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import SimulationPage from '@/routes/SimulationPage'
import SettingsPage from '@/routes/SettingsPage'

export default function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/" element={<SimulationPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Unknown paths send the user back to the dashboard rather than a
            blank page — simpler than a 404 view for a 2-route SPA. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </TooltipProvider>
  )
}
