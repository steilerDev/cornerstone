-- Add account lockout columns to users
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;

-- Case-insensitive unique index for budget_categories.name
CREATE UNIQUE INDEX idx_budget_categories_name_ci ON budget_categories(LOWER(name));

-- Case-insensitive unique index for household_item_categories.name
CREATE UNIQUE INDEX idx_household_item_categories_name_ci ON household_item_categories(LOWER(name));
