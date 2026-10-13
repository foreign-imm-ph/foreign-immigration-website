# Prototypes (historical reference, superseded)

The three form generators under this directory (`CCS-A-CDR-2016/`,
`2014-13-002/`, `2014-13-006/`) were the original, hand-written
implementations built one form at a time, before the shared FIS Forms
Library engine existed. As of Phase 1 of the engine migration, they are
**superseded** -- kept only as a historical record of how each form's
secure customer-preview generation was designed and approved, not as
something anything still runs.

Each `generate.js`, `compose_customer_canvas.py`, and
`finalize_customer_preview.js` in these folders carries a notice at the
top pointing to its replacement and is otherwise left unmodified.

The current, maintained implementation for all three forms is:

- `bi-forms-library/engine/cli.js` -- the single shared entry point
  (`validate` and `generate` commands) for every form
- `bi-forms-library/configs/<formId>/` -- each form's
  `coordinate-map.json`, `questionnaire.json`, and `sample-data.json`
- `bi-forms-library/tests/run-all.js` -- the automated regression suite,
  including pixel-exact parity against `bi-forms-library/tests/golden/`

The `*.md` reports in these folders (`ALIGNMENT_REPORT.md`,
`VALIDATION_REPORT.md`, `STAGE1_ANALYSIS.md`, `FOLLOWUP_REPORT.md`) are
likewise kept as the historical record of each form's review and
approval process and are not updated going forward; current validation
results come from the engine's own test suite.
