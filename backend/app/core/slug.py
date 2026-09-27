import secrets
import string

# URL-safe alphanumeric alphabet (lowercase + digits matches '37k56xgr3v' style)
SLUG_ALPHABET = string.ascii_lowercase + string.digits


def generate_share_slug(length: int = 10) -> str:
    """Generate a short, random, non-sequential, URL-safe slug."""
    return "".join(secrets.choice(SLUG_ALPHABET) for _ in range(length))
