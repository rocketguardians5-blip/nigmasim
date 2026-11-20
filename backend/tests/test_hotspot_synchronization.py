import uuid
import pytest
from app.db.session import SessionLocal
from app.models.capture import Screen
from app.models.reconstruction import Reconstruction, ReconstructionComponent
from app.services import reconstructor
from app.services.reconstructor import Analysis
from app.services.simulation import is_interactive_component


@pytest.fixture()
def project_id(client, auth_headers) -> int:
    suffix = uuid.uuid4().hex[:8]
    app = client.post(
        "/api/v1/applications",
        headers=auth_headers,
        json={"name": f"Hotspot App {suffix}", "source_url": "https://hotspot.example.com"},
    ).json()
    client.patch(
        f"/api/v1/applications/{app['id']}/authorization",
        headers=auth_headers,
        json={"authorization_status": "approved", "authorization_ref": "IZIN/H/001"},
    )
    project = client.post(
        f"/api/v1/applications/{app['id']}/projects",
        headers=auth_headers,
        json={"name": "Project Hotspot Sync"},
    ).json()
    return project["id"]


def _make_screen(project_id: int) -> int:
    with SessionLocal() as db:
        screen = Screen(
            project_id=project_id,
            screen_key="product_screen",
            title="Layar Produk",
            screenshot_path="captures/test/product.png",
            review_status="pending",
            tags=[],
            structure={"viewport": {"width": 1440, "height": 900}},
        )
        db.add(screen)
        db.commit()
        return screen.id


def test_is_interactive_component_filtering():
    # Buttons, links, inputs must be interactive
    assert is_interactive_component("button", "Buy Now", {"x": 10, "y": 10, "w": 10, "h": 5}) is True
    assert is_interactive_component("link", "Details", {"x": 10, "y": 10, "w": 10, "h": 5}) is True
    assert is_interactive_component("field", "Email", {"x": 10, "y": 10, "w": 10, "h": 5}) is True

    # Menu / Navigation / Header items must be interactive (HOME, PRODUCT, CART, LOGIN)
    assert is_interactive_component("header-item", "HOME", {"x": 40, "y": 1, "w": 3, "h": 2}) is True
    assert is_interactive_component("header-item", "CART", {"x": 80, "y": 1, "w": 3, "h": 2}) is True
    assert is_interactive_component("nav-item", "Product", {"x": 10, "y": 20, "w": 10, "h": 5}) is True

    # Cards and Logo must be interactive
    assert is_interactive_component("card", "Product Card", {"x": 10, "y": 30, "w": 20, "h": 30}) is True
    assert is_interactive_component("logo", "NigmaSim Logo", {"x": 5, "y": 1, "w": 8, "h": 3}) is True

    # Static headings and decorative text must be discarded
    assert is_interactive_component("heading", "Why choose ZFPV", {"x": 10, "y": 10, "w": 20, "h": 5}) is False
    assert is_interactive_component("heading", "Description", {"x": 10, "y": 10, "w": 20, "h": 5}) is False

    # Huge containers (>80% of width and height or >64% total area) must be discarded
    assert is_interactive_component("header-item", "Container", {"x": 0, "y": 0, "w": 90, "h": 90}) is False
    assert is_interactive_component("button", "Huge Area", {"x": 0, "y": 0, "w": 85, "h": 85}) is False


