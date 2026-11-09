-- Constraints required for deterministic per-user synchronization.
create unique index if not exists shopping_items_user_ingredient_uidx
  on public.shopping_items(user_id, ingredient_name);
create unique index if not exists meal_plan_items_user_slot_recipe_uidx
  on public.meal_plan_items(user_id, meal_date, meal_type, recipe_id);
