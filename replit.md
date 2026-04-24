# BRR Liquor Soft

## Overview

BRR Liquor Soft (BRR IT Solutions) is a full-stack sales management dashboard application for tracking daily sales, inventory, and orders. It features a React frontend with a modern UI built on shadcn/ui components, and an Express backend with PostgreSQL database storage using Drizzle ORM. The application provides modules for daily sales tracking, order management, file uploads, and various placeholder modules for future expansion (Stock, Reports, Credits, Calendar).

### Order-to-Stock Sync
- Triggered manually via "Get Latest Stock" button on Stock page (POST /api/stock/sync)
- Also triggered automatically when orders are created (bulk)
- Only orders with `data_updated = 'NO'` are processed (prevents double-counting)
- After syncing, orders are marked `data_updated = 'YES'`
- Stock fields updated: `stock_in_cases`, `stock_in_bottles`, `total_stock_bottles`, `total_stock_value`
- Sync aggregates multiple orders per stock item before applying
- Matching uses 3-way condition: brand_number, brand_name, and orders.pack_size contains stock_details.size

### Invoice Tracking
- Orders table has `invoice_date` and `icdc_number` columns for tracking invoices
- PDF parser extracts Invoice Date and ICDC Number from the PDF header and applies them to all parsed rows
- Inventory page loads all orders and filters client-side (date range, ICDC, brand no, text search)
- API endpoint: GET /api/orders (fetches all; client handles filtering)

### Inventory Page Design
- Airtable-style single-view layout (no tabs) matching the screenshot design
- Stats cards: ICDC Invoices, Total Cases (+ bottles), Stock Value, This Month lines
- Toolbar: inline search, Filter popover (quick range + from/to date + ICDC + brand no), Sort popover (per column asc/desc), Import dropdown (upload / template / export), Add Entry button, Settings gear (save changes shortcut)
- Three tabs next to heading: Invoices (default) | Update Sales MRP | Import Sales Data (admin only)
- Table with checkboxes, inline row edit/delete, sortable column headers
- Empty state with "Import ICDC file" and "+ Add manually" CTAs
- Keyboard shortcuts bar: / Search, n New entry, r Refresh, Esc Clear selection
- Manual entry in a Dialog (multi-row table)
- Sales MRP management rendered inline in "Update Sales MRP" tab
- Import Sales Data rendered inline in "Import Sales Data" tab (admin only)

### Shop Details Extraction
- `shop_details` table stores metadata from PDF invoice headers: Name, Address, Retail Shop Excise Tax, License No, PAN Number, Name & Phone, Invoice Date, Gazette Code & Licensee Issue Date, ICDC Number
- Automatically extracted and saved when a PDF invoice is uploaded via the file upload endpoint
- API endpoint: GET /api/shop-details returns all saved shop detail records (newest first)

### Stock-to-DailySales Sync
- After stock is updated (from orders or direct stock edit), daily_sales rows are auto-updated
- Matches on: brand_number, brand_name, size, quantity_per_case
- Fields updated: `opening_balance_bottles` (from total_stock_bottles), `new_stock_cases` (from stock_in_cases), `new_stock_bottles` (from stock_in_bottles)

### Daily Stock Snapshots
- `daily_stock` table stores a per-brand, per-date closing stock snapshot (created each time "Save Sales" is clicked)
- Snapshot is derived from `daily_sales` closing values: `closing_balance_cases`, `closing_balance_bottles`, `total_closing_stock`
- API endpoint: GET /api/daily-stock?date=YYYY-MM-DD returns the snapshot for that date
- Stock page date picker: selecting today shows current (editable) stock_details; selecting a past date shows the daily_stock snapshot (read-only)
- Sales page opening balance rule: Op. Bal (Btls) for date D = daily_stock[D-1].total_stock_bottles
  - Matching uses 4-field key: Brand No + Brand Name + Size + Qty/Cs (same as Stock page "Tot Stk (Btls)")
  - If no daily_stock exists for D-1, falls back to daily_sales[D-1].totalClosingStock (same 4-field match)
  - If neither exists, falls back to stock_details.totalStockBottles minus today's orders
  - Order aggregation (New Stock) still uses 2-field key (Brand No + Size) since orders lack brandName/qty

