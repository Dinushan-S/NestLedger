import uuid

# Health and invitation backend endpoint behavior tests


def test_health_ok(api_client, base_url):
    response = api_client.get(f"{base_url}/api/health", timeout=20)
    assert response.status_code == 200

    data = response.json()
    assert data == {"ok": True}


def test_invitation_send_requires_auth(api_client, base_url, primary_profile_id):
    payload = {
        "invited_email": "nestledger.e2e.member@example.org",
        "inviter_name": "Primary Tester",
        "profile_id": primary_profile_id,
        "profile_name": "TEST Household",
    }
    response = api_client.post(f"{base_url}/api/invitations/send", json=payload, timeout=30)

    assert response.status_code == 401


def test_invitation_send_success(api_client, base_url, primary_access_token, primary_profile_id):
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

    assert response.status_code == 200

    data = response.json()
    assert data["invite_token"]
    assert "token=" in data["shareable_link"]


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
    assert send_response.status_code == 200
    invite_token = send_response.json()["invite_token"]

    accept_response = api_client.post(
        f"{base_url}/api/invitations/accept",
        headers={"Authorization": f"Bearer {member_access_token}"},
        json={"invite_token": invite_token},
        timeout=40,
    )
    assert accept_response.status_code == 200

    accept_data = accept_response.json()
    assert accept_data["profile_id"] == primary_profile_id
