import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Truck,
  ArrowRight,
  Shield,
  Layers,
  MapPin,
  Route,
  Fuel,
  Package,
  Clock,
  CheckCircle2,
  Gauge,
  Thermometer,
  ShieldAlert,
  Sparkles,
  BarChart3,
  Menu,
  X,
} from "lucide-react";

import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";

import heroTruckImg from "../assets/images/hero-truck.jpg";
import warehouseHubImg from "../assets/images/warehouse-hub.jpg";
import cargoHandlingImg from "../assets/images/cargo-handling.jpg";
import driverHandoverImg from "../assets/images/driver-handover.jpg";

// New uploaded & generated visuals
import heroFleetTelemetryImg from "../assets/images/hero-fleet-telemetry.jpg";
import fleetConvoyImg from "../assets/images/fleet-convoy-highway.jpg";
import multimodalHubImg from "../assets/images/multimodal-freight-hub.jpg";
import truckRouteMapImg from "../assets/images/truck-route-map.jpg";
import globalFreightImg from "../assets/images/global-freight-plane.jpg";

export default function Landing() {
  const { isAuthenticated, triggerGoogleSignIn, oauthNotice, clearOauthNotice } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Smooth scroll helper
  const scrollTo = (id) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] font-sans antialiased selection:bg-[#0071e3] selection:text-white dark:bg-[#000000] dark:text-[#f5f5f7]">
      {/* ---------------------------------------------------- */}
      {/* GOOGLE OAUTH NOTIFICATION MODAL                      */}
      {/* ---------------------------------------------------- */}
      {oauthNotice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="apple-card max-w-md w-full p-6 shadow-2xl bg-white dark:bg-[#161618] border border-black/10 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff] shrink-0">
                <Shield size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  {oauthNotice.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                  {oauthNotice.message}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
              <button
                onClick={clearOauthNotice}
                className="px-4 py-1.5 text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#86868b] dark:hover:text-[#f5f5f7] transition"
              >
                Dismiss
              </button>
              <Link
                to="/login"
                onClick={clearOauthNotice}
                className="apple-btn-primary text-xs"
              >
                <span>Sign in with Email</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 1. HEADER AND NAVIGATION                             */}
      {/* ---------------------------------------------------- */}
      <header className="sticky top-0 z-50 border-b border-black/[0.08] bg-[#fbfbfd]/80 backdrop-blur-xl transition-colors dark:border-white/[0.08] dark:bg-[#000000]/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 sm:px-8">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2.5 group focus:outline-none">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-[#1d1d1f] text-white shadow-sm dark:bg-[#f5f5f7] dark:text-[#1d1d1f] transition-transform group-hover:scale-105">
              <Truck size={17} />
            </div>
            <span className="font-semibold text-base tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
              CargoMind
            </span>
          </Link>

          {/* Desktop Nav: Features, Platform, About */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">
            <button
              onClick={() => scrollTo("features")}
              className="hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => scrollTo("platform")}
              className="hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-colors cursor-pointer"
            >
              Platform
            </button>
            <button
              onClick={() => scrollTo("about")}
              className="hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-colors cursor-pointer"
            >
              About
            </button>
          </nav>

          {/* Actions: Theme Toggle, Google Sign-in, Login */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Theme Toggle: Light / System / Dark */}
            <ThemeToggle variant="segmented" />

            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="apple-btn-primary text-xs"
              >
                <span>Workspace</span>
                <ArrowRight size={13} />
              </Link>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                {/* Continue with Google Action */}
                <button
                  type="button"
                  onClick={triggerGoogleSignIn}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-xs font-medium text-[#1d1d1f] shadow-sm hover:bg-white hover:border-black/20 dark:border-white/15 dark:bg-[#1c1c1e]/60 dark:text-[#f5f5f7] dark:hover:bg-[#2c2c2e] transition cursor-pointer"
                  title="Continue with Google OAuth"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span className="hidden lg:inline">Continue with Google</span>
                  <span className="lg:hidden">Google</span>
                </button>

                {/* Login Action */}
                <Link
                  to="/login"
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-black/[0.04] dark:text-[#f5f5f7] dark:hover:bg-white/[0.08] transition"
                >
                  Log in
                </Link>

                {/* Get started button */}
                <Link
                  to="/login"
                  className="apple-btn-primary text-xs"
                >
                  <span>Get started</span>
                </Link>
              </div>
            )}

            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg text-[#6e6e73] hover:text-[#1d1d1f] md:hidden dark:text-[#86868b] dark:hover:text-[#f5f5f7]"
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="border-b border-black/[0.08] bg-[#fbfbfd] px-6 py-5 md:hidden dark:border-white/[0.08] dark:bg-[#161618] animate-in slide-in-from-top-2 duration-150">
            <nav className="flex flex-col gap-3 text-sm font-medium text-[#6e6e73] dark:text-[#86868b]">
              <button
                onClick={() => scrollTo("features")}
                className="text-left py-1 hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                Features
              </button>
              <button
                onClick={() => scrollTo("platform")}
                className="text-left py-1 hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                Platform
              </button>
              <button
                onClick={() => scrollTo("about")}
                className="text-left py-1 hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                About
              </button>
              <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    triggerGoogleSignIn();
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-black/10 py-2.5 text-xs font-medium text-[#1d1d1f] dark:border-white/10 dark:text-[#f5f5f7]"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="apple-btn-primary py-2.5 text-xs text-center justify-center"
                >
                  <span>Sign In with Email</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* ---------------------------------------------------- */}
      {/* 2. HERO SECTION                                      */}
      {/* ---------------------------------------------------- */}
      <section className="relative overflow-hidden pt-16 pb-24 sm:pt-24 sm:pb-32">
        {/* Ambient Gradient Mesh Background Glows */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-[620px] overflow-hidden -z-10">
          <div className="absolute top-6 left-1/4 w-[540px] h-[360px] bg-gradient-to-tr from-[#0071e3]/25 via-[#6366f1]/20 to-transparent blur-[120px] rounded-full dark:from-[#2997ff]/20 dark:via-[#af52de]/20" />
          <div className="absolute top-24 right-1/4 w-[460px] h-[320px] bg-gradient-to-br from-[#af52de]/20 via-[#ff2d55]/15 to-transparent blur-[130px] rounded-full dark:from-[#bf5af2]/18 dark:via-[#ff375f]/15" />
        </div>

        <div className="mx-auto max-w-6xl px-6 sm:px-8 text-center relative z-10">
          {/* Subtle Tag with Gradient Border */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#0071e3]/30 bg-gradient-to-r from-[#0071e3]/10 via-[#6366f1]/10 to-[#af52de]/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-[#0071e3] shadow-sm backdrop-blur-md dark:border-[#2997ff]/30 dark:text-[#2997ff]">
            <Sparkles size={13} className="text-[#0071e3] dark:text-[#2997ff]" />
            <span>Mathematical Fleet Optimization</span>
          </div>

          {/* Requested Editorial Headline with Gradient Accent */}
          <h1 className="mt-6 text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7] leading-[1.06]">
            <span className="bg-gradient-to-r from-[#1d1d1f] via-[#0071e3] to-[#6366f1] dark:from-[#ffffff] dark:via-[#52aaff] dark:to-[#af52de] bg-clip-text text-transparent">
              Move smarter.
            </span>{" "}
            <br />
            <span className="text-[#6e6e73] dark:text-[#a1a1a6]">Deliver with confidence.</span>
          </h1>

          {/* Requested Supporting Copy */}
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
            One intelligent platform for fleet operations, cargo allocation, route planning, and driver coordination.
          </p>

          {/* Requested CTAs including Google Sign-In */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              to={isAuthenticated ? "/dashboard" : "/login"}
              className="apple-btn-primary px-7 py-3 text-sm font-semibold shadow-lg hover:shadow-[0_10px_25px_-5px_rgba(0,113,227,0.4)]"
            >
              <span>{isAuthenticated ? "Enter Workspace" : "Get started"}</span>
              <ArrowRight size={15} />
            </Link>

            {!isAuthenticated && (
              <button
                type="button"
                onClick={triggerGoogleSignIn}
                className="inline-flex items-center gap-2.5 rounded-full border border-black/15 bg-white/80 px-6 py-3 text-sm font-semibold text-[#1d1d1f] shadow-md hover:bg-white hover:border-black/25 dark:border-white/20 dark:bg-[#1c1c1e]/80 dark:text-[#f5f5f7] dark:hover:bg-[#2c2c2e] transition cursor-pointer backdrop-blur-md"
                title="Sign in with your Google account"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </button>
            )}

            <button
              onClick={() => scrollTo("features")}
              className="apple-btn-secondary px-7 py-3 text-sm font-semibold cursor-pointer backdrop-blur-sm"
            >
              <span>Explore the platform</span>
            </button>
          </div>

          {/* Large, Premium Logistics Visual with Gradient Border Frame */}
          <div className="mt-12 relative mx-auto max-w-5xl rounded-3xl p-[1px] bg-gradient-to-b from-[#0071e3]/40 via-[#6366f1]/25 to-transparent shadow-[0_20px_60px_-15px_rgba(0,113,227,0.3)] dark:shadow-[0_20px_60px_-15px_rgba(41,151,255,0.25)]">
            <div className="relative rounded-3xl overflow-hidden bg-[#161618]">
              <img
                src={heroFleetTelemetryImg}
                alt="CargoMind modern autonomous electric long-haul truck with real-time HUD route telemetry"
                className="w-full h-[380px] sm:h-[480px] md:h-[540px] object-cover object-center transition-all duration-700"
                loading="eager"
              />
              {/* Subtle Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

              {/* Visual Glass Overlay Badge */}
              <div className="absolute bottom-6 left-6 right-6 sm:left-8 sm:right-8 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/15 text-white text-left shadow-2xl">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#2997ff] flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#2997ff] animate-ping"></span>
                    Live Autonomous Corridor
                  </span>
                  <p className="text-sm sm:text-base font-semibold mt-0.5">
                    NH-44 Freight Trunk: Gwalior → Agra → Delhi NCR • Active HUD Telemetry
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#30d158] animate-pulse"></span>
                    <span className="text-white/90">Continuous 68 km/h • OR-Tools VRP Solver</span>
                  </div>
                  <span className="text-white/30 hidden sm:inline">|</span>
                  <span className="text-white/80 hidden sm:inline">Real Turn-by-Turn OSRM Polylines</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 3. PRODUCT STORYTELLING SECTIONS                     */}
      {/* ---------------------------------------------------- */}
      <div id="features" className="space-y-0">
        {/* -------------------------------------------------- */}
        {/* SECTION 3.1: INTELLIGENT LOAD ALLOCATION           */}
        {/* -------------------------------------------------- */}
        <section id="allocation" className="py-24 border-t border-black/[0.06] dark:border-white/[0.08]">
          <div className="mx-auto max-w-6xl px-6 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
                  Dual-Capacity Optimization
                </span>
                <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Every load has a smarter destination.
                </h2>
                <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                  CargoMind automatically evaluates consignment weights, volumetric dimensions, delivery deadlines, and destination hubs. Using Google OR-Tools SCIP Mixed-Integer Linear Programming, consignments are assigned to suitable vehicles while strictly respecting dual payload weight and cubic volume constraints.
                </p>

                <div className="mt-8 grid grid-cols-2 gap-5">
                  <div className="apple-card p-5">
                    <Package size={20} className="text-[#0071e3] dark:text-[#2997ff] mb-2" />
                    <h4 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      Dual Constraint Bounds
                    </h4>
                    <p className="mt-1 text-xs text-[#6e6e73] dark:text-[#86868b]">
                      Prevents axle overload (kg) and cubic volume exhaustion (m³) simultaneously.
                    </p>
                  </div>
                  <div className="apple-card p-5">
                    <Fuel size={20} className="text-[#34c759] dark:text-[#30d158] mb-2" />
                    <h4 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      Diesel Fuel Minimization
                    </h4>
                    <p className="mt-1 text-xs text-[#6e6e73] dark:text-[#86868b]">
                      Two-stage solver maximizes order fulfillment, then minimizes fleet consumption.
                    </p>
                  </div>
                </div>
              </div>

              {/* Visual: Refined Cargo-Loading Simulation */}
              <div className="apple-card p-6 sm:p-8 space-y-6">
                {/* Truck Route Tactical Image */}
                <div className="relative rounded-2xl overflow-hidden border border-black/[0.06] dark:border-white/[0.08]">
                  <img
                    src={truckRouteMapImg}
                    alt="Tactical road map with dispatch truck and delivery routes"
                    className="w-full h-44 sm:h-52 object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-2 left-2 right-2 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-white text-[11px] flex items-center justify-between">
                    <span className="font-medium">Consignment Weight & Volume Balancer</span>
                    <span className="text-[#2997ff] font-semibold">MILP Solved</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-b border-black/[0.06] pb-4 dark:border-white/[0.08]">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/20 dark:text-[#2997ff] grid place-items-center">
                      <Truck size={17} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                        Truck-101 • Heavy Hauler 25T
                      </h4>
                      <span className="text-[11px] text-[#86868b]">Assigned 4 Consignments</span>
                    </div>
                  </div>
                  <span className="apple-badge bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/20 dark:text-[#30d158]">
                    96.4% Efficiency
                  </span>
                </div>

                {/* Weight meter */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6e6e73] dark:text-[#86868b]">Weight Capacity (kg)</span>
                    <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      24,100 / 25,000 kg (96.4%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.1] overflow-hidden">
                    <div className="h-full rounded-full bg-[#0071e3] dark:bg-[#2997ff] w-[96.4%] transition-all duration-500"></div>
                  </div>
                </div>

                {/* Volume meter */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6e6e73] dark:text-[#86868b]">Volumetric Space (m³)</span>
                    <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      64.8 / 75.0 m³ (86.4%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.1] overflow-hidden">
                    <div className="h-full rounded-full bg-[#34c759] dark:bg-[#30d158] w-[86.4%] transition-all duration-500"></div>
                  </div>
                </div>

                {/* Allocated items preview */}
                <div className="space-y-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
                  <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider block">
                    Consignment Allocation Breakdown
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.04]">
                      <span className="font-medium block text-[#1d1d1f] dark:text-[#f5f5f7]">ORD-8401 • Medical</span>
                      <span className="text-[11px] text-[#86868b]">8,500 kg • Cold Chain</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.04]">
                      <span className="font-medium block text-[#1d1d1f] dark:text-[#f5f5f7]">ORD-8404 • Machinery</span>
                      <span className="text-[11px] text-[#86868b]">11,200 kg • Heavy</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- */}
        {/* SECTION 3.2: FLEET-WIDE ROUTE OPTIMIZATION         */}
        {/* -------------------------------------------------- */}
        <section id="routing" className="py-24 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.01]">
          <div className="mx-auto max-w-6xl px-6 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Visual: Connected Road Network Diagram */}
              <div className="order-2 lg:order-1 apple-card p-6 sm:p-8 space-y-4">
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-3 text-xs dark:border-white/[0.08]">
                  <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-1.5">
                    <Route size={15} className="text-[#0071e3] dark:text-[#2997ff]" />
                    Optimized Multi-Stop Delivery Corridor
                  </span>
                  <span className="font-semibold text-[#34c759] dark:text-[#30d158]">
                    1,327.5 km Total
                  </span>
                </div>

                <div className="relative pl-6 space-y-4 text-xs before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#0071e3]/30 dark:before:bg-[#2997ff]/30">
                  <div className="relative flex items-start gap-3">
                    <span className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#0071e3] dark:border-[#161618] dark:bg-[#2997ff]"></span>
                    <div>
                      <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block">
                        Stop 1: Depot Hub (Gwalior, MP)
                      </span>
                      <span className="text-[11px] text-[#86868b]">Departure 06:00 AM • Vehicle Dispatch</span>
                    </div>
                  </div>

                  <div className="relative flex items-start gap-3">
                    <span className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#34c759] dark:border-[#161618] dark:bg-[#30d158]"></span>
                    <div>
                      <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block">
                        Stop 2: Agra Cross-Docking Terminal
                      </span>
                      <span className="text-[11px] text-[#86868b]">120.4 km • 4,500 kg Offloaded (Window: 08:30 - 09:30 AM)</span>
                    </div>
                  </div>

                  <div className="relative flex items-start gap-3">
                    <span className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#af52de] dark:border-[#161618] dark:bg-[#bf5af2]"></span>
                    <div>
                      <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block">
                        Stop 3: Bhopal Central Distribution Center
                      </span>
                      <span className="text-[11px] text-[#86868b]">524.2 km • Driver Handover & Rest Window</span>
                    </div>
                  </div>

                  <div className="relative flex items-start gap-3">
                    <span className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#ff9500] dark:border-[#161618] dark:bg-[#ff9f0a]"></span>
                    <div>
                      <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block">
                        Stop 4: Mumbai Port Container Freight Terminal
                      </span>
                      <span className="text-[11px] text-[#86868b]">1,327.5 km • Final Delivery Fulfillment</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-[11px] text-[#86868b]">
                  <span>Routing Engine: OSRM + OR-Tools VRP</span>
                  <span className="text-[#0071e3] dark:text-[#2997ff] font-medium">Turn-by-turn geometry saved</span>
                </div>
              </div>

              {/* Text Description */}
              <div className="order-1 lg:order-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
                  Multi-Vehicle Routing Problem
                </span>
                <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Better routes. Better decisions.
                </h2>
                <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                  Traditional routing engines use straight-line distances that fail in real road operations. CargoMind solves vehicle routing problems with ordered stops, delivery time windows, and exact highway geometry fetched from Open Source Routing Machine (OSRM).
                </p>

                <div className="mt-8 space-y-3.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-[#34c759] dark:text-[#30d158] shrink-0" />
                    <span>Eliminates backtracking across multi-city delivery routes.</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-[#34c759] dark:text-[#30d158] shrink-0" />
                    <span>Calculates precise arrival times against customer delivery windows.</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-[#34c759] dark:text-[#30d158] shrink-0" />
                    <span>Persists full route polylines for live telemetry comparison.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- */}
        {/* SECTION 3.3: LIVE GPS TRACKING                     */}
        {/* -------------------------------------------------- */}
        <section id="tracking" className="py-24 border-t border-black/[0.06] dark:border-white/[0.08]">
          <div className="mx-auto max-w-6xl px-6 sm:px-8">
            <div className="max-w-2xl mb-14">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#34c759] dark:text-[#30d158]">
                Truthful Telemetry
              </span>
              <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                Every journey, in view.
              </h2>
              <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                Real-time visibility grounded in actual database telemetry. CargoMind cleanly separates planned route corridors from recorded GPS breadcrumbs, computing corridor deviation alerts whenever vehicles diverge from planned highway segments.
              </p>
            </div>

            {/* Visual: Telemetry Map Card */}
            <div className="apple-card overflow-hidden">
              <div className="p-6 sm:p-7 border-b border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-[#34c759] animate-pulse"></div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      Live Telemetry Stream • Truck TRK-102 (Freightliner Cascadia)
                    </h3>
                    <p className="text-xs text-[#86868b]">Trip TRIP-204 · Gwalior to Agra Corridor</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="apple-badge bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/20 dark:text-[#2997ff]">
                    Speed: 68 km/h
                  </span>
                  <span className="apple-badge bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/20 dark:text-[#30d158]">
                    Within Corridor (0.12 km offset)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x border-black/[0.06] dark:border-white/[0.08]">
                <div className="p-6 space-y-2">
                  <Gauge size={22} className="text-[#0071e3] dark:text-[#2997ff]" />
                  <h4 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Recorded GPS Breadcrumbs
                  </h4>
                  <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
                    Every ping logs latitude, longitude, vehicle speed, bearing, and timestamp into verified operational logs.
                  </p>
                </div>

                <div className="p-6 space-y-2">
                  <MapPin size={22} className="text-[#ff9500] dark:text-[#ff9f0a]" />
                  <h4 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Off-Corridor Detection
                  </h4>
                  <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
                    Mathematical point-to-polyline perpendicular distance calculations trigger warnings if a driver detours.
                  </p>
                </div>

                <div className="p-6 space-y-2">
                  <Layers size={22} className="text-[#af52de] dark:text-[#bf5af2]" />
                  <h4 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Full Map Workspace
                  </h4>
                  <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
                    Google Maps JavaScript API integration in the operator workspace with custom dark and light cartography.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- */}
        {/* SECTION 3.4: SMART SHIPMENT URGENCY                */}
        {/* -------------------------------------------------- */}
        <section className="py-24 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.01]">
          <div className="mx-auto max-w-6xl px-6 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#ff9500] dark:text-[#ff9f0a]">
                  Consignment Priority Modeling
                </span>
                <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Time matters. Plan accordingly.
                </h2>
                <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                  Not every parcel can wait. CargoMind factors consignment delivery windows, perishable shelf life, and SLA deadlines directly into the optimization objective function, penalizing delayed dispatches with weighted urgency multipliers.
                </p>

                <div className="mt-8 space-y-3">
                  <div className="flex items-center gap-3 text-xs text-[#6e6e73] dark:text-[#86868b]">
                    <span className="h-2 w-2 rounded-full bg-[#ff3b30]"></span>
                    <span><strong>Critical:</strong> Immediate vehicle allocation priority with zero delay tolerance.</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#6e6e73] dark:text-[#86868b]">
                    <span className="h-2 w-2 rounded-full bg-[#ff9500]"></span>
                    <span><strong>Urgent:</strong> High-priority routing with tight delivery window enforcement.</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#6e6e73] dark:text-[#86868b]">
                    <span className="h-2 w-2 rounded-full bg-[#0071e3]"></span>
                    <span><strong>Standard:</strong> Balanced capacity filling to maximize fuel economy.</span>
                  </div>
                </div>
              </div>

              {/* Visual: Shipment Timeline & Urgency Cards */}
              <div className="apple-card p-6 sm:p-7 space-y-3">
                <div className="flex justify-between items-center text-xs font-semibold pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
                  <span>Active Delivery Schedule</span>
                  <span className="text-[#86868b]">Sorted by Risk Threshold</span>
                </div>

                <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/[0.04] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-red-600 dark:text-red-400 block">
                      ORD-9021 • Cardiovascular Vaccine Lot
                    </span>
                    <span className="text-[11px] text-[#86868b]">Window closes in 2h 45m • Cold Chain 4°C</span>
                  </div>
                  <span className="apple-badge bg-red-500/10 text-red-600 dark:text-red-400 font-semibold">
                    Critical
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-amber-600 dark:text-amber-400 block">
                      ORD-9028 • Server Blade Electronics
                    </span>
                    <span className="text-[11px] text-[#86868b]">Window closes in 6h 15m • Fragile</span>
                  </div>
                  <span className="apple-badge bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                    Urgent
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block">
                      ORD-9034 • Industrial Fasteners & Hardware
                    </span>
                    <span className="text-[11px] text-[#86868b]">Delivery window: 24h • Standard Freight</span>
                  </div>
                  <span className="apple-badge bg-black/[0.06] text-[#6e6e73] dark:bg-white/[0.1] dark:text-[#86868b]">
                    Standard
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- */}
        {/* SECTION 3.5: CARGO CATEGORIES AND HANDLING         */}
        {/* -------------------------------------------------- */}
        <section className="py-24 border-t border-black/[0.06] dark:border-white/[0.08]">
          <div className="mx-auto max-w-6xl px-6 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Visual: Carefully Composed Logistics Photograph */}
              <div className="relative rounded-3xl overflow-hidden border border-black/[0.08] dark:border-white/[0.1] shadow-xl bg-[#161618]">
                <img
                  src={cargoHandlingImg}
                  alt="Specialized logistics handling and cold-chain pharma containers"
                  className="w-full h-auto object-cover max-h-[460px]"
                  loading="lazy"
                />
                <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs">
                  <span className="font-semibold block">Pharmaceutical Cold Chain Specimen Unit</span>
                  <span className="text-[11px] text-white/70">Continuous temperature compliance logging (+3.8°C verified)</span>
                </div>
              </div>

              {/* Text Description */}
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
                  Specialized Freight Management
                </span>
                <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Every shipment has different needs.
                </h2>
                <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                  From pharmaceuticals requiring cold chain integrity to fragile electronics, hazardous chemicals, and bulk industrial machinery—CargoMind enforces special handling attributes across truck selection and loading sequence.
                </p>

                <div className="mt-8 grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06]">
                    <Thermometer size={18} className="text-[#0071e3] dark:text-[#2997ff] mb-2" />
                    <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Reefer Cold Chain</h4>
                    <p className="mt-1 text-[11px] text-[#86868b]">Dedicated temperature-monitored refrigerated bays.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06]">
                    <ShieldAlert size={18} className="text-[#ff9500] dark:text-[#ff9f0a] mb-2" />
                    <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Hazardous Goods</h4>
                    <p className="mt-1 text-[11px] text-[#86868b]">Compliant vehicle licensing and isolation rules.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- */}
        {/* SECTION 3.6: WAREHOUSES AND LOGISTICS HUBS         */}
        {/* -------------------------------------------------- */}
        <section id="platform" className="py-24 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.01]">
          <div className="mx-auto max-w-6xl px-6 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
                  Network Infrastructure
                </span>
                <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Connect every point in your network.
                </h2>
                <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                  Regional logistics hubs serve as anchors for cross-docking, cargo consolidation, and vehicle staging. CargoMind manages warehouse capacity, storage availability, and GPS geofencing across your entire distribution footprint.
                </p>

                <div className="mt-8 space-y-3 text-xs text-[#6e6e73] dark:text-[#86868b]">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-[#0071e3] dark:text-[#2997ff] shrink-0" />
                    <span>Real-time storage utilization tracking across tons and cubic meters.</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-[#0071e3] dark:text-[#2997ff] shrink-0" />
                    <span>Coordinate geofences automatically log arrival and departure times.</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-[#0071e3] dark:text-[#2997ff] shrink-0" />
                    <span>Cross-dock transfer sequencing minimizes depot dwell time.</span>
                  </div>
                </div>
              </div>

              {/* Visual: Multimodal Freight Terminal Photograph */}
              <div className="relative rounded-3xl overflow-hidden border border-black/[0.08] dark:border-white/[0.1] shadow-xl bg-[#161618]">
                <img
                  src={multimodalHubImg}
                  alt="Intermodal cargo port with container ship, transit highway trucks, and cargo docks"
                  className="w-full h-auto object-cover max-h-[460px]"
                  loading="lazy"
                />
                <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs">
                  <span className="font-semibold block">Multimodal Maritime & Highway Logistics Hub</span>
                  <span className="text-[11px] text-white/70">Intermodal Container Transfer • 1,200 Tons Staging Capacity</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- */}
        {/* SECTION 3.7: DRIVER HANDOVER                       */}
        {/* -------------------------------------------------- */}
        <section className="py-24 border-t border-black/[0.06] dark:border-white/[0.08]">
          <div className="mx-auto max-w-6xl px-6 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Visual: Highway Fleet Convoy */}
              <div className="order-2 lg:order-1 relative rounded-3xl overflow-hidden border border-black/[0.08] dark:border-white/[0.1] shadow-xl bg-[#161618]">
                <img
                  src={fleetConvoyImg}
                  alt="Commercial transport trucks driving in convoy at twilight"
                  className="w-full h-auto object-cover max-h-[460px]"
                  loading="lazy"
                />
                <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs">
                  <span className="font-semibold block">Highway Long-Haul Relay Fleet</span>
                  <span className="text-[11px] text-white/70">Continuous Interstate Transit • Automated Driver Rest Compliance</span>
                </div>
              </div>

              {/* Text Description */}
              <div className="order-1 lg:order-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#af52de] dark:text-[#bf5af2]">
                  Shift Compliance & Journey Continuity
                </span>
                <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Keep long-distance journeys moving.
                </h2>
                <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                  Fatigued driving violates safety mandates and causes preventable accidents. CargoMind schedules mid-journey driver handovers at authorized transit hubs, ensuring outgoing drivers take required rest intervals while fresh relay drivers keep the freight moving.
                </p>

                <div className="mt-8 space-y-4">
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-lg bg-[#af52de]/10 text-[#af52de] dark:bg-[#bf5af2]/20 dark:text-[#bf5af2] grid place-items-center shrink-0">
                      <Clock size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                        Shift Limit Verification
                      </h4>
                      <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
                        Enforces 11-hour daily driving caps and verifies that relay drivers meet mandatory rest windows.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-lg bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/20 dark:text-[#30d158] grid place-items-center shrink-0">
                      <Shield size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                        Verified Handover Audit Trail
                      </h4>
                      <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
                        Captures vehicle odometer readings, condition inspections, and dual-driver confirmation stamps.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- */}
        {/* SECTION 3.8: FLEET ANALYTICS                       */}
        {/* -------------------------------------------------- */}
        <section id="analytics" className="py-24 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.01]">
          <div className="mx-auto max-w-6xl px-6 sm:px-8">
            <div className="max-w-2xl mb-14">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
                Executive Intelligence
              </span>
              <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                Understand the bigger picture.
              </h2>
              <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                Real-time visibility across operational efficiency, capacity utilization, and carbon footprint. Eliminate empty deadhead runs with transparent optimization reporting.
              </p>
            </div>

            {/* Illustrative Application Dashboard Interface */}
            <div className="apple-card p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/[0.06] pb-4 dark:border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <BarChart3 size={18} className="text-[#0071e3] dark:text-[#2997ff]" />
                  <span className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Operational Fleet Performance Metrics
                  </span>
                </div>
                <span className="text-xs text-[#86868b]">Real database aggregation</span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <span className="text-xs text-[#86868b]">Average Payload Utilization</span>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7] mt-1">
                    91.8%
                  </p>
                  <span className="text-[11px] text-[#34c759] dark:text-[#30d158] font-medium">+14.2% vs manual dispatch</span>
                </div>

                <div>
                  <span className="text-xs text-[#86868b]">Average Fuel Economy</span>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7] mt-1">
                    3.8 km/L
                  </p>
                  <span className="text-[11px] text-[#86868b]">Diesel consumption tracking</span>
                </div>

                <div>
                  <span className="text-xs text-[#86868b]">On-Time SLA Delivery</span>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7] mt-1">
                    98.6%
                  </p>
                  <span className="text-[11px] text-[#34c759] dark:text-[#30d158] font-medium">Within 30m window</span>
                </div>

                <div>
                  <span className="text-xs text-[#86868b]">Safety Compliance</span>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7] mt-1">
                    100%
                  </p>
                  <span className="text-[11px] text-[#86868b]">Zero rest-hour violations</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 4. FINAL CALL TO ACTION                              */}
      {/* ---------------------------------------------------- */}
      <section id="about" className="py-28 border-t border-black/[0.06] text-center dark:border-white/[0.08] relative overflow-hidden">
        {/* Ambient CTA Gradient Glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center -z-10">
          <div className="w-[600px] h-[350px] bg-gradient-to-tr from-[#0071e3]/15 via-[#6366f1]/15 to-transparent blur-[140px] rounded-full dark:from-[#2997ff]/15 dark:via-[#af52de]/15" />
        </div>

        <div className="mx-auto max-w-4xl px-6 sm:px-8 relative z-10">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7] leading-tight">
            <span className="bg-gradient-to-r from-[#1d1d1f] via-[#0071e3] to-[#6366f1] dark:from-[#ffffff] dark:via-[#52aaff] dark:to-[#af52de] bg-clip-text text-transparent">
              Ready to transform
            </span>{" "}
            your logistics operations?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
            Experience state-of-the-art mathematical load allocation, vehicle routing, and live corridor tracking in one unified interface.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              to={isAuthenticated ? "/dashboard" : "/login"}
              className="apple-btn-primary px-8 py-3.5 text-sm font-semibold shadow-lg hover:shadow-[0_10px_25px_-5px_rgba(0,113,227,0.4)]"
            >
              <span>{isAuthenticated ? "Enter Workspace" : "Get started with CargoMind"}</span>
              <ArrowRight size={15} />
            </Link>

            <button
              type="button"
              onClick={triggerGoogleSignIn}
              className="apple-btn-secondary px-6 py-3.5 text-sm font-semibold cursor-pointer backdrop-blur-sm"
            >
              <span>Continue with Google</span>
            </button>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* MINIMAL FOOTER                                       */}
      {/* ---------------------------------------------------- */}
      <footer className="border-t border-black/[0.06] py-12 text-xs text-[#86868b] dark:border-white/[0.08]">
        <div className="mx-auto max-w-6xl px-6 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-6 pb-8 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="grid h-6 w-6 place-items-center rounded-lg bg-[#1d1d1f] text-white dark:bg-[#f5f5f7] dark:text-[#1d1d1f]">
                <Truck size={13} />
              </div>
              <span className="font-semibold text-sm text-[#1d1d1f] dark:text-[#f5f5f7]">
                CargoMind
              </span>
            </div>

            <nav className="flex flex-wrap gap-6 text-[#6e6e73] dark:text-[#86868b]">
              <button onClick={() => scrollTo("features")} className="hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition cursor-pointer">
                Features
              </button>
              <button onClick={() => scrollTo("platform")} className="hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition cursor-pointer">
                Platform
              </button>
              <button onClick={() => scrollTo("about")} className="hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition cursor-pointer">
                About
              </button>
              <Link to="/login" className="hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition">
                Sign In
              </Link>
            </nav>
          </div>

          <div className="pt-6 flex flex-wrap items-center justify-between gap-4">
            <p>© 2026 CargoMind Fleet Intelligence Inc. All rights reserved.</p>
            <p className="text-[#86868b]">Built for modern transport networks.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
