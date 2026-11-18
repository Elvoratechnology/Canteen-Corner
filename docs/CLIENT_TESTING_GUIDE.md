# CANTEEN CORNER — CLIENT TESTING & EVALUATION GUIDE

Welcome to the client evaluation phase for **Canteen Corner**, the enterprise correctional commissary management and trust accounting platform.

This guide provides everything you need to access, test, and evaluate the actual application across all four role-based operational portals.

---

## 1. PORTAL DIRECTORY & TEST ACCESS URLS

> **Note on Deployment URL:**  
> During private hosted testing, replace `<TESTING_BASE_URL>` with your assigned testing URL (e.g., `https://canteen-corner-preview.vercel.app` or your private testing host).

| Operational Portal | Access Path | Primary Audience |
| :--- | :--- | :--- |
| **Portal Hub / Directory** | `<TESTING_BASE_URL>/` | Overview of all application entry points |
| **Inmate Commissary Kiosk** | `<TESTING_BASE_URL>/inmate/login` | Incarcerated individuals (touchscreen / terminal) |
| **Family & Friends Portal** | `<TESTING_BASE_URL>/family/login` | Public visitors, family accounts, trust deposits |
| **Warehouse Fulfillment** | `<TESTING_BASE_URL>/warehouse/login` | Pickers, packers, warehouse supervisors |
| **Institutional Administration** | `<TESTING_BASE_URL>/admin/login` | Facility wardens, finance managers, system admins |

---

## 2. ASSIGNED TEST ACCOUNTS & ROLES

The testing environment is pre-populated with realistic institutional test personas. Use the credentials below to log into each portal:

### A. Inmate Kiosk Account
- **Portal URL:** `<TESTING_BASE_URL>/inmate/login`
- **Inmate / Offender ID:** `A1234567`
- **PIN Code:** `1234`
- **Persona:** John Smith (Housing: Cell Block B-204, Facility: Cumberland Regional CC)
- **Account State:** Starting Trust Balance: **\$82.50**, Weekly Limit: **\$100.00**

### B. Family & Friends Account
- **Portal URL:** `<TESTING_BASE_URL>/family/login`
- **Email:** `family@canteen.local`
- **Password:** `Password123!`
- **Persona:** Sarah Smith (Sister, approved relationship link to inmate John Smith)

### C. Warehouse Staff Accounts
- **Portal URL:** `<TESTING_BASE_URL>/warehouse/login`
- **Supervisor Account:**
  - **Identifier / Email:** `supervisor@canteen.local`
  - **Password:** `Staff123!`
  - **Persona:** Chief Linda Vance (Supervisor — manifest dispatch, inventory, shortage tracking)
- **Picker Account:**
  - **Identifier / Email:** `picker@canteen.local`
  - **Password:** `Staff123!`
  - **Persona:** Marcus Miller (Picker — order picking, barcode verification)

### D. Institutional Administrator Account
- **Portal URL:** `<TESTING_BASE_URL>/admin/login`
- **Identifier / Email:** `admin@canteen.local`
- **Password:** `Admin123!`
- **Persona:** System Administrator & Warden

---

## 3. SUGGESTED WORKFLOWS TO TEST

### Workflow 1: Inmate Kiosk Ordering & Auto-Logout
1. Navigate to `/inmate/login`.
2. Enter Inmate ID `A1234567` and use the on-screen keypad to enter PIN `1234`.
3. Check the dashboard: observe current trust balance (\$82.50) and remaining weekly limit (\$100.00).
4. Click **Commissary Catalog**: browse categories (Snacks, Beverages, Personal Care).
5. Add items to the cart (e.g., 2 Ramen noodles @ \$1.50, 1 Bar soap @ \$2.00).
6. Proceed to **Cart & Checkout**: observe exact subtotal calculation and remaining balance preview.
7. Click **Confirm Order**: observe the order placement, new order number, and immediate balance deduction.
8. View **Order History**: observe the newly created order in `PROCESSING` status.
9. **Kiosk Inactivity Test:** Leave the terminal idle for 30 seconds to observe automated kiosk logout for security.

