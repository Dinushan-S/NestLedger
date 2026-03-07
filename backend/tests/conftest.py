import os

import pytest
import requests
from dotenv import dotenv_values

# Shared fixtures for backend API auth/session and profile context

def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if value:
        return value.rstrip("/")
    raise RuntimeError(f"Missing required environment variable: {name}")


def _load_base_url() -> str:
    env_url = os.environ.get("EXPO_BACKEND_URL")
    if env_url:
        return env_url.rstrip("/")

    frontend_env = dotenv_values("/app/frontend/.env")
    public_url = frontend_env.get("EXPO_PUBLIC_BACKEND_URL")
    if public_url:
        return str(public_url).rstrip("/")

    raise RuntimeError("Missing backend URL in EXPO_BACKEND_URL and frontend/.env EXPO_PUBLIC_BACKEND_URL")


def _load_supabase_url() -> str:
    backend_env = dotenv_values("/app/backend/.env")
    value = os.environ.get("SUPABASE_URL") or backend_env.get("SUPABASE_URL")
    if not value:
        raise RuntimeError("Missing SUPABASE_URL")
    return str(value).strip().strip('"').rstrip("/")


def _load_supabase_anon_key() -> str:
    backend_env = dotenv_values("/app/backend/.env")
    value = os.environ.get("SUPABASE_ANON_KEY") or backend_env.get("SUPABASE_ANON_KEY")
    if not value:
        raise RuntimeError("Missing SUPABASE_ANON_KEY")
    return str(value).strip().strip('"')


@pytest.fixture(scope="session")
def base_url() -> str:
    return _load_base_url()


@pytest.fixture(scope="session")
def api_client() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def supabase_auth_url() -> str:
    return f"{_load_supabase_url()}/auth/v1/token?grant_type=password"


@pytest.fixture(scope="session")
def supabase_rest_url() -> str:
    return f"{_load_supabase_url()}/rest/v1"


@pytest.fixture(scope="session")
def supabase_anon_key() -> str:
    return _load_supabase_anon_key()


@pytest.fixture(scope="session")
def primary_credentials() -> dict[str, str]:
    return {
        "email": "nestledger.e2e.primary@example.org",
        "password": "NestLedger123!",
    }


@pytest.fixture(scope="session")
def member_credentials() -> dict[str, str]:
    return {
        "email": "nestledger.e2e.member@example.org",
        "password": "NestLedger123!",
    }


def _sign_in(
    api_client: requests.Session,
    supabase_auth_url: str,
    supabase_anon_key: str,
    credentials: dict[str, str],
) -> dict:
    response = api_client.post(
        supabase_auth_url,
        headers={"apikey": supabase_anon_key, "Content-Type": "application/json"},
        json=credentials,
        timeout=30,
    )
    if response.status_code != 200:
        pytest.skip(f"Auth failed for {credentials['email']}: {response.status_code} {response.text}")
    return response.json()


@pytest.fixture(scope="session")
def primary_auth(api_client, supabase_auth_url, supabase_anon_key, primary_credentials) -> dict:
    return _sign_in(api_client, supabase_auth_url, supabase_anon_key, primary_credentials)


@pytest.fixture(scope="session")
def member_auth(api_client, supabase_auth_url, supabase_anon_key, member_credentials) -> dict:
    return _sign_in(api_client, supabase_auth_url, supabase_anon_key, member_credentials)


@pytest.fixture(scope="session")
def primary_access_token(primary_auth: dict) -> str:
    token = primary_auth.get("access_token")
    if not token:
        pytest.skip("Primary token not available")
    return token


@pytest.fixture(scope="session")
def member_access_token(member_auth: dict) -> str:
    token = member_auth.get("access_token")
    if not token:
        pytest.skip("Member token not available")
    return token


@pytest.fixture(scope="session")
def primary_user_id(primary_auth: dict) -> str:
    user = primary_auth.get("user") or {}
    uid = user.get("id")
    if not uid:
        pytest.skip("Primary user id missing")
    return uid


@pytest.fixture(scope="session")
def primary_profile_id(api_client, supabase_rest_url, supabase_anon_key, primary_access_token) -> str:
    response = api_client.get(
        f"{supabase_rest_url}/profile_members",
        headers={
            "apikey": supabase_anon_key,
            "Authorization": f"Bearer {primary_access_token}",
        },
        params={"select": "profile_id", "order": "joined_at.desc", "limit": "1"},
        timeout=30,
    )
    if response.status_code != 200:
        pytest.skip(f"Unable to fetch profile membership: {response.status_code} {response.text}")

    rows = response.json()
    if not rows:
        pytest.skip("No profile memberships for primary user")

    profile_id = rows[0].get("profile_id")
    if not profile_id:
        pytest.skip("profile_id missing in profile membership")
    return profile_id
