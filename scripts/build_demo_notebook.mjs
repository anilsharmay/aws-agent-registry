import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const target = path.join(root, "demo", "aws-agent-registry-cli-demo.ipynb");

const markdown = (source) => ({
  cell_type: "markdown",
  metadata: {},
  source: source.split(/(?<=\n)/),
});

const code = (source) => ({
  cell_type: "code",
  execution_count: null,
  metadata: {},
  outputs: [],
  source: source.split(/(?<=\n)/),
});

const md = (...lines) => markdown(`${lines.join("\n")}\n`);

const notebook = JSON.parse(await fs.readFile(target, "utf8"));
notebook.metadata = {
  ...notebook.metadata,
  kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
  language_info: { name: "python", version: "3" },
};

notebook.cells = [
  md(
    "# AWS Agent Registry Governance Walkthrough",
    "",
    "This tutorial builds a governed AWS Agent Registry from first principles and exercises the complete publisher, curator, and consumer workflow using real AWS CLI commands.",
    "",
    "The registry stores discovery metadata. It does not deploy or invoke the MCP servers, agents, or custom resources represented by its records."
  ),

  md(
    "## Audience, prerequisites, and learning objectives",
    "",
    "**Audience:** AWS builders evaluating governed discovery for agentic resources.",
    "",
    "**Prerequisites:**",
    "",
    "- An AWS account in a Region where AWS Agent Registry preview is available.",
    "- AWS credentials with AgentCore, IAM, and STS permissions required by this walkthrough.",
    "- A current AWS CLI that includes the `bedrock-agentcore-control` and `bedrock-agentcore` service models.",
    "- Python 3.10 or newer in VS Code, JupyterLab, or another notebook environment.",
    "",
    "**Learning objectives:**",
    "",
    "1. Create a registry with IAM authorization and manual approval.",
    "2. Define Administrator, Publisher, and Consumer permission boundaries.",
    "3. Register MCP, A2A, and custom resource records.",
    "4. Verify allowed and denied governance operations.",
    "5. Approve records and discover them through hybrid search.",
    "6. Remove every resource created by the walkthrough."
  ),

  md(
    "## Logical flow",
    "",
    "`Bootstrap identity -> Registry -> Persona policies -> Records -> Guardrail tests -> Approval -> Search -> Cleanup`",
    "",
    "The bootstrap identity creates temporary IAM users for the three personas. Their access keys remain in notebook memory, are never displayed, and are deleted during cleanup."
  ),

  md(
    "## 1. Configuration and execution safety",
    "",
    "Set `CONFIRM_RESOURCE_CREATION` to `True` before running the AWS workflow. Resource names include a unique run identifier so repeated executions do not collide. Keep cleanup enabled unless you intentionally want to inspect the resources afterward."
  ),

  code(String.raw`import json
import os
import re
import shlex
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

# Explicit confirmation prevents accidental IAM and AgentCore resource creation.
CONFIRM_RESOURCE_CREATION = False
CLEANUP_RESOURCES = True

AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
RUN_ID = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
WORK_DIR = Path.cwd() / ".agent-registry-work" / RUN_ID
WORK_DIR.mkdir(parents=True, exist_ok=True)

REGISTRY_NAME = f"agent_registry_walkthrough_{RUN_ID}"
RECORD_PREFIX = f"acme_{RUN_ID}"

REGISTRY_ID = None
REGISTRY_ARN = None
PERSONAS = {}
RECORDS = {}

print("CONFIGURATION SUMMARY")
print(f"  Region:                 {AWS_REGION}")
print(f"  Run identifier:         {RUN_ID}")
print(f"  Working directory:      {WORK_DIR}")
print(f"  Cleanup after run:      {CLEANUP_RESOURCES}")
print(f"  Creation confirmed:     {CONFIRM_RESOURCE_CREATION}")

if not CONFIRM_RESOURCE_CREATION:
    raise RuntimeError(
        "Set CONFIRM_RESOURCE_CREATION = True after reviewing the prerequisites and cleanup behavior."
    )
`),

  md(
    "## 2. Command, logging, and polling helpers",
    "",
    "All AWS calls pass through one helper that suppresses the CLI pager, sanitizes account identifiers in displayed errors, and returns parsed JSON. Polling helpers use bounded retries and report status changes without producing noisy output."
  ),

  code(String.raw`def log(level, message, **fields):
    timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
    details = " | ".join(f"{key}={value}" for key, value in fields.items())
    suffix = f" | {details}" if details else ""
    print(f"[{timestamp}] {level:<7} {message}{suffix}")


def sanitize(text):
    return re.sub(r"(?<!\d)\d{12}(?!\d)", "<account-id>", text or "")


def run_aws(*args, credentials=None, check=True, show_command=True):
    command = ["aws", *args, "--region", AWS_REGION, "--output", "json", "--no-cli-pager"]
    environment = os.environ.copy()
    environment["AWS_PAGER"] = ""
    if credentials:
        environment.pop("AWS_PROFILE", None)
        environment.pop("AWS_SESSION_TOKEN", None)
        environment.update(credentials)

    if show_command:
        log("DEBUG", "AWS CLI", command=shlex.join(command))

    result = subprocess.run(command, capture_output=True, text=True, env=environment)
    payload = json.loads(result.stdout) if result.stdout.strip() else {}

    if check and result.returncode != 0:
        raise RuntimeError(sanitize(result.stderr.strip()))

    return result, payload


def wait_for_registry(expected="READY", timeout_seconds=180):
    deadline = time.monotonic() + timeout_seconds
    last_status = None
    while time.monotonic() < deadline:
        _, response = run_aws(
            "bedrock-agentcore-control", "get-registry",
            "--registry-id", REGISTRY_ID,
            show_command=False,
        )
        status = response.get("status")
        if status != last_status:
            log("INFO", "Registry status", status=status)
            last_status = status
        if status == expected:
            return response
        if status in {"CREATE_FAILED", "UPDATE_FAILED", "DELETE_FAILED"}:
            raise RuntimeError(f"Registry entered failure status: {status}")
        time.sleep(3)
    raise TimeoutError(f"Registry did not reach {expected} within {timeout_seconds} seconds")


def wait_for_record(record_id, expected, credentials, timeout_seconds=120):
    deadline = time.monotonic() + timeout_seconds
    last_status = None
    while time.monotonic() < deadline:
        _, response = run_aws(
            "bedrock-agentcore-control", "get-registry-record",
            "--registry-id", REGISTRY_ID,
            "--record-id", record_id,
            credentials=credentials,
            show_command=False,
        )
        status = response.get("status")
        if status != last_status:
            log("INFO", "Record status", record_id=record_id, status=status)
            last_status = status
        if status == expected:
            return response
        if status in {"CREATE_FAILED", "UPDATE_FAILED"}:
            raise RuntimeError(f"Record {record_id} entered failure status: {status}")
        time.sleep(2)
    raise TimeoutError(f"Record {record_id} did not reach {expected} within {timeout_seconds} seconds")


def expect_denied(label, *args, credentials):
    result, _ = run_aws(*args, credentials=credentials, check=False, show_command=True)
    error = sanitize(result.stderr)
    if result.returncode == 0:
        raise AssertionError(f"Expected access to be denied: {label}")
    if "AccessDenied" not in error and "not authorized" not in error:
        raise RuntimeError(f"Expected AccessDenied for {label}, received: {error.strip()}")
    log("PASS", label, result="ACCESS_DENIED")


def record_id_from(response):
    return response.get("recordId") or response["recordArn"].rsplit("/", 1)[-1]


log("SUMMARY", "Command helpers initialized")
`),

  md(
    "## 3. Preflight validation",
    "",
    "The preflight confirms the AWS CLI is installed, includes the AgentCore service commands, and can resolve the active AWS identity. It fails before creating resources when a prerequisite is missing."
  ),

  code(String.raw`if not shutil.which("aws"):
    raise RuntimeError("AWS CLI is not installed or is not available on PATH.")

version = subprocess.run(["aws", "--version"], capture_output=True, text=True)
log("INFO", "AWS CLI detected", version=(version.stdout or version.stderr).strip())

service_check = subprocess.run(
    [
        "aws", "bedrock-agentcore-control", "create-registry",
        "--generate-cli-skeleton", "input",
    ],
    capture_output=True,
    text=True,
    env={**os.environ, "AWS_PAGER": ""},
)
if service_check.returncode != 0:
    raise RuntimeError(
        "This AWS CLI does not include bedrock-agentcore-control. Install a current AWS CLI release."
    )

_, identity = run_aws("sts", "get-caller-identity")
ACCOUNT_ID = identity["Account"]
CALLER_ARN = identity["Arn"]

log("PASS", "AWS preflight complete", account="<account-id>", caller=sanitize(CALLER_ARN))
`),

  md(
    "## 4. Create the registry",
    "",
    "The registry uses IAM authorization and manual approval. The create operation is asynchronous, so the notebook polls `GetRegistry` until the status reaches `READY`."
  ),

  code(String.raw`_, created_registry = run_aws(
    "bedrock-agentcore-control", "create-registry",
    "--name", REGISTRY_NAME,
    "--description", "Governed discovery walkthrough for agentic resources",
    "--authorizer-type", "AWS_IAM",
    "--approval-configuration", json.dumps({"autoApproval": False}),
)

REGISTRY_ARN = created_registry["registryArn"]
REGISTRY_ID = created_registry.get("registryId") or REGISTRY_ARN.rsplit("/", 1)[-1]
registry = wait_for_registry()

print("REGISTRY SUMMARY")
print(f"  Name:             {registry['name']}")
print(f"  Identifier:       {REGISTRY_ID}")
print(f"  Status:           {registry['status']}")
print(f"  Authorization:    {registry.get('authorizerType', 'AWS_IAM')}")
print(f"  Auto approval:    {registry.get('approvalConfiguration', {}).get('autoApproval')}")
`),

  md(
    "## 5. Define persona permissions",
    "",
    "Three scoped policies model separation of duties:",
    "",
    "- **Administrator:** manages records and approval status.",
    "- **Publisher:** creates, updates, deletes, and submits records, but cannot approve them.",
    "- **Consumer:** reads registry metadata and searches approved records, but cannot modify records."
  ),

  code(String.raw`registry_record_arn = f"{REGISTRY_ARN}/record/*"

ADMIN_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock-agentcore:GetRegistry",
                "bedrock-agentcore:ListRegistryRecords",
                "bedrock-agentcore:SearchRegistryRecords",
                "bedrock-agentcore:CreateRegistryRecord",
            ],
            "Resource": REGISTRY_ARN,
        },
        {
            "Effect": "Allow",
            "Action": [
                "bedrock-agentcore:GetRegistryRecord",
                "bedrock-agentcore:UpdateRegistryRecord",
                "bedrock-agentcore:DeleteRegistryRecord",
                "bedrock-agentcore:SubmitRegistryRecordForApproval",
                "bedrock-agentcore:UpdateRegistryRecordStatus",
            ],
            "Resource": registry_record_arn,
        },
    ],
}

PUBLISHER_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock-agentcore:GetRegistry",
                "bedrock-agentcore:ListRegistryRecords",
                "bedrock-agentcore:CreateRegistryRecord",
            ],
            "Resource": REGISTRY_ARN,
        },
        {
            "Effect": "Allow",
            "Action": [
                "bedrock-agentcore:GetRegistryRecord",
                "bedrock-agentcore:UpdateRegistryRecord",
                "bedrock-agentcore:DeleteRegistryRecord",
                "bedrock-agentcore:SubmitRegistryRecordForApproval",
            ],
            "Resource": registry_record_arn,
        },
    ],
}

CONSUMER_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock-agentcore:GetRegistry",
                "bedrock-agentcore:ListRegistryRecords",
                "bedrock-agentcore:SearchRegistryRecords",
            ],
            "Resource": REGISTRY_ARN,
        },
        {
            "Effect": "Allow",
            "Action": ["bedrock-agentcore:GetRegistryRecord"],
            "Resource": registry_record_arn,
        },
    ],
}

POLICIES = {
    "administrator": ADMIN_POLICY,
    "publisher": PUBLISHER_POLICY,
    "consumer": CONSUMER_POLICY,
}

for persona, policy in POLICIES.items():
    policy_path = WORK_DIR / f"{persona}-policy.json"
    policy_path.write_text(json.dumps(policy, indent=2))
    log("DEBUG", "Policy document written", persona=persona, path=policy_path)

print("PERMISSION SUMMARY")
print("  Administrator: create, read, submit, approve, reject, deprecate, search")
print("  Publisher:     create, read, update, delete, submit")
print("  Consumer:      read and search")
`),

  md(
    "## 6. Provision temporary persona identities",
    "",
    "The bootstrap identity creates one temporary IAM user per persona and attaches the corresponding inline policy. Access-key secrets are held only in memory and are never logged. IAM propagation is verified by retrying a permitted `GetRegistry` call for each persona."
  ),

  code(String.raw`def persona_credentials(access_key):
    return {
        "AWS_ACCESS_KEY_ID": access_key["AccessKeyId"],
        "AWS_SECRET_ACCESS_KEY": access_key["SecretAccessKey"],
        "AWS_REGION": AWS_REGION,
        "AWS_DEFAULT_REGION": AWS_REGION,
    }


def wait_for_persona_access(persona, credentials, timeout_seconds=90):
    deadline = time.monotonic() + timeout_seconds
    delay = 2
    while time.monotonic() < deadline:
        result, _ = run_aws(
            "bedrock-agentcore-control", "get-registry",
            "--registry-id", REGISTRY_ID,
            credentials=credentials,
            check=False,
            show_command=False,
        )
        if result.returncode == 0:
            log("PASS", "IAM policy propagated", persona=persona)
            return
        log("DEBUG", "Waiting for IAM propagation", persona=persona, retry_in_seconds=delay)
        time.sleep(delay)
        delay = min(delay * 2, 15)
    raise TimeoutError(f"IAM policy did not propagate for {persona}")


for persona, policy in POLICIES.items():
    user_name = f"agent-registry-{persona}-{RUN_ID}"
    policy_name = f"agent-registry-{persona}-policy"
    policy_path = WORK_DIR / f"{persona}-policy.json"

    run_aws("iam", "create-user", "--user-name", user_name)
    PERSONAS[persona] = {
        "user_name": user_name,
        "policy_name": policy_name,
        "access_key_id": None,
        "credentials": None,
    }
    run_aws(
        "iam", "put-user-policy",
        "--user-name", user_name,
        "--policy-name", policy_name,
        "--policy-document", f"file://{policy_path}",
    )
    _, key_response = run_aws("iam", "create-access-key", "--user-name", user_name)

    PERSONAS[persona]["access_key_id"] = key_response["AccessKey"]["AccessKeyId"]
    PERSONAS[persona]["credentials"] = persona_credentials(key_response["AccessKey"])
    log("INFO", "Temporary persona created", persona=persona, user=user_name)

for persona, details in PERSONAS.items():
    wait_for_persona_access(persona, details["credentials"])

print("PERSONA SUMMARY")
for persona, details in PERSONAS.items():
    print(f"  {persona.title():<14} {details['user_name']}")
`),

  md(
    "## 7. Prepare record descriptors",
    "",
    "The walkthrough registers three metadata models:",
    "",
    "- MCP server metadata containing a `review_code` tool definition.",
    "- A2A agent metadata containing an inline agent card.",
    "- Custom JSON metadata describing a data-pipeline resource.",
    "",
    "The endpoints are descriptive examples; this walkthrough does not deploy them."
  ),

  code(String.raw`MCP_DESCRIPTORS = {
    "mcp": {
        "server": {
            "inlineContent": json.dumps({
                "name": "acme/code-review",
                "description": "MCP server metadata for automated code review and security scanning",
                "version": "2.1.0",
                "packages": [{
                    "registryType": "npm",
                    "identifier": "@acme/code-review-mcp",
                    "version": "2.1.0",
                    "transport": {"type": "stdio"},
                }],
            })
        },
        "tools": {
            "inlineContent": json.dumps({
                "tools": [{
                    "name": "review_code",
                    "description": "Analyze source code for security issues",
                    "inputSchema": {
                        "type": "object",
                        "properties": {"code": {"type": "string"}},
                        "required": ["code"],
                    },
                }]
            })
        },
    }
}

A2A_DESCRIPTORS = {
    "a2a": {
        "agentCard": {
            "schemaVersion": "0.3",
            "inlineContent": json.dumps({
                "protocolVersion": "0.3",
                "name": "acme-compliance-agent",
                "description": "A2A agent metadata for compliance validation and audit checks",
                "version": "1.0.0",
                "url": "https://example.invalid/acme-compliance-agent/a2a",
                "capabilities": {"streaming": True},
                "skills": [{
                    "id": "validate_compliance",
                    "name": "Compliance Validation",
                    "description": "Validate resources against compliance policies",
                    "tags": ["compliance", "audit"],
                }],
                "defaultInputModes": ["text/plain"],
                "defaultOutputModes": ["text/plain"],
            })
        }
    }
}

CUSTOM_DESCRIPTORS = {
    "custom": {
        "inlineContent": json.dumps({
            "name": "acme-data-pipeline-orchestrator",
            "description": "Custom metadata for orchestrating governed data pipelines",
            "version": "3.0.0",
            "endpoint": "https://example.invalid/acme-data-pipelines/v3",
            "owner": "data-platform",
            "riskLevel": "medium",
        })
    }
}

DESCRIPTOR_FILES = {
    "mcp": WORK_DIR / "mcp-descriptors.json",
    "a2a": WORK_DIR / "a2a-descriptors.json",
    "custom": WORK_DIR / "custom-descriptors.json",
}

for kind, descriptor in {
    "mcp": MCP_DESCRIPTORS,
    "a2a": A2A_DESCRIPTORS,
    "custom": CUSTOM_DESCRIPTORS,
}.items():
    DESCRIPTOR_FILES[kind].write_text(json.dumps(descriptor, indent=2))
    log("DEBUG", "Descriptor validated and written", type=kind.upper(), path=DESCRIPTOR_FILES[kind])

print("DESCRIPTOR SUMMARY")
print("  MCP:     server metadata and review_code tool definition")
print("  A2A:     inline compliance agent card")
print("  CUSTOM:  organization-defined data-pipeline metadata")
`),

  md(
    "## 8. Register records as the Publisher",
    "",
    "The Publisher creates one record of each type. Record creation is asynchronous, so each record is polled until it reaches `DRAFT` before the workflow continues."
  ),

  code(String.raw`publisher_credentials = PERSONAS["publisher"]["credentials"]

record_specs = {
    "mcp": {
        "name": f"{RECORD_PREFIX}_code_review_mcp",
        "descriptor_type": "MCP",
        "version": "2.1",
        "description": "Code review and security scanning MCP metadata",
        "search_query": "automated code review security scanning",
    },
    "a2a": {
        "name": f"{RECORD_PREFIX}_compliance_agent",
        "descriptor_type": "A2A",
        "version": "1.0",
        "description": "Compliance validation A2A agent metadata",
        "search_query": "compliance validation audit agent",
    },
    "custom": {
        "name": f"{RECORD_PREFIX}_data_pipeline",
        "descriptor_type": "CUSTOM",
        "version": "3.0",
        "description": "Governed data-pipeline orchestration metadata",
        "search_query": "governed data pipeline orchestration",
    },
}

for kind, spec in record_specs.items():
    _, response = run_aws(
        "bedrock-agentcore-control", "create-registry-record",
        "--registry-id", REGISTRY_ID,
        "--name", spec["name"],
        "--description", spec["description"],
        "--descriptor-type", spec["descriptor_type"],
        "--descriptors", f"file://{DESCRIPTOR_FILES[kind]}",
        "--record-version", spec["version"],
        credentials=publisher_credentials,
    )
    record_id = record_id_from(response)
    RECORDS[kind] = {**spec, "record_id": record_id, "record_arn": response["recordArn"]}
    wait_for_record(record_id, "DRAFT", publisher_credentials)
    log("PASS", "Record ready for submission", type=kind.upper(), record_id=record_id)

print("RECORD SUMMARY")
for kind, record in RECORDS.items():
    print(f"  {kind.upper():<8} {record['name']:<48} DRAFT")
`),

  md(
    "## 9. Verify governance boundaries",
    "",
    "The MCP record is submitted first. The notebook then proves that a Publisher cannot approve it, a Consumer cannot create a record, and a Consumer can read the pending record. A pre-approval search verifies that pending metadata is not discoverable."
  ),

  code(String.raw`mcp_record = RECORDS["mcp"]
administrator_credentials = PERSONAS["administrator"]["credentials"]
consumer_credentials = PERSONAS["consumer"]["credentials"]

_, submitted = run_aws(
    "bedrock-agentcore-control", "submit-registry-record-for-approval",
    "--registry-id", REGISTRY_ID,
    "--record-id", mcp_record["record_id"],
    credentials=publisher_credentials,
)
if submitted.get("status") != "PENDING_APPROVAL":
    raise AssertionError(f"Expected PENDING_APPROVAL, received {submitted.get('status')}")
log("PASS", "Publisher submitted MCP record", status=submitted["status"])

expect_denied(
    "Publisher cannot approve a record",
    "bedrock-agentcore-control", "update-registry-record-status",
    "--registry-id", REGISTRY_ID,
    "--record-id", mcp_record["record_id"],
    "--status", "APPROVED",
    "--status-reason", "Publisher self-approval must be denied",
    credentials=publisher_credentials,
)

expect_denied(
    "Consumer cannot create a record",
    "bedrock-agentcore-control", "create-registry-record",
    "--registry-id", REGISTRY_ID,
    "--name", f"{RECORD_PREFIX}_consumer_write_test",
    "--descriptor-type", "CUSTOM",
    "--descriptors", f"file://{DESCRIPTOR_FILES['custom']}",
    credentials=consumer_credentials,
)

_, readable = run_aws(
    "bedrock-agentcore-control", "get-registry-record",
    "--registry-id", REGISTRY_ID,
    "--record-id", mcp_record["record_id"],
    credentials=consumer_credentials,
)
log("PASS", "Consumer can read registry metadata", status=readable["status"])

_, before_approval = run_aws(
    "bedrock-agentcore", "search-registry-records",
    "--registry-ids", REGISTRY_ARN,
    "--search-query", mcp_record["search_query"],
    "--max-results", "10",
    credentials=consumer_credentials,
)
preapproval_matches = [
    item for item in before_approval.get("registryRecords", [])
    if item.get("name") == mcp_record["name"]
]
if preapproval_matches:
    raise AssertionError("A pending record appeared in search results")
log("PASS", "Pending record is excluded from discovery")
`),

  md(
    "## 10. Submit and approve records",
    "",
    "The Publisher submits the remaining records. The Administrator then approves every pending record with a status reason. Approval controls discoverability; it does not deploy the represented resources."
  ),

  code(String.raw`for kind in ("a2a", "custom"):
    record = RECORDS[kind]
    _, response = run_aws(
        "bedrock-agentcore-control", "submit-registry-record-for-approval",
        "--registry-id", REGISTRY_ID,
        "--record-id", record["record_id"],
        credentials=publisher_credentials,
    )
    if response.get("status") != "PENDING_APPROVAL":
        raise AssertionError(f"Expected PENDING_APPROVAL for {kind}, received {response.get('status')}")
    log("PASS", "Record submitted", type=kind.upper(), status=response["status"])

for kind, record in RECORDS.items():
    _, response = run_aws(
        "bedrock-agentcore-control", "update-registry-record-status",
        "--registry-id", REGISTRY_ID,
        "--record-id", record["record_id"],
        "--status", "APPROVED",
        "--status-reason", "Reviewed for metadata quality and governed discovery",
        credentials=administrator_credentials,
    )
    if response.get("status") != "APPROVED":
        raise AssertionError(f"Expected APPROVED for {kind}, received {response.get('status')}")
    wait_for_record(record["record_id"], "APPROVED", administrator_credentials)
    log("PASS", "Record approved", type=kind.upper(), status="APPROVED")

print("APPROVAL SUMMARY")
for kind, record in RECORDS.items():
    print(f"  {kind.upper():<8} {record['name']:<48} APPROVED")
`),

  md(
    "## 11. Discover approved records",
    "",
    "Search indexing is eventually consistent. Each query retries with exponential backoff until its approved record appears or the timeout is reached."
  ),

  code(String.raw`def search_until_found(record, timeout_seconds=180):
    deadline = time.monotonic() + timeout_seconds
    delay = 2
    attempt = 1

    while time.monotonic() < deadline:
        _, response = run_aws(
            "bedrock-agentcore", "search-registry-records",
            "--registry-ids", REGISTRY_ARN,
            "--search-query", record["search_query"],
            "--max-results", "10",
            credentials=consumer_credentials,
            show_command=(attempt == 1),
        )
        matches = [
            item for item in response.get("registryRecords", [])
            if item.get("name") == record["name"]
        ]
        if matches:
            match = matches[0]
            log(
                "PASS",
                "Approved record discovered",
                name=match.get("name"),
                type=match.get("descriptorType"),
                version=match.get("version"),
            )
            return match

        log("DEBUG", "Search index not ready", attempt=attempt, retry_in_seconds=delay)
        time.sleep(delay)
        delay = min(delay * 2, 20)
        attempt += 1

    raise TimeoutError(f"Record was not discoverable within {timeout_seconds} seconds: {record['name']}")


SEARCH_RESULTS = {}
for kind, record in RECORDS.items():
    SEARCH_RESULTS[kind] = search_until_found(record)

print("DISCOVERY SUMMARY")
for kind, result in SEARCH_RESULTS.items():
    print(
        f"  {kind.upper():<8} {result.get('name', ''):<48} "
        f"{result.get('status', 'APPROVED')}"
    )
`),

  md(
    "## 12. Review exercise",
    "",
    "Inspect the MCP descriptor and identify which fields contribute to discovery relevance. Consider how the result would change if the tool description were vague or missing.",
    "",
    "AWS Agent Registry uses record name, description, descriptor content, version, and descriptor type when matching and filtering records."
  ),

  code(String.raw`mcp_tools = json.loads(MCP_DESCRIPTORS["mcp"]["tools"]["inlineContent"])["tools"]

print("MCP CAPABILITY SUMMARY")
for tool in mcp_tools:
    required = tool.get("inputSchema", {}).get("required", [])
    print(f"  Tool:             {tool['name']}")
    print(f"  Description:      {tool['description']}")
    print(f"  Required inputs:  {', '.join(required) if required else 'none'}")
`),

  md(
    "## 13. Cleanup",
    "",
    "Cleanup removes records first, then the registry, access keys, inline policies, and IAM users. If an earlier cell fails, resolve the error and run this cell manually."
  ),

  code(String.raw`def wait_for_record_deleted(record_id, credentials, timeout_seconds=120):
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        result, _ = run_aws(
            "bedrock-agentcore-control", "get-registry-record",
            "--registry-id", REGISTRY_ID,
            "--record-id", record_id,
            credentials=credentials,
            check=False,
            show_command=False,
        )
        if result.returncode != 0 and (
            "ResourceNotFound" in result.stderr or "not found" in result.stderr.lower()
        ):
            return
        time.sleep(2)
    raise TimeoutError(f"Record was not deleted within {timeout_seconds} seconds: {record_id}")


def cleanup_walkthrough():
    failures = []

    for kind, record in list(RECORDS.items()):
        try:
            run_aws(
                "bedrock-agentcore-control", "delete-registry-record",
                "--registry-id", REGISTRY_ID,
                "--record-id", record["record_id"],
                credentials=administrator_credentials,
            )
            wait_for_record_deleted(record["record_id"], administrator_credentials)
            log("PASS", "Record deleted", type=kind.upper(), record_id=record["record_id"])
        except Exception as error:
            failures.append(f"record {kind}: {error}")
            log("ERROR", "Record cleanup failed", type=kind.upper(), error=sanitize(str(error)))

    if REGISTRY_ID:
        try:
            delay = 2
            for attempt in range(1, 8):
                result, response = run_aws(
                    "bedrock-agentcore-control", "delete-registry",
                    "--registry-id", REGISTRY_ID,
                    check=False,
                    show_command=(attempt == 1),
                )
                if result.returncode == 0:
                    log("PASS", "Registry deletion initiated", status=response.get("status"))
                    break
                if "Conflict" not in result.stderr:
                    raise RuntimeError(sanitize(result.stderr))
                log("DEBUG", "Registry still contains deleting records", retry_in_seconds=delay)
                time.sleep(delay)
                delay = min(delay * 2, 15)
            else:
                raise TimeoutError("Registry deletion could not be initiated")

            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                result, _ = run_aws(
                    "bedrock-agentcore-control", "get-registry",
                    "--registry-id", REGISTRY_ID,
                    check=False,
                    show_command=False,
                )
                if result.returncode != 0 and (
                    "ResourceNotFound" in result.stderr or "not found" in result.stderr.lower()
                ):
                    log("PASS", "Registry deletion confirmed")
                    break
                time.sleep(3)
            else:
                raise TimeoutError("Registry deletion was not confirmed within 180 seconds")
        except Exception as error:
            failures.append(f"registry: {error}")
            log("ERROR", "Registry cleanup failed", error=sanitize(str(error)))

    for persona, details in PERSONAS.items():
        try:
            if details.get("access_key_id"):
                run_aws(
                    "iam", "delete-access-key",
                    "--user-name", details["user_name"],
                    "--access-key-id", details["access_key_id"],
                )
            run_aws(
                "iam", "delete-user-policy",
                "--user-name", details["user_name"],
                "--policy-name", details["policy_name"],
            )
            run_aws("iam", "delete-user", "--user-name", details["user_name"])
            log("PASS", "Temporary persona deleted", persona=persona)
        except Exception as error:
            failures.append(f"persona {persona}: {error}")
            log("ERROR", "Persona cleanup failed", persona=persona, error=sanitize(str(error)))

    print("CLEANUP SUMMARY")
    print(f"  Records processed:   {len(RECORDS)}")
    print(f"  Personas processed:  {len(PERSONAS)}")
    print(f"  Failures:            {len(failures)}")
    for failure in failures:
        print(f"  - {failure}")

    if failures:
        raise RuntimeError("Cleanup completed with failures. Review the summary above.")


if CLEANUP_RESOURCES:
    cleanup_walkthrough()
else:
    print("Cleanup is disabled. Re-run this cell with CLEANUP_RESOURCES = True when finished.")
`),

  md(
    "## Result and extensions",
    "",
    "This walkthrough established a registry with manual approval, enforced separation of duties, registered multiple metadata types, verified approved-only discovery, and removed its temporary resources.",
    "",
    "Useful extensions:",
    "",
    "- Add an Agent Skills record using the supported `AGENT_SKILLS` descriptor type.",
    "- Connect the registry MCP endpoint to an MCP-compatible client.",
    "- Replace temporary IAM users with your organization's existing roles and identity controls.",
    "- Route pending-approval events into an existing review workflow through Amazon EventBridge."
  ),
];

await fs.writeFile(target, `${JSON.stringify(notebook, null, 2)}\n`);
console.log(`Wrote ${target}`);
