"""Offline maintenance for a single-user Qicaizhice SQLite project library.

No business amounts, enterprise names, source fields, report text, or original
files are written to diagnostics. Restore only from the designated backup dir.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
from uuid import uuid4
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from storage.project_store import storage_dir, validate_archive

VERSION = 'v3.0-F'
NAMES = re.compile(r'(?:projects_|safety_)[A-Za-z0-9T._-]+\.sqlite3\Z')
EXPECTED = {'id', 'display_name', 'revision', 'archive_json', 'checksum_sha256'}


def stopped():
    for port in range(8791, 8801):
        try:
            with urlopen(f'http://127.0.0.1:{port}/__qz/health', timeout=.12) as response:
                r = json.load(response)
            if r.get('app') == 'qicaizhice-preview':
                raise RuntimeError('检测到企财智策仍在运行。请先运行「停止体验版.bat」，再恢复。')
        except RuntimeError:
            raise
        except Exception:
            pass


def check_file(path, archives=True):
    if not path.is_file():
        raise RuntimeError('项目数据库不存在')
    uri = path.resolve().as_uri() + '?mode=ro'
    with sqlite3.connect(uri, uri=True, timeout=2) as db:
        ver = db.execute('PRAGMA user_version').fetchone()[0]
        if ver != 1:
            raise RuntimeError('数据库版本不兼容（当前只支持 schema v1）')
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('SQLite 完整性检测失败')
        tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        if ('projects',) not in tables:
            raise RuntimeError('缺少项目表')
        columns = {r[1] for r in db.execute('PRAGMA table_info(projects)').fetchall()}
        if not EXPECTED.issubset(columns):
            raise RuntimeError('项目表字段不完整')
        count = db.execute('SELECT count(*) FROM projects').fetchone()[0]
        if count > 200:
            raise RuntimeError('企业项目数超出兼容范围')
        if archives:
            for (payload,) in db.execute('SELECT archive_json FROM projects'):
                validate_archive(json.loads(payload))
        return count


def backup_live(root, prefix='projects_'):
    target = root/'projects.sqlite3'
    count = check_file(target)
    folder = root/'backups'
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ')
    name = f'{prefix}{stamp}_{uuid4().hex[:8]}.sqlite3'
    output = folder/name
    try:
        with sqlite3.connect(str(target), timeout=5) as src, sqlite3.connect(str(output)) as dest:
            src.backup(dest)
        check_file(output)
        try: os.chmod(output, 0o600)
        except OSError: pass
        return name, count
    except Exception:
        output.unlink(missing_ok=True)
        raise


def list_backups(root):
    folder = root/'backups'
    candidates = sorted((p for p in folder.iterdir() if p.is_file() and not p.is_symlink() and NAMES.fullmatch(p.name)), reverse=True) if folder.exists() else []
    return candidates[:150]


def restore(root, filename):
    stopped()
    if not NAMES.fullmatch(filename) or Path(filename).name != filename:
        raise RuntimeError('只能选择备份目录里的合法 .sqlite3 文件')
    folder = root/'backups'
    backup_file = folder/filename
    if not backup_file.is_file() or backup_file.is_symlink():
        raise RuntimeError('备份文件不存在或不是普通文件')
    expected_count = check_file(backup_file)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = root/'projects.sqlite3'
    staged = root/f'.restore_{uuid4().hex}.sqlite3'
    old_backup = None
    try:
        with sqlite3.connect(str(backup_file), timeout=5) as src, sqlite3.connect(str(staged), timeout=5) as dst:
            src.backup(dst)
        if check_file(staged) != expected_count:
            raise RuntimeError('恢复临时库与备份记录数不一致')
        if target.exists():
            # Preserve old data first. This is a valid, restorable online SQLite snapshot.
            old_backup, _ = backup_live(root, 'safety_')
            with sqlite3.connect(str(target), timeout=2) as active:
                row = active.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()
                if row[0] != 0:
                    raise RuntimeError('当前数据库仍被其他进程持有，停止恢复')
        # At this point the live server is stopped and we have a verified safety copy.
        # Remove orphaned journal files only after successful WAL checkpoint.
        for suffix in ('-wal', '-shm'):
            Path(str(target)+suffix).unlink(missing_ok=True)
        os.replace(staged, target)
        try:os.chmod(target,0o600)
        except OSError: pass
        if check_file(target) != expected_count:
            raise RuntimeError('恢复后完整性检查失败，请使用安全备份回滚')
        return expected_count, old_backup
    finally:
        staged.unlink(missing_ok=True)


def main():
    parser=argparse.ArgumentParser(description='企财智策离线数据维护工具')
    parser.add_argument('action', choices=('status','list','backup','restore','restore-index'))
    parser.add_argument('filename', nargs='?')
    parser.add_argument('--confirm', default='')
    args=parser.parse_args()
    root=storage_dir();db=root/'projects.sqlite3'
    try:
        if args.action=='status':
            count=check_file(db) if db.exists() else 0
            print(f'[OK] 企财智策 {VERSION} 项目数据自检')
            print(f'数据库：{"完整、兼容" if db.exists() else "未创建（新用户正常）"}；企业项目数：{count}')
            print(f'可用备份数：{len(list_backups(root))}；本机存储：启用；云同步：不启用')
            print('此诊断不包含企业名称、财务金额和报表正文。')
        elif args.action=='list':
            items=list_backups(root)
            print('可恢复的本地备份（不会自动恢复）：')
            for i,p in enumerate(items,1):
                print(f'{i:>3}. {p.name}  ({p.stat().st_size//1024} KiB)')
            if not items: print('尚无备份。')
        elif args.action=='backup':
            name,count=backup_live(root)
            print(f'[OK] 一致性备份：{name}；项目数：{count}')
            print('备份保存在本机用户数据目录。请再复制一份至你控制的其他安全位置。')
        else:
            if args.confirm!='RESTORE' or not args.filename:
                raise RuntimeError('恢复属于覆盖操作，必须在停止软件后明确输入 RESTORE 确认')
            filename=args.filename
            if args.action=='restore-index':
                entries=list_backups(root)
                if not re.fullmatch(r'[1-9]\d{0,2}',filename) or int(filename)>len(entries):
                    raise RuntimeError('请选择列表中的有效序号')
                filename=entries[int(filename)-1].name
            count,safety=restore(root,filename)
            print(f'[OK] 恢复完成，项目数：{count}')
            if safety:print(f'恢复前自动安全备份：{safety}')
            print('可重新运行「启动体验版.bat」验证。')
    except Exception as exc:
        print(f'[ERROR] {str(exc).splitlines()[0][:220]}', file=sys.stderr)
        sys.exit(2)

if __name__=='__main__':main()
