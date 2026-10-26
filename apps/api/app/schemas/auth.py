import uuid
from typing import Literal

from pydantic import BaseModel, Field

RoleName = Literal["super_admin", "admin", "adviser", "entrepreneur"]


class LoginIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=12, max_length=128)


class RegisterIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=160)


class AccountOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    roles: list[str]
    is_active: bool


class AuthOut(BaseModel):
    account: AccountOut


class AccountCreateIn(RegisterIn):
    role: RoleName = "entrepreneur"
