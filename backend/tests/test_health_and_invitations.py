import uuid

# Health and invitation backend endpoint behavior tests


def test_health_ok(api_client, base_url):
    response = api_client.get(f"{base_url}/api/health", timeout=20)
    assert response.status_code == 200

    data = response.json()
    assert data == {"ok": True}


def test_invite_landing_page_renders(api_client, base_url):
    response = api_client.get(f"{base_url}/invite?token=test-token", timeout=20)

    assert response.status_code == 200
    assert "Open your NestLedger invite" in response.text
    assert "nestledger://invite?token=test-token" in response.text


def test_invitation_send_requires_auth(api_client, base_url, primary_profile_id):
    payload = {
        "invited_email": "nestledger.e2e.member@example.org",
        "inviter_name": "Primary Tester",
        "profile_id": primary_profile_id,
        "profile_name": "TEST Household",
    }
    response = api_client.post(f"{base_url}/api/invitations/send", json=payload, timeout=30)

    assert response.status_code == 401


def test_invitation_send_success(
    api_client, base_url, primary_access_token, primary_profile_id, clear_member_pending_invitation
):
    payload = {
        "invited_email": "nestledger.e2e.member@example.org",
        "inviter_name": "Primary Tester",
        "profile_id": primary_profile_id,
        "profile_name": "TEST Household",
    }
    response = api_client.post(
        f"{base_url}/api/invitations/send",
        headers={"Authorization": f"Bearer {primary_access_token}"},
        json=payload,
        timeout=40,
    )

    assert response.status_code == 200, response.text

    data = response.json()
    assert data["invite_token"]
    assert "token=" in data["shareable_link"]
    assert "email_delivered" in data


def test_invitation_accept_not_found_for_invalid_token(api_client, base_url, member_access_token):
    payload = {"invite_token": str(uuid.uuid4())}
    response = api_client.post(
        f"{base_url}/api/invitations/accept",
        headers={"Authorization": f"Bearer {member_access_token}"},
        json=payload,
        timeout=30,
    )

    assert response.status_code == 404


def test_invitation_send_and_accept_flow(
    api_client,
    base_url,
    primary_access_token,
    primary_profile_id,
    member_access_token,
    clear_member_pending_invitation,
):
    send_payload = {
        "invited_email": "nestledger.e2e.member@example.org",
        "inviter_name": "Primary Tester",
        "profile_id": primary_profile_id,
        "profile_name": "TEST Household",
    }
    send_response = api_client.post(
        f"{base_url}/api/invitations/send",
        headers={"Authorization": f"Bearer {primary_access_token}"},
        json=send_payload,
        timeout=40,
    )
    assert send_response.status_code == 200, send_response.text
    invite_token = send_response.json()["invite_token"]

    accept_response = api_client.post(
        f"{base_url}/api/invitations/accept",
        headers={"Authorization": f"Bearer {member_access_token}"},
        json={"invite_token": invite_token},
        timeout=40,
    )
    assert accept_response.status_code == 200, accept_response.text

    accept_data = accept_response.json()
    assert accept_data["profile_id"] == primary_profile_id


# ── New tests added by Task 2 ────────────────────────────────────────────────


def test_invite_rate_limiter_blocks_after_max():
    """Unit test: InviteRateLimiter blocks on the (max+1)-th call within the window."""
    from server import InviteRateLimiter

    limiter = InviteRateLimiter(max_calls=3, window_seconds=60)
    assert limiter.check("u1") is None
    assert limiter.check("u1") is None
    assert limiter.check("u1") is None
    retry_after = limiter.check("u1")
    assert isinstance(retry_after, int) and retry_after > 0


def test_invitation_send_duplicate_returns_409(
    api_client,
    base_url,
    primary_access_token,
    primary_profile_id,
):
    """Integration test: sending a second invite for the same (profile, email) returns 409."""
    unique_email = f"nestledger.e2e.dup.{uuid.uuid4()}@example.org"
    payload = {
        "invited_email": unique_email,
        "inviter_name": "Primary Tester",
        "profile_id": primary_profile_id,
        "profile_name": "TEST Household",
    }
    headers = {"Authorization": f"Bearer {primary_access_token}"}

    # First invite — should succeed (200)
    first_response = api_client.post(
        f"{base_url}/api/invitations/send",
        headers=headers,
        json=payload,
        timeout=40,
    )
    assert first_response.status_code == 200, f"First invite failed: {first_response.text}"

    # Second invite — same address, same profile → duplicate pending → 409
    second_response = api_client.post(
        f"{base_url}/api/invitations/send",
        headers=headers,
        json=payload,
        timeout=40,
    )
    assert second_response.status_code == 409, (
        f"Expected 409 for duplicate invite, got {second_response.status_code}: {second_response.text}"
    )
