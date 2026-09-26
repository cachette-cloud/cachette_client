from jose import jwt, JWTError
from app.config import settings


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.PUBLIC_KEY, algorithms=["RS256"])
    except JWTError:
        return None
