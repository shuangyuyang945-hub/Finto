import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr
from http import HTTPStatus
from unittest import mock
from pathlib import Path

import server


class OperationalErrorLoggingTests(unittest.TestCase):
    def test_unexpected_error_has_safe_log_and_matching_request_id(self):
        original_app_data_root = server.APP_DATA_ROOT
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                server.configure_storage(Path(temp_dir))
                handler = server.Handler.__new__(server.Handler)
                error = RuntimeError("api-key-super-secret")

                with mock.patch.object(handler, "json_response") as json_response:
                    stderr = io.StringIO()
                    with redirect_stderr(stderr):
                        handler.respond_unexpected_error("POST", "/api/example", error)

                payload, status = json_response.call_args.args
                log_entry = json.loads(stderr.getvalue())
                persisted_log = server.ERROR_LOG_PATH.read_text(encoding="utf-8")

                self.assertEqual(status, HTTPStatus.INTERNAL_SERVER_ERROR)
                self.assertEqual(payload["error"], "操作失败，请根据错误编号查看服务日志")
                self.assertEqual(payload["request_id"], log_entry["request_id"])
                self.assertEqual(log_entry["event"], "unexpected_request_error")
                self.assertEqual(log_entry["method"], "POST")
                self.assertEqual(log_entry["path"], "/api/example")
                self.assertEqual(log_entry["error_type"], "RuntimeError")
                self.assertIn(log_entry["request_id"], persisted_log)
                self.assertNotIn("api-key-super-secret", stderr.getvalue())
                self.assertNotIn("api-key-super-secret", persisted_log)
        finally:
            server.configure_storage(original_app_data_root)


if __name__ == "__main__":
    unittest.main()
