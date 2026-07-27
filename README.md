# Campus Nest

ระบบบริหารจัดการหอพักมหาวิทยาลัย แยก frontend และ backend เป็น npm workspaces เพื่อให้แต่ละส่วนมี dependency, tests และ configuration ของตัวเอง

## Project structure

```text
campus-nest/
├─ apps/
│  ├─ web/                 # React + Tailwind frontend
│  │  ├─ src/
│  │  │  ├─ assets/        # รูปภาพ ไอคอน และฟอนต์
│  │  │  ├─ components/    # Presentational components ที่ไม่มี state
│  │  │  │  ├─ RoomCard/
│  │  │  │  ├─ Sidebar/
│  │  │  │  └─ StatCard/
│  │  │  ├─ containers/    # Stateful components และ orchestration
│  │  │  │  └─ Dashboard/
│  │  │  ├─ App.jsx        # Root component
│  │  │  ├─ main.jsx       # React entry point
│  │  │  └─ index.css      # Global styles
│  │  ├─ index.html
│  │  ├─ vite.config.js
│  │  └─ package.json
│  └─ api/                 # Express backend API
│     ├─ src/
│     │  ├─ index.js       # Application entry point
│     │  ├─ app.js         # Routes and business rules
│     │  ├─ db.js          # Database schema and seed data
│     │  ├─ auth.js        # JWT authentication and RBAC
│     │  ├─ ldap.js        # LDAP / Active Directory adapter
│     │  └─ audit.js       # Audit log writer
│     ├─ test/
│     │  └─ app.test.js
│     ├─ .env.example
│     └─ package.json
├─ data/                   # Runtime SQLite database (ไม่ commit)
├─ docs/
│  ├─ ARCHITECTURE.md
│  └─ BACKEND.md
├─ package.json            # Workspace commands
└─ package-lock.json       # Dependency lock ของทั้ง monorepo
```

## Commands

```powershell
npm install
npm run dev:api     # API: http://localhost:3000
npm run dev:web     # Web: http://localhost:5173
npm run test        # Backend automated tests
npm run build       # Frontend production build
```

Vite proxy ส่ง request ที่ขึ้นต้นด้วย `/api` ไป backend port `3000` จึงเรียก API จาก frontend ด้วย relative URL ได้

รายละเอียด backend และ environment configuration ดูที่ [docs/BACKEND.md](docs/BACKEND.md) และตาราง coverage ที่ [ข้อ 3.11–3.22](docs/REQUIREMENTS-3.11-3.22.md), [ข้อ 4.1–4.3](docs/REQUIREMENTS-4.1-4.3.md), [ข้อ 4.4](docs/REQUIREMENTS-4.4.md) และ [ข้อ 4.5](docs/REQUIREMENTS-4.5.md)
