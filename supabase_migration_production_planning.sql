-- ============================================================
-- Migration: Production Planning Module
-- Tables: raw_materials, product_recipes, recipe_ingredients,
--         purchase_plans, purchase_plan_items, purchase_plan_batches
-- ============================================================

-- 1. RAW MATERIALS (Bahan)
CREATE TABLE IF NOT EXISTS raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'packet',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  calculation_mode TEXT NOT NULL CHECK (calculation_mode IN ('unit', 'fraction')) DEFAULT 'unit',
  fraction_grams NUMERIC,
  fraction_unit TEXT CHECK (fraction_unit IN ('g', 'ml')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix existing table if it has old columns (purchase_quantity, purchase_unit)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'raw_materials' AND column_name = 'purchase_unit') THEN
    ALTER TABLE raw_materials RENAME COLUMN purchase_unit TO unit;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'raw_materials' AND column_name = 'purchase_quantity') THEN
    ALTER TABLE raw_materials DROP COLUMN purchase_quantity;
  END IF;
END $$;

-- 2. PRODUCT RECIPES (Resipi untuk setiap produk dalam inventory)
CREATE TABLE IF NOT EXISTS product_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  recipe_name TEXT,
  batch_size_desc TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inventory_id)
);

-- 3. RECIPE INGREDIENTS (Bahan-bahan dalam resipi)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES product_recipes(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  quantity_used NUMERIC NOT NULL DEFAULT 0,
  unit_used TEXT NOT NULL DEFAULT 'g',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PURCHASE PLANS (Rekod pembelian)
CREATE TABLE IF NOT EXISTS purchase_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  total_estimated_cost NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PURCHASE PLAN ITEMS (Item dalam pembelian - aggregate bahan)
CREATE TABLE IF NOT EXISTS purchase_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_plan_id UUID NOT NULL REFERENCES purchase_plans(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  total_quantity_needed NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'g',
  estimated_cost NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PURCHASE PLAN BATCHES (Produk + batch yang diplan)
CREATE TABLE IF NOT EXISTS purchase_plan_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_plan_id UUID NOT NULL REFERENCES purchase_plans(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  batch_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_plan_batches ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can CRUD own raw_materials" ON raw_materials;
  DROP POLICY IF EXISTS "Users can CRUD own product_recipes" ON product_recipes;
  DROP POLICY IF EXISTS "Users can CRUD own recipe_ingredients" ON recipe_ingredients;
  DROP POLICY IF EXISTS "Users can CRUD own purchase_plans" ON purchase_plans;
  DROP POLICY IF EXISTS "Users can CRUD own purchase_plan_items" ON purchase_plan_items;
  DROP POLICY IF EXISTS "Users can CRUD own purchase_plan_batches" ON purchase_plan_batches;
END $$;

-- RLS policies: users can only see their own data
CREATE POLICY "Users can CRUD own raw_materials" ON raw_materials
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own product_recipes" ON product_recipes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM inventory i
      WHERE i.id = product_recipes.inventory_id
      AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can CRUD own recipe_ingredients" ON recipe_ingredients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM product_recipes pr
      JOIN inventory i ON i.id = pr.inventory_id
      WHERE pr.id = recipe_ingredients.recipe_id
      AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can CRUD own purchase_plans" ON purchase_plans
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own purchase_plan_items" ON purchase_plan_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM purchase_plans pp
      WHERE pp.id = purchase_plan_items.purchase_plan_id
      AND pp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can CRUD own purchase_plan_batches" ON purchase_plan_batches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM purchase_plans pp
      WHERE pp.id = purchase_plan_batches.purchase_plan_id
      AND pp.user_id = auth.uid()
    )
  );

-- ============================================================
-- Insert module into system_modules for Privileges page
-- ============================================================
INSERT INTO system_modules (id, name, description)
VALUES ('productionPlanning', 'Production Planning', 'Manage materials, recipes, and purchase planning.')
ON CONFLICT (id) DO NOTHING;
