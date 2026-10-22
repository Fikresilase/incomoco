# Phase 2 Architecture Assessment

Phase 1 already provides the reusable identity and context layer: the secure guest session cookie, `EntrepreneurProfile`, and `EntrepreneurContextService`. The existing chat flow separates routing, retrieval, grounded generation, citations, and voice, so Phase 2 should add recommendations as an optional sidecar rather than replace answer generation.

The existing `Document`/`IngestionJob`/`DocumentIndexer` pipeline and Weaviate are the approved knowledge path. MinIO remains the binary storage path. Learning resources therefore store metadata and may reference an existing document, MinIO object, or explicitly approved URL; they do not duplicate files or create another RAG system.

This phase adds a PostgreSQL-managed `LearningSkill` catalog and `LearningResource` registry. End-user routes join against active skills and only return resources with `approval_status=approved` and `is_active=true`. Demo seeds are explicitly marked synthetic. A deterministic keyword classifier maps a question to an existing skill key; arbitrary model-generated keys are not accepted. Resource ranking respects preferred language and learning format and returns at most three resources.

The migration extends head `9d4f2e6b1c77` with indexed skill/resource tables and safe demo seed data. Admin CRUD is the next hardening step; the current admin authentication can guard it without introducing another identity system. Recommendations can be emitted as a separate chat event after the answer, with failures isolated from RAG.
