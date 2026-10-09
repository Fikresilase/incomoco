from app.rag.ingestion.chunker import StructureChunker
from app.rag.ingestion.markdown_tree import parse_markdown
from app.rag.ingestion.tokens import estimate_tokens


def para(words: int, word: str = "lorem") -> str:
    return " ".join([word] * words) + "."


def test_markdown_tree_builds_sections_and_tracks_pages():
    md = "<<<PAGE 1>>>\n# Policy\nIntro text.\n\n## Eligibility\n- one\n- two\n\n<<<PAGE 2>>>\n## Fees\n| a | b |\n|---|---|\n| 1 | 2 |"
    root = parse_markdown(md)
    policy = root.children[0]
    assert policy.title == "Policy"
    assert [c.title for c in policy.children] == ["Eligibility", "Fees"]
    assert policy.children[0].blocks[0].kind == "list"
    fees_table = policy.children[1].blocks[0]
    assert fees_table.kind == "table" and fees_table.page_start == 2
    assert "<<<PAGE" not in fees_table.text


def test_small_document_is_one_chunk_with_breadcrumb():
    chunks = StructureChunker(450, 1200).chunk("# Title\n\nShort body.", "My Doc")
    assert len(chunks) == 1
    assert chunks[0].breadcrumb == "My Doc › Title"
    assert "Short body." in chunks[0].text


def test_large_sections_split_on_section_boundaries_within_bounds():
    sections = "\n\n".join(f"## Section {i}\n\n{para(700)}" for i in range(4))
    chunks = StructureChunker(450, 1200).chunk(f"# Guide\n\n{sections}", "Doc")
    assert len(chunks) == 4
    for i, chunk in enumerate(chunks):
        assert chunk.text.startswith(f"## Section {i}")
        assert chunk.breadcrumb == f"Doc › Guide › Section {i}"
        assert estimate_tokens(chunk.text) <= 1200


def test_small_sibling_sections_are_merged():
    sections = "\n\n".join(f"## Part {i}\n\n{para(120)}" for i in range(12))
    chunks = StructureChunker(450, 1200).chunk(f"# Big\n\n{sections}", "Doc")
    assert 1 < len(chunks) < 12
    for chunk in chunks[:-1]:
        assert estimate_tokens(chunk.text) >= 450
    assert all(estimate_tokens(c.text) <= 1200 for c in chunks)
    # No part is split across chunks.
    joined = [c.text for c in chunks]
    for i in range(12):
        assert sum(f"## Part {i}\n" in t for t in joined) == 1


def test_oversized_table_is_split_by_rows_with_header_repeated():
    rows = "\n".join(f"| row {i} | {'value ' * 30}|" for i in range(120))
    md = f"# Rates\n\n| name | value |\n|---|---|\n{rows}"
    chunks = StructureChunker(450, 1200).chunk(md, "Doc")
    assert len(chunks) > 1
    for chunk in chunks:
        assert "| name | value |" in chunk.text
        assert estimate_tokens(chunk.text) <= 1250


def test_flat_text_without_headings_is_packed_by_paragraph():
    md = "\n\n".join(para(200, f"w{i}") for i in range(10))
    chunks = StructureChunker(450, 1200).chunk(md, "Flat")
    assert len(chunks) >= 2
    assert all(c.breadcrumb == "Flat" for c in chunks)
    assert all(450 <= estimate_tokens(c.text) <= 1200 for c in chunks[:-1])


def test_page_range_is_recorded():
    md = "<<<PAGE 3>>>\n# A\n\nText on three.\n\n<<<PAGE 4>>>\nText on four."
    chunk = StructureChunker(450, 1200).chunk(md, "Doc")[0]
    assert (chunk.page_start, chunk.page_end) == (3, 4)
