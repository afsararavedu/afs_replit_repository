CREATE TABLE IF NOT EXISTS "daily_expenses" (
        "id" serial PRIMARY KEY NOT NULL,
        "date" date NOT NULL,
        "type" text NOT NULL,
        "category" text NOT NULL,
        "amount" numeric DEFAULT '0' NOT NULL,
        "description" text,
        "payment_mode" text DEFAULT 'Cash' NOT NULL,
        "submitted_by" text NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_sales" (
        "id" serial PRIMARY KEY NOT NULL,
        "brand_number" text NOT NULL,
        "brand_name" text NOT NULL,
        "size" text NOT NULL,
        "quantity_per_case" integer NOT NULL,
        "opening_balance_bottles" integer DEFAULT 0,
        "new_stock_cases" integer DEFAULT 0,
        "new_stock_bottles" integer DEFAULT 0,
        "closing_balance_cases" integer DEFAULT 0,
        "closing_balance_bottles" integer DEFAULT 0,
        "mrp" numeric NOT NULL,
        "total_sale_value" numeric DEFAULT '0',
        "sold_bottles" integer DEFAULT 0,
        "sale_value" numeric DEFAULT '0',
        "breakage_bottles" integer DEFAULT 0,
        "total_closing_stock" integer DEFAULT 0,
        "final_closing_balance" integer DEFAULT 0,
        "sale_date" date DEFAULT now(),
        "invoice_date" date,
        "is_submitted" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_stock" (
        "id" serial PRIMARY KEY NOT NULL,
        "brand_number" text NOT NULL,
        "brand_name" text NOT NULL,
        "size" text NOT NULL,
        "quantity_per_case" integer NOT NULL,
        "stock_in_cases" integer DEFAULT 0,
        "stock_in_bottles" integer DEFAULT 0,
        "total_stock_bottles" integer DEFAULT 0,
        "mrp" numeric NOT NULL,
        "total_stock_value" numeric DEFAULT '0',
        "breakage" integer DEFAULT 0,
        "remarks" text,
        "date" date NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense_categories" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "type" text NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
        "id" serial PRIMARY KEY NOT NULL,
        "brand_number" text NOT NULL,
        "brand_name" text NOT NULL,
        "product_type" text NOT NULL,
        "pack_type" text NOT NULL,
        "pack_size" text NOT NULL,
        "qty_cases_delivered" integer DEFAULT 0,
        "qty_bottles_delivered" integer DEFAULT 0,
        "rate_per_case" numeric DEFAULT '0',
        "unit_rate_per_bottle" numeric DEFAULT '0',
        "total_amount" numeric DEFAULT '0',
        "breakage_bottle_qty" integer DEFAULT 0,
        "total_bottles" integer DEFAULT 0,
        "remarks" text,
        "invoice_date" date,
        "icdc_number" text,
        "data_updated" text DEFAULT 'NO' NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_mrp_details" (
        "id" serial PRIMARY KEY NOT NULL,
        "brand_number" text NOT NULL,
        "brand_name" text NOT NULL,
        "size" text NOT NULL,
        "product_type" text DEFAULT '' NOT NULL,
        "sales_mrp" numeric DEFAULT '0' NOT NULL,
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_submit_status" (
        "id" serial PRIMARY KEY NOT NULL,
        "date" date NOT NULL,
        "is_submitted" boolean DEFAULT false NOT NULL,
        "submitted_at" timestamp,
        CONSTRAINT "sales_submit_status_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shop_details" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text,
        "address" text,
        "retail_shop_excise_tax" text,
        "license_no" text,
        "pan_number" text,
        "name_phone" text,
        "invoice_date" text,
        "gazette_code_licensee_issue_date" text,
        "icdc_number" text,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_details" (
        "id" serial PRIMARY KEY NOT NULL,
        "brand_number" text NOT NULL,
        "brand_name" text NOT NULL,
        "size" text NOT NULL,
        "quantity_per_case" integer NOT NULL,
        "stock_in_cases" integer DEFAULT 0,
        "stock_in_bottles" integer DEFAULT 0,
        "total_stock_bottles" integer DEFAULT 0,
        "mrp" numeric NOT NULL,
        "total_stock_value" numeric DEFAULT '0',
        "breakage" integer DEFAULT 0,
        "remarks" text,
        "invoice_date" date DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "username" text NOT NULL,
        "password" text NOT NULL,
        "role" text DEFAULT 'employee' NOT NULL,
        "temp_password" text,
        "must_reset_password" boolean DEFAULT false,
        "password_changed_at" timestamp DEFAULT now() NOT NULL,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_sales_brand_size_date_idx" ON "daily_sales" USING btree ("brand_number","size","sale_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_sales_sale_date_idx" ON "daily_sales" USING btree ("sale_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_stock_brand_size_date_idx" ON "daily_stock" USING btree ("brand_number","size","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_mrp_brand_size_idx" ON "sales_mrp_details" USING btree ("brand_number","brand_name","size","product_type");
