-- Migration 0030: Add translation_key to predefined category tables
-- The column is nullable: predefined rows get a key, user-created rows remain NULL.

ALTER TABLE trades ADD COLUMN translation_key TEXT;
ALTER TABLE budget_categories ADD COLUMN translation_key TEXT;
ALTER TABLE household_item_categories ADD COLUMN translation_key TEXT;

-- Set translation keys for predefined trades (seeded in 0028)
UPDATE trades SET translation_key = 'trades.plumbing'         WHERE id = 'trade-plumbing';
UPDATE trades SET translation_key = 'trades.hvac'             WHERE id = 'trade-hvac';
UPDATE trades SET translation_key = 'trades.electrical'       WHERE id = 'trade-electrical';
UPDATE trades SET translation_key = 'trades.drywall'          WHERE id = 'trade-drywall';
UPDATE trades SET translation_key = 'trades.carpentry'        WHERE id = 'trade-carpentry';
UPDATE trades SET translation_key = 'trades.masonry'          WHERE id = 'trade-masonry';
UPDATE trades SET translation_key = 'trades.painting'         WHERE id = 'trade-painting';
UPDATE trades SET translation_key = 'trades.roofing'          WHERE id = 'trade-roofing';
UPDATE trades SET translation_key = 'trades.flooring'         WHERE id = 'trade-flooring';
UPDATE trades SET translation_key = 'trades.tiling'           WHERE id = 'trade-tiling';
UPDATE trades SET translation_key = 'trades.landscaping'      WHERE id = 'trade-landscaping';
UPDATE trades SET translation_key = 'trades.excavation'       WHERE id = 'trade-excavation';
UPDATE trades SET translation_key = 'trades.generalContractor' WHERE id = 'trade-general-contractor';
UPDATE trades SET translation_key = 'trades.architectDesign'  WHERE id = 'trade-architect-design';
UPDATE trades SET translation_key = 'trades.other'            WHERE id = 'trade-other';

-- Set translation keys for predefined budget categories
UPDATE budget_categories SET translation_key = 'budgetCategories.materials'      WHERE id = 'bc-materials';
UPDATE budget_categories SET translation_key = 'budgetCategories.labor'          WHERE id = 'bc-labor';
UPDATE budget_categories SET translation_key = 'budgetCategories.permits'        WHERE id = 'bc-permits';
UPDATE budget_categories SET translation_key = 'budgetCategories.design'         WHERE id = 'bc-design';
UPDATE budget_categories SET translation_key = 'budgetCategories.householdItems' WHERE id = 'bc-household-items';
UPDATE budget_categories SET translation_key = 'budgetCategories.waste'          WHERE id = 'bc-waste';
UPDATE budget_categories SET translation_key = 'budgetCategories.other'          WHERE id = 'bc-other';
UPDATE budget_categories SET translation_key = 'budgetCategories.equipment'    WHERE id = 'bc-equipment';
UPDATE budget_categories SET translation_key = 'budgetCategories.landscaping'  WHERE id = 'bc-landscaping';
UPDATE budget_categories SET translation_key = 'budgetCategories.utilities'    WHERE id = 'bc-utilities';
UPDATE budget_categories SET translation_key = 'budgetCategories.insurance'    WHERE id = 'bc-insurance';
UPDATE budget_categories SET translation_key = 'budgetCategories.contingency'  WHERE id = 'bc-contingency';

-- Set translation keys for predefined household item categories
UPDATE household_item_categories SET translation_key = 'householdItemCategories.furniture'   WHERE id = 'hic-furniture';
UPDATE household_item_categories SET translation_key = 'householdItemCategories.appliances'  WHERE id = 'hic-appliances';
UPDATE household_item_categories SET translation_key = 'householdItemCategories.fixtures'    WHERE id = 'hic-fixtures';
UPDATE household_item_categories SET translation_key = 'householdItemCategories.decor'       WHERE id = 'hic-decor';
UPDATE household_item_categories SET translation_key = 'householdItemCategories.electronics' WHERE id = 'hic-electronics';
UPDATE household_item_categories SET translation_key = 'householdItemCategories.equipment'   WHERE id = 'hic-equipment';
UPDATE household_item_categories SET translation_key = 'householdItemCategories.other'       WHERE id = 'hic-other';
UPDATE household_item_categories SET translation_key = 'householdItemCategories.outdoor'  WHERE id = 'hic-outdoor';
UPDATE household_item_categories SET translation_key = 'householdItemCategories.storage'  WHERE id = 'hic-storage';
