"""Run with: python3 -m unittest discover -s scripts -p 'test_*.py'."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location(
    "setup", Path(__file__).with_name("configure-notifications-gcp.py")
)
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class ConfigurationTest(unittest.TestCase):
    def invoke(self, config, command, apply=True):
        output = io.StringIO()
        with patch.object(setup.sys, "argv", ["setup", "--project", "project-test", *(["--apply"] if apply else [])]), \
             patch.object(setup, "settings", return_value=config), \
             patch.object(setup.shutil, "which", return_value="gcloud"), \
             patch.object(setup, "command", side_effect=command), \
             patch.object(setup.urllib.request, "urlopen", side_effect=urllib.error.HTTPError("https://api.test", 401, "Unauthorized", {}, None)), \
             contextlib.redirect_stdout(output):
            setup.main()
        return output.getvalue()

    @staticmethod
    def describe(args, **kwargs):
        if args[:3] == ["run", "services", "describe"]:
            return {"status": {"url": "https://api.test" if args[3] == "torfun-api" else "https://web.test"},
                    "spec": {"template": {"spec": {"serviceAccountName": "runtime@test", "timeoutSeconds": 600}}}}
        if args[:3] == ["scheduler", "jobs", "describe"]:
            return {"state": "ENABLED", "httpTarget": {"uri": "https://api.test/api/internal/notifications/run"}}
        raise AssertionError("Unexpected operation")

    def test_plan_never_mutates_cloud_resources(self):
        calls = []
        def command(args, **kwargs):
            calls.append(args)
            return self.describe(args)
        output = self.invoke({}, command, apply=False)
        self.assertEqual(len(calls), 3)
        self.assertIn("read-only plan", output)
        self.assertIn("SMTP_PASSWORD", output)

    def test_missing_credentials_stop_apply_before_writes(self):
        with self.assertRaisesRegex(RuntimeError, "Fill the missing settings"):
            self.invoke({}, self.describe)

    def test_apply_pins_secrets_keeps_longer_timeout_and_leaves_job_paused(self):
        calls, service_flags, scheduler_flags = [], [], []
        config = {key: "test-secret-" + key for key in setup.PROVIDER_KEYS}
        config["NOTIFICATION_WORKER_TOKEN"] = "x" * 64
        def command(args, **kwargs):
            calls.append(args)
            if args[:3] in (["run", "services", "describe"], ["scheduler", "jobs", "describe"]):
                return self.describe(args)
            if args[:2] == ["secrets", "describe"]:
                return {"name": "existing"}
            if args[:3] == ["secrets", "versions", "add"]:
                return {"name": "projects/test/secrets/" + args[3] + "/versions/7"}
            if "--flags-file" in args:
                flags = json.loads(Path(args[args.index("--flags-file") + 1]).read_text())
                (service_flags if args[0] == "run" else scheduler_flags).append(flags)
            return {}
        output = self.invoke(config, command)
        self.assertEqual(calls[3][:3], ["scheduler", "jobs", "pause"])
        self.assertEqual(calls[-1][:3], ["scheduler", "jobs", "pause"])
        self.assertEqual(service_flags[0]["--timeout"], "600")
        self.assertEqual(service_flags[0]["--update-env-vars"]["WEB_APP_URL"], "https://web.test")
        self.assertEqual(service_flags[0]["--update-secrets"]["SMTP_PASSWORD"], "SMTP_PASSWORD:7")
        self.assertEqual(scheduler_flags[0]["--update-headers"]["X-Notification-Worker-Token"], "x" * 64)
        for key in setup.SECRETS:
            self.assertNotIn(config[key], output)
            self.assertFalse(any(config[key] in str(args) for args in calls))
        for args in calls:
            if "--data-file" in args:
                self.assertFalse(Path(args[args.index("--data-file") + 1]).exists())


if __name__ == "__main__":
    unittest.main()
