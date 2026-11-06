# CANTEEN CORNER: Institutional Commissary Platform

> **Providing Essentials. Promoting Success.**  
> A secure, compliant digital commissary management platform with trust accounting for correctional facilities.

---

## 🌟 Highlights & Capabilities

- **3 Dedicated Portals**:
  1. **Inmate Portal**: Offender ID + PIN authentication, catalog shopping, balance & weekly limit enforcement, order history, notification inbox.
  2. **Family & Friends Portal**: Account verification, inmate search, TouchPay exclusive trust fund deposits, secure care gift packages.
  3. **Warehouse Portal**: Orders fulfillment queue, printable picking lists, barcode/camera scanner, inventory shortage tracking, delivery manifest generator (PDF/CSV).
- **Accounting Compliance**: Double-entry ledger tracking every penny with zero balance reconciliation discrepancies.
- **Strict TouchPay Payments**: Dedicated `PaymentProvider` interface with `TouchPayProvider` & `MockTouchPayProvider`, webhook signatures, and idempotency guarantees.
- **Dual-Mode Institutional UI (Night & Light Mode)**:
  - **Light Mode**: Crisp, high-contrast `#f8fafc` background with pure `#ffffff` cards and subtle `#e2e8f0` borders.
  - **Night Mode**: Deep neutral `#0b0f19` background with `#111827` cards and `#1f2937` borders.
  - **Authentic Vector Icons**: Clean institutional iconography (custom shopping cart with padlock logo, inmate squircle, family squircle, warehouse squircle) with zero "vibe-coded" artifacts.
- **PWA & Responsive**: Tested across mobile (360px), tablet (768px), and desktop (1180px); >=44px touch targets; >=16px form inputs.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js**: v18+ or v20+
- **npm**: v9+

### 2. Clone & Install
```bash
npm install
```

### 3. Database Initialization & Seed
The local environment is configured with SQLite by default for zero-friction local execution (no PostgreSQL or Docker daemon required).
```bash
# Push Prisma schema to local database
npm run db:push

# Populate database with required seed data
npm run db:seed
```

### 4. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Demo Login Credentials

| Role | Portal URL | Identifier | Password / PIN | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Inmate** | `/inmate/login` | `A1234567` | `1234` | Offender: John Smith (Balance: $82.50, Limit: $100.00) |
| **Family** | `/family/login` | `family@canteen.local` | `Password123!` | Sarah Smith (Sister) |
| **Warehouse Picker** | `/warehouse/login` | `STF-01` or `picker@canteen.local` | `Staff123!` | Marcus Miller |
| **Warehouse Supervisor** | `/warehouse/login` | `STF-02` or `supervisor@canteen.local` | `Staff123!` | Chief Linda Vance |

---

## 🧪 Testing Suite

Run the comprehensive unit, integration, and acceptance tests:
```bash
npm test
```

### Automated Acceptance Tests Covered:
- **Test 1**: Cart of 2 soap + 4 ramen + 1 coffee = $15.00; balance drops from $82.50 to $67.50; order routes to Warehouse queue.
- **Test 2**: Orders exceeding inmate trust balance or weekly spending limit are rejected with clear error messages.
- **Test 3**: TouchPay deposits credit the inmate balance **only** upon confirmed success, updating deposit history and double-entry ledger.
- **Test 4**: Warehouse picking, packaging, barcode scanning, delivery manifest generation, and low stock shortage tracking.

---

## 🐳 Docker Deployment

To run in production mode with PostgreSQL:
```bash
docker-compose up --build
```
This launches:
- `canteen-corner-app`: Next.js production server on port `3000`
- `canteen-corner-db`: PostgreSQL 16 on port `5432`

---

## 📂 Project Structure

```text
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── api/                  # Route handlers (Auth, Inmate, Family, Warehouse, TouchPay)
│   │   ├── inmate/               # Inmate portal screens (Home, Catalog, Cart, Orders, Balance)
│   │   ├── family/               # Family portal screens (Search, Deposit, Packages, Receipts)
│   │   ├── warehouse/            # Warehouse screens (Queue, Picking, Inventory, Manifests)
│   │   ├── globals.css           # Glassmorphism styling and dark theme
│   │   └── layout.tsx            # Root PWA layout
│   ├── components/               # UI components (PWA register, scanners)
│   ├── context/                  # Client contexts (CartContext)
│   └── lib/                      # Core backend libraries (Auth, Prisma DB, Audit, Payments)
├── prisma/
│   ├── schema.prisma             # Institutional data model & double-entry ledger
│   └── seed.js                   # Seed script for John Smith, catalog & staff
├── public/                       # PWA manifest, service worker, icons
├── tests/                        # Vitest automated test suites
├── ARCHITECTURE.md               # Technical architecture & compliance specification
└── docker-compose.yml            # Containerized multi-service deployment
```

---

## 🔒 Security & Privacy Notice
- Never store raw payment card data (all transactions routed through TouchPay electronic gateway).
- Passwords and inmate PINs are hashed using `bcryptjs` with salt factor 10.
- All administrative and financial ledger movements are written to the `AuditLog` table with PII automatically redacted.

