-- D3: inclui porte Gigante sem alterar a permissividade de pets historicos.
ALTER TABLE pets
  DROP CONSTRAINT IF EXISTS chk_pets_porte;

ALTER TABLE pets
  ADD CONSTRAINT chk_pets_porte
  CHECK (
    porte IS NULL
    OR porte IN ('pequeno', 'medio', 'grande', 'gigante')
  );
