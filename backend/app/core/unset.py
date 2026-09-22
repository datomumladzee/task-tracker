"""A marker for "the caller did not pass this".

None cannot do that job in a partial update. For a nullable column, None is a
real value meaning clear it, so a function needs a third state to tell "leave
description alone" from "remove the description".

Shared, because every service with a partial update needs the same marker.
"""


class Unset:
    def __repr__(self) -> str:
        return "UNSET"

    def __bool__(self) -> bool:
        # Falsy, so `if value:` cannot silently treat it as a real value.
        return False


UNSET = Unset()
