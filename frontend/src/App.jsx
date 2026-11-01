import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Trucks from "./pages/Trucks";
import Drivers from "./pages/Drivers";
import Hubs from "./pages/Hubs";
import Handovers from "./pages/Handovers";
import Orders from "./pages/Orders";
import Optimization from "./pages/Optimization";
import Trips from "./pages/Trips";
import GPSTracking from "./pages/GPSTracking";
import Settings from "./pages/Settings";

import { useAuth } from "./context/AuthContext";

// Route protection component
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return children;
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Marketing & Authentication Pages */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

        {/* Protected Fleet Operations Workspace */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/trucks" element={<Trucks />} />
          <Route path="/vehicles" element={<Navigate to="/trucks" replace />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/hubs" element={<Hubs />} />
          <Route path="/handovers" element={<Handovers />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/gps-tracking" element={<GPSTracking />} />
          <Route path="/optimization" element={<Optimization />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
