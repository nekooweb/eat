"""Rebuild and validate before replacing a usable SQLite database."""
from contextlib import closing
from datetime import datetime, timezone
import fcntl
import os
from pathlib import Path
import sqlite3
import tempfile
import time
import uuid

def _copy_database(source, target):
    deadline=time.monotonic()+30
    def progress(*_):
        if time.monotonic()>deadline:
            raise TimeoutError('Database busy during backup/reset; previous backup is retained')
    with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as src:
        with closing(sqlite3.connect(target,timeout=5)) as dst:
            src.backup(dst,pages=512,progress=progress,sleep=0.05)

def _check_database(path):
    with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
            raise RuntimeError('Rebuilt database failed integrity check')
        if list(db.execute('PRAGMA foreign_key_check')):
            raise RuntimeError('Rebuilt database failed foreign-key check')
        if db.execute('SELECT count(*) FROM catalog_entries').fetchone()[0]!=2804:
            raise RuntimeError('Rebuilt database lost frozen catalog entries')

def rebuild_database(output, builder, validator):
    output=Path(output).absolute()
    if output.is_symlink() or output.is_dir() or output.suffix not in ('.sqlite','.sqlite3','.db'):
        raise ValueError('Reset requires an explicit regular SQLite file path')
    output.parent.mkdir(parents=True,exist_ok=True)
    lock_path=output.with_name(output.name+'.reset.lock')
    fd=os.open(lock_path,os.O_CREAT|os.O_RDWR|getattr(os,'O_NOFOLLOW',0),0o600)
    backup=None
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if output.exists():
            stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
            backup=output.with_name(output.name+'.backup-'+stamp+'-'+uuid.uuid4().hex[:8]+'.sqlite')
            _copy_database(output,backup)
        with tempfile.TemporaryDirectory(prefix='.'+output.stem+'-rebuild-',dir=output.parent) as td:
            temporary=Path(td)/'rebuilt.sqlite'
            result=builder(temporary)
            _check_database(temporary)
            validator(temporary)
            try:
                _copy_database(temporary,output)
                _check_database(output)
            except Exception:
                if backup is not None:
                    _copy_database(backup,output)
                raise
        result['reset']={'mode':'validated_sqlite_backup_swap','backup':str(backup) if backup else None,'database':str(output)}
        return result
    finally:
        os.close(fd)