### DailySales-to-Stock Sync
- Triggered automatically when sales are saved ("Save Sales" button) for ANY date
- Matching criteria: brand_number + brand_name + size (contains match) + qty_per_case; fallback drops qty_per_case
- Update logic: **UPSERT** — SET (not decrease) stock_details to closing values from daily_sales
  - `stock_in_cases = closing_balance_cases`
  - `stock_in_bottles = closing_balance_bottles`
  - `total_stock_bottles = total_closing_stock`
  - `total_stock_value = total_closing_stock × mrp`
  - If no matching stock_details row exists → INSERT a new row
- **Auto-populate**: If stock_details table is empty, `getStockDetails()` auto-populates from the most recent `daily_stock` snapshot before returning

### Sales MRP Overrides (sales_mrp_details)
- `sales_mrp_details` table stores per-brand Sales MRP overrides (brand_number, brand_name, size, qty_per_case, sales_mrp)
- When fetching daily_sales, the `mrp` field is replaced with `sales_mrp_details.sales_mrp` if a matching entry exists
- Managed via "Update Sales MRP" tab on the Inventory (invoice) page
- Dropdowns are populated with unique values from stock_details (cascading: brand_no → brand_name → size → qty/cs)
- API endpoints: GET /api/sales-mrp, POST /api/sales-mrp (upsert)

### New Stock from Previous Day's Snapshot
- When the Sales page loads for date D, `new_stock_cases` and `new_stock_bottles` are overridden from `daily_stock[D-1]`
- This ensures the New Stk (Cs) and New Stk (Btls) columns reflect the previous day's received stock

### Sales Calculations
- `Final Closing Balance` = `Total Closing Stock (Bottles)` x `MRP` (or sales_mrp if override exists)

### Expenses & Income Tracking
- New `/expenses` page accessible to both Admin and Employee via sidebar
- `expense_categories` table: Admin-managed list of Expense and Income categories
- `daily_expenses` table: Date-wise entries with type (expense/income), category, amount, description, payment_mode (Cash/UPI/Bank), submittedBy
- Summary cards on page show: Sales Total (from daily_sales), Expenses Total, Income Total, Net Balance
- Both roles can add entries; only Admin can edit or delete
- Admin-only "Manage Categories" tab lets Admin add/remove expense and income category names
- API endpoints: GET/POST /api/expense-categories, DELETE /api/expense-categories/:id, GET/POST /api/daily-expenses, PUT/DELETE /api/daily-expenses/:id

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **Build Tool**: Vite with hot module replacement
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful endpoints defined in shared routes file
- **File Uploads**: Multer with memory storage
- **Development**: tsx for TypeScript execution, Vite dev server integration
- **Production Build**: esbuild for server bundling, Vite for client

### Data Layer
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit with `db:push` command

### Shared Code Structure
- `shared/schema.ts`: Database table definitions and Zod schemas
- `shared/routes.ts`: API route definitions with input/output schemas
- Path aliases: `@/` for client source, `@shared/` for shared code

### Key Design Patterns
- **Type-safe API contracts**: Routes defined with Zod schemas in shared folder
- **Upsert pattern**: Sales data uses `onConflictDoUpdate` for bulk updates
- **Bulk operations**: Orders and sales support bulk create/update endpoints
- **Client-side calculations**: Sales value calculations happen in browser before save

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage for PostgreSQL (available but not currently used)

### Third-Party Libraries
- **Radix UI**: Accessible UI primitives for all interactive components
- **Lucide React**: Icon library
- **date-fns**: Date manipulation utilities
- **class-variance-authority**: Component variant management
- **embla-carousel-react**: Carousel functionality
- **recharts**: Charting library (via shadcn/ui chart component)

### Development Tools
- **Replit Vite plugins**: Runtime error overlay, cartographer, dev banner
- **Drizzle Kit**: Database schema management and migrations