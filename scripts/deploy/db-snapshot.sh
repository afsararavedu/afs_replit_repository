#!/usr/bin/env bash
# Take an ad-hoc manual snapshot of the BRR Liquor Soft RDS Postgres instance.
#
# Use this immediately before any risky operation: schema migrations,
# `drizzle-kit push` against a non-empty database, bulk data fixes, etc.
# Manual snapshots are kept until you delete them, unlike automated daily
# snapshots which roll off after the configured retention window.
#
# Usage:
#   bash scripts/deploy/db-snapshot.sh                 # uses defaults below
#   DB_INSTANCE_ID=brr-db bash scripts/deploy/db-snapshot.sh
#   AWS_REGION=eu-west-1 DB_INSTANCE_ID=brr-db SNAPSHOT_TAG=pre-migration \
#     bash scripts/deploy/db-snapshot.sh
#
# Required:
#   - aws CLI v2 installed and configured (`aws configure` or an IAM role
#     attached to the EC2 instance with `rds:CreateDBSnapshot` and
#     `rds:DescribeDBSnapshots` permissions).
#
# Env vars:
#   DB_INSTANCE_ID  RDS DB instance identifier (default: brr-db)
#   AWS_REGION      AWS region (default: us-east-1, or $AWS_DEFAULT_REGION)
#   SNAPSHOT_TAG    Short tag included in the snapshot id (default: manual)
#                   Must match [a-z0-9-]+, max 20 chars.

set -euo pipefail

DB_INSTANCE_ID="${DB_INSTANCE_ID:-brr-db}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
SNAPSHOT_TAG="${SNAPSHOT_TAG:-manual}"

if ! command -v aws >/dev/null 2>&1; then
  echo "error: aws CLI is not installed or not on PATH" >&2
  echo "  install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" >&2
  exit 1
fi

if ! [[ "$SNAPSHOT_TAG" =~ ^[a-z0-9-]{1,20}$ ]]; then
  echo "error: SNAPSHOT_TAG must match [a-z0-9-]{1,20} (got: '$SNAPSHOT_TAG')" >&2
  exit 1
fi

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
SNAPSHOT_ID="${DB_INSTANCE_ID}-${SNAPSHOT_TAG}-${TIMESTAMP}"

log() { printf '\033[1;34m[db-snapshot]\033[0m %s\n' "$*"; }

log "creating manual snapshot"
log "  db instance : $DB_INSTANCE_ID"
log "  snapshot id : $SNAPSHOT_ID"
log "  region      : $AWS_REGION"

aws rds create-db-snapshot \
  --region "$AWS_REGION" \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --output table \
  --query 'DBSnapshot.{Snapshot:DBSnapshotIdentifier,Status:Status,Type:SnapshotType,Engine:Engine}'

log "snapshot create requested. it will move from 'creating' -> 'available' in a few minutes."
log "poll status with:"
log "  aws rds describe-db-snapshots --region $AWS_REGION \\"
log "    --db-snapshot-identifier $SNAPSHOT_ID \\"
log "    --query 'DBSnapshots[0].{Status:Status,Progress:PercentProgress}'"
