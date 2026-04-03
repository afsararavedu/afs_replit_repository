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
- Saved Orders section on Inventory page supports filtering by invoice_date and icdc_number
- API endpoint: GET /api/orders?invoice_date=X&icdc_number=Y

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
- Sales page opening balance rule: Op. Bal (Btls) for date D = daily_stock[D-1].total_stock_bottles. If no daily_stock exists for D-1, Op. Bal = 0

### DailySales-to-Stock Sync
- Triggered automatically when sales are saved ("Save Sales" button) for ANY date
- Matching criteria: brand_number, brand_name, size (contains match), AND quantity_per_case (exact)
- Update logic: DECREASES stock_details values by the closing balance
  - `stock_in_cases = MAX(0, stock_in_cases − closing_balance_cases)`
  - `stock_in_bottles = MAX(0, stock_in_bottles − closing_balance_bottles)`
  - `total_stock_bottles = new_cases × qty_per_case + new_bottles`
  - `total_stock_value = total_stock_bottles × mrp`

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