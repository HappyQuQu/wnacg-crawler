import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def atomic_output_path(target: Path) -> Iterator[Path]:
    """Keep the old file until a same-directory temporary file is fully written."""
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
    os.close(fd)
    temporary = Path(name)
    try:
        yield temporary
        with temporary.open("rb") as stream:
            os.fsync(stream.fileno())
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def atomic_write_bytes(target: Path, data: bytes) -> None:
    with atomic_output_path(target) as temporary:
        temporary.write_bytes(data)
