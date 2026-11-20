import uuid
import pytest
from app.db.session import SessionLocal
from app.models.capture import Screen
from app.models.reconstruction import Reconstruction, ReconstructionComponent


@pytest.fixture()
def sample_screen_with_components(client, auth_headers):
    suffix = uuid.uuid4().hex[:8]
    app = client.post(
        "/api/v1/applications",
        headers=auth_headers,
        json={"name": f"Filter Safety App {suffix}", "source_url": "https://safety.example.com"},
    ).json()
    client.patch(
        f"/api/v1/applications/{app['id']}/authorization",
        headers=auth_headers,
        json={"authorization_status": "approved", "authorization_ref": "IZIN/S/001"},
    )
    project = client.post(
        f"/api/v1/applications/{app['id']}/projects",
        headers=auth_headers,
        json={"name": "Project Filter Safety"},
    ).json()

    db = SessionLocal()
    try:
        screen = Screen(
            project_id=project["id"],
            screen_key=f"safety-screen-{suffix}",
            title="Safety Test Screen",
            screenshot_path=f"/screenshots/safety-{suffix}.png",
            review_status="pending",
            tags=[],
            structure={"viewport": {"width": 1440, "height": 900}},
        )
        db.add(screen)
        db.flush()

        recon = Reconstruction(
            screen_id=screen.id,
            project_id=project["id"],
            status="draft",
            layout={"viewport": {"width": 1440, "height": 900}},
        )
        db.add(recon)
        db.flush()

        comps = [
            ReconstructionComponent(
                reconstruction_id=recon.id,
                region="header",
                component_type="header-item",
                label="HOME",
                props={"box": {"x": 42.19, "y": 1.25, "w": 2.74, "h": 1.56}},
                source="ai-vision",
                order_index=0,
            ),
            ReconstructionComponent(
                reconstruction_id=recon.id,
                region="header",
                component_type="button",
                label="PRODUCT",
                props={"box": {"x": 46.46, "y": 1.18, "w": 4.51, "h": 1.5}},
                source="ai-vision",
                order_index=1,
            ),
            ReconstructionComponent(
                reconstruction_id=recon.id,
                region="header",
                component_type="button",
                label="CONTACT",
                props={"box": {"x": 52.78, "y": 1.0, "w": 4.03, "h": 1.62}},
                source="ai-vision",
                order_index=2,
            ),
            ReconstructionComponent(
                reconstruction_id=recon.id,
                region="manual",
                component_type="button",
                label="BUY NOW",
                props={"box": {"x": 7.5, "y": 67.2, "w": 8.0, "h": 3.5}},
                source="manual",
                order_index=3,
            ),
            ReconstructionComponent(
                reconstruction_id=recon.id,
                region="manual",
                component_type="button",
                label="VIEW DETAILS",
                props={"box": {"x": 17.3, "y": 67.2, "w": 8.0, "h": 3.5}},
                source="manual",
                order_index=4,
            ),
        ]
        db.add_all(comps)
        db.commit()
        db.refresh(recon)
        comp_ids = [c.id for c in comps]
        return {
            "screen_id": screen.id,
            "recon_id": recon.id,
            "project_id": project["id"],
            "comp_ids": comp_ids,
        }
    finally:
        db.close()


def test_filter_and_save_preserves_all_components(client, auth_headers, sample_screen_with_components):
    """
    Test verifying that when client applies a filter (e.g. only viewing/saving a subset of components),
    hidden or non-filtered components in the database are NEVER deleted.
    """
    data = sample_screen_with_components
    screen_id = data["screen_id"]
    recon_id = data["recon_id"]
    original_comp_ids = data["comp_ids"]

    # Verify initial count = 5
    db = SessionLocal()
    try:
        initial_count = db.query(ReconstructionComponent).filter(
            ReconstructionComponent.reconstruction_id == recon_id
        ).count()
        assert initial_count == 5
    finally:
        db.close()

    # Simulate client action: user has filtered view to ONLY manual components (last 2 components)
    # and edits one of them, saving it.
    target_comp_id = original_comp_ids[3]
    resp = client.patch(
        f"/api/v1/reconstructions/component/{target_comp_id}",
        headers=auth_headers,
        json={
            "label": "BUY NOW UPDATED",
            "props": {"box": {"x": 7.8, "y": 67.5, "w": 8.0, "h": 3.5}},
        },
    )
    assert resp.status_code == 200

    # Verify ALL 5 components still exist in database - none were deleted!
    db = SessionLocal()
    try:
        current_comps = db.query(ReconstructionComponent).filter(
            ReconstructionComponent.reconstruction_id == recon_id
        ).all()
        assert len(current_comps) == 5, f"Expected 5 components, found {len(current_comps)}"
        current_ids = {c.id for c in current_comps}
        assert current_ids == set(original_comp_ids), "Component IDs must match exactly"

        # Check updated component
        updated = next(c for c in current_comps if c.id == target_comp_id)
        assert updated.label == "BUY NOW UPDATED"
    finally:
        db.close()


def test_explicit_delete_only_removes_specified_component(client, auth_headers, sample_screen_with_components):
    """
    Test verifying that deletion ONLY occurs when explicit DELETE request is sent for that ID.
    """
    data = sample_screen_with_components
    screen_id = data["screen_id"]
    recon_id = data["recon_id"]
    original_comp_ids = data["comp_ids"]

    # Explicit delete for component #1
    deleted_id = original_comp_ids[1]
    resp = client.delete(
        f"/api/v1/reconstructions/component/{deleted_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # Verify exactly 4 components remain, and only deleted_id is gone
    db = SessionLocal()
    try:
        remaining = db.query(ReconstructionComponent).filter(
            ReconstructionComponent.reconstruction_id == recon_id
        ).all()
        assert len(remaining) == 4
        remaining_ids = {c.id for c in remaining}
        assert deleted_id not in remaining_ids
        for cid in original_comp_ids:
            if cid != deleted_id:
                assert cid in remaining_ids
    finally:
        db.close()
