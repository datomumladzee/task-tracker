import pyotp 

# TOTP lives here rather than in security.py, which is about passwords and
# tokens. This is a separate concern with a different threat model.
#
# How it works: the server and the phone app share one secret. Both take that
# secret plus the current time rounded to a 30 second window, run HMAC-SHA1
# over it and truncate to 6 digits. Same inputs, same output, so the phone
# never talks to us. That is why an authenticator app works in airplane mode.

ISSUER = "Task Tracker"

# pyotp accepts only the current 30 second window by default, so a phone whose
# clock is a few seconds off produces codes we reject. 1 also accepts the
# window either side. The cost is that a code stays valid for about 90 seconds
# instead of 30. Every real implementation makes this trade.
VALID_WINDOW = 1


def generate_secret() -> str:
    """A new base32 secret, the thing the QR code actually carries."""
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str) -> str:
    """The otpauth:// URI a QR code encodes.

    The frontend renders this as a QR image. The secret is inside it in clear
    text, which is why setup must be an authenticated request and why the URI
    should never be logged.

    email becomes the account label in the app, and ISSUER the heading above
    it, so a user with several accounts can tell them apart.
    """
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)


def verify_code(secret: str, code: str) -> bool:
    """Check 6 digits against the secret.

    Returns False rather than raising on rubbish input, so a caller never has
    to guard the call.

    Known gap, accepted on purpose: a code stays valid for its whole window,
    so the same digits can be replayed within roughly 90 seconds. Closing that
    means storing the last accepted timestamp per user and refusing anything
    at or before it. Out of scope for now.
    """
    if not code or not code.strip().isdigit():
        return False
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=VALID_WINDOW)