### Workflow 2: Family Trust Account Deposit (Sandbox)
1. Navigate to `/family/login` and sign in with `family@canteen.local` / `Password123!`.
2. Click **Search Inmates**: type `John` in the search bar.
3. Observe privacy protection: John Smith is found, but specific housing/cell unit is redacted for facility security.
4. Click **Deposit Funds**: enter an amount (e.g., \$25.00) and choose PayPal.
5. Review the fee breakdown (\$3.50 institutional fee + \$25.00 deposit = \$28.50 total).
6. Proceed to PayPal Sandbox checkout: complete test authorization.
7. Check **Deposit History**: verify that the deposit record updates and receipt is generated.
8. Log into Inmate Portal as John Smith: verify the trust balance increased by \$25.00.

### Workflow 3: Warehouse Fulfillment & Manifests
1. Navigate to `/warehouse/login` and sign in as `supervisor@canteen.local` / `Staff123!`.
2. Review the **Orders Queue**: observe incoming orders filtered strictly to Cumberland Regional CC.
3. Click on an order: review itemized pick list.
4. Advance the order: update status to `PACKED` and then `DELIVER`.
5. Check **Inventory & Shortages**: review stock levels for items at or below reorder threshold.
6. Check **Delivery Manifests**: view batch manifests with printable Code 128 barcodes.

### Workflow 4: Administrator Facility & Financial Audit
1. Navigate to `/admin/login` and sign in as `admin@canteen.local` / `Admin123!`.
2. Review **Overview Stats**: total commissary sales, active offender count, order fulfillment rate.
3. Click **Inmates**: view offender balances, weekly spending limits, and PIN status.
4. Review **Double-Entry Ledger**: audit the financial journal logging every deposit and order deduction.
5. Click **Products**: review catalog pricing in official currency (USD \$).

---

## 4. KNOWN LIMITATIONS DURING TEST PHASE

- **No Real Money Processing:** All payment processing uses sandboxed/simulated gateways. No actual credit card charges will occur.
- **Test Facility Scope:** All operational data belongs to the test facility (*Cumberland Regional Correctional Center*). Real correctional facility rosters are never loaded into test environments.
- **Physical Barcode Scanners:** You can test barcode workflows by typing or copying the barcode strings (e.g., `BC-CC-xxxxx`); physical hardware scanners are supported but optional.

---

## 5. HOW TO REPORT BUGS OR FEEDBACK

When submitting feedback or reporting issues, please include:
1. **Portal & URL:** (e.g., Inmate Portal, `/inmate/cart`)
2. **User Account Used:** (e.g., `A1234567` or `family@canteen.local`)
3. **Steps to Reproduce:** Numbered actions taken before the issue occurred.
4. **Expected Result vs. Actual Result:** What you expected to see versus what happened.
5. **Screenshot or Browser Console Log:** (If applicable)

---

## 6. CLIENT ACCEPTANCE CRITERIA FOR HANDOVER

The Canteen Corner application is considered approved for final handover when:
- [ ] All 4 portals are accessible without errors.
- [ ] Inmate PIN login and spending limits operate as designed.
- [ ] Family deposits credit the inmate balance correctly upon confirmation.
- [ ] Warehouse staff can process orders and generate delivery manifests.
- [ ] Admin ledger records exact financial precision (USD) with zero balance discrepancies.
- [ ] Role-based access boundaries strictly prevent unauthorized cross-portal navigation.

---

## 7. TEST ENVIRONMENT RESET & STATE MANAGEMENT

Administrators can reset the testing environment back to clean baseline state at any time:

1. **To clear operational testing orders and reset account balances:**
   ```bash
   npm run db:clean
   ```
2. **To re-seed fresh test personas, initial balances ($82.50 for John Smith), and catalog stock:**
   ```bash
   npm run db:seed:demo
   ```
*(Note: Automated security guards permanently block these reset scripts from running against Production or Staging databases).*
