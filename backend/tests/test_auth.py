"""Tes autentikasi, RBAC, dan manajemen user."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models.capture import AuditLog
from sqlalchemy import select


def test_health(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_login_success(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nigmasim.com", "password": "AdminTest#123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "admin@nigmasim.com"
    assert body["user"]["role"]["name"] == "super_admin"


def test_login_wrong_password(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nigmasim.com", "password": "salah-total"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_login_unknown_email_same_message(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "tidak-ada@nigmasim.com", "password": "apapun"},
    )
    assert response.status_code == 401
    # Pesan tidak boleh membocorkan apakah email terdaftar
    assert "terdaftar" not in response.json()["error"]["message"].lower()


def test_me_requires_token(client: TestClient) -> None:
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_with_token(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/v1/auth/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "admin@nigmasim.com"
    assert "*" in response.json()["permissions"]


def test_refresh_and_logout(client: TestClient) -> None:
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nigmasim.com", "password": "AdminTest#123"},
    ).json()
    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": login["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"] != login["access_token"]

    # Token lama sudah dirotasi -> tidak boleh dipakai lagi
    reused = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": login["refresh_token"]}
    )
    assert reused.status_code == 401


def test_create_user_and_rbac_denied(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    roles = client.get("/api/v1/roles", headers=auth_headers).json()
    operator_role = next(r for r in roles if r["name"] == "capture_operator")

    created = client.post(
        "/api/v1/users",
        headers=auth_headers,
        json={
            "name": "Operator Satu",
            "email": "operator@nigmasim.com",
            "password": "Operator#12345",
            "role_id": operator_role["id"],
        },
    )
    assert created.status_code == 201, created.text

    operator_login = client.post(
        "/api/v1/auth/login",
        json={"email": "operator@nigmasim.com", "password": "Operator#12345"},
    )
    operator_headers = {"Authorization": f"Bearer {operator_login.json()['access_token']}"}

    # Operator tidak punya users:read
    assert client.get("/api/v1/users", headers=operator_headers).status_code == 403
    # Operator tidak punya applications:write
    forbidden = client.post(
        "/api/v1/applications",
        headers=operator_headers,
        json={"name": "App Terlarang", "source_url": "https://example.com"},
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "FORBIDDEN"


def test_duplicate_email_conflict(client: TestClient, auth_headers: dict[str, str]) -> None:
    roles = client.get("/api/v1/roles", headers=auth_headers).json()
    admin_role = next(r for r in roles if r["name"] == "super_admin")
    response = client.post(
        "/api/v1/users",
        headers=auth_headers,
        json={
            "name": "Duplikat",
            "email": "admin@nigmasim.com",
            "password": "Rahasia#12345",
            "role_id": admin_role["id"],
        },
    )
    assert response.status_code == 409


def test_cannot_disable_self(client: TestClient, auth_headers: dict[str, str]) -> None:
    me = client.get("/api/v1/auth/me", headers=auth_headers).json()["user"]
    response = client.patch(
        f"/api/v1/users/{me['id']}/status",
        headers=auth_headers,
        json={"status": "disabled"},
    )
    assert response.status_code == 409


def test_login_is_audited(client: TestClient) -> None:
    client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nigmasim.com", "password": "AdminTest#123"},
    )
    with SessionLocal() as db:
        actions = list(db.scalars(select(AuditLog.action)))
    assert "auth.login" in actions
