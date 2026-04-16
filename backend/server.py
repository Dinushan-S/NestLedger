import logging
import os
import smtplib
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Header, HTTPException
from pydantic import BaseModel, EmailStr
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "")
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
BREVO_FROM_NAME = os.getenv("BREVO_FROM_NAME", "NestLedger")
BREVO_FROM_EMAIL = os.getenv("BREVO_FROM_EMAIL", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_LOGIN = os.getenv("SMTP_LOGIN", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# new

def validate_runtime_config() -> None:
    required = {
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_ANON_KEY": SUPABASE_ANON_KEY,
        "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_SERVICE_ROLE_KEY,
        "APP_PUBLIC_URL": APP_PUBLIC_URL,
        "BREVO_FROM_EMAIL": BREVO_FROM_EMAIL,
        "SMTP_HOST": SMTP_HOST,
        "SMTP_LOGIN": SMTP_LOGIN,
        "SMTP_PASSWORD": SMTP_PASSWORD,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError(f"Missing backend configuration: {', '.join(missing)}")


@app.on_event("startup")
def startup_checks() -> None:
    validate_runtime_config()


class InviteRequest(BaseModel):
    invited_email: EmailStr
    inviter_name: str
    profile_id: str
    profile_name: str


class AcceptInviteRequest(BaseModel):
    invite_token: str


class PushRegisterRequest(BaseModel):
    platform: str
    push_token: str


class PushFanoutRequest(BaseModel):
    exclude_user_id: str | None = None
    message: str
    profile_id: str
    type: str


class DeleteSpaceRequest(BaseModel):
    profile_id: str


def ensure_backend_config() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500, detail="Supabase backend config is missing."
        )


def build_rest_headers(prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def supabase_rest(
    method: str,
    table: str,
    *,
    params: dict[str, Any] | None = None,
    json_data: Any = None,
    prefer: str | None = None,
) -> Any:
    ensure_backend_config()
    response = requests.request(
        method=method,
        url=f"{SUPABASE_URL}/rest/v1/{table}",
        headers=build_rest_headers(prefer),
        params=params,
        json=json_data,
        timeout=25,
    )

    if not response.ok:
        logger.error("Supabase REST error on %s: %s", table, response.text)
        raise HTTPException(status_code=response.status_code, detail=response.text)

    if not response.text:
        return None

    return response.json()


def get_current_user(authorization: str | None) -> dict[str, Any]:
    ensure_backend_config()

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing access token.")

    access_token = authorization.replace("Bearer ", "", 1)
    response = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {access_token}",
        },
        timeout=20,
    )

    if not response.ok:
        raise HTTPException(
            status_code=401, detail="Invalid or expired Supabase session."
        )

    return response.json()


def ensure_profile_member(profile_id: str, user_id: str) -> None:
    rows = supabase_rest(
        "GET",
        "profile_members",
        params={
            "profile_id": f"eq.{profile_id}",
            "user_id": f"eq.{user_id}",
            "select": "id",
        },
    )
    if not rows:
        raise HTTPException(
            status_code=403, detail="You do not have access to this profile."
        )


def send_brevo_invite(
    recipient_email: str,
    inviter_name: str,
    profile_name: str,
    invite_link: str,
    fallback_link: str,
) -> None:
    if not SMTP_HOST or not SMTP_LOGIN or not SMTP_PASSWORD or not BREVO_FROM_EMAIL:
        raise HTTPException(status_code=500, detail="Brevo email config is missing.")

    html = f"""
    <div style='font-family: Arial, sans-serif; color: #2D312F; line-height: 1.6;'>
      <h2>{inviter_name} invited you to join {profile_name} on NestLedger</h2>
      <p>Tap below to open the app and accept the invitation.</p>
      <p><a href='{invite_link}' style='display:inline-block;padding:12px 18px;background:#5D7B6F;color:#fff;border-radius:999px;text-decoration:none;'>Open NestLedger</a></p>
      <p>If the app does not open automatically, use this fallback link:</p>
      <p><a href='{fallback_link}'>{fallback_link}</a></p>
    </div>
    """

    message = EmailMessage()
    message["Subject"] = (
        f"{inviter_name} invited you to join {profile_name} on NestLedger"
    )
    message["From"] = f"{BREVO_FROM_NAME} <{BREVO_FROM_EMAIL}>"
    message["To"] = recipient_email
    message.set_content(
        f"{inviter_name} invited you to join {profile_name} on NestLedger. Open the app using {invite_link} or use {fallback_link}.",
    )
    message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=25) as smtp:
            smtp.starttls()
            smtp.login(SMTP_LOGIN, SMTP_PASSWORD)
            smtp.send_message(message)
    except Exception as exc:  # noqa: BLE001
        logger.error("Brevo SMTP error: %s", exc)
        raise HTTPException(
            status_code=500, detail="Brevo failed to send the invite email."
        ) from exc


