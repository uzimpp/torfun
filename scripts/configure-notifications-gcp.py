#!/usr/bin/env python3
"""Plan notification configuration; --apply updates an existing Cloud Run service.

Uses gcloud's current identity. Never enables APIs, grants IAM, builds/deploys
application code, resumes the scheduler, or prints credentials.
"""

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SECRETS = (
    "SMTP_USER", "SMTP_PASSWORD", "LINE_CHANNEL_ACCESS_TOKEN",
    "LINE_CHANNEL_SECRET", "NOTIFICATION_WORKER_TOKEN",
)
PROVIDER_KEYS = ("SMTP_HOST", "SMTP_FROM", *SECRETS[:-1], "LINE_OA_ID")


def settings(path):
    """Read only notification keys; do not execute or expand .env contents."""
    keys = {*SECRETS, *PROVIDER_KEYS, "SMTP_PORT", "WEB_APP_URL"}
    result = {}
    if path.exists():
        for line in path.read_text().splitlines():
            key, sep, value = line.removeprefix("export ").partition("=")
            if sep and key.strip() in keys:
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                result[key.strip()] = value
    # Explicit shell overrides win, like the application environment.
    return {**result, **{key: os.environ[key] for key in keys if key in os.environ}}


def command(args, *, optional=False):
    result = subprocess.run(["gcloud", *args, "--quiet", "--format=json"],
                            capture_output=True, text=True, timeout=600)
    if result.returncode:
        if optional and ("NOT_FOUND" in result.stderr or "does not exist" in result.stderr):
            return None
        # Do not include subprocess arguments, config, provider bodies or tokens.
        reason = "permission denied" if "PERMISSION_DENIED" in result.stderr else "request failed"
        raise RuntimeError(f"gcloud {' '.join(args[:3])}: {reason}. Check account, project, enabled APIs and IAM.")
    return json.loads(result.stdout) if result.stdout.strip() else {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--region", default="asia-southeast1")
    parser.add_argument("--api-service", default="torfun-api")
    parser.add_argument("--web-service", default="torfun-web")
    parser.add_argument("--web-url", help="Public HTTPS web origin, if using a custom domain")
    parser.add_argument("--env-file", type=Path, default=ROOT / "apps/api/.env")
    parser.add_argument("--job", default="torfun-notifications")
    parser.add_argument("--apply", action="store_true", help="Write configuration; leave worker schedule paused")
    args = parser.parse_args()
    config = settings(args.env_file)
    missing = [key for key in (*PROVIDER_KEYS, "NOTIFICATION_WORKER_TOKEN") if not config.get(key)]
    print("Mode:", "apply" if args.apply else "read-only plan")
    print("Missing settings:", ", ".join(missing) or "none (values hidden)")
    if not shutil.which("gcloud"):
        raise RuntimeError("Install the official Google Cloud CLI and sign in first.")
    project = ["--project", args.project]
    region = [*project, "--region", args.region]
    api = command(["run", "services", "describe", args.api_service, *region])
    web_url = args.web_url
    if not web_url:
        web = command(["run", "services", "describe", args.web_service, *region])
        web_url = web["status"]["url"]
    from urllib.parse import urlparse
    parsed = urlparse(web_url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise RuntimeError("--web-url must be a public HTTPS origin without credentials, a path, query or fragment.")
    web_url = web_url.rstrip("/")
    worker_url = api["status"]["url"].rstrip("/") + "/api/internal/notifications/run"
    template = api["spec"]["template"]["spec"]
    job_args = [*project, "--location", args.region]
    job = command(["scheduler", "jobs", "describe", args.job, *job_args], optional=True)
    if job and job.get("httpTarget", {}).get("uri") != worker_url:
        raise RuntimeError("The existing scheduler job targets a different URL; choose a different --job name.")
    print("API:", api["status"]["url"])
    print("Web:", web_url)
    print("Runtime identity:", template.get("serviceAccountName", "project default"))
    print("Scheduler:", job.get("state", "UNKNOWN") if job else "not created")
    print("Plan: store provider credentials in Secret Manager, bind them to the API, and configure a paused one-minute scheduler.")
    if not args.apply:
        return
    if missing:
        raise RuntimeError("Fill the missing settings in the ignored env file before --apply.")
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,}", config["NOTIFICATION_WORKER_TOKEN"]):
        raise RuntimeError("The worker token must contain at least 32 URL-safe random characters.")
    # A 401 confirms the deployed route exists, without processing or sending anything.
    try:
        urllib.request.urlopen(urllib.request.Request(worker_url, method="POST"), timeout=20)
        raise RuntimeError("Worker unexpectedly accepted an unauthenticated request; inspect deployment authentication.")
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise RuntimeError(f"Worker preflight returned HTTP {error.code}; deploy this notification implementation first.") from None
    if job and job.get("state") != "PAUSED":
        command(["scheduler", "jobs", "pause", args.job, *job_args])
    with tempfile.TemporaryDirectory(prefix="torfun-notifications-") as folder:
        directory = Path(folder)
        bindings = {}
        for key in SECRETS:
            if command(["secrets", "describe", key, *project], optional=True) is None:
                command(["secrets", "create", key, *project, "--replication-policy=automatic"])
            secret_file = directory / key
            secret_file.write_text(config[key])
            secret_file.chmod(0o600)
            version = command(["secrets", "versions", "add", key, *project, "--data-file", str(secret_file)])
            # Pin this revision to the uploaded version, rather than a mutable latest alias.
            bindings[key] = key + ":" + version["name"].rsplit("/", 1)[1]
        flags = directory / "service-flags.json"
        flags.write_text(json.dumps({
            "--update-env-vars": {key: config[key] for key in ("SMTP_HOST", "SMTP_FROM", "LINE_OA_ID")} | {
                "SMTP_PORT": config.get("SMTP_PORT", "587"), "WEB_APP_URL": web_url,
            },
            "--update-secrets": bindings,
            "--timeout": str(max(300, int(template.get("timeoutSeconds", 300)))),
        }))
        flags.chmod(0o600)
        command(["run", "services", "update", args.api_service, *region, "--flags-file", str(flags)])
        scheduler_flags = directory / "scheduler-flags.json"
        scheduler_flags.write_text(json.dumps({
            "--schedule": "* * * * *", "--time-zone": "Asia/Bangkok",
            "--uri": worker_url, "--http-method": "POST", "--attempt-deadline": "300s",
            "--update-headers" if job else "--headers": {
                "X-Notification-Worker-Token": config["NOTIFICATION_WORKER_TOKEN"],
            },
        }))
        scheduler_flags.chmod(0o600)
        command(["scheduler", "jobs", "update" if job else "create", "http", args.job,
                 *job_args, "--flags-file", str(scheduler_flags)])
        command(["scheduler", "jobs", "pause", args.job, *job_args])
    print("Configuration applied. Scheduler is paused; no application code was deployed.")
    print("Set LINE's webhook URL to:", api["status"]["url"].rstrip("/") + "/api/notifications/line/webhook")
    print("Verify both destinations in Torfun, then resume the scheduler when ready.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, KeyError, ValueError, subprocess.TimeoutExpired, urllib.error.URLError) as error:
        print(f"Setup stopped: {error}", file=sys.stderr)
        sys.exit(1)
