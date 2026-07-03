import assert from "node:assert/strict";
import test from "node:test";
import { validateGitHubActionsCronClaims } from "@/lib/auth/github-actions-oidc";

const now = new Date("2026-07-03T07:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1000);

function createClaims(overrides: Record<string, unknown> = {}) {
  return {
    aud: "portfoliotrack-cron",
    event_name: "schedule",
    exp: nowSeconds + 300,
    iss: "https://token.actions.githubusercontent.com",
    job_workflow_ref:
      "inspirezuza/portfoliotrack/.github/workflows/market-refresh.yml@refs/heads/main",
    nbf: nowSeconds - 60,
    ref: "refs/heads/main",
    repository: "inspirezuza/portfoliotrack",
    ...overrides,
  };
}

test("GitHub Actions cron claims accept the scheduled main-branch workflow", () => {
  assert.equal(validateGitHubActionsCronClaims(createClaims(), now), true);
});

test("GitHub Actions cron claims reject the wrong repo, branch, audience, or expiry", () => {
  assert.equal(
    validateGitHubActionsCronClaims(createClaims({ repository: "someone/else" }), now),
    false,
  );
  assert.equal(
    validateGitHubActionsCronClaims(createClaims({ ref: "refs/heads/feature" }), now),
    false,
  );
  assert.equal(
    validateGitHubActionsCronClaims(
      createClaims({
        job_workflow_ref: "inspirezuza/portfoliotrack/.github/workflows/other.yml@refs/heads/main",
      }),
      now,
    ),
    false,
  );
  assert.equal(validateGitHubActionsCronClaims(createClaims({ aud: "other" }), now), false);
  assert.equal(
    validateGitHubActionsCronClaims(createClaims({ exp: nowSeconds - 120 }), now),
    false,
  );
});