def upsert_user_profile_from_auth(user: dict[str, Any]) -> None:
    email = user.get("email") or ""
    metadata = user.get("user_metadata") or {}
    display_name = metadata.get("name") or email.split("@")[0] or "NestLedger Member"
    timestamp = datetime.now(timezone.utc).isoformat()

    supabase_rest(
        "POST",
        "user_profiles",
        params={"on_conflict": "user_id"},
        json_data={
            "user_id": user["id"],
            "email": email,
            "name": display_name,
            "avatar_emoji": metadata.get("avatar_emoji") or "🏡",
            "created_at": timestamp,
            "updated_at": timestamp,
        },
        prefer="resolution=merge-duplicates,return=representation",
    )


@api_router.get("/")
def root():
    return {"message": "NestLedger backend online"}


@api_router.get("/health")
def health():
    return {"ok": True}


@api_router.post("/invitations/send")
def send_invitation(
    payload: InviteRequest, authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    ensure_profile_member(payload.profile_id, user["id"])

    invite_token = str(uuid.uuid4())
    fallback_link = f"{APP_PUBLIC_URL.rstrip('/')}/invite?token={invite_token}"
    deep_link = f"nestledger://invite?token={invite_token}"

    supabase_rest(
        "POST",
        "invitations",
        json_data={
            "profile_id": payload.profile_id,
            "invited_email": payload.invited_email,
            "invite_token": invite_token,
            "status": "pending",
        },
        prefer="return=representation",
    )

    send_brevo_invite(
        recipient_email=payload.invited_email,
        inviter_name=payload.inviter_name,
        profile_name=payload.profile_name,
        invite_link=deep_link,
        fallback_link=fallback_link,
    )

    return {"invite_token": invite_token, "shareable_link": fallback_link}


@api_router.post("/invitations/accept")
def accept_invitation(
    payload: AcceptInviteRequest, authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    upsert_user_profile_from_auth(user)

    invitation_rows = supabase_rest(
        "GET",
        "invitations",
        params={
            "invite_token": f"eq.{payload.invite_token}",
            "select": "*",
            "limit": 1,
        },
    )

    if not invitation_rows:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    invitation = invitation_rows[0]
    invited_email = (invitation.get("invited_email") or "").lower()
    user_email = (user.get("email") or "").lower()
    if invited_email and invited_email != user_email:
        raise HTTPException(
            status_code=403, detail="This invite belongs to a different email address."
        )

    membership_rows = supabase_rest(
        "GET",
        "profile_members",
        params={
            "profile_id": f"eq.{invitation['profile_id']}",
            "user_id": f"eq.{user['id']}",
            "select": "id",
        },
    )
    if not membership_rows:
        supabase_rest(
            "POST",
            "profile_members",
            json_data={"profile_id": invitation["profile_id"], "user_id": user["id"]},
            prefer="return=representation",
        )

    supabase_rest(
        "PATCH",
        "invitations",
        params={"invite_token": f"eq.{payload.invite_token}"},
        json_data={"status": "accepted"},
        prefer="return=representation",
    )

    member_rows = supabase_rest(
        "GET",
        "profile_members",
        params={"profile_id": f"eq.{invitation['profile_id']}", "select": "user_id"},
    )
    other_user_ids = [
        row["user_id"] for row in member_rows if row["user_id"] != user["id"]
    ]
    if other_user_ids:
        notifications = [
            {
                "profile_id": invitation["profile_id"],
                "user_id": member_id,
                "message": f"{user_email or 'A member'} joined your NestLedger profile.",
                "type": "member_joined",
            }
            for member_id in other_user_ids
        ]
        supabase_rest(
            "POST",
            "notifications",
            json_data=notifications,
            prefer="return=representation",
        )

    return {"profile_id": invitation["profile_id"]}


@api_router.post("/push/register")
def register_push_token(
    payload: PushRegisterRequest, authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    supabase_rest(
        "POST",
        "device_tokens",
        params={"on_conflict": "push_token"},
        json_data={
            "platform": payload.platform,
            "push_token": payload.push_token,
            "user_id": user["id"],
        },
        prefer="resolution=merge-duplicates,return=representation",
    )
    return {"ok": True}


@api_router.post("/push/fanout")
def push_fanout(
    payload: PushFanoutRequest, authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    ensure_profile_member(payload.profile_id, user["id"])

    members = supabase_rest(
        "GET",
        "profile_members",
        params={"profile_id": f"eq.{payload.profile_id}", "select": "user_id"},
    )
    recipient_ids = [
        row["user_id"] for row in members if row["user_id"] != payload.exclude_user_id
    ]
    if not recipient_ids:
        return {"sent": 0}

    joined_ids = ",".join(recipient_ids)
    tokens = supabase_rest(
        "GET",
        "device_tokens",
        params={"user_id": f"in.({joined_ids})", "select": "push_token"},
    )

    expo_tokens = [
        row["push_token"]
        for row in tokens
        if row["push_token"].startswith("ExponentPushToken[")
    ]
    if not expo_tokens:
        return {"sent": 0}

    messages = [
        {
            "to": token,
            "title": "NestLedger",
            "body": payload.message,
            "sound": "default",
        }
        for token in expo_tokens
    ]
    response = requests.post(
        "https://exp.host/--/api/v2/push/send",
        headers={"Content-Type": "application/json"},
        json=messages,
        timeout=25,
    )
    if not response.ok:
        logger.error("Expo push error: %s", response.text)
        return {"sent": 0}

    return {"sent": len(expo_tokens)}


@api_router.post("/spaces/delete")
def delete_space(
    payload: DeleteSpaceRequest, authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    ensure_profile_member(payload.profile_id, user["id"])

    supabase_rest(
        "DELETE",
        "profile_members",
        params={
            "profile_id": f"eq.{payload.profile_id}",
            "user_id": f"eq.{user['id']}",
        },
    )

    remaining_members = supabase_rest(
        "GET",
        "profile_members",
        params={"profile_id": f"eq.{payload.profile_id}", "select": "id"},
    )

    if not remaining_members:
        supabase_rest(
            "DELETE", "expenses", params={"profile_id": f"eq.{payload.profile_id}"}
        )
        supabase_rest(
            "DELETE",
            "buy_list_items",
            params={"profile_id": f"eq.{payload.profile_id}"},
        )
        supabase_rest(
            "DELETE", "budget_plans", params={"profile_id": f"eq.{payload.profile_id}"}
        )
        supabase_rest(
            "DELETE", "notifications", params={"profile_id": f"eq.{payload.profile_id}"}
        )
        supabase_rest(
            "DELETE", "invitations", params={"profile_id": f"eq.{payload.profile_id}"}
        )
        supabase_rest("DELETE", "profiles", params={"id": f"eq.{payload.profile_id}"})

    return {"ok": True}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
