-- ==============================================================================
-- CANTEEN CORNER — FINANCIAL PRECISION HARDENING MIGRATION
-- Migration: 20261117214000_financial_precision_hardening
-- Target Database: Dedicated Supabase Staging (zcamheygapbruuovikar) / Production
-- Converts 19 monetary columns across 8 models from DOUBLE PRECISION to DECIMAL(12, 2)
-- Adds PostgreSQL CHECK constraints for financial integrity and overdraft protection
-- ==============================================================================

-- 1. Facility: maxWeeklySpend and maxDepositAmount
ALTER TABLE "Facility" ALTER COLUMN "maxWeeklySpend" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "maxDepositAmount" SET DATA TYPE DECIMAL(12,2);

-- 2. Offender: balance, weeklyLimit, and currentWeeklySpent
ALTER TABLE "Offender" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "weeklyLimit" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "currentWeeklySpent" SET DATA TYPE DECIMAL(12,2);

-- 3. Product: price
ALTER TABLE "Product" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- 4. Order: subtotal, tax, and total
ALTER TABLE "Order" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "tax" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- 5. OrderItem: unitPrice and totalPrice
ALTER TABLE "OrderItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(12,2);

-- 6. Deposit: amount, fee, and totalPaid
ALTER TABLE "Deposit" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "fee" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalPaid" SET DATA TYPE DECIMAL(12,2);

-- 7. LedgerEntry: debit, credit, balanceBefore, and balanceAfter
ALTER TABLE "LedgerEntry" ALTER COLUMN "debit" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "balanceBefore" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "balanceAfter" SET DATA TYPE DECIMAL(12,2);

-- 8. GiftPackage: totalValue
ALTER TABLE "GiftPackage" ALTER COLUMN "totalValue" SET DATA TYPE DECIMAL(12,2);

-- ==============================================================================
-- FINANCIAL INTEGRITY CHECK CONSTRAINTS
-- ==============================================================================

-- Facility: Non-negative spending limit and positive deposit amount
ALTER TABLE "Facility"
  ADD CONSTRAINT "check_facility_max_weekly_spend_nonnegative" CHECK ("maxWeeklySpend" >= 0.00),
  ADD CONSTRAINT "check_facility_max_deposit_amount_positive" CHECK ("maxDepositAmount" > 0.00);

-- Offender: Non-negative balance and weekly spent, positive weekly limit
ALTER TABLE "Offender"
  ADD CONSTRAINT "check_offender_balance_nonnegative" CHECK ("balance" >= 0.00),
  ADD CONSTRAINT "check_offender_weekly_limit_positive" CHECK ("weeklyLimit" > 0.00),
  ADD CONSTRAINT "check_offender_current_weekly_spent_nonnegative" CHECK ("currentWeeklySpent" >= 0.00);

-- Product: Non-negative price
ALTER TABLE "Product"
  ADD CONSTRAINT "check_product_price_nonnegative" CHECK ("price" >= 0.00);

-- Order: Non-negative subtotal, tax, and total
ALTER TABLE "Order"
  ADD CONSTRAINT "check_order_subtotal_nonnegative" CHECK ("subtotal" >= 0.00),
  ADD CONSTRAINT "check_order_tax_nonnegative" CHECK ("tax" >= 0.00),
  ADD CONSTRAINT "check_order_total_nonnegative" CHECK ("total" >= 0.00);

-- OrderItem: Non-negative unitPrice and totalPrice
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "check_order_item_unit_price_nonnegative" CHECK ("unitPrice" >= 0.00),
  ADD CONSTRAINT "check_order_item_total_price_nonnegative" CHECK ("totalPrice" >= 0.00);

-- Deposit: Positive amount, non-negative fee, positive totalPaid
ALTER TABLE "Deposit"
  ADD CONSTRAINT "check_deposit_amount_positive" CHECK ("amount" > 0.00),
  ADD CONSTRAINT "check_deposit_fee_nonnegative" CHECK ("fee" >= 0.00),
  ADD CONSTRAINT "check_deposit_total_paid_positive" CHECK ("totalPaid" > 0.00);

-- LedgerEntry: Non-negative debit, credit, balanceBefore, balanceAfter; at least one non-zero debit/credit
ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "check_ledger_debit_nonnegative" CHECK ("debit" >= 0.00),
  ADD CONSTRAINT "check_ledger_credit_nonnegative" CHECK ("credit" >= 0.00),
  ADD CONSTRAINT "check_ledger_non_zero_entry" CHECK ("debit" > 0.00 OR "credit" > 0.00),
  ADD CONSTRAINT "check_ledger_balance_before_nonnegative" CHECK ("balanceBefore" >= 0.00),
  ADD CONSTRAINT "check_ledger_balance_after_nonnegative" CHECK ("balanceAfter" >= 0.00);

-- GiftPackage: Non-negative totalValue
ALTER TABLE "GiftPackage"
  ADD CONSTRAINT "check_gift_package_total_value_nonnegative" CHECK ("totalValue" >= 0.00);