def test_store_analysis_no_duplicate_on_reanalysis(project_id):
    screen_id = _make_screen(project_id)
    with SessionLocal() as db:
        screen = db.get(Screen, screen_id)
        initial_analysis = Analysis(
            layout={"viewport": {"width": 1440, "height": 900}},
            components=[
                {
                    "region": "main",
                    "component_type": "button",
                    "label": "AI Button 1",
                    "props": {"box": {"x": 10, "y": 10, "w": 15, "h": 5}},
                    "source": "ai-vision",
                },
                {
                    "region": "header",
                    "component_type": "header-item",
                    "label": "HOME",
                    "props": {"box": {"x": 40, "y": 1, "w": 5, "h": 3}},
                    "source": "ai-vision",
                },
            ],
            assumptions=[],
        )
        draft = reconstructor.store_analysis(db, screen, initial_analysis, "code", actor_id=1)

        # Add a manual component
        manual = ReconstructionComponent(
            reconstruction_id=draft.id,
            region="manual",
            component_type="button",
            label="My Manual Box",
            props={"box": {"x": 70, "y": 50, "w": 20, "h": 10}},
            source="manual",
        )
        db.add(manual)
        db.commit()
        db.refresh(draft)
        manual_id = manual.id

        assert len(draft.components) == 3  # 2 AI + 1 manual

        # Re-run store_analysis 3 times (simulating "Analisis dengan AI" clicked 3 times)
        for _ in range(3):
            new_analysis = Analysis(
                layout={"viewport": {"width": 1440, "height": 900}},
                components=[
                    {
                        "region": "main",
                        "component_type": "button",
                        "label": "AI Button 1",
                        "props": {"box": {"x": 10, "y": 10, "w": 15, "h": 5}},
                        "source": "ai-vision",
                    },
                    {
                        "region": "header",
                        "component_type": "header-item",
                        "label": "HOME",
                        "props": {"box": {"x": 40, "y": 1, "w": 5, "h": 3}},
                        "source": "ai-vision",
                    },
                ],
                assumptions=[],
            )
            reconstructor.store_analysis(db, screen, new_analysis, "code", actor_id=1, replace=True)
            db.commit()
            db.refresh(draft)

            # Count MUST NOT grow!
            assert len(draft.components) == 3
            # Manual component ID MUST remain unchanged (not recreated)
            cur_manual = next(c for c in draft.components if c.source == "manual")
            assert cur_manual.id == manual_id


def test_server_component_dedupe_on_duplicate_post(client, auth_headers, project_id):
    screen_id = _make_screen(project_id)
    # First create draft
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    payload = {
        "region": "manual",
        "component_type": "button",
        "label": "Save Button",
        "props": {"box": {"x": 20.0, "y": 30.0, "w": 15.0, "h": 5.0}},
    }
    res1 = client.post(f"/api/v1/reconstructions/component?screen_id={screen_id}", json=payload, headers=auth_headers)
    assert res1.status_code == 201
    comp1 = res1.json()

    # Post identical component 5 times in a row
    for _ in range(5):
        res2 = client.post(f"/api/v1/reconstructions/component?screen_id={screen_id}", json=payload, headers=auth_headers)
        assert res2.status_code == 201
        comp2 = res2.json()
        # Must return the SAME component ID, not create a new row!
        assert comp2["id"] == comp1["id"]

    # Verify in DB: only 1 component exists
    res_draft = client.get(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)
    manual_comps = [c for c in res_draft.json()["components"] if c["source"] == "manual"]
    assert len(manual_comps) == 1


def test_hotspot_state_tombstone_backend_sync(client, auth_headers, project_id):
    screen_id = _make_screen(project_id)
    client.post(f"/api/v1/reconstructions/screen/{screen_id}", headers=auth_headers)

    # Set tombstone state
    body = {
        "deleted": ["123", "auto_456"],
        "overrides": {"789": {"x": 25.5, "y": 35.5, "label": "Overridden Label"}},
    }
    put_res = client.put(f"/api/v1/reconstructions/screen/{screen_id}/hotspot-state", json=body, headers=auth_headers)
    assert put_res.status_code == 200
    data = put_res.json()
    assert "123" in data["deleted"]
    assert "auto_456" in data["deleted"]
    assert "789" in data["overrides"]

    # Retrieve hotspot state
    get_res = client.get(f"/api/v1/reconstructions/screen/{screen_id}/hotspot-state", headers=auth_headers)
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["deleted"] == ["123", "auto_456"]
    assert get_data["overrides"]["789"]["label"] == "Overridden Label"
