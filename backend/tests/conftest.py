"""Fixture pengujian. Database terpisah dari database development."""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

TEST_DB = Path(tempfile.gettempdir()) / "nigmasim_test.db"
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-yang-cukup-panjang-untuk-hs256-32"
os.environ["ADMIN_EMAIL"] = "admin@nigmasim.com"
os.environ["ADMIN_INITIAL_PASSWORD"] = "AdminTest#123"
# Test harus selalu menolak host internal, apa pun isi .env lokal.
os.environ["ALLOW_PRIVATE_HOSTS_IN_REGISTRY"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.seed import seed  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _prepare_database() -> Iterator[None]:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)
    yield
    engine.dispose()
    if TEST_DB.exists():
        TEST_DB.unlink()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def admin_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nigmasim.com", "password": "AdminTest#123"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture()
def auth_headers(admin_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}
