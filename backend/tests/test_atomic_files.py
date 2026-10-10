import zipfile
from pathlib import Path

import pytest

from backend.app.core.files import atomic_write_bytes
from backend.app.services.archive_service import create_zip
from backend.tests.image_fixtures import image_bytes


def test_image_atomic_write_replaces_only_after_success(tmp_path):
    target = tmp_path / "page.png"
    data = image_bytes("PNG")
    target.write_bytes(b"old contents")
    atomic_write_bytes(target, data)
    assert target.read_bytes() == data
    assert list(tmp_path.iterdir()) == [target]


def test_failed_image_write_keeps_previous_file_and_cleans_temp(tmp_path, monkeypatch):
    target = tmp_path / "page.png"
    original = image_bytes("PNG", "blue")
    target.write_bytes(original)
    write = Path.write_bytes

    def fail(path, data):
        assert target.read_bytes() == original
        write(path, data[:10])
        raise OSError("disk full")

    monkeypatch.setattr(Path, "write_bytes", fail)
    with pytest.raises(OSError, match="disk full"):
        atomic_write_bytes(target, image_bytes("PNG"))
    assert target.read_bytes() == original
    assert list(tmp_path.iterdir()) == [target]


@pytest.mark.parametrize("existing", [False, True])
def test_failed_rename_keeps_old_file_or_leaves_no_final_file(tmp_path, monkeypatch, existing):
    target = tmp_path / "page.png"
    if existing:
        target.write_bytes(b"old contents")

    def fail(*args):
        raise OSError("rename failed")

    monkeypatch.setattr(Path, "replace", fail)
    with pytest.raises(OSError, match="rename failed"):
        atomic_write_bytes(target, image_bytes("PNG"))
    assert target.exists() == existing
    if existing:
        assert target.read_bytes() == b"old contents"
    assert list(tmp_path.iterdir()) == ([target] if existing else [])


def test_zip_success_excludes_temporary_and_stale_files(tmp_path):
    source = tmp_path / "images"
    source.mkdir()
    page = source / "page.png"
    page.write_bytes(image_bytes("PNG"))
    (source / ".page.png.abcd.tmp").write_bytes(b"partial")
    (source / "page.jpg").write_bytes(b"stale file with old extension")
    target = tmp_path / "archive.zip"
    target.write_bytes(b"old archive")
    create_zip(source, target, [page])
    with zipfile.ZipFile(target) as archive:
        assert archive.namelist() == [page.name]
        assert archive.read(page.name) == page.read_bytes()
        assert archive.testzip() is None
    assert not list(tmp_path.glob(".*.tmp"))


@pytest.mark.parametrize("existing", [False, True])
def test_zip_write_failure_preserves_old_archive_and_cleans_temp(tmp_path, monkeypatch, existing):
    source = tmp_path / "images"
    source.mkdir()
    pages = [source / "1.png", source / "2.png"]
    for page in pages:
        page.write_bytes(image_bytes("PNG"))
    target = tmp_path / "archive.zip"
    if existing:
        target.write_bytes(b"old archive")
    real_write = zipfile.ZipFile.write
    count = 0

    def fail(archive, filename, arcname):
        nonlocal count
        count += 1
        if count == 2:
            raise OSError("disk full")
        return real_write(archive, filename, arcname)

    monkeypatch.setattr(zipfile.ZipFile, "write", fail)
    with pytest.raises(OSError, match="disk full"):
        create_zip(source, target, pages)
    assert target.exists() == existing
    if existing:
        assert target.read_bytes() == b"old archive"
    assert not list(tmp_path.glob(".*.tmp"))


def test_zip_refuses_missing_image_and_keeps_old_archive(tmp_path):
    source = tmp_path / "images"
    source.mkdir()
    page = source / "1.png"
    page.write_bytes(image_bytes("PNG"))
    target = tmp_path / "archive.zip"
    target.write_bytes(b"old archive")
    with pytest.raises(ValueError, match="图片不完整"):
        create_zip(source, target, [page, source / "missing.png"])
    assert target.read_bytes() == b"old archive"
    assert not list(tmp_path.glob(".*.tmp"))
