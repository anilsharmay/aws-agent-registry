#!/usr/bin/env bash
set -euo pipefail

export AWS_PAGER=""

REGION="${AWS_REGION:-us-west-2}"
REGISTRY_ID="${REGISTRY_ID:?Set REGISTRY_ID to an existing registry ID}"
REGISTRY_ARN="${REGISTRY_ARN:?Set REGISTRY_ARN to the matching registry ARN}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d%H%M%S)}"
RECORD_NAME="${RECORD_NAME:-acme_code_review_mcp_${RUN_ID}}"
CLEANUP_RESOURCES="${CLEANUP_RESOURCES:-0}"
SEARCH_TIMEOUT_SECONDS="${SEARCH_TIMEOUT_SECONDS:-180}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESCRIPTORS_FILE="${SCRIPT_DIR}/mcp-code-review-descriptors.json"

log() {
  local level="$1"
  shift
  printf '[%s] %-7s %s\n' "$(date -u +%H:%M:%S)" "${level}" "$*"
}

sanitize() {
  sed -E 's/(^|[^0-9])[0-9]{12}([^0-9]|$)/\1<account-id>\2/g'
}

require_command() {
  command -v "$1" >/dev/null || {
    log ERROR "$1 is required."
    exit 1
  }
}

require_command aws
require_command jq

if ! aws bedrock-agentcore-control create-registry \
  --generate-cli-skeleton input >/dev/null 2>&1; then
  log ERROR "The installed AWS CLI does not include bedrock-agentcore-control."
  log ERROR "Install a current AWS CLI release before running this workflow."
  exit 1
fi

log SUMMARY "Configuration"
printf '  Region:             %s\n' "${REGION}"
printf '  Registry ID:        %s\n' "${REGISTRY_ID}"
printf '  Record name:        %s\n' "${RECORD_NAME}"
printf '  Cleanup enabled:    %s\n' "${CLEANUP_RESOURCES}"

log INFO "Creating an MCP registry record"
CREATE_JSON="$(aws bedrock-agentcore-control create-registry-record \
  --registry-id "${REGISTRY_ID}" \
  --name "${RECORD_NAME}" \
  --description "Code review and security scanning MCP metadata" \
  --descriptor-type MCP \
  --descriptors "file://${DESCRIPTORS_FILE}" \
  --record-version "2.1" \
  --region "${REGION}" \
  --output json \
  --no-cli-pager)"

RECORD_ID="$(printf '%s' "${CREATE_JSON}" | jq -r '.recordId // (.recordArn | split("/")[-1])')"
printf '%s\n' "${CREATE_JSON}" | jq '{recordArn, status}' | sanitize

log DEBUG "Waiting for record status DRAFT"
DELAY=2
DEADLINE=$((SECONDS + 120))
while (( SECONDS < DEADLINE )); do
  STATUS="$(aws bedrock-agentcore-control get-registry-record \
    --registry-id "${REGISTRY_ID}" \
    --record-id "${RECORD_ID}" \
    --region "${REGION}" \
    --query status \
    --output text \
    --no-cli-pager)"
  log DEBUG "Record status=${STATUS}"
  [[ "${STATUS}" == "DRAFT" ]] && break
  [[ "${STATUS}" == "CREATE_FAILED" ]] && {
    log ERROR "Record creation failed."
    exit 1
  }
  sleep "${DELAY}"
  (( DELAY < 10 )) && DELAY=$((DELAY * 2))
done

[[ "${STATUS}" == "DRAFT" ]] || {
  log ERROR "Record did not reach DRAFT within 120 seconds."
  exit 1
}
log PASS "Record reached DRAFT"

log INFO "Submitting the record for approval"
SUBMIT_JSON="$(aws bedrock-agentcore-control submit-registry-record-for-approval \
  --registry-id "${REGISTRY_ID}" \
  --record-id "${RECORD_ID}" \
  --region "${REGION}" \
  --output json \
  --no-cli-pager)"
SUBMIT_STATUS="$(printf '%s' "${SUBMIT_JSON}" | jq -r '.status')"
[[ "${SUBMIT_STATUS}" == "PENDING_APPROVAL" ]] || {
  log ERROR "Expected PENDING_APPROVAL, received ${SUBMIT_STATUS}."
  exit 1
}
printf '%s\n' "${SUBMIT_JSON}" | jq '{recordId, status, updatedAt}' | sanitize
log PASS "Record reached PENDING_APPROVAL"

log INFO "Approving the record"
APPROVE_JSON="$(aws bedrock-agentcore-control update-registry-record-status \
  --registry-id "${REGISTRY_ID}" \
  --record-id "${RECORD_ID}" \
  --status APPROVED \
  --status-reason "Reviewed for metadata quality and governed discovery" \
  --region "${REGION}" \
  --output json \
  --no-cli-pager)"
APPROVE_STATUS="$(printf '%s' "${APPROVE_JSON}" | jq -r '.status')"
[[ "${APPROVE_STATUS}" == "APPROVED" ]] || {
  log ERROR "Expected APPROVED, received ${APPROVE_STATUS}."
  exit 1
}
printf '%s\n' "${APPROVE_JSON}" | jq '{recordId, status, statusReason, updatedAt}' | sanitize
log PASS "Record reached APPROVED"

log INFO "Searching for the approved record"
FOUND=0
ATTEMPT=1
DELAY=2
DEADLINE=$((SECONDS + SEARCH_TIMEOUT_SECONDS))
while (( SECONDS < DEADLINE )); do
  SEARCH_JSON="$(aws bedrock-agentcore search-registry-records \
    --registry-ids "${REGISTRY_ARN}" \
    --search-query "code review security scanning" \
    --max-results 5 \
    --region "${REGION}" \
    --output json \
    --no-cli-pager)"

  if printf '%s' "${SEARCH_JSON}" | jq -e --arg name "${RECORD_NAME}" \
    '.registryRecords[]? | select(.name == $name)' >/dev/null; then
    printf '%s\n' "${SEARCH_JSON}" \
      | jq '{results: [.registryRecords[] | {name, descriptorType, status, version}]}' \
      | sanitize
    FOUND=1
    break
  fi

  log DEBUG "Search index not ready; attempt=${ATTEMPT}, retry_in_seconds=${DELAY}"
  sleep "${DELAY}"
  (( DELAY < 20 )) && DELAY=$((DELAY * 2))
  (( DELAY > 20 )) && DELAY=20
  ATTEMPT=$((ATTEMPT + 1))
done

[[ "${FOUND}" == "1" ]] || {
  log ERROR "Approved record was not discoverable within ${SEARCH_TIMEOUT_SECONDS} seconds."
  exit 1
}
log PASS "Approved record discovered"

if [[ "${CLEANUP_RESOURCES}" == "1" ]]; then
  log INFO "Deleting the registry record"
  aws bedrock-agentcore-control delete-registry-record \
    --registry-id "${REGISTRY_ID}" \
    --record-id "${RECORD_ID}" \
    --region "${REGION}" \
    --output json \
    --no-cli-pager | sanitize
  log PASS "Record deletion initiated"
else
  log SUMMARY "Resource retained"
  printf '  Record ID: %s\n' "${RECORD_ID}"
  printf '  Cleanup command:\n'
  printf '  aws bedrock-agentcore-control delete-registry-record --registry-id %q --record-id %q --region %q\n' \
    "${REGISTRY_ID}" "${RECORD_ID}" "${REGION}"
fi

log SUMMARY "Workflow complete"
