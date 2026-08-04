ALTER TABLE project_embedding_chunks
  ADD COLUMN metadata_search_document TSVECTOR GENERATED ALWAYS AS (
    setweight(
      to_tsvector(
        'simple'::REGCONFIG,
        regexp_replace(
          COALESCE(relative_path, ''),
          '([[:lower:][:digit:]])([[:upper:]])',
          '\1 \2',
          'g'
        )
      ),
      'A'
    ) ||
    setweight(
      to_tsvector(
        'simple'::REGCONFIG,
        regexp_replace(
          COALESCE(owner_symbol_name, '') || ' ' || COALESCE(owner_symbol_qualified_name, ''),
          '([[:lower:][:digit:]])([[:upper:]])',
          '\1 \2',
          'g'
        )
      ),
      'A'
    ) ||
    setweight(
      to_tsvector(
        'simple'::REGCONFIG,
        COALESCE(language, '') || ' ' || COALESCE(owner_symbol_kind, '')
      ),
      'B'
    )
  ) STORED;

CREATE INDEX project_embedding_chunks_metadata_search_idx
  ON project_embedding_chunks USING GIN (metadata_search_document);

ALTER TABLE project_framework_entities
  ADD COLUMN metadata_search_document TSVECTOR GENERATED ALWAYS AS (
    setweight(
      to_tsvector(
        'simple'::REGCONFIG,
        regexp_replace(
          COALESCE(name, ''),
          '([[:lower:][:digit:]])([[:upper:]])',
          '\1 \2',
          'g'
        )
      ),
      'A'
    ) ||
    setweight(
      to_tsvector(
        'simple'::REGCONFIG,
        COALESCE(framework, '') || ' ' || COALESCE(entity_kind, '') || ' ' || COALESCE(relative_path, '')
      ),
      'B'
    )
  ) STORED;

CREATE INDEX project_framework_entities_metadata_search_idx
  ON project_framework_entities USING GIN (metadata_search_document);
