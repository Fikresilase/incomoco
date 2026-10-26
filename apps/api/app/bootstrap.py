"""Create the first privileged account without printing credentials."""
import argparse
import asyncio
import getpass

from sqlalchemy import select

from app.core.db import SessionFactory
from app.repositories.orm import AccountRole, Role, UserAccount
from app.services.auth import default_organization, ensure_default_roles, hash_password


async def bootstrap(email: str, display_name: str) -> None:
    password = getpass.getpass("Super-admin password: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm or len(password) < 12:
        raise SystemExit("Password must match and contain at least 12 characters")
    async with SessionFactory() as db:
        if await db.scalar(select(UserAccount).where(UserAccount.email == email.lower())):
            raise SystemExit("Account already exists")
        organization = await default_organization(db)
        await ensure_default_roles(db)
        account = UserAccount(email=email.lower(), display_name=display_name, password_hash=hash_password(password), organization_id=organization.id)
        db.add(account)
        await db.flush()
        role = await db.scalar(select(Role).where(Role.name == "super_admin"))
        db.add(AccountRole(account_id=account.id, role_id=role.id))
        await db.commit()
    print("Super-admin account created.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the initial Inkomoko super-admin account")
    parser.add_argument("--email", required=True)
    parser.add_argument("--display-name", required=True)
    args = parser.parse_args()
    asyncio.run(bootstrap(args.email, args.display_name))


if __name__ == "__main__":
    main()
