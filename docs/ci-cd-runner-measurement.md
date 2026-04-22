# CI/CD Runner Measurement

> Status: maintained
> Applies to: OpenPath CI/E2E timing, artifact evidence, and controlled runner follow-up
> Last verified: 2026-04-22
> Source of truth: `docs/ci-cd-runner-measurement.md`

Use this runbook when continuing CI optimization work. It replaces temporary
planning notes as the durable place to record how OpenPath runner timing is
measured.

## What To Measure

For each representative push, record:

- OpenPath commit SHA and workflow run ID.
- Workflow conclusion and total wall-clock time.
- Per-job durations for:
  - `Windows Agent Tests (Pester)`
  - `Windows E2E`
  - `Windows Student Policy`
  - `Linux E2E`
  - `Linux Student Policy`
  - release or package workflows when they are relevant to the change.
- Whether the job waited in queue before starting.
- Cache signals from logs, especially npm cache hits and pre-provisioned
  Windows dependency reuse.
- Artifact evidence for diagnostic uploads when the workflow is meant to retain
  artifacts.
- Runner health after the run: runner online, not stuck busy, and reset helper
  completed.

Do not compare a cold runner provisioning sample with a warm steady-state
sample without labeling it as cold or warm.

## GitHub CLI Commands

List current main-branch workflow runs:

```bash
gh run list --repo balejosg/Openpath --branch main --limit 10 \
  --json databaseId,workflowName,headSha,status,conclusion,createdAt,updatedAt
```

Inspect one workflow run:

```bash
gh run view <run-id> --repo balejosg/Openpath \
  --json name,headSha,status,conclusion,createdAt,updatedAt,jobs
```

Inspect a specific job log for cache and artifact signals:

```bash
gh run view <run-id> --repo balejosg/Openpath --job <job-id> --log \
  | rg -n "Cache hit|Cache restored|Upload .*diagnostics|Artifact|ENOTFOUND|ETIMEDOUT"
```

List retained artifacts:

```bash
gh api repos/balejosg/Openpath/actions/runs/<run-id>/artifacts \
  --jq '.artifacts[] | [.name,.expired,.size_in_bytes,.created_at] | @tsv'
```

## Latest Controlled Windows Baseline

The latest validated OpenPath controlled Windows baseline is:

- Commit: `ecb7a69c` (`ci: restore windows runner before artifact upload`)
- E2E run: `24760799312`
- Workflow conclusion: `success`
- `Windows Student Policy`: `9m45s`
- `Windows E2E`: `3m36s`
- `Linux Student Policy`: `6m44s`
- `Linux E2E (ubuntu-22.04)`: `1m38s`
- `Linux E2E (ubuntu-24.04)`: `1m44s`
- Windows student-policy diagnostic artifact:
  `windows-student-policy-artifacts-24760799312`, retained, `1123977`
  bytes.
- Upload symptom cleared: the Windows diagnostics upload finalized in GitHub
  blob storage without `ENOTFOUND`.

The important implementation detail is the step order in
`.github/workflows/e2e-tests.yml`: `Restore self-hosted Windows runner state`
must run before `Upload Windows student-policy diagnostics`. The reset restores
external DNS before `actions/upload-artifact` contacts GitHub artifact storage.
`tests/repo-config/workflow-contracts.test.mjs` protects that ordering.

## Decision Rules

- Optimize from repeated representative samples, not one isolated fast or slow
  run.
- Treat GitHub artifact upload failures separately from endpoint behavior when
  local diagnostic files were created and client tests passed.
- Treat a runner that is offline, stuck busy, or unable to pick up jobs as
  runner infrastructure evidence.
- Treat endpoint install, DNS, policy, or self-update failures as product or
  client evidence unless runner health checks show the runner itself failed.
- Keep self-hosted runner usage restricted to trusted repository workflows.

## Remaining Optimization Questions

- Measure sustained queue pressure before adding more Windows capacity.
- Split `windows-student-policy` into parallel SSE and fallback jobs only if
  repeated runs show that this lane remains the workflow bottleneck.
- Consider browser-stack simplification separately from runner provisioning;
  replacing Selenium with Playwright is a larger product-test change, not a
  runner setup task.
