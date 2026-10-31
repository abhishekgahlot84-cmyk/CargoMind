# CargoMind — AI-Powered Fleet & Logistics Intelligence

CargoMind is an enterprise-grade AI-powered fleet and logistics intelligence platform engineered for dynamic freight load allocation, multi-vehicle route optimization, driver relay rotation, and real-time highway GPS tracking across India.

---

## Key Features

- **Dual-Constraint Load Allocation**: Solves mixed-integer bin-packing optimization using Google OR-Tools SCIP solver considering both vehicle payload weight (kg) and cargo volume capacity ($m^3$).
- **Multi-Vehicle Capacitated VRP**: Vehicle Routing Problem (CVRP) solver balancing delivery urgency deadlines, driver hours-of-service compliance, fuel cost penalties, and traffic delays.
- **Driver Rotation & Midpoint Relay Handovers**: Schedules multi-day trips with mandatory rest periods (4.5h driving / 30m break rules) and automated driver changeovers at designated corridor hubs.
- **Deterministic Highway GPS Simulator**: Real-time server-side time interpolation strictly along verified Indian highway polylines with live speed calculation, progress tracking, and 2.5s rapid auto-refresh.
- **Automated Completed Trip Lifecycle**: Completed trips automatically rest at their destination terminal before being purged after approximately 1 hour, immediately freeing vehicles and drivers for new allotments.
- **Interactive Google Maps Operations Hub**: Apple-inspired minimalist UI with dark/light mode, split route polylines (travelled vs. remaining), live speedometer gauges, and hub radius overlays.
- **Fleet Analytics & Maintenance**: Real-time vehicle telemetry, driver compliance metrics, fleet readiness status, and scheduled maintenance monitoring.

---

## Tech Stack

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.9+)
- **ORM & Database**: [SQLAlchemy](https://www.sqlalchemy.org/) with SQLite (`fleet_local.db` local fallback) and PostgreSQL support
- **Optimization Solvers**: [Google OR-Tools](https://developers.google.com/optimization) (SCIP Mixed-Integer Programming & Routing Model)
- **Routing Engine**: [OSRM](http://project-osrm.org/) & Google Routes API fallback
- **Server**: [Uvicorn](https://www.uvicorn.org/)

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite](https://vite.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Mapping**: [@react-google-maps/api](https://www.npmjs.com/package/@react-google-maps/api)
- **Charts & UI**: [Recharts](https://recharts.org/), [Lucide React](https://lucide.dev/)
- **Routing**: [React Router DOM v7](https://reactrouter.com/)
- **HTTP Client**: [Axios](https://axios-http.com/)

---

## Project Structure

```text
AI-Fleet-Optimization/
├── backend/
│   ├── app/
│   │   ├── database/          # SQLAlchemy connection, engine & models
│   │   ├── optimization/      # OR-Tools solvers, speed model, gazetteer & cleanup
│   │   ├── routes/            # FastAPI API endpoints (trips, trucks, gps, orders, etc.)
│   │   └── main.py            # FastAPI entry point & background tasks
│   ├── tests/                 # Unit and integration test suites
│   ├── requirements.txt       # Python dependencies
│   └── .env.example           # Backend environment template
├── frontend/
│   ├── src/
│   │   ├── components/        # Reusable UI widgets, layout, speedometer gauge
│   │   ├── context/           # Theme (Dark/Light) & state contexts
│   │   ├── pages/             # Dashboard, GPS Tracking, Trips, Trucks, Orders, Hubs
│   │   └── services/          # Axios API client & location aliases
│   ├── public/                # Static assets and images
│   ├── package.json           # Frontend dependencies and npm scripts
│   └── .env.example           # Frontend environment template
└── .gitignore                 # Secrets, local databases, and build artifacts ignore rules
```

---

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 18+ & npm
- (Optional) Google Maps API Key with Maps JavaScript API & Directions API enabled

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials if using PostgreSQL or Google Maps

# Start backend server
uvicorn app.main:app --port 8000 --reload
```

The API will be available at `http://127.0.0.1:8000` with interactive Swagger docs at `http://127.0.0.1:8000/docs`.

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Set VITE_GOOGLE_MAPS_API_KEY if available

# Start frontend development server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Environment Variables

### Backend (`backend/.env`)
| Variable | Description | Default |
|---|---|---|
| `DB_HOST` | Database host address | `localhost` |
| `DB_PORT` | Database port | `5432` |
| `DB_NAME` | Database name | `fleet_db` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | `postgres` |
| `DATABASE_URL` | Optional full connection string | Fallback to SQLite |
| `GOOGLE_MAPS_API_KEY` | Server-side Google Routes API Key | Optional |
| `JWT_SECRET` | Secret key for signing auth tokens | Optional |

### Frontend (`frontend/.env`)
| Variable | Description | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API base URL | `http://127.0.0.1:8000` |
| `VITE_GOOGLE_MAPS_API_KEY` | Client-side Google Maps API key | Optional |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | Optional |

---

## Testing & Linting

```bash
# Run backend tests
cd backend
python -m unittest discover tests

# Build frontend
cd frontend
npm run build

# Lint frontend
npm run lint
```

---

## Demo Data Notice

> [!NOTE]
> All initial vehicle registrations, driver identities, phone numbers, customer orders, and consignments populated in this repository are **simulated demo data** generated strictly for testing, algorithm validation, and evaluation purposes.

