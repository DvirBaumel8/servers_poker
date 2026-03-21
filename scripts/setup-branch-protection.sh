#!/usr/bin/env bash
# Setup branch protection rules for the main branch
# Run this script once with admin permissions: ./scripts/setup-branch-protection.sh
#
# Prerequisites:
#   - gh CLI installed and authenticated
#   - Admin access to the repository

set -euo pipefail

BRANCH="main"
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

echo "Setting up branch protection for $REPO ($BRANCH branch)..."

# Enable branch protection with required status checks
gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Lint",
      "Type Check",
      "Tests & Coverage",
      "E2E Tests",
      "Build",
      "CodeQL Analysis",
      "Dependency Audit",
      "License Compliance",
      "Lighthouse Performance"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
EOF

echo ""
echo "Branch protection enabled for $BRANCH!"
echo ""
echo "Required checks before merging:"
echo "  - Lint"
echo "  - Type Check"
echo "  - Tests & Coverage"
echo "  - E2E Tests"
echo "  - Build"
echo "  - CodeQL Analysis"
echo "  - Dependency Audit"
echo "  - License Compliance"
echo "  - Lighthouse Performance"
echo ""
echo "Additional settings:"
echo "  - Require 1 approving review"
echo "  - Dismiss stale reviews on new commits"
echo "  - Require conversations to be resolved"
echo "  - Block force pushes and branch deletion"
