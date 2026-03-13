-- Story #728: Add maximum_amount cap to subsidy programs
ALTER TABLE subsidy_programs ADD COLUMN maximum_amount REAL;
