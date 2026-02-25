-- Migration 0007: Add work_item_milestone_deps table
-- Represents "Required Milestones" relationship: a work item depends on a milestone
-- completing before it can start. Distinct from milestone_work_items which represents
-- "Linked" work items that contribute to a milestone.

CREATE TABLE work_item_milestone_deps (
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  milestone_id INTEGER NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  PRIMARY KEY (work_item_id, milestone_id)
);

CREATE INDEX idx_wi_milestone_deps_milestone ON work_item_milestone_deps(milestone_id);
